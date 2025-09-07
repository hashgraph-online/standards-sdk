import * as services from '../../src/services';

describe('Services Index', () => {
  test('should export HederaMirrorNode', () => {
    expect(services).toHaveProperty('HederaMirrorNode');
    expect(typeof services.HederaMirrorNode).toBe('function');
  });

  test('should export expected service exports', () => {
    const availableKeys = Object.keys(services);
    expect(availableKeys.length).toBeGreaterThan(0);

    expect(availableKeys).toContain('HederaMirrorNode');
  });

  test('should export service types', () => {
    expect(services).toBeDefined();
    expect(typeof services.HederaMirrorNode).toBe('function');
  });
});
