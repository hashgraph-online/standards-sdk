import { AccountId, PrivateKey, TransactionReceipt } from '@hashgraph/sdk';
import { z } from 'zod';
import { Logger, LogLevel } from '../utils/logger';
import { NetworkType } from '../utils/types';

export enum HCS7Operation {
  REGISTER_CONFIG = 'register-config',
  REGISTER = 'register',
}

export enum HCS7ConfigType {
  EVM = 'evm',
  WASM = 'wasm',
}

export type HCS7StateValueType = 'number' | 'string' | 'bool';

export interface HCS7AbiIO {
  name?: string;
  type: string;
}

export interface HCS7AbiDefinition {
  name: string;
  inputs: HCS7AbiIO[];
  outputs: HCS7AbiIO[];
  stateMutability: 'view' | 'pure';
  type: 'function';
}

export interface HCS7BaseMessage {
  p: 'hcs-7';
  op: HCS7Operation;
  m?: string;
}

export interface HCS7EvmConfigMessage extends HCS7BaseMessage {
  op: HCS7Operation.REGISTER_CONFIG;
  t: HCS7ConfigType.EVM;
  c: {
    contractAddress: string;
    abi: HCS7AbiDefinition;
  };
}

export interface HCS7WasmConfigMessage extends HCS7BaseMessage {
  op: HCS7Operation.REGISTER_CONFIG;
  t: HCS7ConfigType.WASM;
  c: {
    wasmTopicId: string;
    inputType: {
      stateData: Record<string, HCS7StateValueType>;
    };
    outputType: {
      type: 'string';
      format: 'topic-id';
    };
  };
}

export interface HCS7MetadataRegistrationMessage extends HCS7BaseMessage {
  op: HCS7Operation.REGISTER;
  t_id: string;
  d: {
    weight: number;
    tags: string[];
    [key: string]: unknown;
  };
}

export type HCS7Message =
  | HCS7EvmConfigMessage
  | HCS7WasmConfigMessage
  | HCS7MetadataRegistrationMessage;

export interface HCS7ClientConfig {
  network: NetworkType;
  logLevel?: LogLevel;
  silent?: boolean;
  mirrorNodeUrl?: string;
  logger?: Logger;
}

export interface SDKHCS7ClientConfig extends HCS7ClientConfig {
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
}

export interface HCS7TopicRegistrationResponse {
  success: boolean;
  topicId?: string;
  transactionId?: string;
  error?: string;
}

export interface HCS7RegistryOperationResponse {
  success: boolean;
  receipt?: TransactionReceipt;
  transactionId?: string;
  sequenceNumber?: number;
  error?: string;
}

export interface HCS7CreateRegistryOptions {
  ttl?: number;
  submitKey?: string | boolean | PrivateKey;
  adminKey?: string | boolean | PrivateKey;
}

export interface HCS7RegisterEvmConfigInput {
  type: HCS7ConfigType.EVM;
  contractAddress: string;
  abi: HCS7AbiDefinition;
}

export interface HCS7RegisterWasmConfigInput {
  type: HCS7ConfigType.WASM;
  wasmTopicId: string;
  inputType: {
    stateData: Record<string, HCS7StateValueType>;
  };
  outputType: {
    type: 'string';
    format: 'topic-id';
  };
}

export type HCS7RegisterConfigInput =
  | HCS7RegisterEvmConfigInput
  | HCS7RegisterWasmConfigInput;

export interface HCS7RegisterConfigOptions {
  registryTopicId: string;
  memo?: string;
  transactionMemo?: string;
  submitKey?: string | PrivateKey;
  config: HCS7RegisterConfigInput;
}

export interface HCS7RegisterMetadataOptions {
  registryTopicId: string;
  metadataTopicId: string;
  memo?: string;
  weight: number;
  tags: string[];
  transactionMemo?: string;
  submitKey?: string | PrivateKey;
  data?: Record<string, unknown>;
}

export interface HCS7RegistryEntry<TMessage extends HCS7Message = HCS7Message> {
  sequenceNumber: number;
  timestamp: string;
  payer: string;
  message: TMessage;
}

export interface HCS7RegistryTopic {
  topicId: string;
  ttl?: number;
  entries: HCS7RegistryEntry[];
}

export interface HCS7QueryRegistryOptions {
  limit?: number;
  order?: 'asc' | 'desc';
  next?: string;
}

const abiIOSchema = z.object({
  name: z.string().optional(),
  type: z.string(),
});

const abiSchema = z.object({
  name: z.string(),
  inputs: z.array(abiIOSchema),
  outputs: z.array(abiIOSchema),
  stateMutability: z.enum(['view', 'pure']),
  type: z.literal('function'),
});

const stateValueSchema = z.enum(['number', 'string', 'bool']);

const baseMessageSchema = z.object({
  p: z.literal('hcs-7'),
  m: z.string().optional(),
});

const evmMessageSchema = baseMessageSchema.extend({
  op: z.literal(HCS7Operation.REGISTER_CONFIG),
  t: z.literal(HCS7ConfigType.EVM),
  c: z.object({
    contractAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'),
    abi: abiSchema,
  }),
});

const wasmMessageSchema = baseMessageSchema.extend({
  op: z.literal(HCS7Operation.REGISTER_CONFIG),
  t: z.literal(HCS7ConfigType.WASM),
  c: z.object({
    wasmTopicId: z.string(),
    inputType: z.object({
      stateData: z.record(stateValueSchema),
    }),
    outputType: z.object({
      type: z.literal('string'),
      format: z.literal('topic-id'),
    }),
  }),
});

const metadataMessageSchema = baseMessageSchema.extend({
  op: z.literal(HCS7Operation.REGISTER),
  t_id: z.string(),
  d: z
    .object({
      weight: z.number(),
      tags: z.array(z.string()).nonempty(),
    })
    .catchall(z.unknown()),
});

export const hcs7MessageSchema = z.union([
  evmMessageSchema,
  wasmMessageSchema,
  metadataMessageSchema,
]);
