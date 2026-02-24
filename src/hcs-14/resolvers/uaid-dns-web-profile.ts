import type {
  DidResolutionProfile,
  ProfileResolutionError,
  UaidProfileResolver,
  UaidProfileResolverContext,
} from './types';
import type { AdapterMeta } from '../adapters/types';
import { nodeDnsTxtLookup, type DnsTxtLookup } from './dns';
import {
  buildCanonicalUaid,
  isFqdn,
  normalizeDomain,
  parseSemicolonFields,
  uaidTargetFromParsed,
} from './profile-utils';
import { AID_DNS_WEB_PROFILE_ID } from './aid-dns-web-profile';
import { ANS_DNS_WEB_PROFILE_ID } from './ans-dns-web-profile';
import { UAID_DID_RESOLUTION_PROFILE_ID } from './uaid-did-resolution-profile';

export const UAID_DNS_WEB_PROFILE_ID = 'hcs-14.profile.uaid-dns-web';

interface UaidDnsWebRecord {
  target: 'aid' | 'did';
  id: string;
  uid: string;
  proto: string;
  nativeId: string;
  registry?: string;
  domain?: string;
  src?: string;
  did?: string;
  memo?: string;
  reconstructedUaid: string;
}

export interface UaidDnsWebResolverOptions {
  dnsLookup?: DnsTxtLookup;
  dnssecValidation?: (hostname: string) => Promise<boolean>;
  requireFullResolution?: boolean;
  enableFollowupResolution?: boolean;
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
      profile: UAID_DNS_WEB_PROFILE_ID,
      resolved: false,
    },
  };
}

function canonicalizeNativeDomainParams(
  params: Record<string, string>,
): Record<string, string> {
  const next = { ...params };
  const nativeId = next['nativeId'];
  if (nativeId && isFqdn(nativeId)) {
    next['nativeId'] = normalizeDomain(nativeId);
  }
  const domain = next['domain'];
  if (domain && isFqdn(domain)) {
    next['domain'] = normalizeDomain(domain);
  }
  return next;
}

function validateRecordFields(
  fields: Record<string, string>,
  queriedNativeId: string,
): UaidDnsWebRecord | null {
  const target = fields['target'];
  const id = fields['id'];
  const uid = fields['uid'];
  const proto = fields['proto'];
  const nativeId = fields['nativeId'];

  if (target !== 'aid' && target !== 'did') {
    return null;
  }
  if (!id || !uid || !proto || !nativeId) {
    return null;
  }
  if (normalizeDomain(nativeId) !== queriedNativeId) {
    return null;
  }
  if ('registry' in fields && !fields['registry']) {
    return null;
  }
  const did = fields['did'];
  if (did && (target !== 'did' || !did.startsWith('did:'))) {
    return null;
  }

  const params: Record<string, string> = {
    uid,
    proto,
    nativeId,
  };
  if (fields['registry']) {
    params['registry'] = fields['registry'];
  }
  if (fields['domain']) {
    params['domain'] = fields['domain'];
  }
  if (fields['src']) {
    params['src'] = fields['src'];
  }

  return {
    target,
    id,
    uid,
    proto,
    nativeId,
    registry: fields['registry'],
    domain: fields['domain'],
    src: fields['src'],
    did,
    memo: fields['m'],
    reconstructedUaid: buildCanonicalUaid(
      target,
      id,
      canonicalizeNativeDomainParams(params),
    ),
  };
}

function selectFollowupProfiles(
  parsed: UaidProfileResolverContext['parsedUaid'],
): string[] {
  const target = uaidTargetFromParsed(parsed);
  if (target === 'aid') {
    if (parsed.params['registry'] === 'ans') {
      return [ANS_DNS_WEB_PROFILE_ID, AID_DNS_WEB_PROFILE_ID];
    }
    return [AID_DNS_WEB_PROFILE_ID];
  }
  return [UAID_DID_RESOLUTION_PROFILE_ID];
}

export class UaidDnsWebProfileResolver implements UaidProfileResolver {
  readonly adapterKind: 'uaid-profile-resolver' = 'uaid-profile-resolver';
  readonly profile = UAID_DNS_WEB_PROFILE_ID;

  readonly meta: AdapterMeta = {
    id: 'hcs-14/uaid-dns-web',
    didMethods: ['*'],
    displayName: 'HCS-14 UAID DNS TXT Profile',
    description:
      'Binds UAIDs to DNS TXT records at _uaid.<nativeId> and can continue to follow-up profile resolution.',
  };

  private readonly dnsLookup: DnsTxtLookup;
  private readonly dnssecValidation?: (hostname: string) => Promise<boolean>;
  private readonly requireFullResolution: boolean;
  private readonly enableFollowupResolution: boolean;

  constructor(options: UaidDnsWebResolverOptions = {}) {
    this.dnsLookup = options.dnsLookup ?? nodeDnsTxtLookup;
    this.dnssecValidation = options.dnssecValidation;
    this.requireFullResolution = options.requireFullResolution ?? false;
    this.enableFollowupResolution = options.enableFollowupResolution ?? true;
  }

