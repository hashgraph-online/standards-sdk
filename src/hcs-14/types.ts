/**
 * HCS-14: Universal Agent ID Standard
 *
 * Type definitions for canonical agent data and DID routing parameters.
 */

import { z } from 'zod';

export const HCS14_PROTOCOL_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export const CanonicalAgentDataSchema = z.object({
  registry: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  protocol: z.string().min(1),
  nativeId: z.string().min(1),
  skills: z.array(z.number().int().nonnegative()),
});

export type CanonicalAgentData = z.infer<typeof CanonicalAgentDataSchema>;

export interface DidRoutingParams {
  registry?: string;
  proto?: string;
  nativeId?: string;
  uid?: string;
  domain?: string;
  /** Encoded full source DID when UAID id was sanitized (multibase base58btc, e.g. z...) */
  src?: string;
}

export type Hcs14Method = 'aid' | 'uaid';

export interface ParsedHcs14Did {
  method: Hcs14Method;
  id: string;
  params: Record<string, string>;
}

export interface CanonicalizationResult {
  normalized: CanonicalAgentData;
  canonicalJson: string;
}
