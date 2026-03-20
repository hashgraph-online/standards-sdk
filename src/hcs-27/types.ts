import {
  AccountId,
  Client,
  KeyList,
  PrivateKey,
  PublicKey,
  TransactionReceipt,
} from '@hashgraph/sdk';
import { z } from 'zod';
import type { MirrorNodeConfig } from '../services/mirror-node';
import type { ILogger } from '../utils/logger';
import type { NetworkType } from '../utils/types';

const canonicalUintSchema = z.string().regex(/^(0|[1-9]\d*)$/);

const base64UrlSchema = z
  .string()
  .min(1)
  .refine(value => {
    try {
      const normalized = value + '='.repeat((4 - (value.length % 4)) % 4);
      Buffer.from(normalized, 'base64url');
      return true;
    } catch {
      return false;
    }
  }, 'must be base64url');

const base64Schema = z
  .string()
  .min(1)
  .refine(value => {
    try {
      Buffer.from(value, 'base64');
      return true;
    } catch {
      return false;
    }
  }, 'must be base64');

export interface HCS27StreamId {
  registry: string;
  log_id: string;
}

export interface HCS27LogProfile {
  alg: string;
  leaf: string;
  merkle: string;
}

export interface HCS27RootCommitment {
  treeSize: string;
  rootHashB64u: string;
}

export interface HCS27PreviousCommitment {
  treeSize: string;
  rootHashB64u: string;
}

export interface HCS27Signature {
  alg: string;
  kid: string;
  b64u: string;
}

export interface HCS27CheckpointMetadata {
  type: 'ans-checkpoint-v1';
  stream: HCS27StreamId;
  log: HCS27LogProfile;
  root: HCS27RootCommitment;
  prev?: HCS27PreviousCommitment;
  sig?: HCS27Signature;
}

export interface HCS27MetadataDigest {
  alg: 'sha-256';
  b64u: string;
}

export interface HCS27CheckpointMessage {
  p: 'hcs-27';
  op: 'register';
  metadata: HCS27CheckpointMetadata | string;
  metadata_digest?: HCS27MetadataDigest;
  m?: string;
}

export interface HCS27CheckpointRecord {
  topicId: string;
  sequence: number;
  consensusTimestamp: string;
  payer?: string;
  message: HCS27CheckpointMessage;
  effectiveMetadata: HCS27CheckpointMetadata;
}

export interface HCS27InclusionProof {
  leafHash: string;
  leafIndex: string;
  treeSize: string;
  path: string[];
  rootHash: string;
  rootSignature?: string;
  treeVersion: 1;
}

export interface HCS27ConsistencyProof {
  oldTreeSize: string;
  newTreeSize: string;
  oldRootHash: string;
  newRootHash: string;
  consistencyPath: string[];
  treeVersion: 1;
}

export interface HCS27TopicMemo {
  indexedFlag: number;
  ttlSeconds: number;
  topicType: number;
}

export type HCS27TopicKey = boolean | string | PublicKey | KeyList | PrivateKey;

export interface HCS27CreateCheckpointTopicOptions {
  ttl?: number;
  adminKey?: HCS27TopicKey;
  submitKey?: HCS27TopicKey;
  transactionMemo?: string;
}

export interface HCS27CreateCheckpointTopicResult {
  topicId: string;
  transactionId: string;
}

export interface HCS27PublishCheckpointResult {
  transactionId: string;
  sequenceNumber: number;
  receipt: TransactionReceipt;
}

export interface HCS27ClientConfig {
  network: NetworkType;
  logger?: ILogger;
  mirrorNode?: MirrorNodeConfig;
}

export interface SDKHCS27ClientConfig extends HCS27ClientConfig {
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
  client?: Client;
}

export const hcs27RootCommitmentSchema = z
  .object({
    treeSize: canonicalUintSchema,
    rootHashB64u: base64UrlSchema,
  })
  .passthrough();

export const hcs27PreviousCommitmentSchema = z
  .object({
    treeSize: canonicalUintSchema,
    rootHashB64u: base64UrlSchema,
  })
  .passthrough();

export const hcs27SignatureSchema = z
  .object({
    alg: z.string().min(1),
    kid: z.string().min(1),
    b64u: base64UrlSchema,
  })
  .passthrough();

