import { EVMBridge, MapCache } from '../../src/hcs-7/evm-bridge';
import { Logger } from '../../src/utils/logger';

jest.mock('ethers', () => ({
  ethers: {
    Contract: jest.fn().mockImplementation(() => ({
      [Symbol.iterator]: function* () {
        yield { name: 'testFunction' };
      },
    })),
    providers: {
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getNetwork: jest.fn().mockResolvedValue({ chainId: 296 }),
      })),
    },
  },
}));

describe('EVMBridge', () => {
  let logger: Logger;
  let bridge: EVMBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger({ module: 'EVMBridgeTest' });
    bridge = new EVMBridge(
      'testnet',
      'https://test-mirror-node.com',
      new MapCache(),
    );
  });

  describe('constructor', () => {
    test('initializes with provided parameters', () => {
      const customCache = new MapCache();
      const customBridge = new EVMBridge(
        'mainnet',
        'https://custom-mirror.com',
        customCache,
      );

      expect(customBridge.network).toBe('mainnet');
      expect(customBridge.mirrorNodeUrl).toBe('https://custom-mirror.com');
    });

    test('uses default parameters when not provided', () => {
      const defaultBridge = new EVMBridge();

      expect(defaultBridge.network).toBe('mainnet-public');
      expect(defaultBridge.mirrorNodeUrl).toBe(
        'mirrornode.hedera.com/api/v1/contracts/call',
      );
    });

    test('creates default cache when none provided', () => {
      const defaultCacheBridge = new EVMBridge('testnet');

      expect(defaultCacheBridge).toBeInstanceOf(EVMBridge);
    });
  });

  describe('MapCache', () => {
    let cache: MapCache;

    beforeEach(() => {
      cache = new MapCache();
    });

    test('stores and retrieves values', () => {
      cache.set('testKey', 'testValue');
      expect(cache.get('testKey')).toBe('testValue');
    });

    test('returns undefined for non-existent keys', () => {
      expect(cache.get('nonExistentKey')).toBeUndefined();
    });

    test('deletes values', () => {
      cache.set('testKey', 'testValue');
      cache.delete('testKey');
      expect(cache.get('testKey')).toBeUndefined();
    });

    test('clears all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });
});
