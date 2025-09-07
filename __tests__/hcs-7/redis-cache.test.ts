import { RedisCache } from '../../src/hcs-7/redis-cache';
import { Logger } from '../../src/utils/logger';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  }));
});

const Redis = require('ioredis');

describe('RedisCache', () => {
  let redisCache: RedisCache;
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    redisCache = new RedisCache({
      host: 'localhost',
      port: 6379,
      keyPrefix: 'test:',
    });
    mockRedisClient = Redis.mock.results[Redis.mock.results.length - 1].value;
  });

  afterEach(async () => {});

  describe('constructor', () => {
    test('initializes with default config', () => {
      const defaultCache = new RedisCache();

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
          db: 0,
          keyPrefix: '',
          tls: undefined,
          connectTimeout: 5000,
        }),
      );
    });

    test('initializes with custom config', () => {
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
          keyPrefix: 'test:',
        }),
      );
    });

    test('initializes with TLS enabled', () => {
      const tlsCache = new RedisCache({
        host: 'secure-redis.com',
        port: 6380,
        tls: true,
        password: 'secret',
      });

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'secure-redis.com',
          port: 6380,
          password: 'secret',
          tls: {},
        }),
      );
    });
  });

  describe('get', () => {
    test('retrieves value successfully', async () => {
      mockRedisClient.get.mockResolvedValue('cached-value');

      const result = await redisCache.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test:test-key');
      expect(result).toBe('cached-value');
    });

    test('returns undefined for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await redisCache.get('non-existent-key');

      expect(result).toBeUndefined();
    });

    test('handles Redis errors', async () => {
      mockRedisClient.get.mockRejectedValueOnce(
        new Error('Redis connection failed'),
      );

      await expect(redisCache.get('test-key')).rejects.toThrow(
        'Redis connection failed',
      );
    });
  });

  describe('set', () => {
    test('sets value successfully', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await redisCache.set('test-key', 'test-value');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test:test-key',
        'test-value',
      );
    });

    test('handles Redis errors', async () => {
      mockRedisClient.set.mockRejectedValueOnce(
        new Error('Redis write failed'),
      );

      await expect(redisCache.set('test-key', 'test-value')).rejects.toThrow(
        'Redis write failed',
      );
    });
  });

  describe('delete', () => {
    test('deletes value successfully', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await redisCache.delete('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test:test-key');
    });

    test('handles Redis errors', async () => {
      mockRedisClient.del.mockRejectedValueOnce(
        new Error('Redis delete failed'),
      );

      await expect(redisCache.delete('test-key')).rejects.toThrow(
        'Redis delete failed',
      );
    });
  });

  describe('clear', () => {
    test('clears all keys with prefix', async () => {
      mockRedisClient.keys.mockResolvedValue(['test:key1', 'test:key2']);
      mockRedisClient.del.mockResolvedValue(2);

      await redisCache.clear();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'test:key1',
        'test:key2',
      );
    });

    test('handles empty key list', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await redisCache.clear();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    test('handles Redis errors during clear', async () => {
      mockRedisClient.keys.mockRejectedValueOnce(
        new Error('Redis scan failed'),
      );

      await expect(redisCache.clear()).rejects.toThrow('Redis scan failed');
    });
  });

  describe('error handling', () => {
    test('handles connection errors', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(redisCache.get('test-key')).rejects.toThrow('ECONNREFUSED');
    });

    test('handles timeout errors', async () => {
      mockRedisClient.set.mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await expect(redisCache.set('test-key', 'value')).rejects.toThrow(
        'ETIMEDOUT',
      );
    });
  });

  describe('configuration validation', () => {
    test('validates Redis config parameters', () => {
      const validConfigs = [
        { host: 'localhost', port: 6379 },
        { host: 'redis.example.com', port: 6380, password: 'secret' },
        { host: '127.0.0.1', port: 6379, db: 1, keyPrefix: 'app:' },
      ];

      validConfigs.forEach(config => {
        const cache = new RedisCache(config);
        expect(cache).toBeInstanceOf(RedisCache);
      });
    });

    test('handles edge case configurations', () => {
      const edgeCaseConfig = {
        host: 'redis-cluster.example.com',
        port: 7000,
        password: '',
        db: 0,
        keyPrefix: '',
        tls: false,
        connectTimeout: 1000,
      };

      const cache = new RedisCache(edgeCaseConfig);
      expect(cache).toBeInstanceOf(RedisCache);
    });
  });
});
