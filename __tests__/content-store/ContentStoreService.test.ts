import type { ContentStoreInterface } from '../../src/content-store/types';

jest.mock('../../src/utils/logger');
import { Logger } from '../../src/utils/logger';

import {
  ContentStoreService,
  ContentStoreServiceImpl,
  REFERENCE_THRESHOLD,
  extractReferenceId,
  shouldUseReference,
} from '../../src/content-store/ContentStoreService';

describe('ContentStoreServiceImpl (isolated instance)', () => {
  let service: ContentStoreServiceImpl;
  let mockStore: jest.Mocked<ContentStoreInterface>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    (ContentStoreServiceImpl as any)._instance = undefined;
    service = new ContentStoreServiceImpl();
    mockStore = {
      storeContent: jest.fn(),
      resolveReference: jest.fn(),
      hasReference: jest.fn(),
      cleanupReference: jest.fn(),
      getStats: jest.fn(),
      updateConfig: jest.fn(),
      performCleanup: jest.fn(),
      dispose: jest.fn(),
    };
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
  });

  describe('constructor and instance management', () => {
    test('should create a new instance', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ContentStoreServiceImpl);
    });

    test('getInstance should return singleton instance', () => {
      const instance1 = ContentStoreServiceImpl.getInstance();
      const instance2 = ContentStoreServiceImpl.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('setInstance', () => {
    test('should set instance successfully', async () => {
      await service.setInstance(mockStore);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Content store instance set',
      );
      expect(service.getInstance()).toBe(mockStore);
    });

    test('should warn when replacing existing instance', async () => {
      const newStore = { ...mockStore };

      await service.setInstance(mockStore);
      await service.setInstance(newStore);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Content store already set, replacing',
      );
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(service.getInstance()).toBe(newStore);
    });
  });

  describe('getInstance', () => {
    test('should return null when no instance is set', () => {
      expect(service.getInstance()).toBeNull();
    });

    test('should return set instance', async () => {
      await service.setInstance(mockStore);
      expect(service.getInstance()).toBe(mockStore);
    });
  });

  describe('dispose', () => {
    test('should dispose instance successfully', async () => {
      await service.setInstance(mockStore);
      service.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('Content store disposed');
      expect(service.getInstance()).toBeNull();
      expect(service.isAvailable()).toBe(false);
    });

    test('should handle dispose when no instance is set', () => {
      service.dispose();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    test('should return false when no instance is set', () => {
      expect(service.isAvailable()).toBe(false);
    });

    test('should return true when instance is set', async () => {
      await service.setInstance(mockStore);
      expect(service.isAvailable()).toBe(true);
    });
  });
});

describe('ContentStoreService (singleton)', () => {
  let mockStore: jest.Mocked<ContentStoreInterface>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {
      storeContent: jest.fn(),
      resolveReference: jest.fn(),
      hasReference: jest.fn(),
      cleanupReference: jest.fn(),
      getStats: jest.fn(),
      updateConfig: jest.fn(),
      performCleanup: jest.fn(),
      dispose: jest.fn(),
    };
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
  });

  test('should be a singleton instance', () => {
    const instance1 = ContentStoreServiceImpl.getInstance();
    const instance2 = ContentStoreServiceImpl.getInstance();
    expect(instance1).toBe(instance2);
    expect(ContentStoreService).toBe(instance1);
  });

  test('should maintain state across imports', async () => {
    const testStore = {
      storeContent: jest.fn(),
      resolveReference: jest.fn(),
      hasReference: jest.fn(),
      cleanupReference: jest.fn(),
      getStats: jest.fn(),
      updateConfig: jest.fn(),
      performCleanup: jest.fn(),
      dispose: jest.fn(),
    };

    await ContentStoreService.setInstance(testStore);
    expect(ContentStoreService.getInstance()).toBe(testStore);
    expect(ContentStoreService.isAvailable()).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith('Content store instance set');

    ContentStoreService.dispose();
    expect(ContentStoreService.getInstance()).toBeNull();
    expect(ContentStoreService.isAvailable()).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith('Content store disposed');
  });
});

