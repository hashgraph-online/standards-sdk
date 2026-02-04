/**
 * Hash Adapter Interface
 *
 * Provides a unified interface for hash operations across different
 * crypto implementations (Node.js crypto, WebCrypto, fallback).
 */

/**
 * Common interface for hash operations
 */
export interface HashAdapter {
  update(data: Buffer | string): HashAdapter;
  digest(encoding?: string): string | Buffer | Promise<string | Buffer>;
}

/**
 * Node.js crypto hash adapter
 */
export class NodeHashAdapter implements HashAdapter {
  constructor(private nodeHash: any) {}

  update(data: Buffer | string): HashAdapter {
    this.nodeHash.update(data);
    return this;
  }

  digest(encoding?: string): string | Buffer {
    return this.nodeHash.digest(encoding);
  }
}

/**
 * WebCrypto hash adapter
 */
export class WebHashAdapter implements HashAdapter {
  private data: Uint8Array[] = [];

  constructor(private algorithm: string) {}

  update(data: Buffer | string): HashAdapter {
    const bytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);
    this.data.push(bytes);
    return this;
  }

  async digest(encoding?: string): Promise<string | Buffer> {
    const combined = this.concatenateArrays(this.data);
    const bufferView = new Uint8Array(combined);
    const webCrypto = globalThis.crypto;
    if (!webCrypto?.subtle) {
      throw new Error('WebCrypto not available');
    }
    const hashBuffer = await webCrypto.subtle.digest(
      this.mapAlgorithm(this.algorithm),
      bufferView,
    );

    if (encoding === 'hex') {
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    return Buffer.from(hashBuffer);
  }

  private concatenateArrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }

    return result;
  }

  private mapAlgorithm(algorithm: string): string {
    const algorithmMap: Record<string, string> = {
      sha256: 'SHA-256',
      sha384: 'SHA-384',
      sha1: 'SHA-1',
      sha512: 'SHA-512',
    };

    return algorithmMap[algorithm.toLowerCase()] || 'SHA-256';
  }
}

/**
 * Fallback hash adapter for SSR environments
 */
export class FallbackHashAdapter implements HashAdapter {
  private data: Buffer[] = [];

  constructor(private algorithm: string) {}

  update(data: Buffer | string): HashAdapter {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.data.push(buffer);
    return this;
  }

  digest(encoding?: string): string {
    const combined = Buffer.concat(this.data);
    const hash = this.simpleHash(combined);

    if (encoding === 'hex') {
      return hash.toString(16).padStart(8, '0');
    }

    return hash.toString();
  }

  private simpleHash(buffer: Buffer): number {
    let hash = 0;
    for (let i = 0; i < buffer.length; i++) {
      hash = ((hash << 5) - hash + buffer[i]) & 0xffffffff;
    }
    return Math.abs(hash);
  }
}
