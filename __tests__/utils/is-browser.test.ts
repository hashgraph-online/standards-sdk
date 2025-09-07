import { isBrowser } from '../../src/utils/is-browser';

describe('isBrowser', () => {
  test('should be a boolean value', () => {
    expect(typeof isBrowser).toBe('boolean');
  });

  test('should return false in Node.js environment', () => {
    expect(isBrowser).toBe(false);
  });

  test('should evaluate the correct expression', () => {
    const expectedResult =
      typeof window !== 'undefined' && typeof window.document !== 'undefined';
    expect(isBrowser).toBe(expectedResult);
  });
});
