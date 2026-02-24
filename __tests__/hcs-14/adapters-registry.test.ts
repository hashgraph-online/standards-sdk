import { describe, it, expect } from '@jest/globals';

describe('HCS-14 adapters: issuers/resolvers registries and client helpers', () => {
  it('IssuerRegistry list and filters work as expected', async () => {
    const { IssuerRegistry } = await import(
      '../../src/hcs-14/issuers/registry'
    );
    const registry = new IssuerRegistry();

    const webIssuer = {
      meta: {
        id: 'web/custom',
        didMethods: ['web'],
        caip2Networks: ['web:example'],
        displayName: 'did:web (custom)',
      },
      supports(method: string) {
        return this.meta.didMethods.includes(method);
      },
      async issue() {
        return 'did:web:example.com:agent';
      },
    };

    const hederaIssuer = {
      meta: {
        id: 'hedera/mock',
        didMethods: ['hedera'],
        caip2Networks: ['hedera:testnet'],
        displayName: 'Hedera (mock) issuer',
      },
      supports(method: string) {
        return this.meta.didMethods.includes(method);
      },
      async issue() {
        return 'did:hedera:testnet:zMock';
      },
    };

    registry.register(webIssuer);
    registry.register(hederaIssuer);

    const all = registry.list();
    expect(all.length).toBe(2);
    const hederaOnly = registry.filterByDidMethod('hedera');
    expect(hederaOnly.length).toBe(1);
    expect(hederaOnly[0].meta.id).toBe('hedera/mock');
    const testnet = registry.filterByCaip2('hedera:testnet');
    expect(testnet.length).toBe(1);
    const none = registry.filter(i => i.meta.id === 'none');
    expect(none.length).toBe(0);
  });

  it('ResolverRegistry adapter API list and filters work as expected', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const registry = new ResolverRegistry();

    const webResolver: import('../../src/hcs-14/resolvers/types').DidResolver =
      {
        meta: { id: 'web/custom-resolver', didMethods: ['web'] },
        supports(did: string) {
          return did.startsWith('did:web:');
        },
        async resolve(did: string) {
          return this.supports(did) ? { id: did } : null;
        },
      };

    const hederaResolver: import('../../src/hcs-14/resolvers/types').DidResolver =
      {
        meta: { id: 'hedera/mock-resolver', didMethods: ['hedera'] },
        supports(did: string) {
          return did.startsWith('did:hedera:');
        },
        async resolve(did: string) {
          return this.supports(did) ? { id: did } : null;
        },
      };

    registry.registerAdapter(webResolver);
    registry.registerAdapter(hederaResolver);

    const hederaProfileResolver: import('../../src/hcs-14/resolvers/types').DidProfileResolver =
      {
        meta: {
          id: 'hedera/mock-profile-resolver',
          didMethods: ['hedera'],
        },
        supports(did: string) {
          return did.startsWith('did:hedera:');
        },
        async resolveProfile(did: string) {
          return { id: did, did };
        },
      };
    registry.registerAdapter(hederaProfileResolver);

    const aidUaidProfileResolver: import('../../src/hcs-14/resolvers/types').UaidProfileResolver =
      {
        profile: 'hcs-14.profile.aid-dns-web',
        meta: {
          id: 'hcs-14/aid-dns-web',
          didMethods: ['*'],
        },
        supports(_uaid, parsed) {
          return parsed.method === 'aid';
        },
        async resolveProfile(uaid) {
          return { id: uaid };
        },
      };
    registry.registerAdapter(aidUaidProfileResolver);

    const allAdapters = registry.listAdapters();
    expect(allAdapters.length).toBe(4);
    const didResolvers = registry.filterAdapters({
      capability: 'did-resolver',
    });
    expect(didResolvers.length).toBe(2);
    const hederaOnly = registry.filterAdapters({
      capability: 'did-resolver',
      didMethod: 'hedera',
    });
    expect(hederaOnly.length).toBe(1);
    expect(hederaOnly[0].adapter.meta?.id).toBe('hedera/mock-resolver');

    const profileResolvers = registry.filterAdapters({
      capability: 'did-profile-resolver',
    });
    expect(profileResolvers.length).toBe(1);
    const hederaProfiles = registry.filterAdapters({
      capability: 'did-profile-resolver',
      didMethod: 'hedera',
    });
    expect(hederaProfiles.length).toBe(1);
    expect(hederaProfiles[0].adapter.meta?.id).toBe(
      'hedera/mock-profile-resolver',
    );

    const uaidProfileResolvers = registry.filterAdapters({
      capability: 'uaid-profile-resolver',
    });
    expect(uaidProfileResolvers.length).toBe(1);
    const uaidAdapterRecord = uaidProfileResolvers[0];
    expect(uaidAdapterRecord.adapter.profile).toBe(
      'hcs-14.profile.aid-dns-web',
    );
    const byProfileId = registry.filterAdapters({
      capability: 'uaid-profile-resolver',
      profileId: 'hcs-14.profile.aid-dns-web',
    });
    expect(byProfileId.length).toBe(1);
    const byProfileIdWithoutCapability = registry.filterAdapters({
      profileId: 'hcs-14.profile.aid-dns-web',
    });
    expect(byProfileIdWithoutCapability.length).toBe(1);
    expect(byProfileIdWithoutCapability[0].capability).toBe(
      'uaid-profile-resolver',
    );

    expect(() => {
      registry.filterAdapters({
        capability: 'did-resolver',
        profileId: 'hcs-14.profile.aid-dns-web',
      });
    }).toThrow('profileId filter requires capability "uaid-profile-resolver".');
  });

  it('ResolverRegistry deprecated resolver methods remain backwards compatible', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const registry = new ResolverRegistry();

    const didResolver: import('../../src/hcs-14/resolvers/types').DidResolver =
      {
        meta: { id: 'hedera/mock-resolver', didMethods: ['hedera'] },
        supports(did: string) {
          return did.startsWith('did:hedera:');
        },
        async resolve(did: string) {
          return this.supports(did) ? { id: did } : null;
        },
      };

    const profileResolver: import('../../src/hcs-14/resolvers/types').DidProfileResolver =
      {
        meta: { id: 'hedera/mock-profile-resolver', didMethods: ['hedera'] },
        supports(did: string) {
          return did.startsWith('did:hedera:');
        },
        async resolveProfile(did: string) {
          return { id: did, did };
        },
      };

    const uaidResolver: import('../../src/hcs-14/resolvers/types').UaidProfileResolver =
      {
        profile: 'hcs-14.profile.aid-dns-web',
        meta: {
          id: 'hcs-14/aid-dns-web',
          didMethods: ['*'],
        },
        supports(_uaid, parsed) {
          return parsed.method === 'aid';
        },
        async resolveProfile(uaid: string) {
          return { id: uaid };
        },
      };

    registry.register(didResolver);
    registry.registerProfileResolver(profileResolver);
    registry.registerUaidProfileResolver(uaidResolver);

    expect(registry.list().length).toBe(1);
    expect(registry.listProfileResolvers().length).toBe(1);
    expect(registry.listUaidProfileResolvers().length).toBe(1);
    expect(registry.filterByDidMethod('hedera').length).toBe(1);
    expect(registry.filterProfileResolversByDidMethod('hedera').length).toBe(1);
    expect(
      registry.filterUaidProfileResolversByDidMethod('hedera').length,
    ).toBe(1);
    expect(
      registry.filterUaidProfileResolversByProfileId(
        'hcs-14.profile.aid-dns-web',
      ).length,
    ).toBe(1);
  });

  it('deprecated register keeps explicit did-resolver capability for mixed resolvers', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const registry = new ResolverRegistry();

    const mixedResolver: import('../../src/hcs-14/resolvers/types').DidResolver &
      import('../../src/hcs-14/resolvers/types').DidProfileResolver = {
      meta: { id: 'mixed/resolver', didMethods: ['hedera'] },
      supports(did: string) {
        return did.startsWith('did:hedera:');
      },
      async resolve(did: string) {
        return { id: did };
      },
      async resolveProfile(did: string) {
        return { id: did, did };
      },
    };

    registry.register(mixedResolver);
    expect(registry.list().length).toBe(1);
    expect(registry.listProfileResolvers().length).toBe(0);
    expect(registry.listAdapters()[0].capability).toBe('did-resolver');
    await expect(
      registry.resolveDid('did:hedera:testnet:0.0.123'),
    ).resolves.toEqual({ id: 'did:hedera:testnet:0.0.123' });

    const secondRegistry = new ResolverRegistry();
    expect(() => {
      secondRegistry.registerAdapter(mixedResolver);
    }).toThrow('matches multiple resolver capabilities');
  });

  it('registerAdapter supports explicit adapterKind disambiguation', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const registry = new ResolverRegistry();

    const didProfileResolverWithProfileProperty: import('../../src/hcs-14/resolvers/types').DidProfileResolver & {
      profile: string;
    } = {
      adapterKind: 'did-profile-resolver',
      profile: 'custom-internal-profile',
      meta: { id: 'hedera/custom-profile', didMethods: ['hedera'] },
      supports(did: string) {
        return did.startsWith('did:hedera:');
      },
      async resolveProfile(did: string) {
        return { id: did, did };
      },
    };

    registry.registerAdapter(didProfileResolverWithProfileProperty);
    const records = registry.filterAdapters({
      capability: 'did-profile-resolver',
    });
    expect(records.length).toBe(1);
    expect(records[0].adapter.meta?.id).toBe('hedera/custom-profile');
  });

  it('HCS14Client adapter methods surface all supported profile resolvers', async () => {
    const {
      HCS14Client,
      AID_DNS_WEB_PROFILE_ID,
      ANS_DNS_WEB_PROFILE_ID,
      UAID_DID_RESOLUTION_PROFILE_ID,
      UAID_DNS_WEB_PROFILE_ID,
    } = await import('../../src/hcs-14');
    const client = new HCS14Client();

    const issuers = client.listIssuers();
    expect(issuers.length).toBeGreaterThan(0);
    const hederaIssuers = client.filterIssuersByMethod('hedera');
    expect(hederaIssuers.length).toBeGreaterThan(0);
    expect(hederaIssuers.some(i => i.meta.didMethods.includes('hedera'))).toBe(
      true,
    );

    const adapters = client.listAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(5);
    const didResolvers = client.filterAdapters({
      capability: 'did-resolver',
      didMethod: 'hedera',
    });
    expect(didResolvers.length).toBeGreaterThan(0);
    const didProfileResolvers = client.filterAdapters({
      capability: 'did-profile-resolver',
      didMethod: 'hedera',
    });
    expect(didProfileResolvers.length).toBeGreaterThan(0);
    const uaidProfileResolvers = client.filterAdapters({
      capability: 'uaid-profile-resolver',
    });
    expect(uaidProfileResolvers.length).toBeGreaterThanOrEqual(4);
    const uaidProfileIds = uaidProfileResolvers.map(
      record => record.adapter.profile,
    );
    expect(uaidProfileIds.includes(AID_DNS_WEB_PROFILE_ID)).toBe(true);
    expect(uaidProfileIds.includes(ANS_DNS_WEB_PROFILE_ID)).toBe(true);
    expect(uaidProfileIds.includes(UAID_DNS_WEB_PROFILE_ID)).toBe(true);
    expect(uaidProfileIds.includes(UAID_DID_RESOLUTION_PROFILE_ID)).toBe(true);
    expect(
      client.filterAdapters({
        capability: 'uaid-profile-resolver',
        profileId: UAID_DNS_WEB_PROFILE_ID,
      }).length,
    ).toBe(1);

    const deprecatedList = client.listUaidProfileResolvers();
    expect(
      deprecatedList.some(
        resolver => resolver.profile === UAID_DID_RESOLUTION_PROFILE_ID,
      ),
    ).toBe(true);

    const aidProfile = await client.resolveUaidProfile('uaid:aid:QmHash');
    expect(aidProfile?.id).toBe('uaid:aid:QmHash');
  });

  it('client.createDid uses registered issuers; createDidWithUaid wraps UAID', async () => {
    const { HCS14Client } = await import('../../src/hcs-14');
    const client = new HCS14Client();
    const stubIssuer: import('../../src/hcs-14/issuers/types').DidIssuer = {
      meta: { id: 'web/stub', didMethods: ['web'] },
      supports: m => m === 'web',
      async issue() {
        return 'did:web:agent.example.com';
      },
    };
    client.getIssuerRegistry().register(stubIssuer);

    const did = await client.createDid({ method: 'web' });
    expect(did).toBe('did:web:agent.example.com');

    const { uaid, parsed } = await client.createDidWithUaid({
      issue: { method: 'web' },
      uid: 'support-bot',
      proto: 'a2a',
      nativeId: 'agent.example.com',
    });
    expect(uaid).toBe(
      'uaid:did:agent.example.com;uid=support-bot;proto=a2a;nativeId=agent.example.com',
    );
    expect(parsed.method).toBe('uaid');
  });

  it('HederaHieroIssuer exposes CAIP coverage via meta', async () => {
    const { HederaHieroIssuer } = await import('../../src/hcs-14');
    const issuer = new HederaHieroIssuer();
    expect(issuer.meta.didMethods).toContain('hedera');
    expect(issuer.meta.caip2Networks).toContain('hedera:testnet');
  });
});
