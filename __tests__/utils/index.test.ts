import * as utils from '../../src/utils';

describe('Utils Index', () => {
  test('should export Logger', () => {
    expect(utils).toHaveProperty('Logger');
    expect(typeof utils.Logger).toBe('function');
  });

  test('should export utility functions', () => {
    const expectedFunctions = ['sleep', 'isSSREnvironment'];

    expectedFunctions.forEach(funcName => {
      expect(utils).toHaveProperty(funcName);
      expect(typeof utils[funcName]).toBe('function');
    });

    expect(utils).toHaveProperty('isBrowser');
    expect(typeof (utils as any).isBrowser).toBe('boolean');
  });

  test('should export utility classes', () => {
    const expectedClasses = [
      'ProgressReporter',
      'HRLResolver',
      'TransactionParser',
    ];

    expectedClasses.forEach(className => {
      expect(utils).toHaveProperty(className);
      expect(typeof utils[className]).toBe('function');
    });
  });

  test('should export parser utilities', () => {
    expect(utils).toHaveProperty('HTSParser');
    expect(utils).toHaveProperty('ScheduleParser');
    expect(utils).toHaveProperty('transactionParserRegistry');
  });

  test('should export crypto utilities', () => {
    expect(utils).toHaveProperty('getCryptoAdapter');
    expect(utils).toHaveProperty('hash');
  });

  test('should export hash utilities', () => {
    const expectedHashFunctions = [
      'NodeHashAdapter',
      'WebHashAdapter',
      'FallbackHashAdapter',
    ];

    expectedHashFunctions.forEach(funcName => {
      expect(utils).toHaveProperty(funcName);
    });
  });

  test('should export all expected utilities', () => {
    const availableKeys = Object.keys(utils);
    expect(availableKeys.length).toBeGreaterThan(20); // Should have many exports

    expect(availableKeys).toContain('Logger');
    expect(availableKeys).toContain('sleep');
    expect(availableKeys).toContain('ProgressReporter');
  });
});
