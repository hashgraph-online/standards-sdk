/**
 * Canonicalization and hashing helpers for HCS-14 AID generation.
 */

import { z } from 'zod';
import {
  CanonicalAgentDataSchema,
  CanonicalAgentData,
  CanonicalizationResult,
} from './types';
import { isHederaCaip10, isEip155Caip10 } from './caip';

function normalizeString(value: string): string {
  return value.trim();
}

function normalizeLower(value: string): string {
  return value.trim().toLowerCase();
}

export function canonicalizeAgentData(input: unknown): CanonicalizationResult {
  const parsed = CanonicalAgentDataSchema.parse(input);

  if (parsed.protocol.trim().toLowerCase() === 'hcs-10') {
    if (!isHederaCaip10(parsed.nativeId.trim())) {
      throw new Error(
        'HCS-14: For protocol hcs-10, nativeId must be CAIP-10 (hedera:<network>:<account>)',
      );
    }
  }

  const protocol = parsed.protocol.trim().toLowerCase();
  if (protocol === 'acp-virtuals') {
    if (!isEip155Caip10(parsed.nativeId.trim())) {
      throw new Error(
        'HCS-14: For protocol acp-virtuals, nativeId must be EIP-155 CAIP-10 (eip155:<chainId>:<address>)',
      );
    }
  }

  const normalized: CanonicalAgentData = {
    registry: normalizeLower(parsed.registry),
    name: normalizeString(parsed.name),
    version: normalizeString(parsed.version),
    protocol: normalizeLower(parsed.protocol),
    nativeId: normalizeString(parsed.nativeId),
    skills: [...parsed.skills].sort((a, b) => a - b),
  };

  const orderedKeys = [
    'skills',
    'name',
    'nativeId',
    'protocol',
    'registry',
    'version',
  ] as const;
  const canonicalObject: Record<string, unknown> = {};
  for (const key of orderedKeys) {
    canonicalObject[key] = normalized[key];
  }

  const canonicalJson = JSON.stringify(canonicalObject);
  return { normalized, canonicalJson };
}
