import { describe, it, expect, jest } from '@jest/globals';

describe('HCS-14 resolver registry and profile resolvers', () => {
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
    const { base58Encode } = await import('../../src/hcs-14/base58');

    const registry = new ResolverRegistry();
    registry.register(new HieroDidResolver());

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

  it('registry returns null for unsupported DID and UAID', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const reg = new ResolverRegistry();

    const didDoc = await reg.resolveDid('did:unknown:abc');
    expect(didDoc).toBeNull();

    const uaidDoc = await reg.resolveUaid('uaid:did:unknown:id');
    expect(uaidDoc).toBeNull();
  });

  it('exports a defaultResolverRegistry singleton', async () => {
    const { defaultResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    expect(defaultResolverRegistry).toBeDefined();
  });

  it('resolves minimal profile for uaid:aid with no profile resolver match', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const registry = new ResolverRegistry();

    const profile = await registry.resolveUaidProfile(
      'uaid:aid:QmHash;uid=0;registry=hol;nativeId=hedera:testnet:0.0.1',
    );

    expect(profile).toMatchObject({
      id: 'uaid:aid:QmHash;uid=0;registry=hol;nativeId=hedera:testnet:0.0.1',
    });
  });

  it('falls back to UAID-linked DID profile when no profile resolver matches', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const registry = new ResolverRegistry();
    registry.register({
      meta: { id: 'hedera/mock', didMethods: ['hedera'] },
      supports(did: string) {
        return did.startsWith('did:hedera:');
      },
      async resolve(did: string) {
        return { id: did };
      },
    });

    const uaid =
      'uaid:did:zRoot;uid=0;proto=hcs-10;nativeId=hedera:testnet:0.0.1';
    const profile = await registry.resolveUaidProfile(uaid);

    expect(profile?.id).toBe(uaid);
    expect(profile?.did).toBe('did:hedera:testnet:zRoot');
    expect(profile?.alsoKnownAs).toContain('did:hedera:testnet:zRoot');
  });

  it('enriches UAID profile with HCS-11 data using HCS11ProfileResolver', async () => {
    jest.resetModules();
    jest.doMock('../../src/hcs-11/client', () => ({
      HCS11Client: class {
        constructor(_config: {
          network: 'mainnet' | 'testnet';
          auth: { operatorId: string };
          silent?: boolean;
        }) {}

        async fetchProfileByAccountId(accountId: string) {
          return {
            success: true,
            profile: {
              version: '1.0',
              type: 0,
              display_name: 'Mock Agent',
              uaid: `uaid:did:zRoot;uid=0;proto=hcs-10;nativeId=hedera:testnet:${accountId}`,
            },
            topicInfo: {
              inboundTopic: '0.0.1001',
              outboundTopic: '0.0.1002',
              profileTopicId: '0.0.1003',
            },
          };
        }
      },
    }));

    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { HCS11ProfileResolver } = await import(
      '../../src/hcs-14/resolvers/hcs-11-profile'
    );

    const registry = new ResolverRegistry();
    registry.register({
      meta: { id: 'hedera/mock', didMethods: ['hedera'] },
      supports(did: string) {
        return did.startsWith('did:hedera:');
      },
      async resolve(did: string) {
        return { id: did };
      },
    });
    registry.registerProfileResolver(new HCS11ProfileResolver());

    const uaid =
      'uaid:did:zRoot;uid=0;proto=hcs-10;nativeId=hedera:testnet:0.0.1234';
    const profile = await registry.resolveUaidProfile(uaid);

    expect(profile?.id).toBe(uaid);
    expect(profile?.did).toBe('did:hedera:testnet:zRoot');
    expect(profile?.profiles?.hcs11?.accountId).toBe('0.0.1234');
    expect(profile?.profiles?.hcs11?.network).toBe('testnet');
    expect(
      profile?.service?.some(service => service.type === 'HCS10Service'),
    ).toBe(true);
  });

  it('enriches AID profile with HCS-11 data when nativeId is Hedera CAIP-10', async () => {
    jest.resetModules();
    jest.doMock('../../src/hcs-11/client', () => ({
      HCS11Client: class {
        constructor(_config: {
          network: 'mainnet' | 'testnet';
          auth: { operatorId: string };
          silent?: boolean;
        }) {}

        async fetchProfileByAccountId(accountId: string) {
          return {
            success: true,
            profile: {
              version: '1.0',
              type: 0,
              display_name: 'Mock AID Agent',
              uaid: `uaid:aid:QmHash;uid=0;proto=hcs-10;nativeId=hedera:testnet:${accountId}`,
            },
            topicInfo: {
              inboundTopic: '0.0.2001',
              outboundTopic: '0.0.2002',
              profileTopicId: '0.0.2003',
            },
          };
        }
      },
    }));

    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { HCS11ProfileResolver } = await import(
      '../../src/hcs-14/resolvers/hcs-11-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerProfileResolver(new HCS11ProfileResolver());

    const uaid =
      'uaid:aid:QmHash;uid=0;proto=hcs-10;nativeId=hedera:testnet:0.0.4321';
    const profile = await registry.resolveUaidProfile(uaid);

    expect(profile?.id).toBe(uaid);
    expect(profile?.did).toBe('did:hedera:testnet:0.0.4321');
    expect(profile?.profiles?.hcs11?.accountId).toBe('0.0.4321');
    expect(profile?.profiles?.hcs11?.network).toBe('testnet');
  });
});
