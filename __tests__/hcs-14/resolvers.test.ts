import { describe, it, expect } from '@jest/globals';

describe('HCS-14 resolver registry and Hiero resolver', () => {
  it('multibase base58btc roundtrips a did string', async () => {
    const { base58Encode, multibaseB58btcDecode } = await import(
      '../../src/hcs-14/base58'
    );
    const original = 'did:hedera:testnet:zRoot';
    const z = 'z' + base58Encode(Buffer.from(original, 'utf8'));
    const bytes = multibaseB58btcDecode(z);
    expect(Buffer.from(bytes).toString('utf8')).toBe(original);
  });
  it('resolves UAID via src parameter using Hiero resolver (mocked)', async () => {
    jest.resetModules();
    jest.doMock(
      '@hiero-did-sdk/resolver',
      () => ({
        resolveDID: async (arg: unknown) => {
          if (typeof arg === 'string') return { id: arg };
          const did = (arg as { did?: string }).did;
          return { id: did as string };
        },
      }),
      { virtual: true },
    );
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { HieroDidResolver } = await import(
      '../../src/hcs-14/resolvers/hiero'
    );

    const fakeLoader = async () => ({
      HcsDid: { fromString: (_did: string) => ({}) },
    });

    const registry = new ResolverRegistry();
    registry.register(new HieroDidResolver());

    const { base58Encode } = await import('../../src/hcs-14/base58');
    const uaid =
      'uaid:did:zRoot;src=z' +
      base58Encode(Buffer.from('did:hedera:testnet:zRoot'));

    const doc = await registry.resolveUaid(uaid);
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('did:hedera:testnet:zRoot');
    const direct = await registry.resolveDid('did:hedera:testnet:zRoot');
    expect(direct).not.toBeNull();
  });

  it('resolves UAID by reconstructing did:hedera from id (mocked)', async () => {
    jest.resetModules();
    jest.doMock(
      '@hiero-did-sdk/resolver',
      () => ({
        resolveDID: async (arg: unknown) => {
          if (typeof arg === 'string') return { id: arg };
          const did = (arg as { did?: string }).did;
          return { id: did as string };
        },
      }),
      { virtual: true },
    );
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { HieroDidResolver } = await import(
      '../../src/hcs-14/resolvers/hiero'
    );

    const registry = new ResolverRegistry();
    registry.register(new HieroDidResolver());

    const uaid = 'uaid:did:zRoot;proto=hcs-10;nativeId=hedera:testnet:0.0.1';
    const doc = await registry.resolveUaid(uaid);
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('did:hedera:testnet:zRoot');
  });

  it('handles default loader path when Hiero module is present', async () => {
    jest.resetModules();
    jest.doMock(
      '@hiero-did-sdk/resolver',
      () => ({
        resolveDID: async (arg: unknown) => {
          if (typeof arg === 'string') return { id: arg };
          const did = (arg as { did?: string }).did;
          return { id: did as string };
        },
      }),
      { virtual: true },
    );
    const { HieroDidResolver } = await import(
      '../../src/hcs-14/resolvers/hiero'
    );
    const resolver = new HieroDidResolver();
    const doc = await resolver.resolve('did:hedera:previewnet:zX');
    expect(doc!.id).toBe('did:hedera:previewnet:zX');
  });

  it('registry returns null for unsupported DID and UAID', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const reg = new ResolverRegistry();
    const a = await reg.resolveDid('did:unknown:abc');
    expect(a).toBeNull();
    const b = await reg.resolveUaid('uaid:did:unknown:id');
    expect(b).toBeNull();
    const c = await reg.resolveUaid('uaid:aid:abc');
    expect(c).toBeNull();
  });

  it('default loader success path (virtual mock for Hiero)', async () => {
    jest.resetModules();
    jest.doMock(
      '@hiero-did-sdk/resolver',
      () => ({
        resolveDID: async (arg: unknown) => {
          if (typeof arg === 'string') return { id: arg };
          const did = (arg as { did?: string }).did;
          return { id: did as string };
        },
      }),
      { virtual: true },
    );
    const { HieroDidResolver } = await import(
      '../../src/hcs-14/resolvers/hiero'
    );
    const resolver = new HieroDidResolver();
    const doc = await resolver.resolve('did:hedera:mainnet:zOk');
    expect(doc!.id).toBe('did:hedera:mainnet:zOk');
  });

  it('exports a defaultResolverRegistry singleton', async () => {
    const { defaultResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    expect(defaultResolverRegistry).toBeDefined();
  });
});
