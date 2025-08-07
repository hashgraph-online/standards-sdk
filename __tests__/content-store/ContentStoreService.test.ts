import {
  ContentStoreService,
  REFERENCE_THRESHOLD,
  extractReferenceId,
  shouldUseReference,
} from '../../src/content-store';
import type { ContentStoreInterface } from '../../src/content-store';

class MockStore implements ContentStoreInterface {
  async storeContent(): Promise<string> {
    return 'deadbeef';
  }
  async resolveReference(): Promise<{ content: Buffer }> {
    return { content: Buffer.from('ok') };
  }
  async hasReference(): Promise<boolean> {
    return true;
  }
  async cleanupReference(): Promise<void> {
    return;
  }
  async getStats(): Promise<any> {
    return { items: 1 };
  }
  async updateConfig(): Promise<void> {
    return;
  }
  async performCleanup(): Promise<void> {
    return;
  }
  async dispose(): Promise<void> {
    return;
  }
}

describe('ContentStoreService', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    ContentStoreService.dispose();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    ContentStoreService.dispose();
  });

  it('sets, gets, and disposes store instance', async () => {
    const store = new MockStore();
    expect(ContentStoreService.getInstance()).toBeNull();
    expect(ContentStoreService.isAvailable()).toBe(false);
    await ContentStoreService.setInstance(store);
    expect(ContentStoreService.getInstance()).toBe(store);
    expect(ContentStoreService.isAvailable()).toBe(true);
    ContentStoreService.dispose();
    expect(ContentStoreService.getInstance()).toBeNull();
    expect(ContentStoreService.isAvailable()).toBe(false);
  });

  it('warns when replacing existing store', async () => {
    const first = new MockStore();
    const second = new MockStore();
    await ContentStoreService.setInstance(first);
    await ContentStoreService.setInstance(second);
    expect(warnSpy).toHaveBeenCalled();
    expect(ContentStoreService.getInstance()).toBe(second);
  });
});

describe('reference utilities', () => {
  it('extractReferenceId returns id for exact format', () => {
    const id = extractReferenceId('content-ref:abcdef');
    expect(id).toBe('abcdef');
  });

  it('extractReferenceId returns id for embedded format', () => {
    const id = extractReferenceId('wrapped content-ref:1234 and more');
    expect(id).toBe('1234');
  });

  it('extractReferenceId returns null when not present', () => {
    const id = extractReferenceId('no reference here');
    expect(id).toBeNull();
  });

  it('shouldUseReference respects threshold for string', () => {
    const small = 'a'.repeat(REFERENCE_THRESHOLD);
    const large = 'a'.repeat(REFERENCE_THRESHOLD + 1);
    expect(shouldUseReference(small)).toBe(false);
    expect(shouldUseReference(large)).toBe(true);
  });

  it('shouldUseReference respects threshold for buffer', () => {
    const small = Buffer.alloc(REFERENCE_THRESHOLD);
    const large = Buffer.alloc(REFERENCE_THRESHOLD + 1);
    expect(shouldUseReference(small)).toBe(false);
    expect(shouldUseReference(large)).toBe(true);
  });
});


