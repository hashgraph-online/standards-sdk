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

  it('ResolverRegistry list and filters work as expected', async () => {
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

    registry.register(webResolver);
    registry.register(hederaResolver);

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
    registry.registerProfileResolver(hederaProfileResolver);

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
    registry.registerUaidProfileResolver(aidUaidProfileResolver);

    const all = registry.list();
    expect(all.length).toBe(2);
    const hederaOnly = registry.filterByDidMethod('hedera');
    expect(hederaOnly.length).toBe(1);
    expect(hederaOnly[0].meta?.id).toBe('hedera/mock-resolver');

    const profileResolvers = registry.listProfileResolvers();
    expect(profileResolvers.length).toBe(1);
    const hederaProfiles = registry.filterProfileResolversByDidMethod('hedera');
    expect(hederaProfiles.length).toBe(1);
    expect(hederaProfiles[0].meta?.id).toBe('hedera/mock-profile-resolver');

    const uaidProfileResolvers = registry.listUaidProfileResolvers();
    expect(uaidProfileResolvers.length).toBe(1);
    expect(uaidProfileResolvers[0].profile).toBe('hcs-14.profile.aid-dns-web');
    const byProfileId = registry.filterUaidProfileResolversByProfileId(
      'hcs-14.profile.aid-dns-web',
    );
    expect(byProfileId.length).toBe(1);
  });

  it('HCS14Client convenience methods surface adapters and filtering', async () => {
    const {
      HCS14Client,
      AID_DNS_WEB_PROFILE_ID,
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

    const resolvers = client.listResolvers();
    expect(resolvers.length).toBeGreaterThan(0);
    const hederaResolvers = client.filterResolversByMethod('hedera');
    expect(hederaResolvers.length).toBeGreaterThan(0);

    const profileResolvers = client.listProfileResolvers();
    expect(profileResolvers.length).toBeGreaterThan(0);
    const hederaProfileResolvers =
      client.filterProfileResolversByMethod('hedera');
    expect(hederaProfileResolvers.length).toBeGreaterThan(0);

    const uaidProfileResolvers = client.listUaidProfileResolvers();
    expect(uaidProfileResolvers.length).toBeGreaterThan(0);
    expect(
      uaidProfileResolvers.some(
        resolver => resolver.profile === AID_DNS_WEB_PROFILE_ID,
      ),
    ).toBe(true);
    expect(
      uaidProfileResolvers.some(
        resolver => resolver.profile === UAID_DNS_WEB_PROFILE_ID,
      ),
    ).toBe(true);
    expect(
      uaidProfileResolvers.some(
        resolver => resolver.profile === UAID_DID_RESOLUTION_PROFILE_ID,
      ),
    ).toBe(true);
    expect(
      client.filterUaidProfileResolversByProfileId(UAID_DNS_WEB_PROFILE_ID)
        .length,
    ).toBe(1);

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
