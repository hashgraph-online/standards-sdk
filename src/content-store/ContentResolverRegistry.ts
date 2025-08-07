/**
 * Content Resolver Registry
 *
 * Dependency injection registry for content resolvers.
 * Allows tools to access content resolution without circular dependencies.
 */

import type { ContentResolverInterface } from './types';

class ContentResolverRegistryImpl {
  private static _instance: ContentResolverRegistryImpl;
  private resolver: ContentResolverInterface | null = null;
  private onUnavailableCallbacks: (() => void)[] = [];

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
      console.warn(
        '[ContentResolverRegistry] Resolver already registered, replacing existing',
      );
    }
    this.resolver = resolver;
    console.log('[ContentResolverRegistry] Content resolver registered');
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
      console.log('[ContentResolverRegistry] Content resolver unregistered');
      this.onUnavailableCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error(
            '[ContentResolverRegistry] Error in unavailable callback:',
            error,
          );
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
        console.warn(
          '[ContentResolverRegistry] Resolver operation failed, using fallback:',
          error,
        );
        return await fallback();
      }
    } else {
      console.warn(
        '[ContentResolverRegistry] No resolver available, using fallback',
      );
      return await fallback();
    }
  }
}

export const ContentResolverRegistry =
  ContentResolverRegistryImpl.getInstance();
export { ContentResolverRegistryImpl };
