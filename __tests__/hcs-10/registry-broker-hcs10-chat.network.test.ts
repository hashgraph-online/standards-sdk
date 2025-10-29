import {
  normaliseNetwork,
  resolveNetwork,
  resolveNetworkScopedLedgerValue,
} from '../../demo/hcs-10/network';

const networkEnvKeys = [
  'HEDERA_NETWORK',
  'MAINNET_HEDERA_ACCOUNT_ID',
  'MAINNET_HEDERA_PRIVATE_KEY',
  'TESTNET_HEDERA_ACCOUNT_ID',
  'TESTNET_HEDERA_PRIVATE_KEY',
] as const;

const snapshotEnv = (): Record<(typeof networkEnvKeys)[number], string | undefined> => {
  return networkEnvKeys.reduce<Record<(typeof networkEnvKeys)[number], string | undefined>>(
    (acc, key) => {
      acc[key] = process.env[key];
      return acc;
    },
    {} as Record<(typeof networkEnvKeys)[number], string | undefined>,
  );
};

const restoreEnv = (
  snapshot: Record<(typeof networkEnvKeys)[number], string | undefined>,
): void => {
  for (const key of networkEnvKeys) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
};

const clearNetworkEnv = (): void => {
  for (const key of networkEnvKeys) {
    delete process.env[key];
  }
};

describe('HCS-10 chat demo network resolution', () => {
  const originalEnv = snapshotEnv();

  afterAll(() => {
    restoreEnv(originalEnv);
  });

  beforeEach(() => {
    clearNetworkEnv();
  });

  describe('normaliseNetwork', () => {
    it('returns canonical values for valid inputs', () => {
      expect(normaliseNetwork('mainnet')).toBe('mainnet');
      expect(normaliseNetwork('MAINNET')).toBe('mainnet');
      expect(normaliseNetwork('testnet')).toBe('testnet');
      expect(normaliseNetwork('TestNet')).toBe('testnet');
    });

    it('returns undefined for missing or invalid inputs', () => {
      expect(normaliseNetwork(undefined)).toBeUndefined();
      expect(normaliseNetwork('')).toBeUndefined();
      expect(normaliseNetwork('previewnet')).toBeUndefined();
    });
  });

  describe('resolveNetwork', () => {
    it('prefers explicit env configuration', () => {
      process.env.HEDERA_NETWORK = 'mainnet';
      expect(resolveNetwork('http://127.0.0.1:4000/api/v1')).toBe('mainnet');
    });

    it('infers production hostnames as mainnet', () => {
      expect(resolveNetwork('https://registry.hashgraphonline.com/api/v1')).toBe(
        'mainnet',
      );
    });

    it('treats staging and localhost hosts as testnet', () => {
      expect(resolveNetwork('https://registry-staging.hashgraphonline.com/api/v1')).toBe(
        'testnet',
      );
      expect(resolveNetwork('http://localhost:4000/api/v1')).toBe('testnet');
      expect(resolveNetwork('http://127.0.0.1:4000/api/v1')).toBe('testnet');
    });
  });

  describe('resolveNetworkScopedLedgerValue', () => {
    it('returns scoped env values when defined', () => {
      process.env.MAINNET_HEDERA_ACCOUNT_ID = ' 0.0.123 ';
      process.env.TESTNET_HEDERA_PRIVATE_KEY = ' 302e... ';
      expect(
        resolveNetworkScopedLedgerValue('mainnet', 'ACCOUNT_ID'),
      ).toBe('0.0.123');
      expect(
        resolveNetworkScopedLedgerValue('testnet', 'PRIVATE_KEY'),
      ).toBe('302e...');
    });

    it('returns undefined when scoped values are missing or blank', () => {
      delete process.env.MAINNET_HEDERA_PRIVATE_KEY;
      process.env.TESTNET_HEDERA_ACCOUNT_ID = '   ';
      expect(
        resolveNetworkScopedLedgerValue('mainnet', 'PRIVATE_KEY'),
      ).toBeUndefined();
      expect(
        resolveNetworkScopedLedgerValue('testnet', 'ACCOUNT_ID'),
      ).toBeUndefined();
    });
  });
});
