/**
 * Performance optimization utilities for quote generation
 */

import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import { HederaClientConfig, InscriptionOptions, QuoteResult } from './types';

interface CacheKey {
  inputHash: string;
  clientConfigHash: string;
  optionsHash: string;
}

interface CacheEntry {
  quote: QuoteResult;
  timestamp: number;
  ttlMs: number;
}

interface SDKCacheEntry {
  sdk: InscriptionSDK;
  timestamp: number;
  config: string;
}

/**
 * LRU Cache for quote results to improve performance
 */
class QuoteCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 100;
  private defaultTtlMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate cache key from input parameters
   */
  private generateKey(key: CacheKey): string {
    return `${key.inputHash}-${key.clientConfigHash}-${key.optionsHash}`;
  }

  /**
   * Hash object to string for cache key
   */
  private hashObject(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64').slice(0, 16);
  }

  /**
   * Create cache key from parameters
   */
  createCacheKey(
    input: unknown,
    clientConfig: HederaClientConfig,
    options: InscriptionOptions,
  ): CacheKey {
    return {
      inputHash: this.hashObject(input),
      clientConfigHash: this.hashObject({
        accountId: clientConfig.accountId,
        network: clientConfig.network,
      }),
      optionsHash: this.hashObject({
        mode: options.mode,
        apiKey: options.apiKey ? 'present' : 'absent',
        network: options.network,
        metadata: options.metadata,
      }),
    };
  }

  /**
   * Get cached quote if available and not expired
   */
  get(key: CacheKey): QuoteResult | null {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttlMs) {
      this.cache.delete(cacheKey);
      return null;
    }

    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);

    return entry.quote;
  }

  /**
   * Store quote in cache
   */
  set(
    key: CacheKey,
    quote: QuoteResult,
    ttlMs: number = this.defaultTtlMs,
  ): void {
    const cacheKey = this.generateKey(key);

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(cacheKey, {
      quote,
      timestamp: Date.now(),
      ttlMs,
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * SDK instance cache for reuse
 */
class SDKCache {
  private cache = new Map<string, SDKCacheEntry>();
  private maxSize = 10;
  private defaultTtlMs = 30 * 60 * 1000; // 30 minutes

  /**
   * Generate config key for SDK instance
   */
  private generateConfigKey(config: unknown): string {
    return Buffer.from(JSON.stringify(config)).toString('base64');
  }

  /**
   * Get cached SDK instance
   */
  get(config: Record<string, unknown>): InscriptionSDK | null {
    const configKey = this.generateConfigKey(config);
    const entry = this.cache.get(configKey);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.defaultTtlMs) {
      this.cache.delete(configKey);
      return null;
    }

    return entry.sdk;
  }

  /**
   * Store SDK instance in cache
   */
  set(config: Record<string, unknown>, sdk: InscriptionSDK): void {
    const configKey = this.generateConfigKey(config);

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(configKey, {
      sdk,
      timestamp: Date.now(),
      config: configKey,
    });
  }

  /**
   * Clear all cached SDK instances
   */
  clear(): void {
    this.cache.clear();
  }
}

// Global cache instances
const quoteCache = new QuoteCache();
const sdkCache = new SDKCache();

/**
 * Get or create SDK instance with caching
 */
export async function getOrCreateSDK(
  clientConfig: HederaClientConfig,
  options: InscriptionOptions,
  existingSDK?: InscriptionSDK,
): Promise<InscriptionSDK> {
  if (existingSDK) {
    return existingSDK;
  }

  const cacheConfig = {
    apiKey: options.apiKey,
    accountId: clientConfig.accountId,
    network: clientConfig.network || 'mainnet',
    authType: options.apiKey ? 'api' : 'server',
  };

  const cachedSDK = sdkCache.get(cacheConfig);
  if (cachedSDK) {
    return cachedSDK;
  }

  let sdk: InscriptionSDK;

  if (options.apiKey) {
    sdk = new InscriptionSDK({
      apiKey: options.apiKey,
      network: clientConfig.network || 'mainnet',
    });
  } else {
    sdk = await InscriptionSDK.createWithAuth({
      type: 'server',
      accountId: clientConfig.accountId,
      privateKey: clientConfig.privateKey,
      network: clientConfig.network || 'mainnet',
    });
  }

  sdkCache.set(cacheConfig, sdk);
  return sdk;
}

/**
 * Check if quote is cached and return it if valid
 */
export function getCachedQuote(
  input: unknown,
  clientConfig: HederaClientConfig,
  options: InscriptionOptions,
): QuoteResult | null {
  const cacheKey = quoteCache.createCacheKey(input, clientConfig, options);
  return quoteCache.get(cacheKey);
}

/**
 * Cache a generated quote
 */
export function cacheQuote(
  input: unknown,
  clientConfig: HederaClientConfig,
  options: InscriptionOptions,
  quote: QuoteResult,
): void {
  const cacheKey = quoteCache.createCacheKey(input, clientConfig, options);
  const quoteTtlMs = 10 * 60 * 1000;
  quoteCache.set(cacheKey, quote, quoteTtlMs);
}

/**
 * Pre-validate parameters for early error detection
 */
export function validateQuoteParameters(
  input: unknown,
  clientConfig: HederaClientConfig,
  options: InscriptionOptions,
): void {
  if (!input || typeof input !== 'object' || !('type' in input)) {
    throw new Error('Invalid inscription input: type is required');
  }

  if (!clientConfig || !clientConfig.accountId) {
    throw new Error('Invalid client config: accountId is required');
  }

  if (!options) {
    throw new Error('Options are required');
  }

  if (options.mode === 'hashinal') {
    if (!options.metadata) {
      throw new Error('Hashinal mode requires metadata');
    }

    const requiredFields = ['name', 'creator', 'description', 'type'];
    const missingFields = requiredFields.filter(
      field => !options.metadata || !options.metadata[field],
    );

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required Hashinal metadata fields: ${missingFields.join(', ')}`,
      );
    }
  }
}

/**
 * Clear all caches (useful for testing or memory management)
 */
export function clearAllCaches(): void {
  quoteCache.clear();
  sdkCache.clear();
}
