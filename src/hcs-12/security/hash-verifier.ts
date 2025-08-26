/**
 * Hash Verifier for HCS-12 HashLinks
 *
 * Provides content integrity verification using cryptographic hashes
 * for WASM modules, assemblies, and resources.
 */

import { Logger } from '../../utils/logger';
import { getCryptoAdapter } from '../../utils/crypto-abstraction';
import { isSSREnvironment } from '../../utils/crypto-env';

export interface HashVerifierConfig {
  logger: Logger;
  defaultAlgorithm?: string;
}

export interface WasmManifest {
  codeHash: string;
  metadataHash: string;
  combinedHash: string;
  algorithm: string;
  timestamp: number;
}

export interface WasmVerificationResult {
  valid: boolean;
  codeIntegrity?: boolean;
  metadataIntegrity?: boolean;
  error?: string;
}

export interface AssemblyHashTree {
  root: string;
  components: Record<string, string>;
  metadata?: string;
  algorithm: string;
}

export interface AssemblyVerificationResult {
  valid: boolean;
  invalidComponents: string[];
  error?: string;
}

export interface ComponentVerificationResult {
  valid: boolean;
  verifiedCount: number;
  failedComponents?: string[];
}

export interface Resource {
  id: string;
  type: string;
  content: Buffer;
  contentType?: string;
  encoding?: string;
}

export interface MerkleTree {
  root: string;
  proof: Record<number, string[]>;
  leaves: string[];
}

export interface HashChainVerification {
  valid: boolean;
  chainLength: number;
  brokenAt?: number;
}

export interface CacheConfig {
  maxSize: number;
  ttlMs: number;
}

export interface KeyDerivationOptions {
  iterations: number;
  keyLength: number;
  algorithm: 'pbkdf2' | 'scrypt' | 'argon2';
}

/**
 * Cryptographic hash verification system
 */
export class HashVerifier {
  private logger: Logger;
  private config: HashVerifierConfig;
  private cache: Map<string, { hash: string; expiry: number }> = new Map();
  private cacheConfig?: CacheConfig;
  private cryptoAdapter = getCryptoAdapter();

  constructor(config: HashVerifierConfig) {
    this.config = config;
    this.logger = config.logger;
  }

  /**
   * Hash content with specified algorithm
   */
  async hash(content: Buffer, algorithm: string = 'sha256'): Promise<string> {
    try {
      if (isSSREnvironment()) {
        return this.createSSRSafeHash(content, algorithm);
      }

      const cacheKey = `${algorithm}:${content.toString('hex')}`;
      if (this.cacheConfig) {
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;
      }

      const hasher = this.cryptoAdapter.createHash(algorithm);
      const result = hasher.update(content).digest('hex');
      const hash = result instanceof Promise ? await result : result;
      const hashStr = typeof hash === 'string' ? hash : hash.toString('hex');

      if (this.cacheConfig) {
        this.addToCache(cacheKey, hashStr);
      }

      return hashStr;
    } catch (error) {
      this.logger.error('Hash computation failed', { error, algorithm });
      throw new Error('Hash computation failed');
    }
  }

  /**
   * Create deterministic placeholder hash for SSR environments
   */
  private createSSRSafeHash(content: Buffer, algorithm: string): string {
    const contentLength = content.length;
    const timestamp = Math.floor(Date.now() / 1000);
    let simpleHash = 0;

    for (let i = 0; i < Math.min(content.length, 32); i++) {
      simpleHash = ((simpleHash << 5) - simpleHash + content[i]) & 0xffffffff;
    }

    return `ssr-${algorithm}-${contentLength}-${Math.abs(simpleHash).toString(16).padStart(8, '0')}`;
  }

  /**
   * Create WASM module manifest
   */
  async createWasmManifest(module: {
    id: string;
    code: Uint8Array;
    metadata: Record<string, unknown>;
  }): Promise<WasmManifest> {
    const algorithm = this.config.defaultAlgorithm || 'sha256';

    const codeHash = await this.hash(Buffer.from(module.code), algorithm);
    const metadataHash = await this.hash(
      Buffer.from(JSON.stringify(module.metadata)),
      algorithm,
    );

    const combined = Buffer.concat([
      Buffer.from(codeHash, 'hex'),
      Buffer.from(metadataHash, 'hex'),
    ]);
    const combinedHash = await this.hash(combined, algorithm);

    return {
      codeHash,
      metadataHash,
      combinedHash,
      algorithm,
      timestamp: Date.now(),
    };
  }

