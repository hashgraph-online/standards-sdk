/**
 * DID issuance adapters for HCS-14.
 */

import type { AdapterMeta } from '../adapters/types';
import type { Client as HederaClient } from '@hashgraph/sdk';

export type DidMethod = 'hedera' | string;

export interface DidIssueRequestHedera {
  method: 'hedera';
  client: HederaClient;
}

/**
 * Generic fallback for other DID methods contributed by adapters.
 */
export interface GenericDidIssueRequest {
  method: string;
  [key: string]: unknown;
}

export type DidIssueRequest = DidIssueRequestHedera | GenericDidIssueRequest;

export interface DidIssuer {
  /** Metadata describing supported methods and networks. */
  readonly meta: AdapterMeta;
  supports(method: DidMethod): boolean;
  issue(request: DidIssueRequest): Promise<string>;
}

export interface IssuerRegistryApi {
  register(issuer: DidIssuer): void;
  /** Return a snapshot of registered issuers. */
  list(): DidIssuer[];
  issue(request: DidIssueRequest): Promise<string>;
}
