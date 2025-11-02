import * as hcs2 from '../../src/hcs-2';

describe('HCS-2 Index', () => {
  test('should export HCS-2 client classes', () => {
    expect(hcs2).toHaveProperty('HCS2Client');
    expect(typeof hcs2.HCS2Client).toBe('function');
  });

  test('should export HCS-2 browser client', () => {
    expect(hcs2).toHaveProperty('BrowserHCS2Client');
    expect(typeof hcs2.BrowserHCS2Client).toBe('function');
  });

  test('should export HCS-2 transaction builders', () => {
    const expectedTxFunctions = [
      'buildHcs2CreateRegistryTx',
      'buildHcs2RegisterTx',
      'buildHcs2UpdateTx',
      'buildHcs2DeleteTx',
      'buildHcs2MigrateTx',
    ];

    expectedTxFunctions.forEach(funcName => {
      expect(hcs2).toHaveProperty(funcName);
      expect(typeof hcs2[funcName]).toBe('function');
    });
  });

  test('should export HCS-2 types', () => {
    const expectedTypes = ['HCS2Operation', 'HCS2RegistryType'];

    expectedTypes.forEach(typeName => {
      expect(hcs2).toHaveProperty(typeName);
    });
  });

  test('should export expected HCS-2 exports', () => {
    const availableKeys = Object.keys(hcs2);
    expect(availableKeys.length).toBeGreaterThan(10); // Should have multiple exports

    expect(availableKeys).toContain('HCS2Client');
    expect(availableKeys).toContain('BrowserHCS2Client');
    expect(availableKeys).toContain('HCS2BaseClient');
  });
});
