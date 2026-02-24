import { multibaseB58btcDecode } from '../base58';
import type {
  DidResolutionProfile,
  HintedServiceEndpoint,
  ProfileResolutionError,
  UaidProfileResolver,
  UaidProfileResolverContext,
} from './types';
import type { AdapterMeta } from '../adapters/types';

export const UAID_DID_RESOLUTION_PROFILE_ID =
  'hcs-14.profile.uaid-did-resolution';

function decodeSrcDid(src: string): string | null {
  try {
    const bytes = multibaseB58btcDecode(src);
    const decoded = Buffer.from(bytes).toString('utf8').trim();
    return decoded || null;
  } catch {
    return null;
  }
}

function buildHintedService(
  uaid: string,
  params: Record<string, string>,
): {
  id: string;
  type: string;
  serviceEndpoint: HintedServiceEndpoint;
} | null {
  const proto = params['proto'];
  const nativeId = params['nativeId'];
  const domain = params['domain'];
  if (!proto && !nativeId && !domain) {
    return null;
  }
  return {
    id: `${uaid}#hcs14-hinted-service-1`,
    type: 'HintedService',
    serviceEndpoint: {
      source: 'uaid-parameters',
      proto,
      nativeId,
      domain,
    },
  };
}

function buildErrorProfile(
  uaid: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): DidResolutionProfile {
  const error: ProfileResolutionError = {
    code,
    message,
    details,
  };

  return {
    id: uaid,
    error,
    metadata: {
      profile: UAID_DID_RESOLUTION_PROFILE_ID,
      resolved: false,
    },
  };
}

function dedupeAlsoKnownAs(baseDid: string, existing: string[] = []): string[] {
  const values = new Set<string>([baseDid, ...existing]);
  return [...values];
}

export class UaidDidResolutionProfileResolver implements UaidProfileResolver {
  readonly adapterKind: 'uaid-profile-resolver' = 'uaid-profile-resolver';
  readonly profile = UAID_DID_RESOLUTION_PROFILE_ID;

  readonly meta: AdapterMeta = {
    id: 'hcs-14/uaid-did-resolution',
    didMethods: ['*'],
    displayName: 'HCS-14 UAID DID Resolution Profile',
    description:
      'Resolves uaid:did identifiers to DID Document-compatible output with profile metadata.',
  };

  supports(
    _uaid: string,
    parsed: UaidProfileResolverContext['parsedUaid'],
  ): boolean {
    return parsed.method === 'uaid';
  }

  async resolveProfile(
    uaid: string,
    context: UaidProfileResolverContext,
  ): Promise<DidResolutionProfile | null> {
    const parsed = context.parsedUaid;
    if (parsed.method !== 'uaid') {
      return buildErrorProfile(
        uaid,
        'ERR_INVALID_UAID',
        'Identifier is not uaid:did and cannot be resolved by this profile.',
        { uaid },
      );
    }

    const src = parsed.params['src'];
    const srcDid = src ? decodeSrcDid(src) : null;
    const baseDid = srcDid ?? context.did ?? null;

    if (!baseDid) {
      return buildErrorProfile(
        uaid,
        'ERR_BASE_DID_UNDETERMINED',
        'Unable to determine base DID; provide src parameter or configure method inference.',
        { uaid },
      );
    }

    const didDocument =
      context.didDocument && context.didDocument.id === baseDid
        ? context.didDocument
        : await context.resolveDid(baseDid);

    if (!didDocument) {
      return buildErrorProfile(
        uaid,
        'ERR_DID_RESOLUTION_FAILED',
        'Base DID resolution failed.',
        { uaid, baseDid },
      );
    }

    if (!didDocument.id || typeof didDocument.id !== 'string') {
      return buildErrorProfile(
        uaid,
        'ERR_DID_DOCUMENT_INVALID',
        'Resolved DID document is malformed.',
        { uaid, baseDid },
      );
    }

    const baseServices = didDocument.service ?? [];
    const hintedService = buildHintedService(uaid, parsed.params);
    const includeHintedService =
      baseServices.length === 0 && hintedService !== null;
    const service = includeHintedService
      ? [...baseServices, hintedService]
      : baseServices;

    return {
      id: uaid,
      did: baseDid,
      alsoKnownAs: dedupeAlsoKnownAs(baseDid, didDocument.alsoKnownAs),
      verificationMethod: didDocument.verificationMethod,
      authentication: didDocument.authentication,
      assertionMethod: didDocument.assertionMethod,
      service: service.length > 0 ? service : undefined,
      metadata: {
        profile: UAID_DID_RESOLUTION_PROFILE_ID,
        resolved: true,
        baseDid,
        baseDidResolved: true,
        verification: {
          method: 'did-resolution',
          assurance: 'base-method',
          details: 'Validated according to base DID method rules',
        },
        services: {
          copiedFromBaseDidDocument: baseServices.length > 0,
          derivedFromUaidParameters: includeHintedService,
        },
      },
    };
  }
}
