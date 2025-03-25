import {
  StartInscriptionRequest,
  InscriptionResult,
  RetrievedInscriptionResult as SDKRetrievedInscriptionResult,
  HederaClientConfig,
  InscriptionNumbersParams,
  InscriptionNumberDetails,
} from '@kiloscribe/inscription-sdk';
import { LoggerOptions, LogLevel } from '../utils/logger';
import { RegistrationProgressCallback } from '../hcs-10/types.d';

export type {
  StartInscriptionRequest,
  InscriptionResult,
  InscriptionNumbersParams,
  InscriptionNumberDetails,
};

export interface RetrievedInscriptionResult
  extends SDKRetrievedInscriptionResult {
  content?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  message?: string;
}

export type { HederaClientConfig };

export interface AuthConfig {
  accountId: string;
  privateKey: string;
  network?: 'mainnet' | 'testnet';
}

export interface AuthResult {
  token: string;
  expiresAt: number;
}

export interface InscriptionSDKOptions {
  apiKey?: string;
  network?: 'mainnet' | 'testnet';
}

export interface InscriptionOptions {
  mode?: 'file' | 'upload' | 'hashinal' | 'hashinal-collection';
  waitForConfirmation?: boolean;
  waitMaxAttempts?: number;
  waitIntervalMs?: number;
  apiKey?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  jsonFileURL?: string;
  chunkSize?: number;
  logging?: {
    level?: LogLevel;
  };
  progressCallback?: RegistrationProgressCallback;
  network?: 'mainnet' | 'testnet';
}

export interface TextInscriptionOptions extends InscriptionOptions {
  contentType?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface FileInscriptionOptions extends InscriptionOptions {
  contentType?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  chunkSize?: number;
}

export interface UrlInscriptionOptions extends InscriptionOptions {
  metadata?: Record<string, unknown> & {
    name?: string;
    description?: string;
    tags?: string[];
  };
  tags?: string[];
  maxFileSize?: number;
}

export interface HashinalInscriptionOptions extends InscriptionOptions {
  metadata: {
    name: string;
    creator: string;
    description: string;
    image?: string;
    type: string;
    attributes?: Array<{
      trait_type: string;
      value: string | number;
    }>;
    properties?: Record<string, unknown>;
    tags?: string[];
    [key: string]: unknown;
  };
  jsonFileURL?: string;
  chunkSize?: number;
}
