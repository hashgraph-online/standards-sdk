/**
 * Content Store Types
 *
 * Common interfaces for content storage and resolution across packages.
 * These types enable dependency injection without circular dependencies.
 */

/**
 * Result of resolving a content reference
 */
export interface ReferenceResolutionResult {
  content: Buffer;
  metadata?: {
    mimeType?: string;
    fileName?: string;
    encoding?: string;
    originalSize?: number;
    compressed?: boolean;
  };
}

/**
 * Content store interface for storage operations
 */
export interface ContentStoreInterface {
  storeContent(content: Buffer, metadata: any): Promise<string>;
  resolveReference(referenceId: string): Promise<ReferenceResolutionResult>;
  hasReference(referenceId: string): Promise<boolean>;
  cleanupReference(referenceId: string): Promise<void>;
  getStats(): Promise<any>;
  updateConfig(config: any): Promise<void>;
  performCleanup(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Content resolver interface for dependency injection
 */
export interface ContentResolverInterface {
  resolveReference(referenceId: string): Promise<ReferenceResolutionResult>;
  shouldUseReference(content: string | Buffer): boolean;
  extractReferenceId(input: string): string | null;
}
