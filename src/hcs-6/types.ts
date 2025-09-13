import { Logger, LogLevel } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { TransactionReceipt, PrivateKey } from '@hashgraph/sdk';
import { z } from 'zod';
import { HCS2Operation, HCS2RegistryType } from '../hcs-2/types';

/**
 * HCS-6 specific operation types (extends HCS-2 operations)
 * HCS-6 only supports 'register' operations for non-indexed topics
 */
export enum HCS6Operation {
  REGISTER = 'register',
}

/**
 * HCS-6 registry type (always non-indexed for dynamic hashinals)
 */
export enum HCS6RegistryType {
  NON_INDEXED = 1,
}

/**
 * Base HCS-6 message format (extends HCS-2 with HCS-6 specific constraints)
 */
export interface HCS6Message {
  p: 'hcs-6';
  op: HCS6Operation;
  t_id?: string;
  m?: string;
}

/**
 * Register operation message for HCS-6
 */
export interface HCS6RegisterMessage extends HCS6Message {
  op: HCS6Operation.REGISTER;
  t_id: string;
}

/**
 * Configuration for HCS-6 client
 */
export interface HCS6ClientConfig {
  network: NetworkType;
  logLevel?: LogLevel;
  silent?: boolean;
  mirrorNodeUrl?: string;
  logger?: Logger;
}

/**
 * Response from HCS-6 topic registration
 */
export interface HCS6TopicRegistrationResponse {
  success: boolean;
  topicId?: string;
  transactionId?: string;
  error?: string;
}

/**
 * Response from HCS-6 registry operation
 */
export interface HCS6RegistryOperationResponse {
  success: boolean;
  transactionId?: string;
  receipt?: TransactionReceipt;
  error?: string;
  sequenceNumber?: number;
}

/**
 * HCS-6 registry entry information
 */
export interface HCS6RegistryEntry {
  topicId: string;
  sequence: number;
  timestamp: string;
  payer: string;
  message: HCS6Message;
  consensus_timestamp: string;
  registry_type: HCS6RegistryType;
}

/**
 * HCS-6 topic registry information
 */
export interface HCS6TopicRegistry {
  topicId: string;
  registryType: HCS6RegistryType;
  ttl: number;
  entries: HCS6RegistryEntry[];
  latestEntry?: HCS6RegistryEntry;
}

/**
 * Options for creating a new HCS-6 registry (dynamic hashinal topic)
 */
export interface HCS6CreateRegistryOptions {
  ttl?: number;
  submitKey?: string | boolean | PrivateKey;
}

/**
 * Options for registering a dynamic hashinal update
 */
export interface HCS6RegisterEntryOptions {
  targetTopicId: string;
  memo?: string;
}

/**
 * Options for querying HCS-6 registry entries
 */
export interface HCS6QueryRegistryOptions {
  limit?: number;
  order?: 'asc' | 'desc';
  skip?: number;
}

/**
 * Options for creating a dynamic hashinal with inscription
 */
export interface HCS6CreateHashinalOptions {
  metadata: Record<string, unknown>;
  memo?: string;
  ttl?: number;
  inscriptionOptions?: Record<string, unknown>;
  registryTopicId?: string;
  submitKey?: string | PrivateKey;
}

/**
 * Options for the register method that combines createHashinal and registerEntry
 */
export interface HCS6RegisterOptions {
  metadata: Record<string, unknown>;
  data?: {
    base64?: string;
    url?: string;
    mimeType?: string;
  };
  memo?: string;
  ttl?: number;
  inscriptionOptions?: Record<string, unknown>;
  registryTopicId?: string;
  submitKey?: string | PrivateKey;
}

/**
 * Response from creating a dynamic hashinal
 */
export interface HCS6CreateHashinalResponse {
  success: boolean;
  registryTopicId?: string;
  inscriptionTopicId?: string;
  transactionId?: string;
  error?: string;
}

/**
 * Options for minting an HTS NFT that references an HCS-6 topic via HRL
 */
export interface HCS6MintOptions {
  tokenId: string;
  metadataTopicId?: string;
  supplyKey?: string | PrivateKey;
  memo?: string;
}

/**
 * Options for inscribing content then minting a HCS-6 Hashinal in one flow
 */
export interface HCS6InscribeAndMintOptions {
  tokenId: string;
  inscriptionInput:
    | {
        type: 'buffer';
        buffer: Buffer | ArrayBuffer;
        fileName: string;
        mimeType?: string;
      }
    | {
        type: 'url';
        url: string;
      };
  inscriptionOptions?: Record<string, unknown>;
  supplyKey?: string | PrivateKey;
  memo?: string;
}

/**
 * Response from minting an HTS NFT with HCS-6 HRL metadata
 */
export interface HCS6MintResponse {
  success: boolean;
  serialNumber?: number;
  transactionId?: string;
  metadata?: string;
  error?: string;
}

/**
 * Build an HRL for HCS-6 dynamic hashinals
 */
export function buildHcs6Hrl(topicId: string): string {
  return `hcs://6/${topicId}`;
}

/**
 * Zod schemas for HCS-6 message validation
 */
export const hcs6TopicIdSchema = z.string().regex(/^\d+\.\d+\.\d+$/, {
  message: "Topic ID must be in Hedera format (e.g., '0.0.123456')",
});
export const hcs6BaseMessageSchema = z.object({
  p: z.literal('hcs-6'),
  op: z.enum([HCS6Operation.REGISTER]),
  m: z.string().max(500, 'Memo must not exceed 500 characters').optional(),
});
export const hcs6RegisterMessageSchema = hcs6BaseMessageSchema.extend({
  op: z.literal(HCS6Operation.REGISTER),
  t_id: hcs6TopicIdSchema,
});
export const hcs6MessageSchema = z.discriminatedUnion('op', [
  hcs6RegisterMessageSchema,
]);

/**
 * Validation function for HCS-6 TTL
 * @param ttl The TTL value to validate
 * @returns True if valid, false otherwise
 */
export function validateHCS6TTL(ttl: number): boolean {
  return ttl >= 3600;
}

/**
 * Validation function for HCS-6 registry memo format
 * @param memo The topic memo to validate
 * @returns True if valid, false otherwise
 */
export function validateHCS6RegistryMemo(memo: string): boolean {
  const regex = /^hcs-6:(\d):(\d+)$/;
  const match = memo.match(regex);

  if (!match) {
    return false;
  }

  const registryType = parseInt(match[1]);
  const ttl = parseInt(match[2]);
  if (registryType !== HCS6RegistryType.NON_INDEXED) {
    return false;
  }
  return validateHCS6TTL(ttl);
}

/**
 * Generate HCS-6 registry memo format
 * @param ttl The time-to-live in seconds
 * @returns The memo string
 */
export function generateHCS6RegistryMemo(ttl: number): string {
  if (!validateHCS6TTL(ttl)) {
    throw new Error('TTL must be at least 3600 seconds (1 hour)');
  }
  return `hcs-6:1:${ttl}`;
}
