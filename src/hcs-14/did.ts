/**
 * DID generation and parsing for HCS-14 AID/UAID methods.
 */

import { getCryptoAdapter } from '../utils/crypto-abstraction';
import { base58Encode } from './base58';
import { canonicalizeAgentData } from './canonical';
import { CanonicalAgentData, DidRoutingParams, ParsedHcs14Did } from './types';

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
  if (params.uid) entries.push(['uid', params.uid]);
  if (params.registry) entries.push(['registry', params.registry]);
  if (params.proto) entries.push(['proto', params.proto]);
  if (params.nativeId) entries.push(['nativeId', params.nativeId]);
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

async function createUaidAidImpl(
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
  return paramString ? `uaid:aid:${id};${paramString}` : `uaid:aid:${id}`;
}

function createUaidFromDidImpl(
  existingDid: string,
  params?: DidRoutingParams,
): string {
  let method: string;
  let idPart: string;
  if (existingDid.startsWith('uaid:aid:')) {
    method = 'aid';
    idPart = existingDid.slice('uaid:aid:'.length);
  } else if (existingDid.startsWith('did:')) {
    const idx = existingDid.indexOf(':');
    const second = existingDid.indexOf(':', idx + 1);
    if (second < 0) throw new Error('Invalid DID format');
    method = existingDid.slice(idx + 1, second);
    idPart = existingDid.slice(second + 1);
  } else {
    throw new Error('Invalid DID format');
  }
  const { sanitized, hadSuffix } = sanitizeDidSpecificId(idPart);

  let finalId = sanitized;
  if (method === 'hedera') {
    const networkPrefixMatch = sanitized.match(
      /^(mainnet|testnet|previewnet|devnet):(.+)$/,
    );
    if (networkPrefixMatch) {
      finalId = networkPrefixMatch[2];
    }
  }

  const finalParams: DidRoutingParams = { ...(params || {}) };
  if (hadSuffix && !finalParams.src) {
    finalParams.src = encodeMultibaseB58btc(existingDid);
  }
  const paramString = buildParamString(finalParams);
  return paramString
    ? `uaid:did:${finalId};${paramString}`
    : `uaid:did:${finalId}`;
}

export function createUaid(
  existingDid: string,
  params?: DidRoutingParams,
): string;
export function createUaid(
  input: CanonicalAgentData,
  params?: DidRoutingParams,
  options?: { includeParams?: boolean },
): Promise<string>;
export function createUaid(
  input: string | CanonicalAgentData,
  params?: DidRoutingParams,
  options?: { includeParams?: boolean },
): Promise<string> | string {
  if (typeof input === 'string') {
    return createUaidFromDidImpl(input, params);
  }
  return createUaidAidImpl(input, params, options);
}

export function parseHcs14Did(did: string): ParsedHcs14Did {
  const parseParams = (paramStr: string): Record<string, string> => {
    const params: Record<string, string> = {};
    if (!paramStr) return params;
    const pairs = paramStr.split(';');
    for (const p of pairs) {
      const eq = p.indexOf('=');
      if (eq > 0) {
        const k = p.slice(0, eq);
        const v = p.slice(eq + 1);
        params[k] = v;
      }
    }
    return params;
  };

  if (did.startsWith('uaid:')) {
    const afterUaid = did.slice('uaid:'.length);
    let inner: 'did' | 'aid';
    let afterInner: string;
    if (afterUaid.startsWith('did:')) {
      inner = 'did';
      afterInner = afterUaid.slice('did:'.length);
    } else if (afterUaid.startsWith('aid:')) {
      inner = 'aid';
      afterInner = afterUaid.slice('aid:'.length);
    } else {
      throw new Error('Invalid UAID');
    }
    const semi = afterInner.indexOf(';');
    const id = semi >= 0 ? afterInner.slice(0, semi) : afterInner;
    const paramStr = semi >= 0 ? afterInner.slice(semi + 1) : '';
    const params = parseParams(paramStr);
    return { method: inner === 'did' ? 'uaid' : 'aid', id, params };
  }

  throw new Error('Invalid DID');
}
