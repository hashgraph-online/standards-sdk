import {
  ContentResolverRegistry,
  ContentResolverRegistryImpl,
} from '../../src/content-store';
import type {
  ContentResolverInterface,
  ReferenceResolutionResult,
} from '../../src/content-store';

class MockResolver implements ContentResolverInterface {
  async resolveReference(
    referenceId: string,
  ): Promise<ReferenceResolutionResult> {
    const content = Buffer.from(`resolved:${referenceId}`);
    return { content };
  }

  shouldUseReference(content: string | Buffer): boolean {
    if (typeof content === 'string') {
      return content.length > 0;
    }
    return content.length > 0;
  }

  extractReferenceId(input: string): string | null {
    const match = input.match(/^content-ref:([a-f0-9]+)$/);
    if (match) {
      return match[1];
    }
    return null;
  }
}

describe('ContentResolverRegistryImpl (isolated instance)', () => {
  let registry: ContentResolverRegistryImpl;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    registry = new (ContentResolverRegistryImpl as unknown as {
      new (): ContentResolverRegistryImpl;
    })();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('registers and retrieves resolver', () => {
    const resolver = new MockResolver();
    registry.register(resolver);
    expect(registry.isAvailable()).toBe(true);
    expect(registry.getResolver()).toBe(resolver);
  });

  it('replaces existing resolver and warns', () => {
    const first = new MockResolver();
    const second = new MockResolver();
    registry.register(first);
    registry.register(second);
    expect(warnSpy).toHaveBeenCalled();
    expect(registry.getResolver()).toBe(second);
  });

  it('unregisters resolver and triggers callbacks', () => {
    const resolver = new MockResolver();
    registry.register(resolver);

    const called: { value: boolean } = { value: false };
    const cb = () => {
      called.value = true;
    };
    registry.onUnavailable(cb);
    registry.unregister();
    expect(registry.isAvailable()).toBe(false);
    expect(called.value).toBe(true);
  });

  it('offUnavailable removes callback', () => {
    const resolver = new MockResolver();
    registry.register(resolver);

    const called: { value: number } = { value: 0 };
    const cb = () => {
      called.value = called.value + 1;
    };
    registry.onUnavailable(cb);
    registry.offUnavailable(cb);
    registry.unregister();
    expect(called.value).toBe(0);
  });

  it('withResolver uses resolver when available', async () => {
    const resolver = new MockResolver();
    registry.register(resolver);
    const result = await registry.withResolver(
      async r => {
        const resolved = await r.resolveReference('abc');
        return resolved.content.toString('utf8');
      },
      async () => 'fallback',
    );
    expect(result).toBe('resolved:abc');
  });

  it('withResolver falls back when operation throws', async () => {
    const resolver = new MockResolver();
    registry.register(resolver);
    const result = await registry.withResolver(
      async () => {
        throw new Error('boom');
      },
      async () => 'fallback',
    );
    expect(result).toBe('fallback');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('withResolver falls back when resolver unavailable', async () => {
    const result = await registry.withResolver(
      async () => 'primary',
      async () => 'fallback',
    );
    expect(result).toBe('fallback');
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('ContentResolverRegistry (singleton)', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const current = ContentResolverRegistry.getResolver();
    if (current) {
      ContentResolverRegistry.unregister();
    }
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    const current = ContentResolverRegistry.getResolver();
    if (current) {
      ContentResolverRegistry.unregister();
    }
  });

  it('manages resolver lifecycle end-to-end', async () => {
    const resolver = new MockResolver();
    ContentResolverRegistry.register(resolver);
    expect(ContentResolverRegistry.isAvailable()).toBe(true);
    const value = await ContentResolverRegistry.withResolver(
      async r => {
        const res = await r.resolveReference('xyz');
        return res.content.toString('utf8');
      },
      async () => 'fallback',
    );
    expect(value).toBe('resolved:xyz');
    ContentResolverRegistry.unregister();
    expect(ContentResolverRegistry.isAvailable()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
