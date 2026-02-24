import type {
  DidResolutionProfile,
  ProfileResolutionError,
  ProfileResolutionTransparencyHints,
  UaidProfileResolver,
  UaidProfileResolverContext,
} from './types';
import type { AdapterMeta } from '../adapters/types';
import { nodeDnsTxtLookup, type DnsTxtLookup } from './dns';
import { isFqdn, normalizeDomain } from './profile-utils';
import {
  parseAnsDnsTxtRecord,
  type AnsDnsTxtRecord,
  parseAnsAgentCard,
  extractEndpointCandidates,
  selectPreferredEndpoint,
  isValidAnsProfileVersion,
  normalizeAnsVersion,
  toErrorMessage,
} from './ans-dns-web-profile-utils';

export const ANS_DNS_WEB_PROFILE_ID = 'hcs-14.profile.ans-dns-web';

export interface AnsTransparencyVerificationInput {
  uaid: string;
  protocol: string;
  endpoint: string;
  agentCardUrl: string;
  transparencyHints?: ProfileResolutionTransparencyHints;
}

type AnsTransparencyVerifier = (
  input: AnsTransparencyVerificationInput,
) => Promise<boolean>;

export interface AnsDnsWebResolverOptions {
  dnsLookup?: DnsTxtLookup;
  fetchJson?: (url: string) => Promise<unknown>;
  supportedUriSchemes?: string[];
  transparencyVerifier?: AnsTransparencyVerifier;
}

const UAID_UNSPECIFIED_PARAM_VALUE = '0';

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
      profile: ANS_DNS_WEB_PROFILE_ID,
      resolved: false,
    },
  };
}

async function defaultFetchJson(url: string): Promise<unknown> {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch API is unavailable in this runtime.');
  }

  const response = await globalThis.fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(
      `Agent Card request failed with status ${response.status}.`,
    );
  }
  return response.json();
}

function isUnspecifiedUaidParamValue(value: string | undefined): boolean {
  return !value || value === UAID_UNSPECIFIED_PARAM_VALUE;
}

function selectDeterministicAnsDnsRecord(
  records: AnsDnsTxtRecord[],
): AnsDnsTxtRecord {
  return [...records].sort((a, b) => a.url.localeCompare(b.url))[0];
}

export class AnsDnsWebProfileResolver implements UaidProfileResolver {
  readonly adapterKind: 'uaid-profile-resolver' = 'uaid-profile-resolver';
  readonly profile = ANS_DNS_WEB_PROFILE_ID;

  readonly meta: AdapterMeta = {
    id: 'hcs-14/ans-dns-web',
    didMethods: ['*'],
    displayName: 'HCS-14 ANS DNS/Web Profile',
    description:
      'Resolves ANS uaid:aid identifiers via _ans.<nativeId> TXT records and Agent Card endpoint selection.',
  };

  private readonly dnsLookup: DnsTxtLookup;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly supportedSchemes: Set<string>;
  private readonly transparencyVerifier?: AnsTransparencyVerifier;

  constructor(options: AnsDnsWebResolverOptions = {}) {
    this.dnsLookup = options.dnsLookup ?? nodeDnsTxtLookup;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.supportedSchemes = new Set(
      (options.supportedUriSchemes ?? ['https', 'http', 'wss', 'ws']).map(
        scheme => scheme.toLowerCase(),
      ),
    );
    this.transparencyVerifier = options.transparencyVerifier;
  }

  supports(
    _uaid: string,
    parsed: UaidProfileResolverContext['parsedUaid'],
  ): boolean {
    if (parsed.method !== 'aid') {
      return false;
    }
    if (parsed.params['registry'] !== 'ans') {
      return false;
    }
    const nativeId = parsed.params['nativeId'];
    return !!nativeId && isFqdn(nativeId);
  }

