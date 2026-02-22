import { describe, it, expect } from '@jest/globals';

describe('HCS-14 profile resolver behaviors', () => {
  it('implements hcs-14.profile.uaid-did-resolution with DID metadata contract', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDidResolutionProfileResolver, UAID_DID_RESOLUTION_PROFILE_ID } =
      await import('../../src/hcs-14/resolvers/uaid-did-resolution-profile');
    const { base58Encode } = await import('../../src/hcs-14/base58');

    const registry = new ResolverRegistry();
    registry.register({
      meta: { id: 'did/mock', didMethods: ['key'] },
      supports(did: string) {
        return did.startsWith('did:key:');
      },
      async resolve(did: string) {
        return {
          id: did,
          verificationMethod: [
            {
              id: `${did}#key-1`,
              type: 'Ed25519VerificationKey2020',
              controller: did,
              publicKeyMultibase: 'z6MkFakeKey',
            },
          ],
          authentication: [`${did}#key-1`],
        };
      },
    });
    registry.registerUaidProfileResolver(
      new UaidDidResolutionProfileResolver(),
    );

    const baseDid = 'did:key:z6MkhaXgBZDvotDkL5257f';
    const src = 'z' + base58Encode(Buffer.from(baseDid, 'utf8'));
    const uaid = `uaid:did:z6MkhaXgBZDvotDkL5257f;uid=0;proto=hcs-10;nativeId=agent.example.com;src=${src}`;

    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DID_RESOLUTION_PROFILE_ID,
    });

    expect(profile?.id).toBe(uaid);
    expect(profile?.did).toBe(baseDid);
    expect(profile?.alsoKnownAs).toContain(baseDid);
    expect(profile?.metadata?.profile).toBe(UAID_DID_RESOLUTION_PROFILE_ID);
    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.baseDid).toBe(baseDid);
    expect(profile?.metadata?.services?.derivedFromUaidParameters).toBe(true);
  });

  it('returns ERR_BASE_DID_UNDETERMINED for uaid-did-resolution when base did cannot be inferred', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDidResolutionProfileResolver, UAID_DID_RESOLUTION_PROFILE_ID } =
      await import('../../src/hcs-14/resolvers/uaid-did-resolution-profile');

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new UaidDidResolutionProfileResolver(),
    );

    const uaid = 'uaid:did:opaque-id;uid=0';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DID_RESOLUTION_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_BASE_DID_UNDETERMINED');
  });

  it('implements hcs-14.profile.aid-dns-web with endpoint extraction and precedence metadata', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AidDnsWebProfileResolver, AID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/aid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AidDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_agent.agent.example.com') {
            return [
              'v=aid1; p=hcs-10; u=https://agent.example.com/.well-known/agent.json',
            ];
          }
          return [];
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: AID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.profile).toBe(AID_DNS_WEB_PROFILE_ID);
    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.protocol).toBe('hcs-10');
    expect(profile?.metadata?.precedenceSource).toBe('dns');
    expect(profile?.metadata?.endpoint).toBe(
      'https://agent.example.com/.well-known/agent.json',
    );
    expect(profile?.service?.[0].type).toBe('AIDService');
  });

  it('returns ERR_ENDPOINT_INVALID for malformed aid-dns-web endpoint URIs', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AidDnsWebProfileResolver, AID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/aid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AidDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_agent.agent.example.com') {
            return ['v=aid1; p=a2a; u=ftp://agent.example.com'];
          }
          return [];
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: AID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_ENDPOINT_INVALID');
  });

  it('implements hcs-14.profile.uaid-dns-web with deterministic UAID reconstruction', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDnsWebProfileResolver, UAID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/uaid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new UaidDnsWebProfileResolver({
        enableFollowupResolution: false,
        dnsLookup: async hostname => {
          if (hostname === '_uaid.agent.example.com') {
            return [
              'target=aid; id=QmAid123; uid=support; proto=a2a; nativeId=agent.example.com',
            ];
          }
          return [];
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.profile).toBe(UAID_DNS_WEB_PROFILE_ID);
    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.verificationLevel).toBe('dns-binding');
    expect(profile?.metadata?.resolutionMode).toBe('dns-binding-only');
    expect(profile?.metadata?.reconstructedUaid).toBe(uaid);
  });

  it('uaid-dns-web performs follow-up full resolution through aid-dns-web when available', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDnsWebProfileResolver, UAID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/uaid-dns-web-profile'
    );
    const { AidDnsWebProfileResolver, AID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/aid-dns-web-profile'
    );

    const dnsLookup = async (hostname: string): Promise<string[]> => {
      if (hostname === '_uaid.agent.example.com') {
        return [
          'target=aid; id=QmAid123; uid=support; proto=a2a; nativeId=agent.example.com',
        ];
      }
      if (hostname === '_agent.agent.example.com') {
        return ['v=aid1; p=a2a; u=https://agent.example.com/endpoint'];
      }
      return [];
    };

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new UaidDnsWebProfileResolver({ dnsLookup }),
    );
    registry.registerUaidProfileResolver(
      new AidDnsWebProfileResolver({ dnsLookup }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.profile).toBe(UAID_DNS_WEB_PROFILE_ID);
    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.resolutionMode).toBe('full-resolution');
    expect(profile?.metadata?.selectedFollowupProfile).toBe(
      AID_DNS_WEB_PROFILE_ID,
    );
    expect(profile?.metadata?.endpoint).toBe(
      'https://agent.example.com/endpoint',
    );
    expect(profile?.service?.[0].type).toBe('AIDService');
  });

  it('uaid-dns-web returns ERR_UAID_MISMATCH when TXT fields do not match UAID', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDnsWebProfileResolver, UAID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/uaid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new UaidDnsWebProfileResolver({
        enableFollowupResolution: false,
        dnsLookup: async hostname => {
          if (hostname === '_uaid.agent.example.com') {
            return [
              'target=aid; id=WrongAid; uid=support; proto=a2a; nativeId=agent.example.com',
            ];
          }
          return [];
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_UAID_MISMATCH');
  });
});