  /**
   * Verify WASM module integrity
   */
  async verifyWasmModule(
    module: { id: string; code: Uint8Array; metadata: Record<string, unknown> },
    manifest: WasmManifest,
  ): Promise<WasmVerificationResult> {
    try {
      const currentCodeHash = await this.hash(
        Buffer.from(module.code),
        manifest.algorithm,
      );
      const codeIntegrity = currentCodeHash === manifest.codeHash;

      if (!codeIntegrity) {
        return {
          valid: false,
          codeIntegrity: false,
          error: 'Code integrity check failed',
        };
      }

      const currentMetadataHash = await this.hash(
        Buffer.from(JSON.stringify(module.metadata)),
        manifest.algorithm,
      );
      const metadataIntegrity = currentMetadataHash === manifest.metadataHash;

      return {
        valid: codeIntegrity && metadataIntegrity,
        codeIntegrity,
        metadataIntegrity,
      };
    } catch (error) {
      this.logger.error('WASM verification failed', { error });
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create assembly hash tree
   */
  async createAssemblyHashTree(assembly: {
    id: string;
    components: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<AssemblyHashTree> {
    const algorithm = this.config.defaultAlgorithm || 'sha256';
    const componentHashes: Record<string, string> = {};

    for (const [id, component] of Object.entries(assembly.components)) {
      const hash = await this.hash(
        Buffer.from(JSON.stringify(component)),
        algorithm,
      );
      componentHashes[id] = hash;
    }

    const root = await this.computeMerkleRoot(Object.values(componentHashes));

    return {
      root,
      components: componentHashes,
      metadata: assembly.metadata
        ? await this.hash(
            Buffer.from(JSON.stringify(assembly.metadata)),
            algorithm,
          )
        : undefined,
      algorithm,
    };
  }

  /**
   * Verify assembly hash tree
   */
  async verifyAssemblyHashTree(
    assembly: { id: string; components: Record<string, unknown> },
    hashTree: AssemblyHashTree,
  ): Promise<AssemblyVerificationResult> {
    const invalidComponents: string[] = [];

    for (const [id, component] of Object.entries(assembly.components)) {
      const currentHash = await this.hash(
        Buffer.from(JSON.stringify(component)),
        hashTree.algorithm,
      );

      if (currentHash !== hashTree.components[id]) {
        invalidComponents.push(id);
      }
    }

    return {
      valid: invalidComponents.length === 0,
      invalidComponents,
    };
  }

  /**
   * Verify specific components
   */
  async verifyComponents(
    assembly: { components: Record<string, unknown> },
    hashTree: AssemblyHashTree,
    componentIds: string[],
  ): Promise<ComponentVerificationResult> {
    const failedComponents: string[] = [];
    let verifiedCount = 0;

    for (const id of componentIds) {
      const component = assembly.components[id];
      if (!component) {
        failedComponents.push(id);
        continue;
      }

      const currentHash = await this.hash(
        Buffer.from(JSON.stringify(component)),
        hashTree.algorithm,
      );

      if (currentHash === hashTree.components[id]) {
        verifiedCount++;
      } else {
        failedComponents.push(id);
      }
    }

    return {
      valid: failedComponents.length === 0,
      verifiedCount,
      failedComponents:
        failedComponents.length > 0 ? failedComponents : undefined,
    };
  }

  /**
   * Hash resource
   */
  async hashResource(resource: Resource): Promise<string> {
    const data = Buffer.concat([
      Buffer.from(resource.id),
      Buffer.from(resource.type),
      resource.content,
    ]);

    return this.hash(data);
  }

  /**
   * Verify resource integrity
   */
  async verifyResource(
    resource: Resource,
    expectedHash: string,
  ): Promise<boolean> {
    const currentHash = await this.hashResource(resource);
    return currentHash === expectedHash;
  }

  /**
   * Compute merkle root
   */
  async computeMerkleRoot(hashes: string[]): Promise<string> {
    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];

    const algorithm = this.config.defaultAlgorithm || 'sha256';
    const pairs: string[] = [];

    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;

      const combined = Buffer.concat([
        Buffer.from(left, 'hex'),
        Buffer.from(right, 'hex'),
      ]);

      const pairHash = await this.hash(combined, algorithm);
      pairs.push(pairHash);
    }

    return this.computeMerkleRoot(pairs);
  }

  /**
   * Verify chunks against merkle root
   */
  async verifyChunks(
    chunks: Buffer[],
    merkleRoot: string,
  ): Promise<{ valid: boolean }> {
    const chunkHashes = await Promise.all(
      chunks.map(chunk => this.hash(chunk)),
    );

    const computedRoot = await this.computeMerkleRoot(chunkHashes);
    return { valid: computedRoot === merkleRoot };
  }

  /**
   * Build merkle tree
   */
  async buildMerkleTree(leaves: string[]): Promise<MerkleTree> {
    const algorithm = this.config.defaultAlgorithm || 'sha256';
    const hashedLeaves = await Promise.all(
      leaves.map(leaf => this.hash(Buffer.from(leaf), algorithm)),
    );

    const tree: MerkleTree = {
      root: '',
      proof: {},
      leaves: hashedLeaves,
    };

    let currentLevel = hashedLeaves;
    const levels: string[][] = [currentLevel];

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left;

        const combined = Buffer.concat([
          Buffer.from(left, 'hex'),
          Buffer.from(right, 'hex'),
        ]);

        const hash = await this.hash(combined, algorithm);
        nextLevel.push(hash);
      }

      levels.push(nextLevel);
      currentLevel = nextLevel;
    }

    tree.root = currentLevel[0];

    for (let leafIndex = 0; leafIndex < hashedLeaves.length; leafIndex++) {
      tree.proof[leafIndex] = this.generateProof(levels, leafIndex);
    }

    return tree;
  }

