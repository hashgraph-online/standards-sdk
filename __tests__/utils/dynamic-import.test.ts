import { optionalImport } from '../../src/utils/dynamic-import';

describe('optionalImport', () => {
  it('loads a built-in module when available', async () => {
    const mod = await optionalImport<typeof import('node:path')>('node:path');
    expect(mod).not.toBeNull();
    expect(typeof mod?.join).toBe('function');
  });

  it('returns null when the module is missing', async () => {
    const mod = await optionalImport('@@non-existent-module@@');
    expect(mod).toBeNull();
  });
});
