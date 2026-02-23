import type {
  DidResolutionProfile,
  ProfileResolutionError,
  UaidProfileResolver,
  UaidProfileResolverContext,
} from './types';
import type { AdapterMeta } from '../adapters/types';
import { nodeDnsTxtLookup, type DnsTxtLookup } from './dns';
import { isFqdn, normalizeDomain, parseSemicolonFields } from './profile-utils';

export const AID_DNS_WEB_PROFILE_ID = 'hcs-14.profile.aid-dns-web';

interface AidDnsRecord {
  version: string;
  protocol: string;
  endpoint: string;
  publicKey?: string;
  keyId?: string;
}

interface AidDnsRecordParseError {
  code: 'ERR_INVALID_AID_RECORD' | 'ERR_ENDPOINT_INVALID';
}

interface AidDnsRecordParseSuccess {
  record: AidDnsRecord;
}

type AidDnsRecordParseResult =
  | AidDnsRecordParseError
  | AidDnsRecordParseSuccess;

interface AidDnsVerificationInput {
  uaid: string;
  protocol: string;
  endpoint: string;
  record: AidDnsRecord;
}

type AidDnsVerification = (input: AidDnsVerificationInput) => Promise<boolean>;

export interface AidDnsWebResolverOptions {
  dnsLookup?: DnsTxtLookup;
  supportedUriSchemes?: string[];
  metadataVerifier?: AidDnsVerification;
  cryptographicVerifier?: AidDnsVerification;
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
      profile: AID_DNS_WEB_PROFILE_ID,
      resolved: false,
    },
  };
}

function parseRecord(
  rawRecord: string,
  supportedSchemes: Set<string>,
): AidDnsRecordParseResult {
  const fields = parseSemicolonFields(rawRecord);
  const version = fields['v'];
  const protocol = fields['p'] ?? fields['proto'];
  const endpoint = fields['u'];

  if (!version || !protocol || !endpoint) {
    return { code: 'ERR_INVALID_AID_RECORD' };
  }
  if (!version.toLowerCase().startsWith('aid')) {
    return { code: 'ERR_INVALID_AID_RECORD' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return { code: 'ERR_ENDPOINT_INVALID' };
  }

  const scheme = parsedUrl.protocol.replace(/:$/, '').toLowerCase();
  if (!supportedSchemes.has(scheme)) {
    return { code: 'ERR_ENDPOINT_INVALID' };
  }

  return {
    record: {
      version,
      protocol,
      endpoint: parsedUrl.toString(),
      publicKey: fields['k'],
      keyId: fields['i'],
    },
  };
}

function deterministicRecordKey(record: AidDnsRecord): string {
  return `${record.protocol}|${record.endpoint}|${record.publicKey ?? ''}|${record.keyId ?? ''}`;
}

function verificationMethodForLevel(
  verificationLevel: 'none' | 'metadata' | 'cryptographic',
): 'aid-pka' | 'metadata-match' | undefined {
  if (verificationLevel === 'cryptographic') {
    return 'aid-pka';
  }
  if (verificationLevel === 'metadata') {
    return 'metadata-match';
  }
  return undefined;
}

export class AidDnsWebProfileResolver implements UaidProfileResolver {
  readonly profile = AID_DNS_WEB_PROFILE_ID;

  readonly meta: AdapterMeta = {
    id: 'hcs-14/aid-dns-web',
    didMethods: ['*'],
    displayName: 'HCS-14 AID DNS/Web Profile',
    description:
      'Resolves uaid:aid identifiers via _agent.<nativeId> DNS TXT records and protocol endpoint hints.',
  };

  private readonly dnsLookup: DnsTxtLookup;
  private readonly supportedSchemes: Set<string>;
  private readonly metadataVerifier?: AidDnsVerification;
  private readonly cryptographicVerifier?: AidDnsVerification;

  constructor(options: AidDnsWebResolverOptions = {}) {
    this.dnsLookup = options.dnsLookup ?? nodeDnsTxtLookup;
    this.supportedSchemes = new Set(
      (options.supportedUriSchemes ?? ['https', 'http', 'wss', 'ws']).map(
        scheme => scheme.toLowerCase(),
      ),
    );
    this.metadataVerifier = options.metadataVerifier;
    this.cryptographicVerifier = options.cryptographicVerifier;
  }

  supports(
    _uaid: string,
    parsed: UaidProfileResolverContext['parsedUaid'],
  ): boolean {
    if (parsed.method !== 'aid') {
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
      return null;
    }

    const nativeId = parsed.params['nativeId'];
    if (!nativeId || !isFqdn(nativeId)) {
      return null;
    }

    const normalizedNativeId = normalizeDomain(nativeId);
    const dnsName = `_agent.${normalizedNativeId}`;
    const txtRecords = await this.dnsLookup(dnsName);
    if (txtRecords.length === 0) {
      return null;
    }

    const parsedRecords = txtRecords.map(record =>
      parseRecord(record, this.supportedSchemes),
    );
    const validRecords = parsedRecords
      .filter(
        (result): result is AidDnsRecordParseSuccess => 'record' in result,
      )
      .map(result => result.record);

    if (validRecords.length === 0) {
      const endpointInvalid = parsedRecords.some(
        result =>
          !('record' in result) && result.code === 'ERR_ENDPOINT_INVALID',
      );
      return buildErrorProfile(
        uaid,
        endpointInvalid ? 'ERR_ENDPOINT_INVALID' : 'ERR_INVALID_AID_RECORD',
        endpointInvalid
          ? 'AID DNS record endpoint URI is invalid or unsupported.'
          : 'AID DNS TXT payload is malformed or unsupported.',
        { dnsName },
      );
    }

    const selectedRecord = [...validRecords].sort((a, b) =>
      deterministicRecordKey(a).localeCompare(deterministicRecordKey(b)),
    )[0];

    const verificationInput: AidDnsVerificationInput = {
      uaid,
      protocol: selectedRecord.protocol,
      endpoint: selectedRecord.endpoint,
      record: selectedRecord,
    };

    let verificationLevel: 'none' | 'metadata' | 'cryptographic' = 'none';

    if (this.metadataVerifier) {
      const metadataVerified = await this.metadataVerifier(verificationInput);
      if (!metadataVerified) {
        return buildErrorProfile(
          uaid,
          'ERR_VERIFICATION_FAILED',
          'AID metadata verification failed.',
          { dnsName },
        );
      }
      verificationLevel = 'metadata';
    }

    if (selectedRecord.publicKey && this.cryptographicVerifier) {
      const cryptographicVerified =
        await this.cryptographicVerifier(verificationInput);
      if (!cryptographicVerified) {
        return buildErrorProfile(
          uaid,
          'ERR_VERIFICATION_FAILED',
          'AID cryptographic verification failed.',
          { dnsName },
        );
      }
      verificationLevel = 'cryptographic';
    }

    const did = context.did ?? undefined;
    const alsoKnownAs = did ? [did] : undefined;

    return {
      id: uaid,
      did,
      alsoKnownAs,
      service: [
        {
          id: `${uaid}#aid-endpoint`,
          type: 'AIDService',
          serviceEndpoint: selectedRecord.endpoint,
        },
      ],
      metadata: {
        profile: AID_DNS_WEB_PROFILE_ID,
        resolved: true,
        endpoint: selectedRecord.endpoint,
        protocol: selectedRecord.protocol,
        verification: {
          level: verificationLevel,
          method: verificationMethodForLevel(verificationLevel),
        },
        verificationLevel,
        precedenceSource: 'dns',
      },
    };
  }
}
