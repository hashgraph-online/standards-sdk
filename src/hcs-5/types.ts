import { Logger, LogLevel } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { PrivateKey } from '@hashgraph/sdk';
import type { InscriptionOptions } from '../inscribe/types';
import type { InscriptionInput } from '../inscribe/inscriber';

/**
 * Configuration for HCS-5 client
 */
export interface HCS5ClientConfig {
  network: NetworkType;
  logLevel?: LogLevel;
  silent?: boolean;
  logger?: Logger;
  operatorId: string;
  operatorKey: string | PrivateKey;
}

/**
 * Options for minting a Hashinal onto an existing HTS NFT token
 */
export interface HCS5MintOptions {
  tokenId: string;
  metadataTopicId?: string;
  supplyKey?: string | PrivateKey;
  memo?: string;
}

/**
 * Options for inscribing content (HCS-1) then minting as a HCS-5 Hashinal
 */
export interface HCS5CreateHashinalOptions {
  tokenId: string;
  inscriptionInput: InscriptionInput;
  inscriptionOptions: InscriptionOptions & { waitForConfirmation?: boolean };
  supplyKey?: string | PrivateKey;
  memo?: string;
}

/**
 * Mint response
 */
export interface HCS5MintResponse {
  success: boolean;
  serialNumber?: number;
  transactionId?: string;
  metadata?: string;
  error?: string;
}

/**
 * Utility to build an HRL for HCS-1
 */
export function buildHcs1Hrl(topicId: string): string {
  return `hcs://1/${topicId}`;
}
