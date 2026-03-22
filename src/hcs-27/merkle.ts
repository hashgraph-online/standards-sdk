import { createHash } from 'crypto';
import {
  hcs27ConsistencyProofSchema,
  hcs27InclusionProofSchema,
  type HCS27ConsistencyProof,
  type HCS27InclusionProof,
} from './types';

function normalizeJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('JSON numbers must be finite');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return Array.from(value, item =>
      item === undefined ? null : normalizeJsonValue(item),
    );
  }

  if (typeof value === 'object') {
    const toJSON = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return normalizeJsonValue(toJSON.call(value));
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        result[key] = normalizeJsonValue(item);
      }
    }
    return result;
  }

  throw new Error(`Unsupported JSON value type: ${typeof value}`);
}

function formatNumber(value: number): string {
  if (Object.is(value, -0)) {
    return '0';
  }
  return value.toString();
}

function decodeBase64(value: string, fieldName: string): Buffer {
  try {
    if (!value) {
      throw new Error('empty base64');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
      throw new Error('non-canonical base64');
    }
    return decoded;
  } catch {
    throw new Error(`${fieldName} must be valid base64`);
  }
}

function writeCanonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => writeCanonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${writeCanonicalJson(item)}`,
      )
      .join(',')}}`;
  }
  throw new Error(`Unsupported JSON value type: ${typeof value}`);
}

function parseTreeSize(value: number | string): bigint {
  return typeof value === 'number' ? BigInt(value) : BigInt(value);
}

function leastSignificantBit(value: bigint): bigint {
  return value & 1n;
}

function isExactPowerOfTwo(value: bigint): boolean {
  return value !== 0n && (value & (value - 1n)) === 0n;
}

function largestPowerOfTwoLessThan(value: number): number {
  if (value <= 1) {
    return 0;
  }

  let result = 1;
  while (result << 1 < value) {
    result <<= 1;
  }
  return result;
}

export function canonicalizeHCS27Json(value: unknown): Buffer {
  const normalized = normalizeJsonValue(value);
  return Buffer.from(writeCanonicalJson(normalized), 'utf8');
}

export function emptyHCS27Root(): Buffer {
  return createHash('sha256').update(Buffer.alloc(0)).digest();
}

export function hashHCS27Leaf(canonicalEntry: Buffer | Uint8Array): Buffer {
  return createHash('sha256')
    .update(Buffer.from([0x00]))
    .update(Buffer.from(canonicalEntry))
    .digest();
}

export function hashHCS27Node(
  left: Buffer | Uint8Array,
  right: Buffer | Uint8Array,
): Buffer {
  return createHash('sha256')
    .update(Buffer.from([0x01]))
    .update(Buffer.from(left))
    .update(Buffer.from(right))
    .digest();
}

export function merkleRootFromCanonicalEntries(
  entries: ReadonlyArray<Buffer | Uint8Array>,
): Buffer {
  if (entries.length === 0) {
    return emptyHCS27Root();
  }
  if (entries.length === 1) {
    return hashHCS27Leaf(entries[0]);
  }

  const split = largestPowerOfTwoLessThan(entries.length);
  const left = merkleRootFromCanonicalEntries(entries.slice(0, split));
  const right = merkleRootFromCanonicalEntries(entries.slice(split));
  return hashHCS27Node(left, right);
}

export function merkleRootFromEntries(entries: ReadonlyArray<unknown>): Buffer {
  const canonicalEntries = entries.map(entry => canonicalizeHCS27Json(entry));
  return merkleRootFromCanonicalEntries(canonicalEntries);
}

export function leafHashHexFromEntry(entry: unknown): string {
  return hashHCS27Leaf(canonicalizeHCS27Json(entry)).toString('hex');
}

