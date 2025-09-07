import {
  detectCryptoEnvironment,
  isCryptoAvailable,
  isSSREnvironment,
  CryptoEnvironment,
} from '../../src/utils/crypto-env';

const originalWindow = global.window;
const originalProcess = global.process;
const originalRequire = global.require;
const originalCrypto = global.crypto;

describe('crypto-env', () => {
  beforeEach(() => {
    delete (global as any).window;
    delete (global as any).process;
    delete (global as any).require;
    delete (global as any).crypto;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.process = originalProcess;
    global.require = originalRequire;
    global.crypto = originalCrypto;
  });

  describe('detectCryptoEnvironment', () => {
    test('should detect Node.js environment correctly', () => {
      global.process = { versions: { node: '18.0.0' } } as any;
      global.require = jest.fn();

      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(true);
      expect(result.hasWebCrypto).toBe(false);
      expect(result.isSSR).toBe(true);
      expect(result.preferredAPI).toBe('node');
    });

    test('should detect browser environment correctly', () => {
      global.window = {};
      global.crypto = { subtle: {} };

      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(false);
      expect(result.hasWebCrypto).toBe(true);
      expect(result.isSSR).toBe(false);
      expect(result.preferredAPI).toBe('web');
    });

    test('should handle missing crypto in browser', () => {
      global.window = {};

      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(false);
      expect(result.hasWebCrypto).toBe(false);
      expect(result.isSSR).toBe(false);
      expect(result.preferredAPI).toBe('none');
    });

    test('should handle missing subtle in crypto', () => {
      global.window = {};
      global.crypto = {};

      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(false);
      expect(result.hasWebCrypto).toBe(false);
      expect(result.isSSR).toBe(false);
      expect(result.preferredAPI).toBe('none');
    });

    test('should handle environment with no crypto APIs', () => {
      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(false);
      expect(result.hasWebCrypto).toBe(false);
      expect(result.isSSR).toBe(true);
      expect(result.preferredAPI).toBe('none');
    });

    test('should handle errors in Node.js detection gracefully', () => {
      global.require = jest.fn(() => {
        throw new Error('Module not found');
      });

      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(false);
    });

    test('should handle errors in Web Crypto detection gracefully', () => {
      global.window = {};
      global.crypto = new Proxy(
        {},
        {
          get() {
            throw new Error('Crypto error');
          },
        },
      );

      const result = detectCryptoEnvironment();

      expect(result.hasWebCrypto).toBe(false);
    });

    test('should prefer Node.js API when both are available in SSR', () => {
      global.process = { versions: { node: '18.0.0' } } as any;
      global.require = jest.fn();
      global.crypto = { subtle: {} };

      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(true);
      expect(result.hasWebCrypto).toBe(false);
      expect(result.isSSR).toBe(true);
      expect(result.preferredAPI).toBe('node');
    });

    test('should prefer Web Crypto API when both are available in browser', () => {
      global.window = {};
      global.process = { versions: { node: '18.0.0' } } as any;
      global.require = jest.fn();
      global.crypto = { subtle: {} };

      const result = detectCryptoEnvironment();

      expect(result.hasNodeCrypto).toBe(true);
      expect(result.hasWebCrypto).toBe(true);
      expect(result.isSSR).toBe(false);
      expect(result.preferredAPI).toBe('web');
    });
  });

  describe('isCryptoAvailable', () => {
    test('should return true when Node.js crypto is available', () => {
      global.process = { versions: { node: '18.0.0' } } as any;
      global.require = jest.fn();

      expect(isCryptoAvailable()).toBe(true);
    });

    test('should return true when Web Crypto is available', () => {
      global.window = {};
      global.crypto = { subtle: {} };

      expect(isCryptoAvailable()).toBe(true);
    });

    test('should return false when no crypto APIs are available', () => {
      expect(isCryptoAvailable()).toBe(false);
    });
  });

  describe('isSSREnvironment', () => {
    test('should return true when window is undefined', () => {
      expect(isSSREnvironment()).toBe(true);
    });

    test('should return false when window is defined', () => {
      global.window = {};

      expect(isSSREnvironment()).toBe(false);
    });
  });
});
