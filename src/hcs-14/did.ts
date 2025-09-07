/**
 * DID generation and parsing for HCS-14 AID/UAID methods.
 */

import { getCryptoAdapter } from '../utils/crypto-abstraction';
import { base58Encode } from './base58';
import { canonicalizeAgentData } from './canonical';
import {
  CanonicalAgentData,
  DidRoutingParams,
  Hcs14Method,
  ParsedHcs14Did,
} from './types';

function encodeMultibaseB58btc(input: string): string {
  const bytes = Buffer.from(input, 'utf8');
  return 'z' + base58Encode(bytes);
}

function sanitizeDidSpecificId(idPart: string): {
  sanitized: string;
  hadSuffix: boolean;
} {
  const cut = idPart.search(/[;?#]/);
  if (cut === -1) return { sanitized: idPart, hadSuffix: false };
  return { sanitized: idPart.slice(0, cut), hadSuffix: true };
}

function buildParamString(params: DidRoutingParams): string {
  const entries: Array<[string, string]> = [];
  if (params.registry) entries.push(['registry', params.registry]);
  if (params.proto) entries.push(['proto', params.proto]);
  if (params.nativeId) entries.push(['nativeId', params.nativeId]);
  if (params.uid) entries.push(['uid', params.uid]);
  if (params.domain) entries.push(['domain', params.domain]);
  if (params.src) entries.push(['src', params.src]);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join(';');
}

function defaultAidParams(
  data: CanonicalAgentData,
  params?: DidRoutingParams,
): DidRoutingParams {
  const merged: DidRoutingParams = { ...params };
  if (!merged.registry) merged.registry = data.registry;
  if (!merged.nativeId) merged.nativeId = data.nativeId;
  if (!merged.uid) merged.uid = '0';
  return merged;
}

export async function generateAidDid(
  input: CanonicalAgentData,
  params?: DidRoutingParams,
  options?: { includeParams?: boolean },
): Promise<string> {
  const { normalized, canonicalJson } = canonicalizeAgentData(input);
  const adapter = getCryptoAdapter();
  const hasher = adapter.createHash('sha384');
  const digestResult = hasher
    .update(Buffer.from(canonicalJson, 'utf8'))
    .digest();
  const digestBuffer = (await Promise.resolve(
    digestResult as string | Buffer,
  )) as string | Buffer;
  const bytes = Buffer.isBuffer(digestBuffer)
    ? (digestBuffer as Buffer)
    : Buffer.from(digestBuffer as string);
  const id = base58Encode(bytes);
  const includeParams = options?.includeParams !== false;
  const finalParams = includeParams
    ? defaultAidParams(normalized, params || {})
    : {};
  const paramString = includeParams ? buildParamString(finalParams) : '';
  return paramString ? `did:aid:${id};${paramString}` : `did:aid:${id}`;
}

export function generateUaidDid(
  existingDid: string,
  params?: DidRoutingParams,
): string {
  const idx = existingDid.indexOf(':');
  const second = idx >= 0 ? existingDid.indexOf(':', idx + 1) : -1;
  if (!existingDid.startsWith('did:') || second < 0) {
    throw new Error('Invalid DID format');
  }
  const idPart = existingDid.slice(second + 1);
  const { sanitized, hadSuffix } = sanitizeDidSpecificId(idPart);

  const finalParams: DidRoutingParams = { ...(params || {}) };
  if (hadSuffix && !finalParams.src) {
    finalParams.src = encodeMultibaseB58btc(existingDid);
  }
  const paramString = buildParamString(finalParams);
  return paramString
    ? `did:uaid:${sanitized};${paramString}`
    : `did:uaid:${sanitized}`;
}

export function parseHcs14Did(did: string): ParsedHcs14Did {
  if (!did.startsWith('did:')) {
    throw new Error('Invalid DID');
  }
  const parts = did.split(':');
  if (parts.length < 3) {
    throw new Error('Invalid DID');
  }
  const method = parts[1] as Hcs14Method;
  if (method !== 'aid' && method !== 'uaid') {
    throw new Error('Unsupported method');
  }
  const afterMethod = did.slice(`did:${method}:`.length);
  const semi = afterMethod.indexOf(';');
  const id = semi >= 0 ? afterMethod.slice(0, semi) : afterMethod;
  const paramStr = semi >= 0 ? afterMethod.slice(semi + 1) : '';
  const params: Record<string, string> = {};
  if (paramStr) {
    const pairs = paramStr.split(';');
    for (const p of pairs) {
      const eq = p.indexOf('=');
      if (eq > 0) {
        const k = p.slice(0, eq);
        const v = p.slice(eq + 1);
        params[k] = v;
      }
    }
  }
  return { method, id, params };
}
