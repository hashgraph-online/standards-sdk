import { privateKeyToAccount } from 'viem/accounts';
import { canonicalizeLedgerNetwork } from '../../src/services/registry-broker/ledger-network';
import type { LedgerAuthenticationSignerResult } from '../../src/services/registry-broker/types';

export type HederaNetwork = 'mainnet' | 'testnet';

const normaliseNetwork = (value?: string | null): HederaNetwork => {
  const normalised = value?.trim().toLowerCase();
  if (
    normalised === 'hedera:mainnet' ||
    normalised === 'mainnet' ||
    normalised === 'hedera-mainnet' ||
    normalised === 'hedera_mainnet'
  ) {
    return 'mainnet';
  }
  return 'testnet';
};

const getScopedEnv = (
  network: HederaNetwork,
  suffix: string,
): string | undefined => {
  const prefix = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  const key = `${prefix}_HEDERA_${suffix}`;
  const value = process.env[key as keyof NodeJS.ProcessEnv];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
};

export const resolveAccountId = (): string => {
  const account = process.env.HEDERA_ACCOUNT_ID?.trim();
  if (account) {
    return account;
  }
  throw new Error('Set HEDERA_ACCOUNT_ID before running this demo.');
};

export const resolveLedgerNetwork = (): HederaNetwork =>
  normaliseNetwork(process.env.LEDGER_NETWORK ?? process.env.HEDERA_NETWORK);

export const resolveLedgerAccountId = (): string => {
  const network = resolveLedgerNetwork();
  const scoped =
    getScopedEnv(network, 'ACCOUNT_ID') ||
    process.env.HEDERA_ACCOUNT_ID?.trim() ||
    process.env.HEDERA_OPERATOR_ID?.trim();
  if (!scoped) {
    throw new Error(
      `Set ${network === 'mainnet' ? 'MAINNET' : 'TESTNET'}_HEDERA_ACCOUNT_ID or HEDERA_ACCOUNT_ID for ledger auth.`,
    );
  }
  return scoped;
};

export const resolveLedgerPrivateKey = (): string => {
  const network = resolveLedgerNetwork();
  const scoped =
    getScopedEnv(network, 'PRIVATE_KEY') ||
    process.env.HEDERA_PRIVATE_KEY?.trim() ||
    process.env.HEDERA_OPERATOR_KEY?.trim();
  if (!scoped) {
    throw new Error(
      `Set ${network === 'mainnet' ? 'MAINNET' : 'TESTNET'}_HEDERA_PRIVATE_KEY or HEDERA_PRIVATE_KEY for ledger auth.`,
    );
  }
  return scoped;
};

export const resolveWalletPrivateKey = (): `0x${string}` => {
  const key = process.env.ETH_PK?.trim();
  if (!key) {
    throw new Error('ETH_PK is required for x402 ledger authentication.');
  }
  return key.startsWith('0x') ? (key as `0x${string}`) : (`0x${key}` as const);
};

export const resolveEvmAccount = () =>
  privateKeyToAccount(resolveWalletPrivateKey());

export const resolveHederaLedgerAuthConfig = () => ({
  accountId: resolveLedgerAccountId(),
  privateKey: resolveLedgerPrivateKey(),
  network: resolveLedgerNetwork(),
});

const resolveEvmLedgerNetworkAlias = (): string =>
  (
    process.env.EVM_LEDGER_NETWORK ??
    process.env.CREDITS_ETH_NETWORK ??
    process.env.CREDITS_NETWORK ??
    'base-sepolia'
  ).trim();

export const resolveEvmLedgerNetwork = (): string =>
  resolveEvmLedgerNetworkAlias() || 'base-sepolia';

const toCanonicalEvmNetwork = (value: string): string => {
  const parsed = canonicalizeLedgerNetwork(value);
  if (parsed.kind !== 'evm') {
    throw new Error(
      `EVM ledger auth requires an EVM network alias or eip155:<chainId> value. Received: ${value}`,
    );
  }
  return parsed.canonical;
};

export interface EvmLedgerAuthConfig {
  accountId: `0x${string}`;
  network: string;
  privateKey: `0x${string}`;
  sign: (message: string) => Promise<LedgerAuthenticationSignerResult>;
  publicKey: string;
}

export const resolveEvmLedgerAuthConfig = (): EvmLedgerAuthConfig => {
  const privateKey = resolveWalletPrivateKey();
  const evmAccount = privateKeyToAccount(privateKey);
  const networkAlias = resolveEvmLedgerNetwork();
  const network = toCanonicalEvmNetwork(networkAlias);
  return {
    accountId: evmAccount.address,
    network,
    privateKey,
    publicKey: evmAccount.publicKey,
    sign: async (message: string) => ({
      signature: await evmAccount.signMessage({ message }),
      signatureKind: 'evm',
      publicKey: evmAccount.publicKey,
    }),
  };
};
