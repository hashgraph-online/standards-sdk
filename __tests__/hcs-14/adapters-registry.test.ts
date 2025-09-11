import { describe, it, expect } from '@jest/globals';

describe('HCS-14 adapters: issuers/resolvers registries and client helpers', () => {
  it('IssuerRegistry list and filters work as expected', async () => {
    const { IssuerRegistry } = await import('../../src/hcs-14/issuers/registry');
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
    const { ResolverRegistry } = await import('../../src/hcs-14/resolvers/registry');
    const { DidResolver } = await import('../../src/hcs-14/resolvers/types');
    const registry = new ResolverRegistry();

    const webResolver: import('../../src/hcs-14/resolvers/types').DidResolver = {
      meta: { id: 'web/custom-resolver', didMethods: ['web'] },
      supports(did: string) {
        return did.startsWith('did:web:');
      },
      async resolve(did: string) {
        return this.supports(did) ? { id: did } : null;
      },
    };

    const hederaResolver: import('../../src/hcs-14/resolvers/types').DidResolver = {
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

    const all = registry.list();
    expect(all.length).toBe(2);
    const hederaOnly = registry.filterByDidMethod('hedera');
    expect(hederaOnly.length).toBe(1);
    expect(hederaOnly[0].meta?.id).toBe('hedera/mock-resolver');
  });

  it('HCS14Client convenience methods surface adapters and filtering', async () => {
    const { HCS14Client, HieroDidResolver, HederaHieroIssuer } = await import(
      '../../src/hcs-14'
    );
    const client = new HCS14Client();

    const issuers = client.listIssuers();
    expect(issuers.length).toBeGreaterThan(0);
    const hederaIssuers = client.filterIssuersByMethod('hedera');
    expect(hederaIssuers.length).toBeGreaterThan(0);
    expect(
      hederaIssuers.some(i => i.meta.didMethods.includes('hedera')),
    ).toBe(true);

    client.registerHederaResolver();
    const resolvers = client.listResolvers();
    expect(resolvers.length).toBeGreaterThan(0);
    const hederaResolvers = client.filterResolversByMethod('hedera');
    expect(hederaResolvers.length).toBeGreaterThan(0);
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
