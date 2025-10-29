export type SupportedNetwork = 'mainnet' | 'testnet';

export const normaliseNetwork = (
  value: string | undefined,
): SupportedNetwork | undefined => {
  if (!value) {
    return undefined;
  }
  const lowered = value.trim().toLowerCase();
  if (lowered === 'mainnet') {
    return 'mainnet';
  }
  if (lowered === 'testnet') {
    return 'testnet';
  }
  return undefined;
};

export const resolveNetwork = (baseUrl: string): SupportedNetwork => {
  const envNetwork = normaliseNetwork(process.env.HEDERA_NETWORK);
  if (envNetwork) {
    return envNetwork;
  }

  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host.includes('registry.hashgraphonline.com')) {
      return 'mainnet';
    }
    if (
      host.includes('registry-staging.') ||
      host.includes('staging.') ||
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '::1'
    ) {
      return 'testnet';
    }
  } catch {}
  return 'testnet';
};

export const resolveNetworkScopedLedgerValue = (
  network: SupportedNetwork,
  key: 'ACCOUNT_ID' | 'PRIVATE_KEY',
): string | undefined => {
  const prefix = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  const envKey = `${prefix}_HEDERA_${key}` as keyof NodeJS.ProcessEnv;
  const rawValue = process.env[envKey];
  if (typeof rawValue !== 'string') {
    return undefined;
  }
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
