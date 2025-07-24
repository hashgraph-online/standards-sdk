/**
 * HCS-18 Flora Discovery Protocol Types
 * Standard for Flora discovery and formation
 */

import { AccountId, TopicId, PublicKey } from '@hashgraph/sdk';

/**
 * HCS-18 Operation types
 */
export enum DiscoveryOperation {
  ANNOUNCE = 'announce',
  PROPOSE = 'propose',
  RESPOND = 'respond',
  COMPLETE = 'complete',
  WITHDRAW = 'withdraw',
}

/**
 * Base HCS-18 message structure
 */
export interface DiscoveryMessage {
  p: 'hcs-18';
  op: DiscoveryOperation;
  data: any; // Operation-specific data
}

/**
 * Announce operation data
 */
export interface AnnounceData {
  account: string; // Account ID of the announcing Petal
  petal: {
    name: string;
    priority: number; // 0-1000, higher = preferred for Flora coordination
  };
  capabilities: {
    protocols: string[];
    resources?: {
      compute?: 'high' | 'medium' | 'low';
      storage?: 'high' | 'medium' | 'low';
      bandwidth?: 'high' | 'medium' | 'low';
    };
    group_preferences?: {
      sizes?: number[];
      threshold_ratios?: number[];
    };
  };
  valid_for?: number; // Number of HCS messages this announcement remains valid
}

/**
 * Propose operation data
 */
export interface ProposeData {
  proposer: string; // Account ID of the proposing Petal
  members: Array<{
    account: string;
    announce_seq?: number; // Required for new members
    priority: number;
    status?: 'existing' | 'proposed';
  }>;
  config: {
    name: string;
    threshold: number;
    purpose?: string;
    reason?: string; // For replacements
  };
  existing_flora?: string; // For member replacement
}

/**
 * Respond operation data
 */
export interface RespondData {
  responder: string; // Account ID of the responding Petal
  proposal_seq: number;
  decision: 'accept' | 'reject';
  reason?: string;
  accepted_seq?: number; // When rejecting due to conflict
}

/**
 * Complete operation data
 */
export interface CompleteData {
  proposer: string; // Account ID of the original proposer
  proposal_seq: number;
  flora_account: string;
  topics: {
    communication: string;
    transaction: string;
    state: string;
  };
}

/**
 * Withdraw operation data
 */
export interface WithdrawData {
  account: string; // Account ID of the withdrawing Petal
  announce_seq: number;
  reason?: string;
}

/**
 * Typed message operations
 */
export interface AnnounceMessage extends DiscoveryMessage {
  op: DiscoveryOperation.ANNOUNCE;
  data: AnnounceData;
}

export interface ProposeMessage extends DiscoveryMessage {
  op: DiscoveryOperation.PROPOSE;
  data: ProposeData;
}

export interface RespondMessage extends DiscoveryMessage {
  op: DiscoveryOperation.RESPOND;
  data: RespondData;
}

export interface CompleteMessage extends DiscoveryMessage {
  op: DiscoveryOperation.COMPLETE;
  data: CompleteData;
}

export interface WithdrawMessage extends DiscoveryMessage {
  op: DiscoveryOperation.WITHDRAW;
  data: WithdrawData;
}

/**
 * Discovery phase states
 */
export enum DiscoveryState {
  IDLE = 'idle',
  ANNOUNCED = 'announced',
  PROPOSING = 'proposing',
  FORMING = 'forming',
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn',
}

/**
 * Tracked announcement with HCS metadata
 */
export interface TrackedAnnouncement {
  account: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  data: AnnounceData;
}

/**
 * Tracked proposal with HCS metadata
 */
export interface TrackedProposal {
  sequenceNumber: number;
  consensusTimestamp: string;
  proposer: string;
  data: ProposeData;
  responses: Map<string, RespondData>;
}

/**
 * Flora formation result
 */
export interface FloraFormation {
  proposalSeq: number;
  floraAccountId: string;
  topics: {
    communication: string;
    transaction: string;
    state: string;
  };
  members: Array<{
    account: string;
    priority: number;
  }>;
  threshold: number;
  createdAt: Date;
}

/**
 * Discovery event types for monitoring
 */
export interface DiscoveryEvent {
  type: 'announcement_received' | 'proposal_received' | 'response_received' | 
        'formation_complete' | 'withdrawal_received' | 'discovery_timeout';
  sequenceNumber?: number;
  timestamp: Date;
  data: any;
}

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  discoveryTopicId: string | TopicId;
  accountId: string;
  petalName: string;
  priority: number;
  capabilities: {
    protocols: string[];
    resources?: AnnounceData['capabilities']['resources'];
    group_preferences?: AnnounceData['capabilities']['group_preferences'];
  };
  autoAcceptFilter?: (proposal: TrackedProposal) => boolean;
  onDiscoveryEvent?: (event: DiscoveryEvent) => void;
  memberPrivateKeys?: Map<string, string>; // Map of accountId -> privateKey for Flora creation
}

/**
 * HCS-18 Errors
 */
export class DiscoveryError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

export const DiscoveryErrorCodes = {
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  TIMEOUT: 'TIMEOUT',
  INSUFFICIENT_PETALS: 'INSUFFICIENT_PETALS',
  FLORA_CREATION_FAILED: 'FLORA_CREATION_FAILED',
  ALREADY_IN_DISCOVERY: 'ALREADY_IN_DISCOVERY',
  INVALID_STATE: 'INVALID_STATE',
} as const;