export function verifyInclusionProof(
  params:
    | HCS27InclusionProof
    | {
        leafIndex: number;
        treeSize: number;
        leafHashHex: string;
        path: string[];
        expectedRootB64: string;
      },
): boolean {
  let leafIndex: bigint;
  let treeSize: bigint;
  let leafHashHex: string;
  let path: string[];
  let expectedRootB64: string;

  if ('leafHash' in params) {
    const proof = hcs27InclusionProofSchema.parse(params);
    leafIndex = BigInt(proof.leafIndex);
    treeSize = BigInt(proof.treeSize);
    leafHashHex = proof.leafHash;
    path = proof.path;
    expectedRootB64 = proof.rootHash;
  } else {
    leafIndex = parseTreeSize(params.leafIndex);
    treeSize = parseTreeSize(params.treeSize);
    leafHashHex = params.leafHashHex;
    path = params.path;
    expectedRootB64 = params.expectedRootB64;
  }

  if (treeSize <= 0n) {
    throw new Error('treeSize must be greater than zero for inclusion proofs');
  }
  if (leafIndex < 0n || leafIndex >= treeSize) {
    throw new Error('leafIndex must be less than treeSize');
  }
  if (!/^(?:[0-9a-f]{2})+$/i.test(leafHashHex.trim())) {
    throw new Error('leafHash must be valid hex');
  }

  let current: Buffer;
  try {
    current = Buffer.from(leafHashHex.trim(), 'hex');
  } catch {
    throw new Error('leafHash must be valid hex');
  }

  let fn = leafIndex;
  let sn = treeSize - 1n;

  for (const [index, node] of path.entries()) {
    if (sn === 0n) {
      return false;
    }

    const sibling = decodeBase64(node, `path[${index}]`);

    if (leastSignificantBit(fn) === 1n || fn === sn) {
      current = hashHCS27Node(sibling, current);
      if (leastSignificantBit(fn) === 0n) {
        while (leastSignificantBit(fn) === 0n && fn !== 0n) {
          fn /= 2n;
          sn /= 2n;
        }
      }
    } else {
      current = hashHCS27Node(current, sibling);
    }

    fn /= 2n;
    sn /= 2n;
  }

  return sn === 0n && current.toString('base64') === expectedRootB64;
}

export function verifyConsistencyProof(
  params:
    | HCS27ConsistencyProof
    | {
        oldTreeSize: number;
        newTreeSize: number;
        oldRootB64: string;
        newRootB64: string;
        consistencyPath: string[];
      },
): boolean {
  let oldTreeSize: bigint;
  let newTreeSize: bigint;
  let oldRootB64: string;
  let newRootB64: string;
  let consistencyPath: string[];

  if ('oldRootHash' in params) {
    const proof = hcs27ConsistencyProofSchema.parse(params);
    oldTreeSize = BigInt(proof.oldTreeSize);
    newTreeSize = BigInt(proof.newTreeSize);
    oldRootB64 = proof.oldRootHash;
    newRootB64 = proof.newRootHash;
    consistencyPath = proof.consistencyPath;
  } else {
    oldTreeSize = parseTreeSize(params.oldTreeSize);
    newTreeSize = parseTreeSize(params.newTreeSize);
    oldRootB64 = params.oldRootB64;
    newRootB64 = params.newRootB64;
    consistencyPath = params.consistencyPath;
  }

  if (oldTreeSize < 0n || newTreeSize < 0n) {
    throw new Error('tree sizes must be non-negative');
  }
  if (oldTreeSize === 0n) {
    return true;
  }
  if (oldTreeSize === newTreeSize) {
    decodeBase64(oldRootB64, 'oldRootHash');
    decodeBase64(newRootB64, 'newRootHash');
    return oldRootB64 === newRootB64 && consistencyPath.length === 0;
  }
  if (oldTreeSize > newTreeSize || consistencyPath.length === 0) {
    return false;
  }

  const path = consistencyPath.map((node, index) =>
    decodeBase64(node, `consistencyPath[${index}]`),
  );
  if (isExactPowerOfTwo(oldTreeSize)) {
    path.unshift(decodeBase64(oldRootB64, 'oldRootHash'));
  }

  let fn = oldTreeSize - 1n;
  let sn = newTreeSize - 1n;

  while (leastSignificantBit(fn) === 1n) {
    fn /= 2n;
    sn /= 2n;
  }

  const firstHash = Buffer.from(path[0]);
  let fr: Uint8Array = Buffer.from(firstHash);
  let sr: Uint8Array = Buffer.from(firstHash);

  for (const nodeHash of path.slice(1)) {
    if (sn === 0n) {
      return false;
    }

    if (leastSignificantBit(fn) === 1n || fn === sn) {
      fr = hashHCS27Node(nodeHash, fr);
      sr = hashHCS27Node(nodeHash, sr);
      if (leastSignificantBit(fn) === 0n) {
        while (leastSignificantBit(fn) === 0n && fn !== 0n) {
          fn /= 2n;
          sn /= 2n;
        }
      }
    } else {
      sr = hashHCS27Node(sr, nodeHash);
    }

    fn /= 2n;
    sn /= 2n;
  }

  return (
    sn === 0n &&
    Buffer.from(fr).toString('base64') === oldRootB64 &&
    Buffer.from(sr).toString('base64') === newRootB64
  );
}
