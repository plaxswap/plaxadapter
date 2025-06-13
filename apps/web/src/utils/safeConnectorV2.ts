/* eslint-disable lines-between-class-members */

// Implementasi SafeConnector untuk wagmi v2
import { SafeAppProvider } from '@gnosis.pm/safe-apps-provider';
import SafeAppsSDK, { Opts as SafeOpts, SafeInfo } from '@gnosis.pm/safe-apps-sdk';
import { getAddress } from 'viem';
import { createConnector } from 'wagmi';
import { Chain } from 'wagmi/chains';

const __IS_SERVER__ = typeof window === 'undefined';
const __IS_IFRAME__ = !__IS_SERVER__ && window?.parent !== window;

function normalizeChainId(chainId: string | number) {
  if (typeof chainId === 'string') {
    const isHex = chainId.trim().substring(0, 2);

    return Number.parseInt(chainId, isHex === '0x' ? 16 : 10);
  }
  return chainId;
}

export function safeWallet(config: { chains?: readonly Chain[]; options?: SafeOpts }) {
  let sdk: SafeAppsSDK;
  let safe: SafeInfo | undefined;
  let provider: SafeAppProvider | undefined;

  return createConnector<SafeAppProvider>(({ chains, emit }) => ({
    id: 'safe',
    name: 'Safe',
    type: 'safe',
    async connect() {
      const runningAsSafeApp = await this.isSafeApp();
      if (!runningAsSafeApp) {
        throw new Error('Not running in Safe App context');
      }

      const provider = await this.getProvider();
      const chainId = await this.getChainId();
      const accounts = await this.getAccounts();

      return { accounts, chainId };
    },
    async disconnect() {
      provider = undefined;
      safe = undefined;
    },
    async getAccounts() {
      if (!safe) {
        throw new Error('Safe info not available');
      }

      return [getAddress(safe.safeAddress)];
    },
    async getChainId() {
      if (!provider) {
        throw new Error('Provider not available');
      }

      return normalizeChainId(provider.chainId);
    },
    async getSafeInfo(): Promise<SafeInfo> {
      if (!sdk) {
        throw new Error('SDK not initialized');
      }
      if (!safe) {
        safe = await sdk.safe.getInfo();
      }
      return safe;
    },
    async isSafeApp(): Promise<boolean> {
      if (!__IS_IFRAME__) {
        return false;
      }

      const safe = await Promise.race([
        this.getSafeInfo(),
        new Promise<void>((resolve) => setTimeout(resolve, 300)),
      ]);
      return !!safe;
    },
    async getProvider() {
      if (!provider) {
        const safeInfo = await this.getSafeInfo();
        if (!safeInfo) {
          throw new Error('Could not load Safe information');
        }

        provider = new SafeAppProvider(safeInfo, sdk);
      }
      return provider;
    },
    async isAuthorized() {
      try {
        const accounts = await this.getAccounts();
        return !!accounts.length;
      } catch {
        return false;
      }
    },
    onAccountsChanged(accounts: string[]) {
      if (accounts.length === 0) emit.disconnect();
      else emit.change({ accounts: accounts.map((account) => getAddress(account)) });
    },
    onChainChanged(chainId: string | number) {
      const id = normalizeChainId(chainId);
      emit.change({ chainId: id });
    },
    onDisconnect() {
      emit.disconnect();
    },
    setup() {
      sdk = new SafeAppsSDK(config.options);
      return {
        ready: !__IS_SERVER__ && __IS_IFRAME__,
      };
    },
  }));
}