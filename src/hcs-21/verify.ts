import { PublicKey } from '@hashgraph/sdk';
import { createHash } from 'crypto';
import { AdapterDeclaration } from './types';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function sortObject(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortObject) as JsonValue;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, JsonValue>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    const sorted: Record<string, JsonValue> = {};
    for (const [key, val] of entries) {
      sorted[key] = sortObject(val);
    }
    return sorted;
  }
  return value;
}

export function canonicalize(value: unknown): string {
  const sorted = sortObject(value as JsonValue);
  return JSON.stringify(sorted);
}

export function verifyDeclarationSignature(
  declaration: AdapterDeclaration,
  publisherPublicKey: string,
): boolean {
  if (!declaration.signature) {
    return false;
  }
  try {
    const { signature, ...unsigned } = declaration;
    const payload = canonicalize(unsigned);
    const signatureBytes = Buffer.from(signature, 'base64');
    const publicKey = PublicKey.fromString(publisherPublicKey);
    return publicKey.verify(Buffer.from(payload, 'utf8'), signatureBytes);
  } catch {
    return false;
  }
}

export function verifyManifestSignature(
  manifest: unknown,
  signatureBase64: string,
  publisherPublicKey: string,
): boolean {
  try {
    const payload = canonicalize(manifest as JsonValue);
    const signatureBytes = Buffer.from(signatureBase64, 'base64');
    const publicKey = PublicKey.fromString(publisherPublicKey);
    return publicKey.verify(Buffer.from(payload, 'utf8'), signatureBytes);
  } catch {
    return false;
  }
}

function normalizeDigest(value: string): string {
  return value.replace(/^sha384[-:]?/i, '').trim().toLowerCase();
}

export function verifyArtifactDigest(
  artifact: Buffer | Uint8Array,
  expectedDigest: string,
): boolean {
  const hash = createHash('sha384');
  hash.update(artifact);
  const hex = hash.digest('hex').toLowerCase();
  const base64 = Buffer.from(hex, 'hex').toString('base64').toLowerCase();
  const expected = normalizeDigest(expectedDigest);
  return expected === hex || expected === base64;
}
