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

  let hasNodeCrypto = false;
  let hasWebCrypto = false;

  try {
    hasNodeCrypto =
      typeof require !== 'undefined' &&
      typeof process !== 'undefined' &&
      !!process.versions?.node;
  } catch {
    hasNodeCrypto = false;
  }

  try {
    hasWebCrypto =
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined' &&
      !isSSR;
  } catch {
    hasWebCrypto = false;
  }

  let preferredAPI: 'node' | 'web' | 'none';

  if (hasNodeCrypto && isSSR) {
    preferredAPI = 'node';
  } else if (hasWebCrypto && !isSSR) {
    preferredAPI = 'web';
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
