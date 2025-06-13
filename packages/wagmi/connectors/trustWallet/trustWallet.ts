/* eslint-disable prefer-destructuring */
/* eslint-disable consistent-return */
/* eslint-disable class-methods-use-this */
import { Chain, ConnectorNotFoundError, ResourceUnavailableError, UserRejectedRequestError, createConnector, SwitchChainNotSupportedError, SwitchChainError, AddChainError } from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors'
import { getAddress, hexValue } from 'viem'
import type { Ethereum } from 'viem/window'

declare global {
  interface Window {
    trustwallet?: Ethereum
  }
}

const mappingNetwork: Record<number, string> = {
  1: 'eth-mainnet',
  5: 'eth-goerli',
  56: 'bsc-mainnet',
  97: 'bsc-testnet',
  137: 'polygon',
}

export function getTrustWalletProvider() {
  const isTrustWallet = (ethereum: NonNullable<Window['ethereum']>) => {
    // Identify if Trust Wallet injected provider is present.
    const trustWallet = !!ethereum.isTrust

    return trustWallet
  }

  const injectedProviderExist = typeof window !== 'undefined' && typeof window.ethereum !== 'undefined'

  // No injected providers exist.
  if (!injectedProviderExist) {
    return
  }

  // Trust Wallet was injected into window.ethereum.
  if (isTrustWallet(window.ethereum as NonNullable<Window['ethereum']>)) {
    return window.ethereum
  }

  // Trust Wallet provider might be replaced by another
  // injected provider, check the providers array.
  if (window.ethereum?.providers) {
    return window.ethereum.providers.find(isTrustWallet)
  }

  // In some cases injected providers can replace window.ethereum
  // without updating the providers array. In those instances the Trust Wallet
  // can be installed and its provider instance can be retrieved by
  // looking at the global `trustwallet` object.
  return window.trustwallet
}

export function trustWallet(config: { 
  chains?: Chain[]
  options?: {
    shimDisconnect?: boolean
    shimChainChangedDisconnect?: boolean
  }
} = {}) {
  const { chains: _chains, options: _options } = config
  const chains = _chains?.filter((c) => !!mappingNetwork[c.id])
  const options = {
    name: 'Trust Wallet',
    shimDisconnect: _options?.shimDisconnect ?? false,
    shimChainChangedDisconnect: _options?.shimChainChangedDisconnect ?? true,
  }
  
  return createConnector<Window['trustwallet']>((config) => {
    const connector = new TrustWalletConnectorClass({
      chains,
      options,
    })
    
    return {
      id: 'trustWallet',
      name: 'Trust Wallet',
      type: 'injected',
      
      connect: async ({ chainId } = {}) => {
        try {
          return await connector.connect({ chainId })
        } catch (error) {
          connector.handleFailedConnect(error as Error)
        }
      },
      
      disconnect: async () => {
        const provider = await connector.getProvider()
        if (!provider?.removeListener) return
        
        provider.removeListener('accountsChanged', config.emitter.emit.bind(null, 'change', { account: connector.onAccountsChanged }))
        provider.removeListener('chainChanged', config.emitter.emit.bind(null, 'change', { chainId: connector.onChainChanged }))
        provider.removeListener('disconnect', config.emitter.emit.bind(null, 'disconnect'))
        
        if (connector.options?.shimDisconnect) {
          config.storage?.removeItem(connector.shimDisconnectKey)
        }
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
        const chain = await connector.switchChain(chainId)
        return chain.id
      },
    }
  })
}

class TrustWalletConnectorClass extends InjectedConnector {
  readonly id = 'trustWallet'

  handleFailedConnect(error: Error): never {
    if (this.isUserRejectedRequestError(error)) {
      throw new UserRejectedRequestError(error)
    }

    if ((error as any).code === -32002) {
      throw new ResourceUnavailableError(error)
    }

    throw error
  }

  async connect({ chainId }: { chainId?: number } = {}) {
    try {
      const provider = await this.getProvider()
      if (!provider) {
        throw new ConnectorNotFoundError()
      }

      // Wagmi v2 handles events differently through the connector config
      // Event handling is now managed in the trustWallet function

      // Attempt to show wallet select prompt with `wallet_requestPermissions` when
      // `shimDisconnect` is active and account is in disconnected state (flag in storage)
      let account: `0x${string}` | null = null
      if (this.options?.shimDisconnect) {
        try {
          account = await this.getAccount()
          // Attempt to show another prompt for selecting wallet if already connected
          try {
            await provider.request({
              method: 'wallet_requestPermissions',
              params: [{ eth_accounts: {} }],
            })
            // User may have selected a different account so we will need to revalidate here.
            account = await this.getAccount()
          } catch (error) {
            // Only bubble up error if user rejects request
            if (this.isUserRejectedRequestError(error)) {
              throw new UserRejectedRequestError(error)
            }
          }
        } catch (error) {
          // Ignore error and continue with eth_requestAccounts
        }
      }

      if (!account) {
        const accounts = await provider.request({
          method: 'eth_requestAccounts',
        })
        account = getAddress(accounts[0] as string) as `0x${string}`
      }

      // Switch to chain if provided
      let id = await this.getChainId()
      if (chainId && id !== chainId) {
        const chain = await this.switchChain(chainId)
        id = chain.id
      }

      return { account, chainId: id, provider }
    } catch (error) {
      this.handleFailedConnect(error as Error)
    }
  }

  async getProvider() {
    const provider = getTrustWalletProvider()
    return provider
  }

  async switchChain(chainId: number) {
    const provider = await this.getProvider()
    if (!provider) {
      throw new ConnectorNotFoundError()
    }

    const id = hexValue(chainId)

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: id }],
      })
      return { id: chainId }
    } catch (error) {
      const message = typeof error === 'string' ? error : (error as any)?.message
      if (/user rejected request/i.test(message)) {
        throw new UserRejectedRequestError(error)
      }

      const chain = this.chains.find((x) => x.id === chainId)
      if (!chain) {
        throw new SwitchChainNotSupportedError({ chainId, connector: this })
      }

      // Indicates chain is not added to provider
      if ((error as any).code === 4902 || /chain not added/i.test(message)) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: id,
                chainName: chain.name,
                nativeCurrency: chain.nativeCurrency,
                rpcUrls: [chain.rpcUrls.default.http[0] ?? ''],
                blockExplorerUrls: this.getBlockExplorerUrls(chain),
              },
            ],
          })
          const currentChainId = await this.getChainId()
          if (currentChainId !== chainId) {
            throw new Error('Failed to switch chain')
          }
          return { id: chainId }
        } catch (error) {
          if (/user rejected request/i.test((error as any)?.message)) {
            throw new UserRejectedRequestError(error)
          }
          throw new AddChainError()
        }
      }

      throw new SwitchChainError(error)
    }
  }

  private getBlockExplorerUrls(chain: Chain) {
    const blockExplorers = chain.blockExplorers
    if (blockExplorers?.default?.url) {
      return [blockExplorers.default.url]
    }
    return undefined
  }
}
