import { isBrowser } from '../../src/utils/is-browser';

describe('isBrowser', () => {
  test('returns false in Node test environment', () => {
    expect(isBrowser).toBe(false);
  });
});