const hcs27CheckpointMetadataBaseSchema = z
  .object({
    type: z.literal('ans-checkpoint-v1'),
    stream: z
      .object({
        registry: z.string().min(1),
        log_id: z.string().min(1),
      })
      .passthrough(),
    log: z
      .object({
        alg: z.literal('sha-256'),
        leaf: z.string().min(1),
        merkle: z.literal('rfc9162'),
      })
      .passthrough(),
    root: hcs27RootCommitmentSchema,
    prev: hcs27PreviousCommitmentSchema.optional(),
    sig: hcs27SignatureSchema.optional(),
  })
  .passthrough();

export const hcs27CheckpointMetadataSchema =
  hcs27CheckpointMetadataBaseSchema.superRefine((value, ctx) => {
    const rootTreeSize = BigInt(value.root.treeSize);
    const prevTreeSize = value.prev ? BigInt(value.prev.treeSize) : undefined;
    if (prevTreeSize !== undefined && prevTreeSize > rootTreeSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'metadata.prev.treeSize must be <= metadata.root.treeSize',
        path: ['prev', 'treeSize'],
      });
    }
  });

export const hcs27MetadataDigestSchema = z
  .object({
    alg: z.literal('sha-256'),
    b64u: base64UrlSchema,
  })
  .passthrough();

export const hcs27CheckpointMessageSchema = z
  .object({
    p: z.literal('hcs-27'),
    op: z.literal('register'),
    metadata: z.union([
      hcs27CheckpointMetadataBaseSchema,
      z.string().regex(/^hcs:\/\/1\/\d+\.\d+\.\d+$/),
    ]),
    metadata_digest: hcs27MetadataDigestSchema.optional(),
    m: z.string().max(299).optional(),
  })
  .passthrough();

export const hcs27InclusionProofSchema = z
  .object({
    leafHash: z.string().regex(/^[0-9a-f]+$/i),
    leafIndex: canonicalUintSchema,
    treeSize: canonicalUintSchema,
    path: z.array(base64Schema),
    rootHash: base64Schema,
    rootSignature: z.string().optional(),
    treeVersion: z.literal(1),
  })
  .passthrough();

export const hcs27ConsistencyProofSchema = z
  .object({
    oldTreeSize: canonicalUintSchema,
    newTreeSize: canonicalUintSchema,
    oldRootHash: z.string(),
    newRootHash: z.string(),
    consistencyPath: z.array(base64Schema),
    treeVersion: z.literal(1),
  })
  .passthrough();

export type HCS27ValidatedCheckpointMessage = z.infer<
  typeof hcs27CheckpointMessageSchema
>;

export function toHCS27CheckpointMetadata(
  value: z.output<typeof hcs27CheckpointMetadataBaseSchema>,
): HCS27CheckpointMetadata {
  const { type, stream, log, root, prev, sig } = value;
  if (!type || !stream || !log || !root) {
    throw new Error('Invalid HCS-27 checkpoint metadata');
  }

  return {
    type,
    stream: {
      registry: stream.registry,
      log_id: stream.log_id,
    },
    log: {
      alg: log.alg,
      leaf: log.leaf,
      merkle: log.merkle,
    },
    root: {
      treeSize: root.treeSize,
      rootHashB64u: root.rootHashB64u,
    },
    ...(prev
      ? {
          prev: {
            treeSize: prev.treeSize,
            rootHashB64u: prev.rootHashB64u,
          },
        }
      : {}),
    ...(sig
      ? {
          sig: {
            alg: sig.alg,
            kid: sig.kid,
            b64u: sig.b64u,
          },
        }
      : {}),
  };
}

export function toHCS27CheckpointMessage(
  value: z.output<typeof hcs27CheckpointMessageSchema>,
): HCS27CheckpointMessage {
  const { p, op, metadata, metadata_digest: metadataDigest, m } = value;
  if (!p || !op || !metadata) {
    throw new Error('Invalid HCS-27 checkpoint message');
  }

  return {
    p,
    op,
    metadata:
      typeof metadata === 'string'
        ? metadata
        : toHCS27CheckpointMetadata(metadata),
    ...(metadataDigest
      ? {
          metadata_digest: {
            alg: metadataDigest.alg,
            b64u: metadataDigest.b64u,
          },
        }
      : {}),
    ...(m ? { m } : {}),
  };
}
