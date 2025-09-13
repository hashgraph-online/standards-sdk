/**
 * CAIP helpers for Hedera alignment in HCS-14.
 */

export type HederaNetwork = 'mainnet' | 'testnet' | 'previewnet' | 'devnet';

const HEDERA_NETWORKS: HederaNetwork[] = [
  'mainnet',
  'testnet',
  'previewnet',
  'devnet',
];

export function isHederaNetwork(value: string): value is HederaNetwork {
  return HEDERA_NETWORKS.includes(value as HederaNetwork);
}

const CAIP10_HEDERA_REGEX =
  /^hedera:(mainnet|testnet|previewnet|devnet):\d+\.\d+\.\d+(?:-[a-zA-Z0-9]{5})?$/;

export function isHederaCaip10(value: string): boolean {
  return CAIP10_HEDERA_REGEX.test(value);
}

export function toHederaCaip10(
  network: HederaNetwork,
  accountId: string,
): string {
  if (!isHederaNetwork(network)) {
    throw new Error('Invalid Hedera network');
  }
  if (accountId.startsWith('hedera:')) {
    if (isHederaCaip10(accountId)) return accountId;
    throw new Error('Invalid Hedera CAIP-10 account');
  }
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9]{5})?$/.test(accountId)) {
    throw new Error('Invalid Hedera accountId format');
  }
  return `hedera:${network}:${accountId}`;
}

export function parseHederaCaip10(value: string): {
  network: HederaNetwork;
  accountId: string;
} {
  if (!isHederaCaip10(value)) throw new Error('Invalid Hedera CAIP-10');
  const [, net, account] = value.match(/^hedera:([^:]+):(.+)$/)!;
  return { network: net as HederaNetwork, accountId: account };
}

const EIP155_REGEX = /^eip155:(\d+):(0x[0-9a-fA-F]{39,40})$/;

export function isEip155Caip10(value: string): boolean {
  return EIP155_REGEX.test(value);
}

export function toEip155Caip10(
  chainId: number | string,
  address: string,
): string {
  const chain = typeof chainId === 'number' ? String(chainId) : chainId;
  const addr = address.startsWith('0x') ? address : `0x${address}`;
  const value = `eip155:${chain}:${addr}`;
  if (!isEip155Caip10(value)) throw new Error('Invalid EIP-155 CAIP-10');
  return value;
}
