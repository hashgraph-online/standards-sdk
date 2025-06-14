import { LogLevel } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { HederaMirrorNode } from '../services/mirror-node';
import { TransactionReceipt } from '@hashgraph/sdk';
import { z } from 'zod';

/**
 * HCS-2 operation types
 * - register: Add a new entry/version
 * - update: Modify a previous entry (indexed topics only)
 * - delete: Remove an entry by uid (indexed topics only)
 * - migrate: Move a topic to a new one
 */
export enum HCS2Operation {
  REGISTER = 'register',
  UPDATE = 'update',
  DELETE = 'delete',
  MIGRATE = 'migrate'
}

/**
 * HCS-2 registry type
 * - 0: Indexed registry - All records are considered for processing
 * - 1: Non-indexed registry - Only the latest message is considered
 */
export enum HCS2RegistryType {
  INDEXED = 0,
  NON_INDEXED = 1
}

/**
 * Base HCS-2 message format
 */
export interface HCS2Message {
  p: string; // Protocol (always "hcs-2")
  op: HCS2Operation; // Operation
  t_id?: string; // Target Topic ID (for register, update, migrate)
  uid?: string; // Unique ID/Sequence number (for update, delete)
  metadata?: string; // Metadata URI (HIP-412 format)
  m?: string; // Memo (max 500 chars)
  ttl?: number; // Time to live (in seconds, optional override)
}

/**
 * Register operation message
 */
export interface HCS2RegisterMessage extends HCS2Message {
  op: HCS2Operation.REGISTER;
  t_id: string;
}

/**
 * Update operation message
 */
export interface HCS2UpdateMessage extends HCS2Message {
  op: HCS2Operation.UPDATE;
  uid: string;
  t_id: string;
}

/**
 * Delete operation message
 */
export interface HCS2DeleteMessage extends HCS2Message {
  op: HCS2Operation.DELETE;
  uid: string;
}

/**
 * Migrate operation message
 */
export interface HCS2MigrateMessage extends HCS2Message {
  op: HCS2Operation.MIGRATE;
  t_id: string;
}

/**
 * Configuration for HCS-2 client
 */
export interface HCS2ClientConfig {
  network: NetworkType;
  logLevel?: LogLevel;
  silent?: boolean;
  mirrorNodeUrl?: string;
}

/**
 * Response from topic registration
 */
export interface TopicRegistrationResponse {
  success: boolean;
  topicId?: string;
  transactionId?: string;
  error?: string;
}

/**
 * Response from a registry operation
 */
export interface RegistryOperationResponse {
  success: boolean;
  transactionId?: string;
  receipt?: TransactionReceipt;
  error?: string;
  sequenceNumber?: number;
}

/**
 * Registry entry information
 */
export interface RegistryEntry {
  topicId: string;
  sequence: number;
  timestamp: string;
  payer: string;
  message: HCS2Message;
  consensus_timestamp: string;
  registry_type: HCS2RegistryType;
}

/**
 * Topic registry information
 */
export interface TopicRegistry {
  topicId: string;
  registryType: HCS2RegistryType;
  ttl: number;
  entries: RegistryEntry[];
  latestEntry?: RegistryEntry;
}

/**
 * Options for creating a new registry
 */
export interface CreateRegistryOptions {
  memo?: string;
  ttl?: number;
  adminKey?: boolean;
  submitKey?: boolean;
  registryType?: HCS2RegistryType;
}

/**
 * Options for registering a topic entry
 */
export interface RegisterEntryOptions {
  targetTopicId: string;
  metadata?: string;
  memo?: string;
}

/**
 * Options for updating a topic entry
 */
export interface UpdateEntryOptions {
  targetTopicId: string;
  uid: string;
  metadata?: string;
  memo?: string;
}

/**
 * Options for deleting a topic entry
 */
export interface DeleteEntryOptions {
  uid: string;
  memo?: string;
}

/**
 * Options for migrating a topic
 */
export interface MigrateTopicOptions {
  targetTopicId: string;
  metadata?: string;
  memo?: string;
}

/**
 * Options for querying registry entries
 */
export interface QueryRegistryOptions {
  limit?: number;
  order?: 'asc' | 'desc';
  skip?: number;
}

/**
 * Zod schemas for HCS-2 message validation
 */

// Topic ID validation (e.g., "0.0.123456")
export const topicIdSchema = z.string().regex(/^\d+\.\d+\.\d+$/, {
  message: "Topic ID must be in Hedera format (e.g., '0.0.123456')"
});

// Base HCS-2 message schema
export const baseMessageSchema = z.object({
  p: z.literal('hcs-2'),
  op: z.enum([
    HCS2Operation.REGISTER, 
    HCS2Operation.UPDATE, 
    HCS2Operation.DELETE, 
    HCS2Operation.MIGRATE
  ]),
  m: z.string().max(500, "Memo must not exceed 500 characters").optional(),
  ttl: z.number().int().positive().optional()
});

// Register message schema
export const registerMessageSchema = baseMessageSchema.extend({
  op: z.literal(HCS2Operation.REGISTER),
  t_id: topicIdSchema,
  metadata: z.string().optional()
});

// Update message schema
export const updateMessageSchema = baseMessageSchema.extend({
  op: z.literal(HCS2Operation.UPDATE),
  uid: z.string(),
  t_id: topicIdSchema,
  metadata: z.string().optional()
});

// Delete message schema
export const deleteMessageSchema = baseMessageSchema.extend({
  op: z.literal(HCS2Operation.DELETE),
  uid: z.string()
});

// Migrate message schema
export const migrateMessageSchema = baseMessageSchema.extend({
  op: z.literal(HCS2Operation.MIGRATE),
  t_id: topicIdSchema,
  metadata: z.string().optional()
});

// Combined schema for all message types
export const hcs2MessageSchema = z.discriminatedUnion("op", [
  registerMessageSchema,
  updateMessageSchema,
  deleteMessageSchema,
  migrateMessageSchema
]); 