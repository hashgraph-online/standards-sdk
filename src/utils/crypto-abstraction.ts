/**
 * Crypto Abstraction Layer
 *
 * Provides a unified interface for cryptographic operations that works
 * across Node.js, browser, and SSR environments.
 */

import { detectCryptoEnvironment } from './crypto-env';
import {
  HashAdapter,
  NodeHashAdapter,
  WebHashAdapter,
  FallbackHashAdapter,
} from './hash-adapter';

/**
 * HMAC Adapter interface
 */
export interface HmacAdapter {
  update(data: Buffer): HmacAdapter;
  digest(encoding?: string): string | Buffer | Promise<string | Buffer>;
}

/**
 * Node.js HMAC adapter
 */
export class NodeHmacAdapter implements HmacAdapter {
  constructor(private nodeHmac: any) {}

  update(data: Buffer): HmacAdapter {
    this.nodeHmac.update(data);
    return this;
  }

  digest(encoding?: string): string | Buffer {
    return this.nodeHmac.digest(encoding);
  }
}

/**
 * WebCrypto HMAC adapter
 */
export class WebHmacAdapter implements HmacAdapter {
  private data: Buffer[] = [];

  constructor(
    private key: Buffer,
    private algorithm: string = 'sha256',
  ) {}

  update(data: Buffer): HmacAdapter {
    this.data.push(data);
    return this;
  }

  async digest(encoding?: string): Promise<string | Buffer> {
    const combined = Buffer.concat(this.data);
    const keyBuffer = await crypto.subtle.importKey(
      'raw',
      this.key,
      { name: 'HMAC', hash: this.mapAlgorithm(this.algorithm) },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', keyBuffer, combined);

    if (encoding === 'hex') {
      return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    return Buffer.from(signature);
  }

  private mapAlgorithm(algorithm: string): string {
    const algorithmMap: Record<string, string> = {
      sha256: 'SHA-256',
      sha1: 'SHA-1',
      sha512: 'SHA-512',
    };

    return algorithmMap[algorithm.toLowerCase()] || 'SHA-256';
  }
}

/**
 * Fallback HMAC adapter
 */
export class FallbackHmacAdapter implements HmacAdapter {
  private data: Buffer[] = [];

  constructor(
    private key: Buffer,
    private algorithm: string = 'sha256',
  ) {}

  update(data: Buffer): HmacAdapter {
    this.data.push(data);
    return this;
  }

  digest(encoding?: string): string {
    const combined = Buffer.concat(this.data);
    const hash = this.simpleHmac(combined, this.key);

    if (encoding === 'hex') {
      return hash.toString(16).padStart(8, '0');
    }

    return hash.toString();
  }

  private simpleHmac(data: Buffer, key: Buffer): number {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const keyByte = key[i % key.length];
      hash = ((hash << 5) - hash + data[i] + keyByte) & 0xffffffff;
    }
    return Math.abs(hash);
  }
}

/**
 * Main crypto adapter interface
 */
export interface CryptoAdapter {
  createHash(algorithm: string): HashAdapter;
  createHmac(algorithm: string, key: Buffer): HmacAdapter;
  pbkdf2(
    password: string,
    salt: Buffer,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Buffer>;
  timingSafeEqual(a: Buffer, b: Buffer): boolean;
}

declare const require: any;

/**
 * Node.js crypto adapter
 */
export class NodeCryptoAdapter implements CryptoAdapter {
  private crypto: any;

  constructor() {
    try {
      const moduleName = 'cry' + 'pto';
      this.crypto = require(moduleName);
    } catch (error) {
      throw new Error('Node.js crypto module not available');
    }
  }

  createHash(algorithm: string): HashAdapter {
    return new NodeHashAdapter(this.crypto.createHash(algorithm));
  }

  createHmac(algorithm: string, key: Buffer): HmacAdapter {
    return new NodeHmacAdapter(this.crypto.createHmac(algorithm, key));
  }

  async pbkdf2(
    password: string,
    salt: Buffer,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.crypto.pbkdf2(
        password,
        salt,
        iterations,
        keylen,
        digest,
        (err: any, derivedKey: Buffer) => {
          if (err) reject(err);
          else resolve(derivedKey);
        },
      );
    });
  }

  timingSafeEqual(a: Buffer, b: Buffer): boolean {
    return this.crypto.timingSafeEqual(a, b);
  }
}

/**
 * WebCrypto adapter
 */
export class WebCryptoAdapter implements CryptoAdapter {
  createHash(algorithm: string): HashAdapter {
    return new WebHashAdapter(algorithm);
  }

  createHmac(algorithm: string, key: Buffer): HmacAdapter {
    return new WebHmacAdapter(key, algorithm);
  }

  async pbkdf2(
    password: string,
    salt: Buffer,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Buffer> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: this.mapDigest(digest),
      },
      keyMaterial,
      keylen * 8,
    );

    return Buffer.from(derivedBits);
  }

  timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }

  private mapDigest(digest: string): string {
    const digestMap: Record<string, string> = {
      sha256: 'SHA-256',
      sha1: 'SHA-1',
      sha512: 'SHA-512',
    };

    return digestMap[digest.toLowerCase()] || 'SHA-256';
  }
}

/**
 * Fallback crypto adapter for SSR
 */
export class FallbackCryptoAdapter implements CryptoAdapter {
  createHash(algorithm: string): HashAdapter {
    return new FallbackHashAdapter(algorithm);
  }

  createHmac(algorithm: string, key: Buffer): HmacAdapter {
    return new FallbackHmacAdapter(key, algorithm);
  }

  async pbkdf2(
    password: string,
    salt: Buffer,
    iterations: number,
    keylen: number,
    digest: string,
  ): Promise<Buffer> {
    const encoder = new TextEncoder();
    const passwordBuffer = Buffer.from(encoder.encode(password));
    let result = Buffer.alloc(keylen);

    for (let i = 0; i < iterations; i++) {
      const combined = Buffer.concat([passwordBuffer, salt, Buffer.from([i])]);
      let hash = 0;
      for (let j = 0; j < combined.length; j++) {
        hash = ((hash << 5) - hash + combined[j]) & 0xffffffff;
      }
      result[i % keylen] ^= hash & 0xff;
    }

    return result;
  }

  timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }
}

/**
 * Get appropriate crypto adapter for current environment
 */
export function getCryptoAdapter(): CryptoAdapter {
  const env = detectCryptoEnvironment();

  switch (env.preferredAPI) {
    case 'node':
      try {
        return new NodeCryptoAdapter();
      } catch {
        return new FallbackCryptoAdapter();
      }
    case 'web':
      return new WebCryptoAdapter();
    case 'none':
    default:
      return new FallbackCryptoAdapter();
  }
}

/**
 * Convenience function for simple hash operations
 */
export async function hash(
  content: Buffer | string,
  algorithm: string = 'sha256',
): Promise<string> {
  const adapter = getCryptoAdapter();
  const hasher = adapter.createHash(algorithm);
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;
  const result = hasher.update(buffer).digest('hex');

  if (result instanceof Promise) {
    return (await result) as string;
  }

  return result as string;
}
