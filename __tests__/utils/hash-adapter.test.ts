import {
  HashAdapter,
  NodeHashAdapter,
  WebHashAdapter,
  FallbackHashAdapter,
} from '../../src/utils/hash-adapter';

const originalCrypto = global.crypto;

describe('HashAdapter implementations', () => {
  describe('NodeHashAdapter', () => {
    let mockNodeHash: jest.Mocked<any>;
    let adapter: NodeHashAdapter;

    beforeEach(() => {
      mockNodeHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('mock-digest'),
      };
      adapter = new NodeHashAdapter(mockNodeHash);
    });

    test('should create NodeHashAdapter instance', () => {
      expect(adapter).toBeInstanceOf(NodeHashAdapter);
      expect(adapter).toBeInstanceOf(Object);
    });

    test('update should call nodeHash.update and return adapter', () => {
      const data = Buffer.from('test data');

      const result = adapter.update(data);

      expect(mockNodeHash.update).toHaveBeenCalledWith(data);
      expect(result).toBe(adapter);
    });

    test('update should handle string data', () => {
      const data = 'test string';

      const result = adapter.update(data);

      expect(mockNodeHash.update).toHaveBeenCalledWith(data);
      expect(result).toBe(adapter);
    });

    test('digest should call nodeHash.digest and return result', () => {
      const encoding = 'hex';

      const result = adapter.digest(encoding);

      expect(mockNodeHash.digest).toHaveBeenCalledWith(encoding);
      expect(result).toBe('mock-digest');
    });

    test('digest should work without encoding', () => {
      const result = adapter.digest();

      expect(mockNodeHash.digest).toHaveBeenCalledWith(undefined);
      expect(result).toBe('mock-digest');
    });

    test('should be a valid HashAdapter', () => {
      const hashAdapter: HashAdapter = adapter;
      expect(hashAdapter).toBeDefined();
    });
  });

  describe('WebHashAdapter', () => {
    let adapter: WebHashAdapter;

    beforeEach(() => {
      global.crypto = {
        subtle: {
          digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
        },
      } as any;
      adapter = new WebHashAdapter('sha256');
    });

    afterEach(() => {
      global.crypto = originalCrypto;
    });

    test('should create WebHashAdapter instance', () => {
      expect(adapter).toBeInstanceOf(WebHashAdapter);
      expect(adapter).toBeInstanceOf(Object);
    });

    test('update should store data and return adapter', () => {
      const data = Buffer.from('test data');

      const result = adapter.update(data);

      expect(result).toBe(adapter);
    });

    test('update should handle string data', () => {
      const data = 'test string';

      const result = adapter.update(data);

      expect(result).toBe(adapter);
    });

    test('digest should call crypto.subtle.digest with correct algorithm', async () => {
      const result = await adapter.digest();

      expect(global.crypto.subtle.digest).toHaveBeenCalledWith(
        'SHA-256',
        expect.any(Uint8Array),
      );
      expect(result).toBeInstanceOf(Buffer);
    });

    test('digest should return hex string when encoding is hex', async () => {
      const result = await adapter.digest('hex');

      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]+$/);
      expect(result.length).toBe(64); // SHA-256 produces 32 bytes = 64 hex chars
    });

    test('digest should handle multiple updates', async () => {
      adapter.update('hello');
      adapter.update(' ');
      adapter.update('world');

      const result = await adapter.digest();

      expect(global.crypto.subtle.digest).toHaveBeenCalledWith(
        'SHA-256',
        expect.any(Uint8Array),
      );
    });

    test('should map algorithms correctly', async () => {
      const sha1Adapter = new WebHashAdapter('sha1');
      const sha512Adapter = new WebHashAdapter('sha512');
      const unknownAdapter = new WebHashAdapter('unknown');

      await sha1Adapter.digest();
      await sha512Adapter.digest();
      await unknownAdapter.digest();

      expect(global.crypto.subtle.digest).toHaveBeenCalledWith(
        'SHA-1',
        expect.any(Uint8Array),
      );
      expect(global.crypto.subtle.digest).toHaveBeenCalledWith(
        'SHA-512',
        expect.any(Uint8Array),
      );
      expect(global.crypto.subtle.digest).toHaveBeenCalledWith(
        'SHA-256',
        expect.any(Uint8Array),
      );
    });

    test('should concatenate arrays correctly', () => {
      const testAdapter = new WebHashAdapter('sha256');
      testAdapter.update('hello');
      testAdapter.update('world');

      const concatenated = (testAdapter as any).concatenateArrays([
        new Uint8Array([72, 101, 108, 108, 111]), // 'hello'
        new Uint8Array([87, 111, 114, 108, 100]), // 'world'
      ]);

      expect(concatenated).toEqual(
        new Uint8Array([72, 101, 108, 108, 111, 87, 111, 114, 108, 100]),
      );
    });

    test('should be a valid HashAdapter', () => {
      const hashAdapter: HashAdapter = adapter;
      expect(hashAdapter).toBeDefined();
    });
  });

  describe('FallbackHashAdapter', () => {
    let adapter: FallbackHashAdapter;

    beforeEach(() => {
      adapter = new FallbackHashAdapter('sha256');
    });

    test('should create FallbackHashAdapter instance', () => {
      expect(adapter).toBeInstanceOf(FallbackHashAdapter);
      expect(adapter).toBeInstanceOf(Object);
    });

    test('update should store data and return adapter', () => {
      const data = Buffer.from('test data');

      const result = adapter.update(data);

      expect(result).toBe(adapter);
    });

    test('update should handle string data', () => {
      const data = 'test string';

      const result = adapter.update(data);

      expect(result).toBe(adapter);
    });

    test('digest should return hash as string', () => {
      adapter.update('test data');

      const result = adapter.digest();

      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d+$/);
    });

    test('digest should return hex string when encoding is hex', () => {
      adapter.update('test data');

      const result = adapter.digest('hex');

      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]+$/);
      expect(result.length).toBeGreaterThanOrEqual(8);
    });

    test('digest should handle multiple updates', () => {
      adapter.update('hello');
      adapter.update(' ');
      adapter.update('world');

      const result = adapter.digest();

      expect(typeof result).toBe('string');
    });

    test('should handle empty data', () => {
      const result = adapter.digest();

      expect(typeof result).toBe('string');
    });

    test('should be a valid HashAdapter', () => {
      const hashAdapter: HashAdapter = adapter;
      expect(hashAdapter).toBeDefined();
    });

    test('simpleHash should produce consistent results', () => {
      const adapter1 = new FallbackHashAdapter('sha256');
      const adapter2 = new FallbackHashAdapter('sha256');

      adapter1.update('same data');
      adapter2.update('same data');

      const result1 = adapter1.digest();
      const result2 = adapter2.digest();

      expect(result1).toBe(result2);
    });

    test('simpleHash should handle different data differently', () => {
      const adapter1 = new FallbackHashAdapter('sha256');
      const adapter2 = new FallbackHashAdapter('sha256');

      adapter1.update('data 1');
      adapter2.update('data 2');

      const result1 = adapter1.digest();
      const result2 = adapter2.digest();

      expect(result1).not.toBe(result2);
    });
  });

  describe('HashAdapter interface', () => {
    test('all adapters should implement HashAdapter interface', () => {
      const nodeAdapter = new NodeHashAdapter({});
      const webAdapter = new WebHashAdapter('sha256');
      const fallbackAdapter = new FallbackHashAdapter('sha256');

      const adapters: HashAdapter[] = [
        nodeAdapter,
        webAdapter,
        fallbackAdapter,
      ];

      adapters.forEach(adapter => {
        expect(typeof adapter.update).toBe('function');
        expect(typeof adapter.digest).toBe('function');
      });
    });

    test('adapters should support method chaining', () => {
      const nodeAdapter = new NodeHashAdapter({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('result'),
      });

      const result = nodeAdapter.update('data').digest();

      expect(result).toBe('result');
    });
  });
});
