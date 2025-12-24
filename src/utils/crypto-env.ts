/**
 * Crypto Environment Detection Utility
 *
 * Detects available cryptographic APIs and determines the best
 * crypto implementation for the current environment (Node.js, browser, or SSR).
 */

export interface CryptoEnvironment {
  hasNodeCrypto: boolean;
  hasWebCrypto: boolean;
  isSSR: boolean;
  preferredAPI: 'node' | 'web' | 'none';
}

/**
 * Detect current cryptographic environment
 */
export function detectCryptoEnvironment(): CryptoEnvironment {
  const isSSR = typeof window === 'undefined';
  const globalCrypto =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  let hasNodeCrypto = false;
  let hasWebCrypto = false;

  try {
    hasNodeCrypto = typeof process !== 'undefined' && !!process.versions?.node;
  } catch {
    hasNodeCrypto = false;
  }

  try {
    hasWebCrypto =
      typeof globalCrypto !== 'undefined' &&
      typeof globalCrypto.subtle !== 'undefined';
  } catch {
    hasWebCrypto = false;
  }

  let preferredAPI: 'node' | 'web' | 'none';

  if (hasWebCrypto) {
    preferredAPI = 'web';
  } else if (hasNodeCrypto) {
    preferredAPI = 'node';
  } else {
    preferredAPI = 'none';
  }

  return {
    hasNodeCrypto,
    hasWebCrypto,
    isSSR,
    preferredAPI,
  };
}

/**
 * Check if crypto operations are available
 */
export function isCryptoAvailable(): boolean {
  const env = detectCryptoEnvironment();
  return env.preferredAPI !== 'none';
}

/**
 * Check if running in server-side rendering context
 */
export function isSSREnvironment(): boolean {
  return typeof window === 'undefined';
}
