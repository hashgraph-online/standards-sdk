/**
 * Content Store Service
 *
 * Provides utility functions for content storage and reference handling.
 */

import type { ContentStoreInterface } from './types';
import { Logger } from '../utils/logger';

/**
 * Maximum content size before using references (50KB)
 */
export const REFERENCE_THRESHOLD = 50 * 1024;

/**
 * Content store service for managing large content
 */
class ContentStoreServiceImpl {
  private static _instance: ContentStoreServiceImpl;
  private contentStore: ContentStoreInterface | null = null;
  private logger = Logger.getInstance({ module: 'ContentStoreService' });

  static getInstance(): ContentStoreServiceImpl {
    if (!ContentStoreServiceImpl._instance) {
      ContentStoreServiceImpl._instance = new ContentStoreServiceImpl();
    }
    return ContentStoreServiceImpl._instance;
  }

  /**
   * Set the content store instance
   */
  async setInstance(store: ContentStoreInterface): Promise<void> {
    if (this.contentStore) {
      this.logger.warn('Content store already set, replacing');
    }
    this.contentStore = store;
    this.logger.info('Content store instance set');
  }

  /**
   * Get the content store instance
   */
  getInstance(): ContentStoreInterface | null {
    return this.contentStore;
  }

  /**
   * Clear the content store instance
   */
  dispose(): void {
    this.contentStore = null;
    this.logger.info('Content store disposed');
  }

  /**
   * Check if content store is available
   */
  isAvailable(): boolean {
    return this.contentStore !== null;
  }
}

/**
 * Extract reference ID from input string
 */
export function extractReferenceId(input: string): string | null {
  const trimmed = input.trim();

  const exactMatch = trimmed.match(/^content-ref:([a-f0-9]+)$/);
  if (exactMatch) {
    return exactMatch[1];
  }

  const embeddedMatch = trimmed.match(/content-ref:([a-f0-9]+)/);
  if (embeddedMatch) {
    return embeddedMatch[1];
  }

  return null;
}

/**
 * Check if content should use reference based on size
 */
export function shouldUseReference(content: string | Buffer): boolean {
  const size =
    typeof content === 'string'
      ? Buffer.byteLength(content, 'utf8')
      : content.length;

  return size > REFERENCE_THRESHOLD;
}

export const ContentStoreService = ContentStoreServiceImpl.getInstance();
