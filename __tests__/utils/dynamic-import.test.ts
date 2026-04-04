import {
  optionalImport,
  optionalImportSync,
} from '../../src/utils/dynamic-import';

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

describe('optionalImportSync', () => {
  it('loads a built-in module when available', () => {
    const mod = optionalImportSync<typeof import('node:path')>('node:path');
    expect(mod).not.toBeNull();
    expect(typeof mod?.join).toBe('function');
  });

  it('returns null when the module is missing', () => {
    const mod = optionalImportSync('@@non-existent-module@@');
    expect(mod).toBeNull();
  });

  it('anchors createRequire to this module instead of process cwd', () => {
    const originalGetBuiltinModule = (
      process as typeof process & {
        getBuiltinModule?: (name: string) => unknown;
      }
    ).getBuiltinModule;
    const createRequire = jest.fn(() => require);
    const getBuiltinModule = jest.fn((name: string) =>
      name === 'module' ? { createRequire } : undefined,
    );

    Object.defineProperty(process, 'getBuiltinModule', {
      configurable: true,
      value: getBuiltinModule,
    });

    try {
      const mod = optionalImportSync<typeof import('node:path')>('node:path');
      expect(mod).not.toBeNull();
      expect(createRequire).toHaveBeenCalledTimes(1);
      const [origin] = createRequire.mock.calls[0] ?? [];
      expect(String(origin)).toContain('dynamic-import');
      expect(String(origin)).not.toBe(`${process.cwd()}/package.json`);
    } finally {
      Object.defineProperty(process, 'getBuiltinModule', {
        configurable: true,
        value: originalGetBuiltinModule,
      });
    }
  });
});