describe('extractReferenceId', () => {
  test('should return null for empty string', () => {
    expect(extractReferenceId('')).toBeNull();
    expect(extractReferenceId('   ')).toBeNull();
  });

  test('should extract reference ID from exact format', () => {
    const result = extractReferenceId('content-ref:abc123');
    expect(result).toBe('abc123');
  });

  test('should extract reference ID from embedded format', () => {
    const result = extractReferenceId('Some text content-ref:def456 more text');
    expect(result).toBe('def456');
  });

  test('should handle multiple reference IDs and return first match', () => {
    const result = extractReferenceId(
      'content-ref:abc123 and content-ref:def456',
    );
    expect(result).toBe('abc123');
  });

  test('should return null for invalid format', () => {
    expect(extractReferenceId('invalid-format')).toBeNull();
    expect(extractReferenceId('content-ref:')).toBeNull();
    expect(extractReferenceId('content-ref')).toBeNull();
  });

  test('should handle case sensitivity', () => {
    expect(extractReferenceId('CONTENT-REF:abc123')).toBeNull();
    expect(extractReferenceId('Content-Ref:abc123')).toBeNull();
  });

  test('should handle various spacing', () => {
    expect(extractReferenceId('content-ref:abc123')).toBe('abc123');
    expect(extractReferenceId('  content-ref:abc123  ')).toBe('abc123');
    expect(extractReferenceId('content-ref:abc123\n')).toBe('abc123');
  });

  test('should handle complex embedded cases', () => {
    const complexText = `
      This is some content with a reference: content-ref:a1b2c3d4
      and some more text after it.
    `;
    expect(extractReferenceId(complexText)).toBe('a1b2c3d4');
  });
});

describe('shouldUseReference', () => {
  test('should return false for small content', () => {
    const smallContent = 'Hello World'; // ~11 bytes
    expect(shouldUseReference(smallContent)).toBe(false);
  });

  test('should return true for large string content', () => {
    const largeContent = 'x'.repeat(REFERENCE_THRESHOLD + 1);
    expect(shouldUseReference(largeContent)).toBe(true);
  });

  test('should return true for buffer at threshold', () => {
    const buffer = Buffer.alloc(REFERENCE_THRESHOLD + 1);
    expect(shouldUseReference(buffer)).toBe(true);
  });

  test('should return false for buffer below threshold', () => {
    const buffer = Buffer.alloc(REFERENCE_THRESHOLD - 1);
    expect(shouldUseReference(buffer)).toBe(false);
  });

  test('should return false for buffer exactly at threshold', () => {
    const buffer = Buffer.alloc(REFERENCE_THRESHOLD);
    expect(shouldUseReference(buffer)).toBe(false);
  });

  test('should handle empty content', () => {
    expect(shouldUseReference('')).toBe(false);
    expect(shouldUseReference(Buffer.alloc(0))).toBe(false);
  });

  test('should handle unicode characters in strings', () => {
    const unicodeContent = '🚀'.repeat(15000); // Each emoji is 4 bytes, 60KB total
    expect(shouldUseReference(unicodeContent)).toBe(true);
  });

  test('should handle mixed content types consistently', () => {
    const testString = 'x'.repeat(60000); // 60KB string
    const testBuffer = Buffer.from(testString);

    expect(shouldUseReference(testString)).toBe(true);
    expect(shouldUseReference(testBuffer)).toBe(true);
  });
});

describe('REFERENCE_THRESHOLD', () => {
  test('should be 50KB', () => {
    expect(REFERENCE_THRESHOLD).toBe(50 * 1024);
    expect(REFERENCE_THRESHOLD).toBe(51200);
  });

  test('should be used correctly in shouldUseReference', () => {
    const contentAtThreshold = 'x'.repeat(REFERENCE_THRESHOLD);
    const contentOverThreshold = 'x'.repeat(REFERENCE_THRESHOLD + 1);

    expect(shouldUseReference(contentAtThreshold)).toBe(false);
    expect(shouldUseReference(contentOverThreshold)).toBe(true);
  });
});
