type HederaNetwork = 'mainnet' | 'testnet';
type LedgerNetworkKind = 'hedera' | 'evm';

export interface CanonicalLedgerNetwork {
  canonical: string;
  kind: LedgerNetworkKind;
  hederaNetwork?: HederaNetwork;
  chainId?: number;
  legacyName?: string;
}

const normalise = (value: string): string => value.trim().toLowerCase();

const HEDERA_NETWORK_ALIASES = new Map<
  string,
  { canonical: `hedera:${HederaNetwork}`; hederaNetwork: HederaNetwork }
>([
  ['hedera:mainnet', { canonical: 'hedera:mainnet', hederaNetwork: 'mainnet' }],
  ['mainnet', { canonical: 'hedera:mainnet', hederaNetwork: 'mainnet' }],
  ['hedera-mainnet', { canonical: 'hedera:mainnet', hederaNetwork: 'mainnet' }],
  ['hedera_mainnet', { canonical: 'hedera:mainnet', hederaNetwork: 'mainnet' }],
  ['hedera:testnet', { canonical: 'hedera:testnet', hederaNetwork: 'testnet' }],
  ['testnet', { canonical: 'hedera:testnet', hederaNetwork: 'testnet' }],
  ['hedera-testnet', { canonical: 'hedera:testnet', hederaNetwork: 'testnet' }],
  ['hedera_testnet', { canonical: 'hedera:testnet', hederaNetwork: 'testnet' }],
]);

const EVM_NETWORK_CHAIN_IDS: Record<string, number> = {
  abstract: 2741,
  'abstract-testnet': 11124,
  base: 8453,
  'base-sepolia': 84532,
  avalanche: 43114,
  'avalanche-fuji': 43113,
  iotex: 4689,
  sei: 1329,
  'sei-testnet': 1328,
  polygon: 137,
  'polygon-amoy': 80002,
  peaq: 3338,
};

const CHAIN_ID_TO_ALIAS = new Map<number, string>(
  Object.entries(EVM_NETWORK_CHAIN_IDS).map(([alias, id]) => [id, alias]),
);

const parseChainId = (value: string): number | undefined => {
  if (/^eip155:\d+$/i.test(value)) {
    return Number.parseInt(value.split(':')[1]!, 10);
  }
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
};

const normaliseEvmNetwork = (value: string): CanonicalLedgerNetwork => {
  const trimmed = normalise(value);
  let chainId = parseChainId(trimmed);
  let alias: string | undefined;

  if (chainId === undefined) {
    const mapped = EVM_NETWORK_CHAIN_IDS[trimmed];
    if (mapped !== undefined) {
      chainId = mapped;
      alias = trimmed;
    }
  } else if (CHAIN_ID_TO_ALIAS.has(chainId)) {
    alias = CHAIN_ID_TO_ALIAS.get(chainId);
  }

  if (chainId === undefined) {
    throw new Error(
      'Unsupported EVM ledger network. Provide an alias like "base-sepolia" or a canonical eip155:<chainId> string.',
    );
  }

  return {
    canonical: `eip155:${chainId}`,
    kind: 'evm',
    chainId,
    legacyName: alias,
  };
};

const normaliseHederaNetwork = (value: string): CanonicalLedgerNetwork => {
  const trimmed = normalise(value);
  const mapping = HEDERA_NETWORK_ALIASES.get(trimmed);
  if (!mapping) {
    throw new Error(
      'Unsupported Hedera network. Use hedera:mainnet or hedera:testnet (legacy "mainnet"/"testnet" also accepted).',
    );
  }
  return {
    canonical: mapping.canonical,
    kind: 'hedera',
    hederaNetwork: mapping.hederaNetwork,
  };
};

export const canonicalizeLedgerNetwork = (
  network: string,
): CanonicalLedgerNetwork => {
  if (typeof network !== 'string' || network.trim().length === 0) {
    throw new Error('Ledger network is required.');
  }
  const trimmed = normalise(network);
  if (
    trimmed.startsWith('hedera:') ||
    trimmed.includes('hedera-') ||
    trimmed.includes('hedera_') ||
    trimmed === 'mainnet' ||
    trimmed === 'testnet'
  ) {
    return normaliseHederaNetwork(trimmed);
  }
  return normaliseEvmNetwork(trimmed);
};
