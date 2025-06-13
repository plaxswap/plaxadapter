/* eslint-disable prefer-destructuring */
/* eslint-disable consistent-return */
/* eslint-disable class-methods-use-this */
import {
  Chain,
  ConnectorNotFoundError,
  ResourceUnavailableError,
  ChainNotConfiguredError,
  UserRejectedRequestError,
  createConnector,
} from 'wagmi'
import { Connector } from 'wagmi/connectors'
import type { EthereumProviderInterface } from '@blocto/sdk'
import { getAddress, normalizeChainId } from 'viem'
import { createWalletClient, custom } from 'viem'

const chainIdToNetwork: { [network: number]: string } = {
  1: 'mainnet',
  3: 'ropsten',
  4: 'rinkeby',
  42: 'kovan',
  56: 'bsc', // BSC Mainnet
  97: 'chapel', // BSC Testnet
  137: 'polygon', // Polygon Mainnet
  80001: 'mumbai', // Polygon Testnet
  43114: 'avalanche', // Avalanche Mainnet
  43113: 'fuji', // Avalanche Testnet
}

export function blocto(config: { 
  chains?: Chain[]; 
  options?: { defaultChainId: number; appId?: string } 
} = { options: { defaultChainId: 56 } }) {
  const { chains: _chains, options } = config
  const chains = _chains?.filter((c) => !!chainIdToNetwork[c.id])
  const defaultOptions = { defaultChainId: 56, ...options }
  
  return createConnector<EthereumProviderInterface>((config) => {
    const connector = new BloctoConnectorClass({
      chains,
      options: defaultOptions,
    })
    
    return {
      id: 'blocto',
      name: 'Blocto',
      type: 'injected',
      
      connect: async ({ chainId } = {}) => {
        try {
          const provider = await connector.getProvider({ chainId })
          if (!provider) throw new ConnectorNotFoundError()
          
          if (provider.on) {
            provider.on('accountsChanged', config.emitter.emit.bind(null, 'change', { account: connector.onAccountsChanged }))
            provider.on('chainChanged', config.emitter.emit.bind(null, 'change', { chainId: connector.onChainChanged }))
            provider.on('disconnect', config.emitter.emit.bind(null, 'disconnect'))
          }
          
          config.emitter.emit('message', { type: 'connecting' })
          
          const account = await connector.getAccount()
          const id = await connector.getChainId()
          
          return { account, chainId: id }
        } catch (error) {
          connector.disconnect()
          if (connector.isUserRejectedRequestError(error)) throw new UserRejectedRequestError(error)
          if ((error as any).code === -32002) throw new ResourceUnavailableError(error)
          throw error
        }
      },
      
      disconnect: async () => {
        await connector.disconnect()
      },
      
      getAccount: async () => {
        return connector.getAccount()
      },
      
      getChainId: async () => {
        return connector.getChainId()
      },
      
      getProvider: async ({ chainId } = {}) => {
        return connector.getProvider({ chainId })
      },
      
      isAuthorized: async () => {
        return connector.isAuthorized()
      },
      
      getWalletClient: async ({ chainId } = {}) => {
        const [provider, account] = await Promise.all([
          connector.getProvider({ chainId }),
          connector.getAccount(),
        ])
        if (!provider) throw new ConnectorNotFoundError()
        return createWalletClient({
          account,
          chain: config.chains.find((x) => x.id === chainId) ?? config.chains[0],
          transport: custom(provider),
        })
      },
    }
  })
}

class BloctoConnectorClass extends Connector {
  readonly id = 'blocto'

  readonly name = 'Blocto'

  readonly ready = typeof window !== 'undefined'

  provider?: EthereumProviderInterface
  
  options: { defaultChainId: number; appId?: string }

  constructor(
    config: { chains?: Chain[]; options: { defaultChainId: number; appId?: string } } = {
      options: { defaultChainId: 56 },
    },
  ) {
    super(config)
    this.options = config.options
  }

  async connect({ chainId }: { chainId?: number } = {}) {
    try {
      const provider = await this.getProvider({ chainId })
      if (!provider) throw new ConnectorNotFoundError()

      // Wagmi v2 handles events differently through the connector config
      // Event handling is now managed in the blocto function

      const account = await this.getAccount()
      const id = await this.getChainId()

      return { account, chainId: id, provider }
    } catch (error) {
      this.disconnect()
      if (this.isUserRejectedRequestError(error)) throw new UserRejectedRequestError(error)
      if ((error as any).code === -32002) throw new ResourceUnavailableError(error)
      throw error
    }
  }

  async getProvider({ chainId }: { chainId?: number } = {}) {
    // Force create new provider
    if (!this.provider || chainId) {
      const rpc = this.chains.reduce(
        // eslint-disable-next-line @typescript-eslint/no-shadow
        (rpc, chain) => ({ ...rpc, [chain.id]: chain.rpcUrls.default.http[0] }),
        {} as Record<number, string>,
      )

      let targetChainId = chainId
      if (!targetChainId) {
        const fallbackChainId = this.options.defaultChainId
        if (fallbackChainId && !this.isChainUnsupported(fallbackChainId)) targetChainId = fallbackChainId
      }

      if (!targetChainId) throw new ChainNotConfiguredError({ chainId: targetChainId || 0, connectorId: this.id })

      const BloctoSDK = (await import('@blocto/sdk')).default
      this.provider = new BloctoSDK({
        appId: this.options.appId,
        ethereum: {
          chainId: targetChainId,
          rpc: rpc[targetChainId],
        },
      }).ethereum
    }

    if (!this.provider) throw new ConnectorNotFoundError()

    return this.provider
  }

  async isAuthorized(): Promise<boolean> {
    try {
      const provider = await this.getProvider()
      if (!provider) throw new ConnectorNotFoundError()
      const accounts = provider.accounts
      const account = accounts[0]
      return !!account
    } catch {
      return false
    }
  }

  async getAccount(): Promise<`0x${string}`> {
    const provider = await this.getProvider()
    if (!provider) throw new ConnectorNotFoundError()
    const accounts = await provider.request({
      method: 'eth_requestAccounts',
    })
    // return checksum address
    return getAddress(accounts[0] as string) as `0x${string}`
  }

  async getChainId() {
    const provider = await this.getProvider()
    if (!provider) throw new ConnectorNotFoundError()
    return provider.request({ method: 'eth_chainId' }).then(normalizeChainId)
  }

  onAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) return { account: undefined }
    return { account: getAddress(accounts[0] as string) as `0x${string}` }
  }

  onChainChanged = (chainId: number | string) => {
    const id = normalizeChainId(chainId)
    return { chainId: id }
  }

  async disconnect() {
    const provider = await this.getProvider()
    if (!provider?.removeListener) return
  }

  isUserRejectedRequestError(error: unknown) {
    return (error as any).code === 4001
  }
  
  isChainUnsupported(chainId: number) {
    return !this.chains.some((chain) => chain.id === chainId)
  }
}