  async resolveProfile(
    uaid: string,
    context: UaidProfileResolverContext,
  ): Promise<DidResolutionProfile | null> {
    const parsed = context.parsedUaid;
    if (parsed.method !== 'aid') {
      return buildErrorProfile(
        uaid,
        'ERR_NOT_APPLICABLE',
        'ANS profile only applies to uaid:aid identifiers.',
      );
    }
    if (parsed.params['registry'] !== 'ans') {
      return buildErrorProfile(
        uaid,
        'ERR_NOT_APPLICABLE',
        'ANS profile requires registry=ans.',
      );
    }

    const nativeId = parsed.params['nativeId'];
    if (!nativeId || !isFqdn(nativeId)) {
      return buildErrorProfile(
        uaid,
        'ERR_NOT_APPLICABLE',
        'ANS profile requires an FQDN nativeId.',
      );
    }

    const uid = parsed.params['uid'];
    if (isUnspecifiedUaidParamValue(uid)) {
      return buildErrorProfile(
        uaid,
        'ERR_NOT_APPLICABLE',
        'ANS profile requires a non-zero uid parameter.',
      );
    }

    const protocol = parsed.params['proto'];
    if (isUnspecifiedUaidParamValue(protocol)) {
      return buildErrorProfile(
        uaid,
        'ERR_PROTOCOL_UNSPECIFIED',
        'ANS profile requires a usable proto parameter.',
      );
    }
    const uaidVersion = parsed.params['version'];
    const normalizedUaidVersion =
      uaidVersion === undefined ? undefined : normalizeAnsVersion(uaidVersion);
    if (uaidVersion !== undefined && !isValidAnsProfileVersion(uaidVersion)) {
      return buildErrorProfile(
        uaid,
        'ERR_NOT_APPLICABLE',
        'ANS profile requires a valid semver version parameter when provided.',
      );
    }

    const normalizedNativeId = normalizeDomain(nativeId);
    const dnsName = `_ans.${normalizedNativeId}`;
    const txtRecords = await this.dnsLookup(dnsName);
    if (txtRecords.length === 0) {
      return buildErrorProfile(
        uaid,
        'ERR_NO_DNS_RECORD',
        'No ANS DNS TXT record was found for the requested nativeId.',
        { dnsName },
      );
    }

    const validTxtRecords = txtRecords
      .map(record => parseAnsDnsTxtRecord(record))
      .filter((record): record is AnsDnsTxtRecord => record !== null);
    if (validTxtRecords.length === 0) {
      return buildErrorProfile(
        uaid,
        'ERR_INVALID_ANS_RECORD',
        'ANS DNS TXT payload is malformed or unsupported.',
        { dnsName },
      );
    }

    let matchingVersionRecords = validTxtRecords;
    if (normalizedUaidVersion) {
      const recordsWithVersion = validTxtRecords.filter(record => {
        return record.version !== undefined;
      });
      if (recordsWithVersion.length > 0) {
        matchingVersionRecords = recordsWithVersion.filter(record => {
          return record.version === normalizedUaidVersion;
        });
        if (matchingVersionRecords.length === 0) {
          return buildErrorProfile(
            uaid,
            'ERR_VERSION_MISMATCH',
            'UAID version does not match ANS DNS TXT record version.',
            { dnsName, uaidVersion: normalizedUaidVersion },
          );
        }
      }
    }

    const selectedRecord = selectDeterministicAnsDnsRecord(
      matchingVersionRecords,
    );

    let agentCardPayload: unknown;
    try {
      agentCardPayload = await this.fetchJson(selectedRecord.url);
    } catch (error) {
      return buildErrorProfile(
        uaid,
        'ERR_AGENT_CARD_INVALID',
        'Agent Card retrieval failed.',
        {
          stage: 'fetch',
          agentCardUrl: selectedRecord.url,
          reason: toErrorMessage(error),
        },
      );
    }

    const agentCard = parseAnsAgentCard(agentCardPayload);
    if (!agentCard) {
      return buildErrorProfile(
        uaid,
        'ERR_AGENT_CARD_INVALID',
        'Agent Card is missing required fields.',
        { stage: 'validate', agentCardUrl: selectedRecord.url },
      );
    }
    if (agentCard.ansName !== uid) {
      return buildErrorProfile(
        uaid,
        'ERR_AGENT_CARD_INVALID',
        'Agent Card ansName does not match UAID uid.',
        {
          stage: 'validate',
          expectedUid: uid,
          actualAnsName: agentCard.ansName,
        },
      );
    }

    const endpointCandidates = extractEndpointCandidates(
      agentCard.endpoints,
      this.supportedSchemes,
    );
    const anchoredCandidates = endpointCandidates.filter(candidate => {
      return (
        normalizeDomain(candidate.parsedUrl.hostname) === normalizedNativeId
      );
    });
    if (anchoredCandidates.length === 0) {
      return buildErrorProfile(
        uaid,
        'ERR_ENDPOINT_NOT_ANCHORED',
        'No endpoint URL is anchored to the UAID nativeId host.',
        {
          nativeId: normalizedNativeId,
        },
      );
    }

    const selectedEndpoint =
      selectPreferredEndpoint(anchoredCandidates, protocol) ??
      anchoredCandidates[0]!;

    let transparencyAttempted = false;
    let transparencySucceeded = false;
    if (this.transparencyVerifier) {
      transparencyAttempted = true;
      transparencySucceeded = await this.transparencyVerifier({
        uaid,
        protocol,
        endpoint: selectedEndpoint.endpointUrl,
        agentCardUrl: selectedRecord.url,
        transparencyHints: agentCard.transparencyHints,
      });
      if (!transparencySucceeded) {
        return buildErrorProfile(
          uaid,
          'ERR_TRANSPARENCY_VERIFICATION_FAILED',
          'Transparency verification failed.',
          {
            agentCardUrl: selectedRecord.url,
          },
        );
      }
    }

    const did = context.did ?? undefined;
    const alsoKnownAs = did ? [did] : undefined;
    const verificationLevel: 'metadata' | 'cryptographic' =
      transparencySucceeded ? 'cryptographic' : 'metadata';
    const verificationMethod = transparencySucceeded
      ? 'ans-transparency'
      : 'metadata-match';

    return {
      id: uaid,
      did,
      alsoKnownAs,
      service: [
        {
          id: `${uaid}#ans-endpoint`,
          type: 'ANSService',
          serviceEndpoint: selectedEndpoint.endpointUrl,
        },
      ],
      metadata: {
        profile: ANS_DNS_WEB_PROFILE_ID,
        resolved: true,
        endpoint: selectedEndpoint.endpointUrl,
        protocol,
        precedenceSource: 'dns',
        verification: {
          level: verificationLevel,
          method: verificationMethod,
        },
        verificationLevel,
        agentCardUrl: selectedRecord.url,
        dnsRecordSelection: 'lexicographically-smallest-url',
        transparencyHints: agentCard.transparencyHints,
        transparencyVerification: {
          attempted: transparencyAttempted,
          succeeded: transparencySucceeded,
        },
      },
    };
  }
}
