import { useCallback } from 'react'
import { useAccount, useSignMessage as useSignMessageWagmi } from 'wagmi'

// Definisikan tipe untuk kompatibilitas dengan wagmi v2
type SignMessageArgs = {
  message: string | Uint8Array
}

export function useSignMessage() {
  const { address, connector } = useAccount()
  const { signMessageAsync } = useSignMessageWagmi()

  return {
    signMessageAsync: useCallback(
      async (args: SignMessageArgs) => {
        // Untuk connector Binance Wallet
        if (connector?.id === 'bsc' && window.BinanceChain && address) {
          try {
            // @ts-ignore
            const res = await window.BinanceChain.bnbSign?.(address, args.message as string)
            if (res) {
              return res.signature
            }
            return null
          } catch (error) {
            console.error('Failed to sign message with Binance Wallet', error)
            throw error
          }
        }
        
        // Gunakan wagmi v2 signMessageAsync
        return signMessageAsync(args)
      },
      [address, connector?.id, signMessageAsync],
    ),
  }
}
