/**
 * Determines if the current environment is a browser
 */
export const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined';
