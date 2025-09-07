import { describe, it, expect, jest } from '@jest/globals';

describe('HieroDidResolver', () => {
  it('resolves via hiero package (mocked)', async () => {
    jest.resetModules();
    jest.doMock('@hiero-did-sdk/resolver', () => ({
      resolveDID: async ({ did }: any) => ({ didDocument: { id: did } }),
    }), { virtual: true });
    const { HieroDidResolver } = await import('../../src/hcs-14');
    const resolver = new HieroDidResolver();
    const doc = await resolver.resolve('did:hedera:testnet:zABC_0.0.1');
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('did:hedera:testnet:zABC_0.0.1');
  });

  it('default loader uses hiero resolver module when available', async () => {
    jest.resetModules();
    jest.doMock('@hiero-did-sdk/resolver', () => ({
      resolveDID: async ({ did }: any) => ({ didDocument: { id: did } }),
    }), { virtual: true });
    const { HieroDidResolver } = await import('../../src/hcs-14');
    const resolver = new HieroDidResolver();
    const doc = await resolver.resolve('did:hedera:mainnet:zXYZ_0.0.2');
    expect(doc!.id).toBe('did:hedera:mainnet:zXYZ_0.0.2');
  });
});
