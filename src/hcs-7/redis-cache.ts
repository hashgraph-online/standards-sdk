import { EVMCache } from './evm-bridge';
import { Logger, ILogger } from '../utils/logger';

type RedisOptions = {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls?: Record<string, unknown>;
  keyPrefix?: string;
  connectTimeout: number;
  retryStrategy?: (times: number) => number | void;
  maxRetriesPerRequest: number;
};

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  quit(): Promise<void>;
  on(event: 'error' | 'connect', listener: (error?: Error) => void): void;
};

type RedisConstructor = new (options: RedisOptions) => RedisClient;

type NodeRequire = (id: string) => unknown;

declare const require: NodeRequire | undefined;

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
  connectTimeout?: number;
  retryStrategy?: (times: number) => number | void;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class RedisCache implements EVMCache {
  private client: RedisClient;
  private prefix: string;
  private logger: ILogger;

  constructor(config: RedisConfig = {}) {
    const {
      host = 'localhost',
      port = 6379,
      password,
      db = 0,
      keyPrefix = '',
      tls = false,
      connectTimeout = 5000,
      retryStrategy,
      logLevel = 'info',
    } = config;

    this.prefix = keyPrefix;
    this.logger = Logger.getInstance({
      level: logLevel,
      module: 'RedisCache',
    });

    this.client = createRedisClient(
      this.logger,
      {
        host,
        port,
        password,
        db,
        tls: tls ? {} : undefined,
        keyPrefix,
        connectTimeout,
        retryStrategy:
          retryStrategy ||
          (times => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          }),
        maxRetriesPerRequest: 3,
      },
      true,
    );
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const value = await this.client.get(this.getKey(key));
      return value || undefined;
    } catch (error: unknown) {
      this.logger.error('Redis get error:', error);
      throw error;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      const fullKey = this.getKey(key);
      if (ttlSeconds) {
        await this.client.setex(fullKey, ttlSeconds, value);
      } else {
        await this.client.set(fullKey, value);
      }
    } catch (error: unknown) {
      this.logger.error('Redis set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.getKey(key));
    } catch (error: unknown) {
      this.logger.error('Redis delete error:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.client.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error: unknown) {
      this.logger.error('Redis clear error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logger.setLogLevel(level);
  }
}

function createRedisClient(
  logger: ILogger,
  options: RedisOptions,
  logConnectEvents: boolean,
): RedisClient {
  const Redis = getRedisConstructor();

  if (!Redis) {
    logger.warn(
      'ioredis is not installed; RedisCache will use an in-memory cache instead',
    );

    return createInMemoryRedisClient();
  }

  const client = new Redis({
    host: options.host,
    port: options.port,
    password: options.password,
    db: options.db,
    tls: options.tls,
    keyPrefix: options.keyPrefix,
    connectTimeout: options.connectTimeout,
    retryStrategy: options.retryStrategy,
    maxRetriesPerRequest: options.maxRetriesPerRequest,
  });

  if (logConnectEvents) {
    client.on('error', (error: Error) => {
      logger.error('Redis connection error:', error);
    });

    client.on('connect', () => {
      logger.debug('Redis connected');
    });
  }

  return client;
}

function getRedisConstructor(): RedisConstructor | null {
  if (typeof require !== 'function') {
    return null;
  }

  try {
    const loaded = require('ioredis') as
      | RedisConstructor
      | { default: RedisConstructor };

    if (typeof (loaded as RedisConstructor) === 'function') {
      return loaded as RedisConstructor;
    }

    if (
      typeof (loaded as { default?: RedisConstructor }).default === 'function'
    ) {
      return (loaded as { default: RedisConstructor }).default;
    }
  } catch {
    return null;
  }

  return null;
}

function createInMemoryRedisClient(): RedisClient {
  const store = new Map<string, string>();

  return {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<string | null> {
      store.set(key, value);
      return 'OK';
    },
    async setex(
      key: string,
      _seconds: number,
      value: string,
    ): Promise<string | null> {
      store.set(key, value);
      return 'OK';
    },
    async del(...keys: string[]): Promise<number> {
      let deleted = 0;
      for (const key of keys) {
        if (store.delete(key)) {
          deleted += 1;
        }
      }
      return deleted;
    },
    async keys(pattern: string): Promise<string[]> {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return Array.from(store.keys()).filter(key => key.startsWith(prefix));
      }
      return store.has(pattern) ? [pattern] : [];
    },
    async quit(): Promise<void> {
      store.clear();
    },
    on(): void {
      return;
    },
  };
}
