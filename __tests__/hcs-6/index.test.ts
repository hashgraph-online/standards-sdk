import * as hcs6 from '../../src/hcs-6';

describe('HCS-6 Index', () => {
  test('should export HCS-6 client classes', () => {
    expect(hcs6).toHaveProperty('HCS6Client');
    expect(typeof hcs6.HCS6Client).toBe('function');
  });

  test('should export HCS-6 browser client', () => {
    expect(hcs6).toHaveProperty('HCS6BrowserClient');
    expect(typeof hcs6.HCS6BrowserClient).toBe('function');
  });

  test('should export HCS-6 transaction builders', () => {
    const expectedTxFunctions = [
      'buildHcs6CreateRegistryTx',
      'buildHcs6RegisterEntryTx',
    ];

    expectedTxFunctions.forEach(funcName => {
      expect(hcs6).toHaveProperty(funcName);
      expect(typeof hcs6[funcName]).toBe('function');
    });
  });

  test('should export HCS-6 types', () => {
    const expectedTypes = [
      'HCS6Operation',
      'HCS6RegistryType',
    ];

    expectedTypes.forEach(typeName => {
      expect(hcs6).toHaveProperty(typeName);
    });
  });

  test('should export expected HCS-6 exports', () => {
    const availableKeys = Object.keys(hcs6);
    expect(availableKeys.length).toBeGreaterThan(10); // Should have multiple exports

    expect(availableKeys).toContain('HCS6Client');
    expect(availableKeys).toContain('HCS6BrowserClient');
    expect(availableKeys).toContain('HCS6BaseClient');
  });
});
