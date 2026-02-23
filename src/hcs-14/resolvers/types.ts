/**
 * DID resolver types for HCS-14.
 */

import type { HCS11Profile } from '../../hcs-11/types';
import type { TopicInfo } from '../../services/types';
import type { ParsedHcs14Did } from '../types';
import type { AdapterMeta } from '../adapters/types';

export interface DidVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  blockchainAccountId?: string;
}

export interface Hcs10ServiceEndpoint {
  network: string;
  accountId: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
}

export interface HintedServiceEndpoint {
  source: 'uaid-parameters';
  proto?: string;
  nativeId?: string;
  domain?: string;
}

export type DidServiceEndpoint =
  | string
  | Hcs10ServiceEndpoint
  | HintedServiceEndpoint
  | Record<string, unknown>;

export interface DidService {
  id: string;
  type: string;
  serviceEndpoint: DidServiceEndpoint;
}

export interface DidDocumentMinimal {
  id: string;
  verificationMethod?: DidVerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  service?: DidService[];
  alsoKnownAs?: string[];
}

export interface DidResolver {
  supports(did: string): boolean;
  resolve(did: string): Promise<DidDocumentMinimal | null>;
  meta?: AdapterMeta;
}

export type ResolverAdapterCapability =
  | 'did-resolver'
  | 'did-profile-resolver'
  | 'uaid-profile-resolver';

export interface Hcs11ResolvedProfile {
  protocol: 'hcs-11';
  network: 'mainnet' | 'testnet';
  accountId: string;
  profile: HCS11Profile;
  topicInfo?: TopicInfo;
}

export interface DidProtocolProfiles {
  hcs11?: Hcs11ResolvedProfile;
}

export interface ProfileResolutionVerification {
  method?: string;
  assurance?: string;
  level?: string;
  details?: string;
}

export interface ProfileResolutionServiceSources {
  copiedFromBaseDidDocument?: boolean;
  derivedFromUaidParameters?: boolean;
}

export interface ProfileResolutionMetadata {
  profile: string;
  resolved: boolean;
  baseDid?: string;
  baseDidResolved?: boolean;
  verification?: ProfileResolutionVerification;
  services?: ProfileResolutionServiceSources;
  reconstructedUaid?: string;
  resolutionMode?: 'dns-binding-only' | 'full-resolution';
  selectedFollowupProfile?: string;
  verificationLevel?:
    | 'dns-binding'
    | 'dns-binding-dnssec'
    | 'none'
    | 'metadata'
    | 'cryptographic';
  precedenceSource?: 'dns' | 'uaid' | 'did' | 'profile-policy';
  endpoint?: string;
  protocol?: string;
}

export interface ProfileResolutionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DidResolutionProfile extends DidDocumentMinimal {
  did?: string;
  profiles?: DidProtocolProfiles;
  metadata?: ProfileResolutionMetadata;
  error?: ProfileResolutionError;
}

export interface DidProfileResolverContext {
  uaid?: string;
  parsedUaid?: ParsedHcs14Did;
  didDocument?: DidDocumentMinimal | null;
}

export interface DidProfileResolver {
  supports(did: string): boolean;
  resolveProfile(
    did: string,
    context?: DidProfileResolverContext,
  ): Promise<DidResolutionProfile | null>;
  meta?: AdapterMeta;
}

export interface UaidProfileResolverContext {
  parsedUaid: ParsedHcs14Did;
  did?: string | null;
  didDocument?: DidDocumentMinimal | null;
  resolveDid(did: string): Promise<DidDocumentMinimal | null>;
  resolveDidProfile(
    did: string,
    context?: DidProfileResolverContext,
  ): Promise<DidResolutionProfile>;
  resolveUaidProfileById(
    profileId: string,
    uaid: string,
  ): Promise<DidResolutionProfile | null>;
}

export interface UaidProfileResolver {
  readonly profile: string;
  supports(uaid: string, parsed: ParsedHcs14Did): boolean;
  resolveProfile(
    uaid: string,
    context: UaidProfileResolverContext,
  ): Promise<DidResolutionProfile | null>;
  meta?: AdapterMeta;
}

export type ResolverAdapter =
  | DidResolver
  | DidProfileResolver
  | UaidProfileResolver;

export interface ResolverAdapterRecord {
  capability: ResolverAdapterCapability;
  adapter: ResolverAdapter;
}

export interface ResolverAdapterFilterOptions {
  capability?: ResolverAdapterCapability;
  didMethod?: string;
  profileId?: string;
}

export function isUaidProfileResolverAdapter(
  adapter: ResolverAdapter,
): adapter is UaidProfileResolver {
  return (
    typeof adapter === 'object' &&
    adapter !== null &&
    'profile' in adapter &&
    typeof adapter.profile === 'string'
  );
}

export function isDidProfileResolverAdapter(
  adapter: ResolverAdapter,
): adapter is DidProfileResolver {
  return (
    typeof adapter === 'object' &&
    adapter !== null &&
    'resolveProfile' in adapter &&
    typeof adapter.resolveProfile === 'function' &&
    !('profile' in adapter)
  );
}

export function isDidResolverAdapter(
  adapter: ResolverAdapter,
): adapter is DidResolver {
  return (
    typeof adapter === 'object' &&
    adapter !== null &&
    'resolve' in adapter &&
    typeof adapter.resolve === 'function'
  );
}
