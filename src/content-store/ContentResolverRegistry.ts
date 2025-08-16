/**
 * Content Resolver Registry
 *
 * Dependency injection registry for content resolvers.
 * Allows tools to access content resolution without circular dependencies.
 */

import type { ContentResolverInterface } from './types';
import { Logger } from '../utils/logger';

class ContentResolverRegistryImpl {
  private static _instance: ContentResolverRegistryImpl;
  private resolver: ContentResolverInterface | null = null;
  private onUnavailableCallbacks: (() => void)[] = [];
  private logger = Logger.getInstance({ module: 'ContentResolverRegistry' });

  static getInstance(): ContentResolverRegistryImpl {
    if (!ContentResolverRegistryImpl._instance) {
      ContentResolverRegistryImpl._instance = new ContentResolverRegistryImpl();
    }
    return ContentResolverRegistryImpl._instance;
  }

  /**
   * Register a content resolver (typically called by ContentStoreManager)
   */
  register(resolver: ContentResolverInterface): void {
    if (this.resolver) {
      this.logger.warn('Resolver already registered, replacing existing');
    }
    this.resolver = resolver;
    this.logger.info('Content resolver registered');
  }

  /**
   * Get the registered content resolver
   */
  getResolver(): ContentResolverInterface | null {
    return this.resolver;
  }

  /**
   * Check if a resolver is available
   */
  isAvailable(): boolean {
    return this.resolver !== null;
  }

  /**
   * Unregister the current resolver
   */
  unregister(): void {
    if (this.resolver) {
      this.resolver = null;
      this.logger.info('Content resolver unregistered');
      this.onUnavailableCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          this.logger.error('Error in unavailable callback:', error);
        }
      });
    }
  }

  /**
   * Register callback for when resolver becomes unavailable
   */
  onUnavailable(callback: () => void): void {
    this.onUnavailableCallbacks.push(callback);
  }

  /**
   * Remove unavailable callback
   */
  offUnavailable(callback: () => void): void {
    const index = this.onUnavailableCallbacks.indexOf(callback);
    if (index !== -1) {
      this.onUnavailableCallbacks.splice(index, 1);
    }
  }

  /**
   * Execute operation with resolver or fallback
   */
  async withResolver<T>(
    operation: (resolver: ContentResolverInterface) => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    if (this.resolver) {
      try {
        return await operation(this.resolver);
      } catch (error) {
        this.logger.warn('Resolver operation failed, using fallback:', error);
        return await fallback();
      }
    } else {
      this.logger.warn('No resolver available, using fallback');
      return await fallback();
    }
  }
}

export const ContentResolverRegistry =
  ContentResolverRegistryImpl.getInstance();
export { ContentResolverRegistryImpl };
