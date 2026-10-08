import { z } from 'zod';

import { hcs25SignalStatusSchema } from '../types';

/**
 * Signals published by an ANS Trust Index provider and consumed by the
 * `ans-trust-discovery` adapter, in specification order.
 */
export const HCS25_ANS_TRUST_DISCOVERY_SIGNALS = [
  'certtype',
  'dnssecurity',
  'agentage',
  'versionstability',
  'dnsconsistency',
  'httpsrecord',
  'agentcard',
  'certificatehygiene',
] as const;

/**
 * One signal name from {@link HCS25_ANS_TRUST_DISCOVERY_SIGNALS}.
 */
export type Hcs25AnsTrustDiscoverySignal =
  (typeof HCS25_ANS_TRUST_DISCOVERY_SIGNALS)[number];

const ansTrustDiscoveryScoreSchema = z.number().min(0).max(100).nullish();

/**
 * Stored-field schema for ANS Trust Index signals stored under
 * `metadata.ansTrustDiscovery`. Each signal is a provider-normalized score
 * in `[0,100]`, or null when the provider could not compute it.
 */
export const hcs25AnsTrustDiscoveryFieldsSchema = z
  .object({
    'ans-trust-discovery.certtype': ansTrustDiscoveryScoreSchema,
    'ans-trust-discovery.dnssecurity': ansTrustDiscoveryScoreSchema,
    'ans-trust-discovery.agentage': ansTrustDiscoveryScoreSchema,
    'ans-trust-discovery.versionstability': ansTrustDiscoveryScoreSchema,
    'ans-trust-discovery.dnsconsistency': ansTrustDiscoveryScoreSchema,
    'ans-trust-discovery.httpsrecord': ansTrustDiscoveryScoreSchema,
    'ans-trust-discovery.agentcard': ansTrustDiscoveryScoreSchema,
    'ans-trust-discovery.certificatehygiene': ansTrustDiscoveryScoreSchema,
    ansTrustDiscoveryStatus: hcs25SignalStatusSchema.nullish(),
    ansTrustDiscoveryUpdatedAt: z.string().nullish(),
  })
  .passthrough();
