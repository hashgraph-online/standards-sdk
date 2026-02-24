import {
  ResolverRegistry,
  UAID_DID_RESOLUTION_PROFILE_ID,
  UaidDidResolutionProfileResolver,
} from '../../src/hcs-14';
import { base58Encode } from '../../src/hcs-14/base58';
import type {
  DidDocumentMinimal,
  DidResolver,
} from '../../src/hcs-14/resolvers/types';

const DEMO_BASE_DID =
  'did:key:z6MksHP7vM4yN6jQ1w5WJ6kXnKc7UqD5uQ2uM3D9wS2hEwA5';
const DEMO_UAID_ID = 'hcs14-did-profile-demo';
const DEMO_PROTOCOL = 'a2a';
const DEMO_NATIVE_ID = 'did-profile.local';

function encodeSrcDid(did: string): string {
  const bytes = Buffer.from(did, 'utf8');
  return `z${base58Encode(bytes)}`;
}

const DEMO_SRC = encodeSrcDid(DEMO_BASE_DID);
const DEMO_UAID = `uaid:did:${DEMO_UAID_ID};uid=0;proto=${DEMO_PROTOCOL};nativeId=${DEMO_NATIVE_ID};src=${DEMO_SRC}`;

const localDidResolver: DidResolver = {
  adapterKind: 'did-resolver',
  meta: {
    id: 'demo/local-did-resolver',
    didMethods: ['key'],
    displayName: 'Local DID Resolver (Demo)',
  },
  supports(did: string): boolean {
    return did === DEMO_BASE_DID;
  },
  async resolve(did: string): Promise<DidDocumentMinimal | null> {
    if (did !== DEMO_BASE_DID) {
      return null;
    }
    return {
      id: DEMO_BASE_DID,
      verificationMethod: [
        {
          id: `${DEMO_BASE_DID}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: DEMO_BASE_DID,
          publicKeyMultibase: 'z6MkDemoPublicKey123',
        },
      ],
      authentication: [`${DEMO_BASE_DID}#key-1`],
      alsoKnownAs: ['did:example:agent-demo'],
    };
  },
};

async function main(): Promise<void> {
  const registry = new ResolverRegistry();
  registry.registerAdapter(localDidResolver);
  registry.registerAdapter(new UaidDidResolutionProfileResolver());

  const profile = await registry.resolveUaidProfile(DEMO_UAID, {
    profileId: UAID_DID_RESOLUTION_PROFILE_ID,
  });
  if (!profile) {
    throw new Error('UAID DID resolution profile returned no profile.');
  }
  if (profile.error || profile.metadata?.resolved === false) {
    const errorCode = profile.error?.code ?? 'unknown error';
    throw new Error(`UAID DID profile resolution failed: ${errorCode}.`);
  }

  const output = {
    uaid: DEMO_UAID,
    runtime: {
      baseDid: DEMO_BASE_DID,
      src: DEMO_SRC,
      didResolverAdapter: localDidResolver.meta?.id,
    },
    resolvedProfile: profile,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
