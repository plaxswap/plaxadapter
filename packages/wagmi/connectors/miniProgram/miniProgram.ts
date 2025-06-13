/* eslint-disable prefer-destructuring */
/* eslint-disable consistent-return */
/* eslint-disable class-methods-use-this */
import { getAddress, hexValue } from 'viem'
import { Chain, ConnectorNotFoundError, ResourceUnavailableError, UserRejectedRequestError, createConnector, SwitchChainNotSupportedError } from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors'
import type { Ethereum } from 'viem/window'

declare global {
  interface Window {
    bn?: any
  }
}

export function miniProgram(config: { chains?: Chain[], getWeb3Provider: () => any } = { getWeb3Provider: () => null }) {
  const { chains: _chains, getWeb3Provider } = config
  const chains = _chains
  
  return createConnector<Window['bn']>((config) => {
    const connector = new MiniProgramConnectorClass({
      chains,
      options: {
        name: 'BnInjected',
        shimDisconnect: false,
        shimChainChangedDisconnect: false,
      },
      getWeb3Provider,
    })
    
    return {
      id: 'miniprogram',
      name: 'MiniProgram',
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
      }
    }
  })
}

class MiniProgramConnectorClass extends InjectedConnector {
  readonly id = 'miniprogram'

  readonly ready = typeof window !== 'undefined' && !!window.bn

  provider?: any

  getWeb3Provider?: any

  constructor({ chains, options, getWeb3Provider }: { chains?: Chain[], options: any, getWeb3Provider: () => any }) {
    super({
      chains,
      options,
    })

    this.getWeb3Provider = getWeb3Provider
  }

  async connect({ chainId }: { chainId?: number } = {}) {
    try {
      const provider = await this.getProvider()
      if (!provider) throw new ConnectorNotFoundError()

      // Wagmi v2 handles events differently through the connector config
      // Event handling is now managed in the miniProgram function

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

  async getAccount(): Promise<`0x${string}`> {
    const provider = await this.getProvider()
    if (!provider) throw new ConnectorNotFoundError()
    const accounts = await provider.request({
      method: 'eth_accounts',
    })
    // return checksum address
    return getAddress(accounts[0] as string) as `0x${string}`
  }

  async getChainId(): Promise<number> {
    return 56
  }

  async getProvider() {
    if (typeof window !== 'undefined') {
      // TODO: Fallback to `ethereum#initialized` event for async injection
      // https://github.com/MetaMask/detect-provider#synchronous-and-asynchronous-injection=
      this.provider = this.getWeb3Provider()
    }
    return this.provider
  }
  
  async isAuthorized() {
    try {
      const provider = await this.getProvider()
      if (!provider) throw new ConnectorNotFoundError()
      const accounts = await provider.request({ method: 'eth_accounts' })
      const account = accounts[0]
      return !!account
    } catch {
      return false
    }
  }
  
  async switchChain(chainId: number): Promise<Chain> {
    const provider = await this.getProvider()
    if (!provider) throw new ConnectorNotFoundError()
    
    // MiniProgram connector only supports BSC (chainId 56)
    if (chainId !== 56) {
      throw new SwitchChainNotSupportedError({ chainId })
    }
    
    return {
      id: chainId,
      name: 'BNB Smart Chain',
      network: 'bsc',
      nativeCurrency: {
        name: 'BNB',
        symbol: 'BNB',
        decimals: 18,
      },
      rpcUrls: {
        default: { http: ['https://bsc-dataseed.binance.org/'] },
        public: { http: ['https://bsc-dataseed.binance.org/'] },
      },
      blockExplorers: {
        default: { name: 'BscScan', url: 'https://bscscan.com' },
      },
    }
  }
}
