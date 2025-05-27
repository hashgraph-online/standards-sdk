import { EVMCache } from './evm-bridge';
// NOTE: This module requires 'ioredis' to be installed:
// npm install ioredis
// npm install @types/ioredis --save-dev
import Redis from 'ioredis';
import { Logger } from '../utils/logger';

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
  private client: Redis;
  private prefix: string;
  private logger: Logger;

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

    this.client = new Redis({
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
    });

    this.client.on('error', (error: Error) => {
      this.logger.error('Redis connection error:', error);
    });

    this.client.on('connect', () => {
      this.logger.debug('Redis connected');
    });
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
      return undefined;
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
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.getKey(key));
    } catch (error: unknown) {
      this.logger.error('Redis delete error:', error);
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
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logger.setLogLevel(level);
  }
}
