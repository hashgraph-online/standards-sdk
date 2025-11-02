import { detectCryptoEnvironment } from '../../src/utils/crypto-env';

jest.mock('../../src/utils/crypto-env');

jest.mock('crypto', () => {
  const hashMock = () => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue(Buffer.from('hash')),
  });
  const hmacMock = () => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hash'),
  });
  return {
    createHash: jest.fn(hashMock),
    createHmac: jest.fn(hmacMock),
    pbkdf2: jest.fn(
      (
        _password: string,
        _salt: Buffer,
        _iterations: number,
        keylen: number,
        _digest: string,
        cb: (err: unknown, derivedKey: Buffer) => void,
      ) => cb(null, Buffer.alloc(keylen)),
    ),
    timingSafeEqual: jest.fn(
      (a: Buffer, b: Buffer) => Buffer.compare(a, b) === 0,
    ),
    webcrypto: { subtle: {} },
  };
});

import {
  getCryptoAdapter,
  NodeCryptoAdapter,
  WebCryptoAdapter,
  FallbackCryptoAdapter,
  NodeHmacAdapter,
  WebHmacAdapter,
  FallbackHmacAdapter,
  hash,
} from '../../src/utils/crypto-abstraction';

describe('Crypto Abstraction Layer', () => {
  const mockDetectCryptoEnvironment =
    detectCryptoEnvironment as jest.MockedFunction<
      typeof detectCryptoEnvironment
    >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('NodeCryptoAdapter', () => {
    let mockCrypto: any;

    beforeEach(() => {
      mockCrypto = undefined as any;
    });

    test('should create NodeCryptoAdapter successfully', () => {
      jest.isolateModules(() => {
        jest.doMock('crypto', () => mockCrypto, { virtual: true });
        const {
          NodeCryptoAdapter: NCA,
        } = require('../../src/utils/crypto-abstraction');
        const adapter = new NCA();
        expect(adapter).toBeInstanceOf(NCA);
      });
    });

    test('constructs without error when crypto module is available', () => {
      const adapter = new NodeCryptoAdapter();
      expect(adapter).toBeInstanceOf(NodeCryptoAdapter);
    });

    test('exposes createHash method', () => {
      const adapter = new NodeCryptoAdapter();
      expect(typeof (adapter as any).createHash).toBe('function');
    });

    test('exposes createHmac method', () => {
      const adapter = new NodeCryptoAdapter();
      expect(typeof (adapter as any).createHmac).toBe('function');
    });

    test('exposes pbkdf2 method', () => {
      const adapter = new NodeCryptoAdapter();
      expect(typeof (adapter as any).pbkdf2).toBe('function');
    });

    test('exposes timingSafeEqual method', () => {
      const adapter = new NodeCryptoAdapter();
      expect(typeof (adapter as any).timingSafeEqual).toBe('function');
    });
  });

  describe('WebCryptoAdapter', () => {
    let originalCrypto: any;

    beforeEach(() => {
      originalCrypto = global.crypto;
      global.crypto = {
        subtle: {
          importKey: jest.fn(),
          sign: jest.fn(),
          deriveBits: jest.fn(),
        },
      } as any;
    });

    afterEach(() => {
      global.crypto = originalCrypto;
    });

    test('should create WebCryptoAdapter successfully', () => {
      const adapter = new WebCryptoAdapter();
      expect(adapter).toBeInstanceOf(WebCryptoAdapter);
    });

    test('should create hash adapter', () => {
      const adapter = new WebCryptoAdapter();
      const result = adapter.createHash('sha256');

      expect(result).toBeDefined();
    });

    test('should create HMAC adapter', () => {
      const adapter = new WebCryptoAdapter();
      const result = adapter.createHmac('sha256', Buffer.from('key'));

      expect(result).toBeDefined();
    });

    test('should perform PBKDF2', async () => {
      const mockKeyMaterial = {};
      const mockDerivedBits = new ArrayBuffer(32);

      (global.crypto.subtle.importKey as jest.Mock).mockResolvedValue(
        mockKeyMaterial,
      );
      (global.crypto.subtle.deriveBits as jest.Mock).mockResolvedValue(
        mockDerivedBits,
      );

      const adapter = new WebCryptoAdapter();
      const result = await adapter.pbkdf2(
        'password',
        Buffer.from('salt'),
        1000,
        32,
        'sha256',
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    test('should perform timing safe equal', () => {
      const adapter = new WebCryptoAdapter();

      const a = Buffer.from('test');
      const b = Buffer.from('test');
      const result = adapter.timingSafeEqual(a, b);

      expect(result).toBe(true);
    });

    test('should return false for timing safe equal with different lengths', () => {
      const adapter = new WebCryptoAdapter();

      const a = Buffer.from('test');
      const b = Buffer.from('different');
      const result = adapter.timingSafeEqual(a, b);

      expect(result).toBe(false);
    });
  });

  describe('FallbackCryptoAdapter', () => {
    test('should create FallbackCryptoAdapter successfully', () => {
      const adapter = new FallbackCryptoAdapter();
      expect(adapter).toBeInstanceOf(FallbackCryptoAdapter);
    });

    test('should create hash adapter', () => {
      const adapter = new FallbackCryptoAdapter();
      const result = adapter.createHash('sha256');

      expect(result).toBeDefined();
    });

    test('should create HMAC adapter', () => {
      const adapter = new FallbackCryptoAdapter();
      const result = adapter.createHmac('sha256', Buffer.from('key'));

      expect(result).toBeDefined();
    });

    test('should perform PBKDF2', async () => {
      const adapter = new FallbackCryptoAdapter();
      const result = await adapter.pbkdf2(
        'password',
        Buffer.from('salt'),
        100,
        32,
        'sha256',
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
    });

    test('should perform timing safe equal', () => {
      const adapter = new FallbackCryptoAdapter();

      const a = Buffer.from('test');
      const b = Buffer.from('test');
      const result = adapter.timingSafeEqual(a, b);

      expect(result).toBe(true);
    });
  });

  describe('HMAC Adapters', () => {
    describe('NodeHmacAdapter', () => {
      test('should create NodeHmacAdapter successfully', () => {
        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn().mockReturnValue('hash'),
        };

        const adapter = new NodeHmacAdapter(mockHmac);
        expect(adapter).toBeInstanceOf(NodeHmacAdapter);
      });

      test('should update and digest', () => {
        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn().mockReturnValue('hash'),
        };

        const adapter = new NodeHmacAdapter(mockHmac);
        const data = Buffer.from('test data');

        const result = adapter.update(data).digest();

        expect(mockHmac.update).toHaveBeenCalledWith(data);
        expect(mockHmac.digest).toHaveBeenCalledWith(undefined);
        expect(result).toBe('hash');
      });

      test('should digest with encoding', () => {
        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn().mockReturnValue('hash-hex'),
        };

        const adapter = new NodeHmacAdapter(mockHmac);

        const result = adapter.digest('hex');

        expect(mockHmac.digest).toHaveBeenCalledWith('hex');
        expect(result).toBe('hash-hex');
      });
    });

    describe('WebHmacAdapter', () => {
      let originalCrypto: any;

      beforeEach(() => {
        originalCrypto = global.crypto;
        global.crypto = {
          subtle: {
            importKey: jest.fn(),
            sign: jest.fn(),
          },
        } as any;
      });

      afterEach(() => {
        global.crypto = originalCrypto;
      });

      test('should create WebHmacAdapter successfully', () => {
        const adapter = new WebHmacAdapter(Buffer.from('key'), 'sha256');
        expect(adapter).toBeInstanceOf(WebHmacAdapter);
      });

      test('should update data', () => {
        const adapter = new WebHmacAdapter(Buffer.from('key'), 'sha256');
        const data = Buffer.from('test data');

        const result = adapter.update(data);

        expect(result).toBe(adapter);
      });

      test('should digest data', async () => {
        const mockKey = {};
        const mockSignature = new ArrayBuffer(32);

        (global.crypto.subtle.importKey as jest.Mock).mockResolvedValue(
          mockKey,
        );
        (global.crypto.subtle.sign as jest.Mock).mockResolvedValue(
          mockSignature,
        );

        const adapter = new WebHmacAdapter(Buffer.from('key'), 'sha256');
        adapter.update(Buffer.from('test data'));

        const result = await adapter.digest();

        expect(result).toBeInstanceOf(Buffer);
      });

      test('should digest with hex encoding', async () => {
        const mockKey = {};
        const mockSignature = new ArrayBuffer(4);
        new Uint8Array(mockSignature).set([0xab, 0xcd, 0xef, 0x12]);

        (global.crypto.subtle.importKey as jest.Mock).mockResolvedValue(
          mockKey,
        );
        (global.crypto.subtle.sign as jest.Mock).mockResolvedValue(
          mockSignature,
        );

        const adapter = new WebHmacAdapter(Buffer.from('key'), 'sha256');

        const result = await adapter.digest('hex');

        expect(result).toBe('abcdef12');
      });

      test('should map algorithms correctly', () => {
        const adapter = new WebHmacAdapter(Buffer.from('key'), 'sha512');
        expect(adapter).toBeDefined();
      });
    });

    describe('FallbackHmacAdapter', () => {
      test('should create FallbackHmacAdapter successfully', () => {
        const adapter = new FallbackHmacAdapter(Buffer.from('key'), 'sha256');
        expect(adapter).toBeInstanceOf(FallbackHmacAdapter);
      });

      test('should update data', () => {
        const adapter = new FallbackHmacAdapter(Buffer.from('key'), 'sha256');
        const data = Buffer.from('test data');

        const result = adapter.update(data);

        expect(result).toBe(adapter);
      });

      test('should digest data', () => {
        const adapter = new FallbackHmacAdapter(Buffer.from('key'), 'sha256');
        adapter.update(Buffer.from('test data'));

        const result = adapter.digest();

        expect(typeof result).toBe('string');
      });

      test('should digest with hex encoding', () => {
        const adapter = new FallbackHmacAdapter(Buffer.from('key'), 'sha256');
        adapter.update(Buffer.from('test data'));

        const result = adapter.digest('hex');

        expect(typeof result).toBe('string');
        expect(result).toMatch(/^[0-9a-f]+$/);
      });
    });
  });

  describe('getCryptoAdapter', () => {
    test('should return NodeCryptoAdapter for node environment', () => {
      mockDetectCryptoEnvironment.mockReturnValue({
        preferredAPI: 'node',
        hasNodeCrypto: true,
        hasWebCrypto: false,
      });

      const adapter = getCryptoAdapter();

      expect(adapter).toBeInstanceOf(NodeCryptoAdapter);
    });

    test('should return WebCryptoAdapter for web environment', () => {
      mockDetectCryptoEnvironment.mockReturnValue({
        preferredAPI: 'web',
        hasNodeCrypto: false,
        hasWebCrypto: true,
      });

      const adapter = getCryptoAdapter();

      expect(adapter).toBeInstanceOf(WebCryptoAdapter);
    });

    test('should return FallbackCryptoAdapter for none environment', () => {
      mockDetectCryptoEnvironment.mockReturnValue({
        preferredAPI: 'none',
        hasNodeCrypto: false,
        hasWebCrypto: false,
      });

      const adapter = getCryptoAdapter();

      expect(adapter).toBeInstanceOf(FallbackCryptoAdapter);
    });

    test('should return a working adapter when node crypto is unavailable', () => {
      mockDetectCryptoEnvironment.mockReturnValue({
        preferredAPI: 'node',
        hasNodeCrypto: false,
        hasWebCrypto: false,
      });
      const adapter = getCryptoAdapter();
      expect(typeof adapter.createHash).toBe('function');
    });
  });

  describe('hash function', () => {
    beforeEach(() => {
      mockDetectCryptoEnvironment.mockReturnValue({
        preferredAPI: 'web',
        hasNodeCrypto: false,
        hasWebCrypto: true,
      });
    });

    test('should hash string content', async () => {
      const result = await hash('test content', 'sha256');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should hash buffer content', async () => {
      const buffer = Buffer.from('test content');
      const result = await hash(buffer, 'sha256');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should use default algorithm', async () => {
      const result = await hash('test content');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
