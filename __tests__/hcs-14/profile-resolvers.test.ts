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

  it('returns ERR_NOT_APPLICABLE for aid-dns-web when identifier is not uaid:aid', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AidDnsWebProfileResolver, AID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/aid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(new AidDnsWebProfileResolver());

    const uaid =
      'uaid:did:z6MkhaXgBZDvotDkL5257f;uid=0;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: AID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_NOT_APPLICABLE');
  });

  it('returns ERR_NO_DNS_RECORD for aid-dns-web when _agent TXT record is missing', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AidDnsWebProfileResolver, AID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/aid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AidDnsWebProfileResolver({
        dnsLookup: async () => [],
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: AID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_NO_DNS_RECORD');
  });

  it('marks aid-dns-web verification as cryptographic when only cryptographic verification is configured', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AidDnsWebProfileResolver, AID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/aid-dns-web-profile'
    );

    let cryptographicVerifierCalls = 0;
    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AidDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_agent.agent.example.com') {
            return [
              'v=aid1; p=a2a; u=https://agent.example.com; k=ed25519:abc123; i=key-1',
            ];
          }
          return [];
        },
        cryptographicVerifier: async () => {
          cryptographicVerifierCalls += 1;
          return true;
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: AID_DNS_WEB_PROFILE_ID,
    });

    expect(cryptographicVerifierCalls).toBe(1);
    expect(profile?.metadata?.verificationLevel).toBe('cryptographic');
    expect(profile?.metadata?.verification).toEqual({
      level: 'cryptographic',
      method: 'aid-pka',
    });
  });

  it('implements hcs-14.profile.ans-dns-web with DNS + agent card endpoint selection', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_ans.support-agent.example.com') {
            return [
              'v=ans1; version=1.0.0; url=https://support-agent.example.com/agent-card.json',
            ];
          }
          return [];
        },
        fetchJson: async _url => {
          return {
            ansName: 'ans://v1.0.0.support-agent.example.com',
            endpoints: {
              a2a: { url: 'https://support-agent.example.com/a2a' },
              mcp: { url: 'https://support-agent.example.com/mcp' },
            },
          };
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.profile).toBe(ANS_DNS_WEB_PROFILE_ID);
    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.protocol).toBe('a2a');
    expect(profile?.metadata?.endpoint).toBe(
      'https://support-agent.example.com/a2a',
    );
    expect(profile?.metadata?.agentCardUrl).toBe(
      'https://support-agent.example.com/agent-card.json',
    );
    expect(profile?.service?.[0].type).toBe('ANSService');
  });

  it('returns ERR_ENDPOINT_NOT_ANCHORED when ans-dns-web endpoint host does not match nativeId', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_ans.support-agent.example.com') {
            return [
              'v=ans1; url=https://support-agent.example.com/agent-card.json',
            ];
          }
          return [];
        },
        fetchJson: async _url => {
          return {
            ansName: 'ans://v1.0.0.support-agent.example.com',
            endpoints: {
              a2a: { url: 'https://other-host.example.net/a2a' },
            },
          };
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_ENDPOINT_NOT_ANCHORED');
  });

  it('returns ERR_NOT_APPLICABLE for ans-dns-web when registry is not ans', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(new AnsDnsWebProfileResolver());

    const uaid =
      'uaid:aid:QmAid123;uid=support;registry=example;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_NOT_APPLICABLE');
  });

  it('returns ERR_PROTOCOL_UNSPECIFIED for ans-dns-web when proto is missing or unusable', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(new AnsDnsWebProfileResolver());

    const uaid =
      'uaid:aid:QmAid123;uid=support;registry=ans;proto=0;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_PROTOCOL_UNSPECIFIED');
  });

  it('returns targeted uaid profile errors without merging DID fallback fields', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.register({
      meta: { id: 'did/mock-hedera', didMethods: ['hedera'] },
      supports(did: string) {
        return did.startsWith('did:hedera:');
      },
      async resolve(did: string) {
        return {
          id: did,
          verificationMethod: [
            {
              id: `${did}#key-1`,
              type: 'Ed25519VerificationKey2020',
              controller: did,
              publicKeyMultibase: 'z6MkFallbackKey',
            },
          ],
          authentication: [`${did}#key-1`],
          service: [
            {
              id: `${did}#svc`,
              type: 'LinkedDomains',
              serviceEndpoint: 'https://fallback.example.com',
            },
          ],
          alsoKnownAs: ['did:example:alias'],
        };
      },
    });
    registry.registerUaidProfileResolver(new AnsDnsWebProfileResolver());

    const uaid =
      'uaid:did:mainnet:0.0.12345;uid=support;registry=example;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_NOT_APPLICABLE');
    expect(profile?.did).toBeUndefined();
    expect(profile?.verificationMethod).toBeUndefined();
    expect(profile?.authentication).toBeUndefined();
    expect(profile?.service).toBeUndefined();
    expect(profile?.alsoKnownAs).toBeUndefined();
  });

  it('returns ERR_AGENT_CARD_INVALID when ans metadata cannot be fetched', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_ans.support-agent.example.com') {
            return [
              'v=ans1; version=v1.0.0; url=https://support-agent.example.com/agent-card.json',
            ];
          }
          return [];
        },
        fetchJson: async _url => {
          throw new Error('request failed');
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_AGENT_CARD_INVALID');
  });

  it('returns ERR_VERSION_MISMATCH when uaid version does not match ans dns version', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_ans.support-agent.example.com') {
            return [
              'v=ans1; version=1.0.0; url=https://support-agent.example.com/agent-card.json',
            ];
          }
          return [];
        },
        fetchJson: async _url => {
          return {
            ansName: 'ans://v1.0.0.support-agent.example.com',
            endpoints: {
              a2a: { url: 'https://support-agent.example.com/a2a' },
            },
          };
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;version=v2.0.0;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_VERSION_MISMATCH');
  });

  it('returns ERR_INVALID_ANS_RECORD when ANS TXT version is malformed', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_ans.support-agent.example.com') {
            return [
              'v=ans1; version=not-a-semver; url=https://support-agent.example.com/agent-card.json',
            ];
          }
          return [];
        },
        fetchJson: async _url => {
          return {
            ansName: 'ans://v1.0.0.support-agent.example.com',
            endpoints: {
              a2a: { url: 'https://support-agent.example.com/a2a' },
            },
          };
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_INVALID_ANS_RECORD');
  });

  it('does not accept non-TLS ANS endpoint schemes unless explicitly configured', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';

    const dnsLookup = async (hostname: string): Promise<string[]> => {
      if (hostname === '_ans.support-agent.example.com') {
        return [
          'v=ans1; version=v1.0.0; url=https://support-agent.example.com/agent-card.json',
        ];
      }
      return [];
    };

    const insecureCard = {
      ansName: 'ans://v1.0.0.support-agent.example.com',
      endpoints: {
        a2a: { url: 'http://support-agent.example.com/a2a' },
      },
    };

    const defaultRegistry = new ResolverRegistry();
    defaultRegistry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup,
        fetchJson: async _url => insecureCard,
      }),
    );

    const defaultProfile = await defaultRegistry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });
    expect(defaultProfile?.metadata?.resolved).toBe(false);
    expect(defaultProfile?.error?.code).toBe('ERR_ENDPOINT_NOT_ANCHORED');

    const optInRegistry = new ResolverRegistry();
    optInRegistry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup,
        fetchJson: async _url => insecureCard,
        supportedUriSchemes: ['https', 'wss', 'http', 'ws'],
      }),
    );

    const optInProfile = await optInRegistry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });
    expect(optInProfile?.metadata?.resolved).toBe(true);
    expect(optInProfile?.metadata?.endpoint).toBe(
      'http://support-agent.example.com/a2a',
    );
  });

  it('ans-dns-web deterministically selects the lexicographically smallest DNS url when multiple records are valid', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_ans.support-agent.example.com') {
            return [
              'v=ans1; version=v1.0.0; url=https://support-agent.example.com/z-card.json',
              'v=ans1; version=v1.0.0; url=https://support-agent.example.com/a-card.json',
            ];
          }
          return [];
        },
        fetchJson: async url => {
          if (url.endsWith('/a-card.json')) {
            return {
              ansName: 'ans://v1.0.0.support-agent.example.com',
              endpoints: {
                a2a: { url: 'https://support-agent.example.com/a2a' },
              },
            };
          }
          throw new Error('Unexpected card selection');
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.agentCardUrl).toBe(
      'https://support-agent.example.com/a-card.json',
    );
    expect(profile?.metadata?.dnsRecordSelection).toBe(
      'lexicographically-smallest-url',
    );
  });

  it('returns ERR_VERSION_MISMATCH when UAID requests version and ANS TXT records omit version', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup: async hostname => {
          if (hostname === '_ans.support-agent.example.com') {
            return ['v=ans1; url=https://support-agent.example.com/card.json'];
          }
          return [];
        },
        fetchJson: async _url => {
          return {
            ansName: 'ans://v1.0.0.support-agent.example.com',
            endpoints: {
              a2a: { url: 'https://support-agent.example.com/a2a' },
            },
          };
        },
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;version=v1.0.0;proto=a2a;nativeId=support-agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_VERSION_MISMATCH');
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

  it('returns ERR_NOT_APPLICABLE for uaid-dns-web when nativeId is missing', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDnsWebProfileResolver, UAID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/uaid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(new UaidDnsWebProfileResolver());

    const uaid = 'uaid:aid:QmAid123;uid=support;proto=a2a';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_NOT_APPLICABLE');
  });

  it('returns ERR_NO_DNS_RECORD for uaid-dns-web when _uaid TXT record is missing', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDnsWebProfileResolver, UAID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/uaid-dns-web-profile'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new UaidDnsWebProfileResolver({
        dnsLookup: async () => [],
      }),
    );

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.resolved).toBe(false);
    expect(profile?.error?.code).toBe('ERR_NO_DNS_RECORD');
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

  it('uaid-dns-web performs follow-up full resolution through ans-dns-web for registry=ans identifiers', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDnsWebProfileResolver, UAID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/uaid-dns-web-profile'
    );
    const { AnsDnsWebProfileResolver, ANS_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';

    const dnsLookup = async (hostname: string): Promise<string[]> => {
      if (hostname === '_uaid.support-agent.example.com') {
        return [
          'target=aid; id=QmAid123; uid=ans://v1.0.0.support-agent.example.com; registry=ans; proto=a2a; nativeId=support-agent.example.com',
        ];
      }
      if (hostname === '_ans.support-agent.example.com') {
        return [
          'v=ans1; version=v1.0.0; url=https://support-agent.example.com/agent-card.json',
        ];
      }
      return [];
    };

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new UaidDnsWebProfileResolver({ dnsLookup }),
    );
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup,
        fetchJson: async _url => {
          return {
            ansName: 'ans://v1.0.0.support-agent.example.com',
            endpoints: {
              a2a: { url: 'https://support-agent.example.com/a2a' },
            },
          };
        },
      }),
    );

    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.profile).toBe(UAID_DNS_WEB_PROFILE_ID);
    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.resolutionMode).toBe('full-resolution');
    expect(profile?.metadata?.selectedFollowupProfile).toBe(
      ANS_DNS_WEB_PROFILE_ID,
    );
    expect(profile?.metadata?.endpoint).toBe(
      'https://support-agent.example.com/a2a',
    );
    expect(profile?.service?.[0].type).toBe('ANSService');
  });

  it('uaid-dns-web falls back to aid-dns-web when ans-dns-web follow-up returns an error', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );
    const { UaidDnsWebProfileResolver, UAID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/uaid-dns-web-profile'
    );
    const { AnsDnsWebProfileResolver } = await import(
      '../../src/hcs-14/resolvers/ans-dns-web-profile'
    );
    const { AidDnsWebProfileResolver, AID_DNS_WEB_PROFILE_ID } = await import(
      '../../src/hcs-14/resolvers/aid-dns-web-profile'
    );

    const uaid =
      'uaid:aid:QmAid123;uid=ans://v1.0.0.support-agent.example.com;registry=ans;proto=a2a;nativeId=support-agent.example.com';

    const dnsLookup = async (hostname: string): Promise<string[]> => {
      if (hostname === '_uaid.support-agent.example.com') {
        return [
          'target=aid; id=QmAid123; uid=ans://v1.0.0.support-agent.example.com; registry=ans; proto=a2a; nativeId=support-agent.example.com',
        ];
      }
      if (hostname === '_ans.support-agent.example.com') {
        return [];
      }
      if (hostname === '_agent.support-agent.example.com') {
        return ['v=aid1; p=a2a; u=https://support-agent.example.com/a2a'];
      }
      return [];
    };

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver(
      new UaidDnsWebProfileResolver({ dnsLookup }),
    );
    registry.registerUaidProfileResolver(
      new AnsDnsWebProfileResolver({
        dnsLookup,
        fetchJson: async _url => {
          return {
            ansName: 'ans://v1.0.0.support-agent.example.com',
            endpoints: {
              a2a: { url: 'https://support-agent.example.com/a2a' },
            },
          };
        },
      }),
    );
    registry.registerUaidProfileResolver(
      new AidDnsWebProfileResolver({ dnsLookup }),
    );

    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });

    expect(profile?.metadata?.profile).toBe(UAID_DNS_WEB_PROFILE_ID);
    expect(profile?.metadata?.resolved).toBe(true);
    expect(profile?.metadata?.selectedFollowupProfile).toBe(
      AID_DNS_WEB_PROFILE_ID,
    );
    expect(profile?.metadata?.endpoint).toBe(
      'https://support-agent.example.com/a2a',
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

  it('continues to later UAID profile resolvers when an earlier resolver returns an error profile', async () => {
    const { ResolverRegistry } = await import(
      '../../src/hcs-14/resolvers/registry'
    );

    const registry = new ResolverRegistry();
    registry.registerUaidProfileResolver({
      profile: 'mock.error',
      meta: {
        id: 'mock/error-resolver',
        didMethods: ['*'],
        displayName: 'Mock Error Resolver',
      },
      supports: () => true,
      resolveProfile: async uaid => ({
        id: uaid,
        error: {
          code: 'ERR_NOT_DETERMINATIVE',
          message: 'Resolver cannot determine final profile.',
        },
        metadata: {
          profile: 'mock.error',
          resolved: false,
        },
      }),
    });
    registry.registerUaidProfileResolver({
      profile: 'mock.success',
      meta: {
        id: 'mock/success-resolver',
        didMethods: ['*'],
        displayName: 'Mock Success Resolver',
      },
      supports: () => true,
      resolveProfile: async uaid => ({
        id: uaid,
        metadata: {
          profile: 'mock.success',
          resolved: true,
        },
      }),
    });

    const uaid =
      'uaid:aid:QmAid123;uid=support;proto=a2a;nativeId=agent.example.com';
    const profile = await registry.resolveUaidProfile(uaid);

    expect(profile?.metadata?.profile).toBe('mock.success');
    expect(profile?.error).toBeUndefined();
  });
});