  /**
   * Get merkle proof for a leaf
   */
  async getMerkleProof(tree: MerkleTree, leafIndex: number): Promise<string[]> {
    return tree.proof[leafIndex] || [];
  }

  /**
   * Verify merkle proof
   */
  async verifyMerkleProof(
    leaf: string,
    proof: string[],
    root: string,
  ): Promise<boolean> {
    const algorithm = this.config.defaultAlgorithm || 'sha256';
    let currentHash = await this.hash(Buffer.from(leaf), algorithm);

    for (const proofElement of proof) {
      const combined = Buffer.concat([
        Buffer.from(currentHash, 'hex'),
        Buffer.from(proofElement, 'hex'),
      ]);

      currentHash = await this.hash(combined, algorithm);
    }

    return currentHash === root;
  }

  /**
   * Verify hash chain
   */
  async verifyHashChain(chain: string[]): Promise<HashChainVerification> {
    if (chain.length === 0) {
      return { valid: true, chainLength: 0 };
    }

    for (let i = 0; i < chain.length; i++) {
      if (!/^[a-f0-9]{64}$/.test(chain[i])) {
        return {
          valid: false,
          chainLength: chain.length,
          brokenAt: i,
        };
      }
    }

    return {
      valid: true,
      chainLength: chain.length,
    };
  }

  /**
   * Enable caching
   */
  enableCaching(config: CacheConfig): void {
    this.cacheConfig = config;
  }

  /**
   * Batch hash operation
   */
  async batchHash(contents: Buffer[]): Promise<string[]> {
    return Promise.all(contents.map(content => this.hash(content)));
  }

  /**
   * Hash with salt
   */
  async hashWithSalt(content: Buffer, salt: Buffer): Promise<string> {
    const combined = Buffer.concat([content, salt]);
    return this.hash(combined);
  }

  /**
   * Derive key from password
   */
  async deriveKey(
    password: string,
    salt: Buffer,
    options: KeyDerivationOptions,
  ): Promise<string> {
    try {
      if (isSSREnvironment()) {
        this.logger.warn('Key derivation using fallback in SSR environment');
        return this.createSSRSafeKey(password, salt, options);
      }

      if (options.algorithm === 'pbkdf2') {
        const derivedKey = await this.cryptoAdapter.pbkdf2(
          password,
          salt,
          options.iterations,
          options.keyLength,
          'sha256',
        );
        return derivedKey.toString('hex');
      } else {
        throw new Error(`Unsupported algorithm: ${options.algorithm}`);
      }
    } catch (error) {
      this.logger.error('Key derivation failed', { error });
      throw new Error('Key derivation failed');
    }
  }

  /**
   * Create SSR-safe key derivation
   */
  private createSSRSafeKey(
    password: string,
    salt: Buffer,
    options: KeyDerivationOptions,
  ): string {
    let result = '';
    for (let i = 0; i < options.keyLength; i++) {
      const charCode = password.charCodeAt(i % password.length);
      const saltByte = salt[i % salt.length];
      const derived = (charCode + saltByte + i + options.iterations) % 256;
      result += derived.toString(16).padStart(2, '0');
    }
    return result;
  }

  /**
   * Create HMAC
   */
  async createHMAC(content: Buffer, secret: Buffer): Promise<string> {
    if (isSSREnvironment()) {
      this.logger.warn('HMAC using fallback in SSR environment');
      return this.createSSRSafeHMAC(content, secret);
    }

    const hmac = this.cryptoAdapter.createHmac('sha256', secret);
    const result = hmac.update(content).digest('hex');
    const hash = result instanceof Promise ? await result : result;
    return typeof hash === 'string' ? hash : hash.toString('hex');
  }

  /**
   * Create SSR-safe HMAC
   */
  private createSSRSafeHMAC(content: Buffer, secret: Buffer): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const keyByte = secret[i % secret.length];
      hash = ((hash << 5) - hash + content[i] + keyByte) & 0xffffffff;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Verify HMAC
   */
  async verifyHMAC(
    content: Buffer,
    hmac: string,
    secret: Buffer,
  ): Promise<boolean> {
    const computedHmac = await this.createHMAC(content, secret);

    if (isSSREnvironment()) {
      return hmac === computedHmac;
    }

    try {
      return this.cryptoAdapter.timingSafeEqual(
        Buffer.from(hmac, 'hex'),
        Buffer.from(computedHmac, 'hex'),
      );
    } catch {
      return hmac === computedHmac;
    }
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): string | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.hash;
  }

  /**
   * Add to cache
   */
  private addToCache(key: string, hash: string): void {
    if (!this.cacheConfig) return;

    this.cache.set(key, {
      hash,
      expiry: Date.now() + this.cacheConfig.ttlMs,
    });

    if (this.cache.size > this.cacheConfig.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Generate merkle proof
   */
  private generateProof(levels: string[][], leafIndex: number): string[] {
    const proof: string[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < levels.length - 1; level++) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < levels[level].length) {
        proof.push(levels[level][siblingIndex]);
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }
}
