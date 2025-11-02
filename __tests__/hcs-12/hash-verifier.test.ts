import { HashVerifier } from '../../src/hcs-12/security/hash-verifier';

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    getInstance: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      getLevel: () => 'info',
    }),
  },
}));

describe('HashVerifier (SSR and adapter paths)', () => {
  test('hash() uses SSR fallback when SSR env', async () => {
    const origWindow = (global as any).window;
    delete (global as any).window;
    const { Logger } = await import('../../src/utils/logger');
    const hv = new HashVerifier({
      logger: Logger.getInstance({ module: 'test', level: 'info' }) as any,
    });
    const out = await hv.hash(Buffer.from('abc'), 'sha256');
    (global as any).window = origWindow || {};
    expect(out.startsWith('ssr-sha256-')).toBe(true);
  });

  test('createWasmManifest + verifyWasmModule succeeds deterministically', async () => {
    jest.doMock('../../src/utils/crypto-env', () => ({
      isSSREnvironment: () => true,
    }));
    const { Logger } = await import('../../src/utils/logger');
    const hv = new HashVerifier({
      logger: Logger.getInstance({ module: 'test', level: 'info' }) as any,
    });
    const mod = {
      id: 'm',
      code: new Uint8Array([1, 2, 3]),
      metadata: { a: 1 },
    };
    const manifest = await hv.createWasmManifest(mod);
    const res = await hv.verifyWasmModule(mod, manifest);
    expect(res.valid).toBe(true);
    expect(res.codeIntegrity).toBe(true);
    expect(res.metadataIntegrity).toBe(true);
  });

  test('computeMerkleRoot + verifyChunks round-trip', async () => {
    jest.doMock('../../src/utils/crypto-env', () => ({
      isSSREnvironment: () => true,
    }));
    const { Logger } = await import('../../src/utils/logger');
    const hv = new HashVerifier({
      logger: Logger.getInstance({ module: 'test', level: 'info' }) as any,
    });
    const chunks = [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')];
    const { valid } = await hv.verifyChunks(
      chunks,
      await (async () => {
        const hashes = await Promise.all(chunks.map(c => hv.hash(c)));
        return hv.computeMerkleRoot(hashes);
      })(),
    );
    expect(valid).toBe(true);
  });

  test('adapter path uses cache when enabled (non-SSR)', async () => {
    await jest.isolateModulesAsync(async () => {
      const createHashSpy = jest.fn(() => ({
        update: () => ({ digest: () => 'deadbeef' }),
      }));
      jest.doMock('../../src/utils/crypto-env', () => ({
        isSSREnvironment: () => false,
      }));
      jest.doMock('../../src/utils/crypto-abstraction', () => ({
        getCryptoAdapter: () => ({ createHash: createHashSpy }),
      }));
      const { Logger } = await import('../../src/utils/logger');
      const { HashVerifier } = await import(
        '../../src/hcs-12/security/hash-verifier'
      );
      const hv = new HashVerifier({
        logger: Logger.getInstance({ module: 'test', level: 'info' }) as any,
      });
      hv.enableCaching({ maxSize: 10, ttlMs: 10_000 });
      const buf = Buffer.from('hello');
      const h1 = await hv.hash(buf, 'sha256');
      const h2 = await hv.hash(buf, 'sha256');
      expect(h1).toBe('deadbeef');
      expect(h2).toBe('deadbeef');
      expect(createHashSpy).toHaveBeenCalledTimes(1);
    });
  });
});
