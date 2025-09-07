import * as hcs20 from '../../src/hcs-20';

describe('HCS-20 Index', () => {
  test('should export HCS-20 client classes', () => {
    expect(hcs20).toHaveProperty('HCS20Client');
    expect(typeof hcs20.HCS20Client).toBe('function');

    expect(hcs20).toHaveProperty('BrowserHCS20Client');
    expect(typeof hcs20.BrowserHCS20Client).toBe('function');

    expect(hcs20).toHaveProperty('HCS20BaseClient');
    expect(typeof hcs20.HCS20BaseClient).toBe('function');
  });

  test('should export HCS-20 indexer', () => {
    expect(hcs20).toHaveProperty('HCS20PointsIndexer');
    expect(typeof hcs20.HCS20PointsIndexer).toBe('function');
  });

  test('should export HCS-20 transaction builders', () => {
    const expectedTxFunctions = [
      'buildHcs20SubmitMessageTx',
      'buildHcs20RegisterTx',
      'buildHcs20MintTx',
      'buildHcs20TransferTx',
      'buildHcs20BurnTx',
      'buildHcs20DeployTx',
    ];

    expectedTxFunctions.forEach(funcName => {
      expect(hcs20).toHaveProperty(funcName);
      expect(typeof hcs20[funcName]).toBe('function');
    });
  });

  test('should export expected HCS-20 exports', () => {
    const availableKeys = Object.keys(hcs20);
    expect(availableKeys.length).toBeGreaterThan(5); // Should have multiple exports

    expect(availableKeys).toContain('HCS20Client');
    expect(availableKeys).toContain('BrowserHCS20Client');
    expect(availableKeys).toContain('HCS20PointsIndexer');
    expect(availableKeys).toContain('HCS20BaseClient');
  });
});
