import { z } from 'zod';
import {
  PollMetadata,
  PollResults,
  PollStatus,
  VoteEntry,
  pollMetadataSchema,
  pollOptionSchema,
  pollStatusSchema,
  voteEntrySchema,
} from '../hcs-9';
import type { ILogger, LogLevel } from '../utils/logger';
import type { NetworkType } from '../utils/types';
import type { MirrorNodeConfig } from '../services';

export const hcs8OperationSchema = z.enum(['register', 'manage', 'update', 'vote']);
export type Hcs8Operation = z.infer<typeof hcs8OperationSchema>;

export const sequenceInfoSchema = z
  .tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().positive(),
  ])
  .refine(([_, num, len]) => num < len, {
    message: 'Sequence num must be less than len',
  });
export type SequenceInfo = z.infer<typeof sequenceInfoSchema>;

export const hcs8BaseMessageSchema = z.object({
  p: z.literal('hcs-8'),
  op: hcs8OperationSchema,
  sid: sequenceInfoSchema.optional(),
  d: z.unknown(),
  m: z.string().optional(),
});
export type Hcs8BaseMessage = z.infer<typeof hcs8BaseMessageSchema>;

export const registerPayloadSchema = z.object({
  metadata: pollMetadataSchema,
});
export type RegisterPayload = z.infer<typeof registerPayloadSchema>;

export const manageActionSchema = z.enum(['open', 'pause', 'close', 'cancel']);
export type Hcs8ManageAction = z.infer<typeof manageActionSchema>;

export const managePayloadSchema = z.object({
  accountId: z.string().min(3, 'Manage payload requires accountId'),
  action: manageActionSchema,
});
export type ManagePayload = z.infer<typeof managePayloadSchema>;

export const updateChangeSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().max(8192).optional(),
    startDate: z.string().regex(/^[0-9]+$/).optional(),
    endDate: z.string().regex(/^[0-9]+$/).optional(),
    status: pollStatusSchema.optional(),
    options: z.array(pollOptionSchema).optional(),
    customParameters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .partial();
export type UpdateChange = z.infer<typeof updateChangeSchema>;

export const updatePayloadSchema = z.object({
  accountId: z.string().min(3, 'Update payload requires accountId'),
  change: updateChangeSchema.optional(),
});
export type UpdatePayload = z.infer<typeof updatePayloadSchema>;

export const votePayloadSchema = z.object({
  accountId: z.string().min(3, 'Vote payload requires accountId'),
  votes: z.array(voteEntrySchema).min(1),
});
export type VotePayload = z.infer<typeof votePayloadSchema>;

export type Hcs8Message<TData = unknown> = Omit<Hcs8BaseMessage, 'd'> & {
  d: TData;
};

export type Hcs8RegisterChunkMessage = Omit<Hcs8BaseMessage, 'd' | 'op'> & {
  op: 'register';
  d: string;
};

export type Hcs8RegisterMessage = Hcs8Message<RegisterPayload> & {
  op: 'register';
};
export type Hcs8ManageMessage = Hcs8Message<ManagePayload> & {
  op: 'manage';
};
export type Hcs8UpdateMessage = Hcs8Message<UpdatePayload> & {
  op: 'update';
};
export type Hcs8VoteMessage = Hcs8Message<VotePayload> & { op: 'vote' };
export type AnyHcs8Message =
  | Hcs8RegisterMessage
  | Hcs8ManageMessage
  | Hcs8UpdateMessage
  | Hcs8VoteMessage;

export interface PollState {
  metadata?: PollMetadata;
  status: PollStatus;
  results: PollResults;
  createdTimestamp?: string;
  updatedTimestamp?: string;
  operations: PollOperationRecord[];
  errors: PollError[];
}

export interface PollOperationRecord {
  operation: Hcs8Operation;
  accountId?: string;
  memo?: string;
  timestamp: string;
}

export interface PollError {
  operation: Hcs8Operation;
  reason: string;
  timestamp: string;
}

export interface ParsedTopicMessage {
  raw: string;
  timestamp: string;
  payerAccountId?: string;
  message: AnyHcs8Message;
}

export interface SequenceAssemblyContext {
  uid: number;
  op: Hcs8Operation;
  length: number;
  memo?: string;
  payloads: string[];
  authorAccountId?: string;
  firstTimestamp: string;
  lastTimestamp: string;
}

export interface PollLedgerEntry {
  accountId: string;
  votes: VoteEntry[];
  timestamp: string;
}

export interface PollLedger {
  register?: ParsedTopicMessage;
  manage: ParsedTopicMessage[];
  update: ParsedTopicMessage[];
  vote: PollLedgerEntry[];
}

export interface PollProcessingOptions {
  stopAtTimestamp?: string;
}

export interface Hcs8ClientConfig {
  network: NetworkType;
  mirrorNode?: MirrorNodeConfig;
  logger?: ILogger;
  logLevel?: LogLevel;
  silent?: boolean;
}