  supports(
    _uaid: string,
    parsed: UaidProfileResolverContext['parsedUaid'],
  ): boolean {
    const target = uaidTargetFromParsed(parsed);
    if (target !== 'aid' && target !== 'did') {
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
    const target = uaidTargetFromParsed(parsed);
    if (target !== 'aid' && target !== 'did') {
      return buildErrorProfile(
        uaid,
        'ERR_NOT_APPLICABLE',
        'UAID DNS/Web profile only applies to uaid:aid or uaid:did identifiers.',
      );
    }

    const nativeId = parsed.params['nativeId'];
    if (!nativeId || !isFqdn(nativeId)) {
      return buildErrorProfile(
        uaid,
        'ERR_NOT_APPLICABLE',
        'UAID DNS/Web profile requires an FQDN nativeId.',
      );
    }

    const normalizedNativeId = normalizeDomain(nativeId);
    const dnsName = `_uaid.${normalizedNativeId}`;
    const inputCanonical = buildCanonicalUaid(
      uaidTargetFromParsed(parsed),
      parsed.id,
      canonicalizeNativeDomainParams(parsed.params),
    );

    const txtRecords = await this.dnsLookup(dnsName);
    if (txtRecords.length === 0) {
      return buildErrorProfile(
        uaid,
        'ERR_NO_DNS_RECORD',
        'No UAID DNS TXT record was found for the requested nativeId.',
        { dnsName },
      );
    }

    const parsedRecords = txtRecords
      .map(record => parseSemicolonFields(record))
      .map(fields => validateRecordFields(fields, normalizedNativeId));
    const validRecords = parsedRecords.filter(
      (record): record is UaidDnsWebRecord => record !== null,
    );

    if (validRecords.length === 0) {
      return buildErrorProfile(
        uaid,
        'ERR_INVALID_UAID_DNS_RECORD',
        'DNS TXT payload at _uaid record is invalid.',
        { dnsName },
      );
    }

    const matchingRecords = validRecords.filter(
      record =>
        record.target === target &&
        record.id === parsed.id &&
        record.reconstructedUaid === inputCanonical,
    );

    if (matchingRecords.length === 0) {
      return buildErrorProfile(
        uaid,
        'ERR_UAID_MISMATCH',
        'DNS TXT payload does not match the input UAID after canonical reconstruction.',
        {
          dnsName,
          inputCanonical,
        },
      );
    }

    const selected = [...matchingRecords].sort((a, b) =>
      a.reconstructedUaid.localeCompare(b.reconstructedUaid),
    )[0];

    const dnssecValidated = this.dnssecValidation
      ? await this.dnssecValidation(dnsName)
      : false;
    const verificationLevel = dnssecValidated
      ? 'dns-binding-dnssec'
      : 'dns-binding';

    if (this.enableFollowupResolution) {
      const followupProfiles = selectFollowupProfiles(parsed);
      const failedFollowupProfileIds: string[] = [];
      for (const followupProfileId of followupProfiles) {
        const followup = await context.resolveUaidProfileById(
          followupProfileId,
          uaid,
        );
        if (!followup) {
          continue;
        }
        if (followup.error || followup.metadata?.resolved === false) {
          failedFollowupProfileIds.push(followupProfileId);
          continue;
        }
        return {
          ...followup,
          metadata: {
            ...followup.metadata,
            profile: UAID_DNS_WEB_PROFILE_ID,
            resolved: true,
            verificationLevel,
            reconstructedUaid: selected.reconstructedUaid,
            selectedFollowupProfile: followupProfileId,
            resolutionMode: 'full-resolution',
          },
        };
      }
      if (failedFollowupProfileIds.length > 0) {
        return buildErrorProfile(
          uaid,
          'ERR_FOLLOWUP_RESOLUTION_FAILED',
          'Follow-up profile resolution failed after successful DNS binding.',
          {
            followupProfileId:
              failedFollowupProfileIds[failedFollowupProfileIds.length - 1],
            attemptedFailedProfiles: failedFollowupProfileIds,
            dnsName,
          },
        );
      }
    }

    if (this.requireFullResolution) {
      return buildErrorProfile(
        uaid,
        'ERR_NO_FOLLOWUP_PROFILE',
        'Resolver policy requires full resolution, but no supported follow-up profile was available.',
        { dnsName },
      );
    }

    const did = selected.did ?? context.did ?? undefined;
    const alsoKnownAs = did ? [did] : undefined;

    return {
      id: uaid,
      did,
      alsoKnownAs,
      metadata: {
        profile: UAID_DNS_WEB_PROFILE_ID,
        resolved: true,
        reconstructedUaid: selected.reconstructedUaid,
        verificationLevel,
        resolutionMode: 'dns-binding-only',
      },
    };
  }
}
