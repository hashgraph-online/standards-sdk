import {
  ContentResolverRegistry,
  ContentResolverRegistryImpl,
} from '../../src/content-store/ContentResolverRegistry';
import type {
  ContentResolverInterface,
  ReferenceResolutionResult,
} from '../../src/content-store/types';
import { Logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger');

describe('ContentResolverRegistryImpl (isolated instance)', () => {
  let registry: ContentResolverRegistryImpl;
  let mockResolver: jest.Mocked<ContentResolverInterface>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolver = {
      resolveReference: jest.fn(),
      shouldUseReference: jest.fn(),
      extractReferenceId: jest.fn(),
    };
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
    registry = new ContentResolverRegistryImpl();
  });

  describe('constructor and instance management', () => {
    test('should create a new instance', () => {
      expect(registry).toBeDefined();
      expect(registry).toBeInstanceOf(ContentResolverRegistryImpl);
    });

    test('getInstance should return singleton instance', () => {
      const instance1 = ContentResolverRegistryImpl.getInstance();
      const instance2 = ContentResolverRegistryImpl.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('register', () => {
    test('should register a resolver successfully', () => {
      registry.register(mockResolver);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Content resolver registered',
      );
      expect(registry.getResolver()).toBe(mockResolver);
    });

    test('should warn when replacing existing resolver', () => {
      const newResolver = { ...mockResolver };

      registry.register(mockResolver);
      registry.register(newResolver);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Resolver already registered, replacing existing',
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(registry.getResolver()).toBe(newResolver);
    });
  });

  describe('getResolver', () => {
    test('should return null when no resolver is registered', () => {
      expect(registry.getResolver()).toBeNull();
    });

    test('should return registered resolver', () => {
      registry.register(mockResolver);
      expect(registry.getResolver()).toBe(mockResolver);
    });
  });

  describe('isAvailable', () => {
    test('should return false when no resolver is registered', () => {
      expect(registry.isAvailable()).toBe(false);
    });

    test('should return true when resolver is registered', () => {
      registry.register(mockResolver);
      expect(registry.isAvailable()).toBe(true);
    });
  });

  describe('unregister', () => {
    test('should do nothing when no resolver is registered', () => {
      registry.unregister();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    test('should unregister resolver successfully', () => {
      registry.register(mockResolver);
      registry.unregister();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Content resolver unregistered',
      );
      expect(registry.getResolver()).toBeNull();
      expect(registry.isAvailable()).toBe(false);
    });

    test('should execute unavailable callbacks when unregistering', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      registry.register(mockResolver);
      registry.onUnavailable(callback1);
      registry.onUnavailable(callback2);

      registry.unregister();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    test('should handle callback errors gracefully', () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      registry.register(mockResolver);
      registry.onUnavailable(errorCallback);
      registry.onUnavailable(goodCallback);

      registry.unregister();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in unavailable callback:',
        expect.any(Error),
      );
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('onUnavailable and offUnavailable', () => {
    test('should register and remove unavailable callbacks', () => {
      const callback = jest.fn();

      registry.onUnavailable(callback);
      expect(registry['onUnavailableCallbacks']).toContain(callback);

      registry.offUnavailable(callback);
      expect(registry['onUnavailableCallbacks']).not.toContain(callback);
    });

    test('should handle removing non-existent callback', () => {
      const callback = jest.fn();
      registry.offUnavailable(callback);
      expect(registry['onUnavailableCallbacks']).toHaveLength(0);
    });
  });

  describe('withResolver', () => {
    const mockResult: ReferenceResolutionResult = {
      content: Buffer.from('test content'),
      metadata: { mimeType: 'text/plain' },
    };

    test('should execute operation with resolver when available', async () => {
      const operation = jest.fn().mockResolvedValue(mockResult);
      const fallback = jest.fn();

      registry.register(mockResolver);

      const result = await registry.withResolver(operation, fallback);

      expect(operation).toHaveBeenCalledWith(mockResolver);
      expect(fallback).not.toHaveBeenCalled();
      expect(result).toBe(mockResult);
    });

    test('should use fallback when resolver is not available', async () => {
      const operation = jest.fn();
      const fallback = jest.fn().mockResolvedValue(mockResult);

      const result = await registry.withResolver(operation, fallback);

      expect(operation).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No resolver available, using fallback',
      );
      expect(result).toBe(mockResult);
    });

    test('should use fallback when resolver operation fails', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('Operation failed'));
      const fallback = jest.fn().mockResolvedValue(mockResult);

      registry.register(mockResolver);

      const result = await registry.withResolver(operation, fallback);

      expect(operation).toHaveBeenCalledWith(mockResolver);
      expect(fallback).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Resolver operation failed, using fallback:',
        expect.any(Error),
      );
      expect(result).toBe(mockResult);
    });
  });
});

describe('ContentResolverRegistry (singleton)', () => {
  let mockResolver: jest.Mocked<ContentResolverInterface>;
  let mockLogger: jest.Mocked<Logger>;
  let singleton: ContentResolverRegistryImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    (ContentResolverRegistryImpl as any)._instance = undefined;
    mockResolver = {
      resolveReference: jest.fn(),
      shouldUseReference: jest.fn(),
      extractReferenceId: jest.fn(),
    };
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
    (ContentResolverRegistryImpl as any)._instance = undefined;
    singleton = ContentResolverRegistryImpl.getInstance();
  });

  test('should be a singleton instance', () => {
    const instance1 = ContentResolverRegistryImpl.getInstance();
    const instance2 = ContentResolverRegistryImpl.getInstance();
    expect(instance1).toBe(instance2);
  });

  test('should maintain state across imports', () => {
    const reg = ContentResolverRegistryImpl.getInstance();
    reg.register(mockResolver);
    expect(reg.getResolver()).toBe(mockResolver);
    expect(reg.isAvailable()).toBe(true);

    reg.unregister();
    expect(reg.getResolver()).toBeNull();
    expect(reg.isAvailable()).toBe(false);
  });

  test('should handle concurrent access', async () => {
    const promises = [
      ContentResolverRegistryImpl.getInstance().withResolver(
        async () => 'result1',
        async () => 'fallback1',
      ),
      ContentResolverRegistryImpl.getInstance().withResolver(
        async () => 'result2',
        async () => 'fallback2',
      ),
    ];

    singleton.register(mockResolver);
    const results = await Promise.all(promises);

    const reg = ContentResolverRegistryImpl.getInstance();
    reg.register(mockResolver);
    const op1 = await reg.withResolver(
      async () => 'result1',
      async () => 'fallback1',
    );
    const op2 = await reg.withResolver(
      async () => 'result2',
      async () => 'fallback2',
    );
    expect([op1, op2]).toEqual(['result1', 'result2']);
  });

  test('should clear callbacks on unregister', () => {
    const callback = jest.fn();

    const reg = ContentResolverRegistryImpl.getInstance();
    reg.onUnavailable(callback);
    reg.register(mockResolver);
    reg.unregister();

    expect(callback).toHaveBeenCalled();
  });
});
