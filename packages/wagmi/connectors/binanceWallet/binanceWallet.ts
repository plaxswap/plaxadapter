/* eslint-disable prefer-destructuring */
/* eslint-disable consistent-return */
/* eslint-disable class-methods-use-this */
import {
  Chain,
  ConnectorNotFoundError,
  ResourceUnavailableError,
  UserRejectedRequestError,
  SwitchChainNotSupportedError,
  createConnector,
  normalizeChainId,
} from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors'
import { hexValue } from 'viem'
import type { Ethereum } from 'viem/window'

declare global {
  interface Window {
    BinanceChain?: {
      bnbSign?: (address: string, message: string) => Promise<{ publicKey: string; signature: string }>
      switchNetwork?: (networkId: string) => Promise<string>
    } & Ethereum
  }
}

const mappingNetwork: Record<number, string> = {
  1: 'eth-mainnet',
  56: 'bsc-mainnet',
  97: 'bsc-testnet',
  137: 'polygon',
}

const _binanceChainListener = async () =>
  new Promise<void>((resolve) =>
    Object.defineProperty(window, 'BinanceChain', {
      get() {
        return this.bsc
      },
      set(bsc) {
        this.bsc = bsc

        resolve()
      },
    }),
  )

export function binanceWallet(config: { chains?: Chain[] } = {}) {
  const { chains: _chains } = config
  const chains = _chains?.filter((c) => !!mappingNetwork[c.id])
  
  return createConnector<Window['BinanceChain']>((config) => {
    const connector = new BinanceWalletConnector({
      chains,
      options: {
        name: 'Binance',
        shimDisconnect: false,
        shimChainChangedDisconnect: true,
      },
    })
    
    return {
      id: 'bsc',
      name: 'Binance Wallet',
      type: 'injected',
      
      connect: async ({ chainId } = {}) => {
        try {
          const provider = await connector.getProvider()
          if (!provider) throw new ConnectorNotFoundError()
          
          if (provider.on) {
            provider.on('accountsChanged', config.emitter.emit.bind(null, 'change', { account: connector.onAccountsChanged }))
            provider.on('chainChanged', config.emitter.emit.bind(null, 'change', { chainId: connector.onChainChanged }))
            provider.on('disconnect', config.emitter.emit.bind(null, 'disconnect'))
          }
          
          config.emitter.emit('message', { type: 'connecting' })
          
          const account = await connector.getAccount()
          let id = await connector.getChainId()
          
          if (chainId && id !== chainId) {
            const chain = await connector.switchChain(chainId)
            id = chain.id
          }
          
          return { account, chainId: id }
        } catch (error) {
          if (connector.isUserRejectedRequestError(error)) throw new UserRejectedRequestError(error)
          if ((error as any).code === -32002) throw new ResourceUnavailableError(error)
          throw error
        }
      },
      
      disconnect: async () => {
        const provider = await connector.getProvider()
        if (!provider?.removeListener) return
        
        provider.removeListener('accountsChanged', config.emitter.emit.bind(null, 'change', { account: connector.onAccountsChanged }))
        provider.removeListener('chainChanged', config.emitter.emit.bind(null, 'change', { chainId: connector.onChainChanged }))
        provider.removeListener('disconnect', config.emitter.emit.bind(null, 'disconnect'))
      },
      
      getAccount: async () => {
        return connector.getAccount()
      },
      
      getChainId: async () => {
        return connector.getChainId()
      },
      
      getProvider: async () => {
        return connector.getProvider()
      },
      
      isAuthorized: async () => {
        return connector.isAuthorized()
      },
      
      switchChain: async (chainId) => {
        return connector.switchChain(chainId)
      },
    }
  })
}

class BinanceWalletConnector extends InjectedConnector {
  readonly id = 'bsc'

  readonly ready = typeof window !== 'undefined'

  provider?: Window['BinanceChain']

  constructor({
    chains,
    options,
  }: {
    chains?: Chain[]
    options: {
      name: string
      shimDisconnect: boolean
      shimChainChangedDisconnect: boolean
    }
  }) {
    super({
      chains,
      options,
    })
  }

  async connect({ chainId }: { chainId?: number } = {}) {
    try {
      const provider = await this.getProvider()
      if (!provider) throw new ConnectorNotFoundError()

      // Wagmi v2 handles events differently through the connector config
      // Event handling is now managed in the binanceWallet function

      const account = await this.getAccount()
      // Switch to chain if provided
      let id = await this.getChainId()
      if (chainId && id !== chainId) {
        const chain = await this.switchChain(chainId)
        id = chain.id
      }

      return { account, chainId: id, provider }
    } catch (error) {
      if (this.isUserRejectedRequestError(error)) throw new UserRejectedRequestError(error)
      if ((error as any).code === -32002) throw new ResourceUnavailableError(error)
      throw error
    }
  }

  async getProvider() {
    if (typeof window !== 'undefined') {
      // TODO: Fallback to `ethereum#initialized` event for async injection
      // https://github.com/MetaMask/detect-provider#synchronous-and-asynchronous-injection=
      if (window.BinanceChain) {
        this.provider = window.BinanceChain
      } else {
        await _binanceChainListener()
        this.provider = window.BinanceChain
      }
    }
    return this.provider
  }

  async switchChain(chainId: number): Promise<Chain> {
    const provider = await this.getProvider()
    if (!provider) throw new ConnectorNotFoundError()

    const id = hexValue(chainId)

    if (mappingNetwork[chainId]) {
      try {
        await provider.switchNetwork?.(mappingNetwork[chainId])

        return (
          this.chains.find((x) => x.id === chainId) || {
            id: chainId,
            name: `Chain ${id}`,
            network: `${id}`,
            nativeCurrency: { decimals: 18, name: 'POL', symbol: 'POL' },
            rpcUrls: { 
              default: { http: [''] },
              public: { http: [''] }
            },
          }
        )
      } catch (error) {
        if ((error as any).error === 'user rejected') {
          throw new UserRejectedRequestError(error)
        }
      }
    }
    throw new SwitchChainNotSupportedError({ connector: this, chainId })
  }
}
