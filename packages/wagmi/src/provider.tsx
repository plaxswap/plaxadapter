import { Web3Provider } from '@ethersproject/providers'
import React from 'react'
import useSWRImmutable from 'swr/immutable'
import { useAccount, useConfig, useConnect, useDisconnect, useChains } from 'wagmi'
import { WagmiProvider as WagmiConfigProvider } from 'wagmi'

export function WagmiProvider(
  props: React.PropsWithChildren<{ config: Parameters<typeof WagmiConfigProvider>[0] }>,
) {
  return (
    <WagmiConfigProvider {...props.config}>
      <Web3LibraryProvider>{props.children}</Web3LibraryProvider>
    </WagmiConfigProvider>
  )
}

const Web3LibraryContext = React.createContext<Web3Provider | undefined>(undefined)

export const useWeb3LibraryContext = () => {
  return React.useContext(Web3LibraryContext)
}

const Web3LibraryProvider: React.FC<React.PropsWithChildren> = (props) => {
  const { connector } = useAccount()
  const config = useConfig()
  const chains = useChains()
  const currentChain = chains.find(c => c.id === config.state.chainId)
  
  const { data: library } = useSWRImmutable(connector && ['web3-library', connector, currentChain], async () => {
    if (!connector) return undefined
    try {
      // Untuk kompatibilitas dengan kode lama, kita masih menggunakan Web3Provider dari ethers
      // Dalam implementasi sebenarnya, sebaiknya beralih ke viem
      const provider = await connector.getProvider?.()
      if (!provider) return undefined
      return new Web3Provider(provider as any)
    } catch (error) {
      console.error('Failed to get Web3Provider', error)
      return undefined
    }
  })

  return <Web3LibraryContext.Provider value={library}>{props.children}</Web3LibraryContext.Provider>
}
