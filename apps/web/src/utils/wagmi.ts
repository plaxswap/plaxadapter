import { BinanceWalletConnector } from '@pancakeswap/wagmi/connectors/binanceWallet'
import { BloctoConnector } from '@pancakeswap/wagmi/connectors/blocto'
import { TrustWalletConnector } from '@pancakeswap/wagmi/connectors/trustWallet'
import { 
  // bsc, bscTestnet, goerli, 
  mainnet, polygon, polygonMumbai } from 'wagmi/chains'
// import { canto } from '../../../../packages/wagmi/src/chains'
// import { core } from '../../../../packages/wagmi/src/chains'
import { createConfig } from 'wagmi'
import { http } from 'viem'
import memoize from 'lodash/memoize'
import { coinbaseWallet } from 'wagmi/connectors'
import { injected } from 'wagmi/connectors'
import { metaMask } from 'wagmi/connectors'
import { walletConnect } from 'wagmi/connectors'
import { ledger } from 'wagmi/connectors'
import { safeWallet } from './safeConnectorV2'

// const CHAINS = [bsc, mainnet, bscTestnet, goerli, polygon]
const CHAINS = [polygon, polygonMumbai]

const getNodeRealUrl = (networkName: string) => {
  let host = null

  switch (networkName) {
    case 'homestead':
      if (process.env.NEXT_PUBLIC_NODE_REAL_API_ETH) {
        host = `eth-mainnet.nodereal.io/v1/${process.env.NEXT_PUBLIC_NODE_REAL_API_ETH}`
      }
      break
    case 'goerli':
      if (process.env.NEXT_PUBLIC_NODE_REAL_API_GOERLI) {
        host = `eth-goerli.nodereal.io/v1/${process.env.NEXT_PUBLIC_NODE_REAL_API_GOERLI}`
      }
      break
    default:
      host = null
  }

  if (!host) {
    return null
  }

  const url = `https://${host}`
  return {
    http: url,
    webSocket: url.replace(/^http/i, 'wss').replace('.nodereal.io/v1', '.nodereal.io/ws/v1'),
  }
}

// Definisikan fungsi untuk mendapatkan transport untuk setiap chain
const getTransport = (chain) => {
  if (!!process.env.NEXT_PUBLIC_NODE_PRODUCTION && chain.id === polygon.id) {
    return http(process.env.NEXT_PUBLIC_NODE_PRODUCTION)
  }
  if (process.env.NODE_ENV === 'test' && chain.id === mainnet.id) {
    return http('https://cloudflare-eth.com')
  }

  const nodeRealUrl = getNodeRealUrl(chain.network)
  if (nodeRealUrl) {
    return http(nodeRealUrl.http)
  }
  
  return http(chain.rpcUrls.default.http[0])
}

// Buat transports object untuk setiap chain
const transports = {}
CHAINS.forEach(chain => {
  transports[chain.id] = getTransport(chain)
})

// Definisikan chains yang didukung
const chains = CHAINS

// Definisikan connectors menggunakan wagmi v2 API
export const injectedConnector = injected({
  chains,
  options: {
    shimDisconnect: false,
  },
})

export const coinbaseConnector = coinbaseWallet({
  chains,
  options: {
    appName: 'PancakeSwap',
    appLogoUrl: 'https://pancakeswap.com/logo.png',
  },
})

export const walletConnectConnector = walletConnect({
  chains,
  options: {
    projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
    showQrModal: true,
  },
})

export const walletConnectNoQrCodeConnector = walletConnect({
  chains,
  options: {
    projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
    showQrModal: false,
  },
})

export const metaMaskConnector = metaMask({
  chains,
  options: {
    shimDisconnect: false,
  },
})

// Catatan: BloctoConnector perlu diperbarui untuk wagmi v2
const bloctoConnector = new BloctoConnector({
  chains,
  options: {
    defaultChainId: 137,
    appId: 'e2f2f0cd-3ceb-4dec-b293-bb555f2ed5af',
  },
})

const ledgerConnector = ledger({
  chains,
})

// Catatan: BinanceWalletConnector perlu diperbarui untuk wagmi v2
export const bscConnector = new BinanceWalletConnector({ chains })

// Catatan: TrustWalletConnector perlu diperbarui untuk wagmi v2
export const trustWalletConnector = new TrustWalletConnector({
  chains,
  options: {
    shimDisconnect: false,
    shimChainChangedDisconnect: true,
  },
})

// Buat konfigurasi wagmi menggunakan createConfig
export const config = createConfig({
  chains,
  transports,
  connectors: [
    // Menggunakan SafeConnector yang sudah diperbarui untuk wagmi v2
    safeWallet({ chains }),
    metaMaskConnector,
    injectedConnector,
    coinbaseConnector,
    walletConnectConnector,
    // Catatan: Connector berikut perlu diperbarui untuk wagmi v2
    // bscConnector,
    // bloctoConnector,
    ledgerConnector,
    // trustWalletConnector,
  ],
})

// Untuk kompatibilitas dengan kode lama
export const client = config

export const CHAIN_IDS = chains.map((c) => c.id)

export const isChainSupported = memoize((chainId: number) => CHAIN_IDS.includes(chainId))
export const isChainTestnet = memoize((chainId: number) => chains.find((c) => c.id === chainId)?.testnet)
