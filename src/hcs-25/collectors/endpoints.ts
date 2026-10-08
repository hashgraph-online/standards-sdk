import type { Hcs25Subject } from '../types';
import { isJsonObject, readString, readSubjectAdditional } from '../signals';

const ENDPOINT_KEYS = [
  'endpoint',
  'url',
  'serverUrl',
  'endpointUrl',
  'baseUrl',
] as const;

function readEndpointKeys(
  record: Record<string, unknown> | undefined,
): string | null {
  if (!record) {
    return null;
  }
  for (const key of ENDPOINT_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      return value;
    }
  }
  return null;
}

/**
 * Resolves the subject's callable endpoint URL from common metadata
 * locations: `metadata.endpoint|url|serverUrl|endpointUrl|baseUrl`,
 * `metadata.additional.*` equivalents, and the first
 * `metadata.endpoints[].url` (AgentVerse-style endpoint lists).
 */
export function resolveSubjectEndpoint(subject: Hcs25Subject): string | null {
  const metadata = subject.metadata;
  if (metadata) {
    const direct = readEndpointKeys(metadata);
    if (direct) {
      return direct;
    }

    const endpoints = metadata.endpoints;
    if (Array.isArray(endpoints)) {
      for (const entry of endpoints) {
        if (isJsonObject(entry)) {
          const url = readString(entry, 'url');
          if (url && /^https?:\/\//.test(url)) {
            return url;
          }
        }
      }
    }
  }

  return readEndpointKeys(readSubjectAdditional(subject));
}
