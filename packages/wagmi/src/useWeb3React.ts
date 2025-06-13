import { useAccount, useNetwork, useConfig } from 'wagmi'

export function useWeb3React() {
  const { chain } = useNetwork()
  const { address, connector, isConnected, status } = useAccount()
  const config = useConfig()

  return {
    chainId: chain?.id,
    account: isConnected ? address : null, // TODO: migrate using `isConnected` instead of account to check wallet auth
    isConnected,
    isConnecting: status === 'connecting',
    chain,
    connector,
    config,
  }
}
