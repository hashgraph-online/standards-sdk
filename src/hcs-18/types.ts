/**
 * HCS-18 Flora Discovery Protocol Types
 * Standard for Flora discovery and formation
 */

import { TopicId } from '@hashgraph/sdk';

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
  data: any;
}

/**
 * Announce operation data
 */
export interface AnnounceData {
  account: string;
  petal: {
    name: string;
    priority: number;
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
  valid_for?: number;
}

/**
 * Propose operation data
 */
export interface ProposeData {
  proposer: string;
  members: Array<{
    account: string;
    announce_seq?: number;
    priority: number;
    status?: 'existing' | 'proposed';
  }>;
  config: {
    name: string;
    threshold: number;
    purpose?: string;
    reason?: string;
  };
  existing_flora?: string;
}

/**
 * Respond operation data
 */
export interface RespondData {
  responder: string;
  proposal_seq: number;
  decision: 'accept' | 'reject';
  reason?: string;
  accepted_seq?: number;
}

/**
 * Complete operation data
 */
export interface CompleteData {
  proposal_seq: number;
  flora_account: string;
  topics: {
    communication: string;
    transaction: string;
    state: string;
  };
  proposer?: string;
}

/**
 * Withdraw operation data
 */
export interface WithdrawData {
  account: string;
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
 * Type guard utilities for HCS-18 discovery messages
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isDiscoveryMessage(value: unknown): value is DiscoveryMessage {
  if (!isRecord(value)) {
    return false;
  }
  if (value.p !== 'hcs-18') {
    return false;
  }
  if (!isString((value as Record<string, unknown>).op)) {
    return false;
  }
  const op = (value as Record<string, unknown>).op as string;
  if (!['announce', 'propose', 'respond', 'complete', 'withdraw'].includes(op)) {
    return false;
  }
  return 'data' in value;
}

export function isAnnounceMessage(value: unknown): value is AnnounceMessage {
  if (!isDiscoveryMessage(value)) {
    return false;
  }
  const v = value as DiscoveryMessage;
  if (v.op !== DiscoveryOperation.ANNOUNCE) {
    return false;
  }
  if (!isRecord(v.data)) {
    return false;
  }
  const d = v.data as Record<string, unknown>;
  if (!isString(d.account)) {
    return false;
  }
  if (!isRecord(d.petal)) {
    return false;
  }
  const petal = d.petal as Record<string, unknown>;
  if (!isString(petal.name) || !isNumber(petal.priority)) {
    return false;
  }
  if (!isRecord(d.capabilities)) {
    return false;
  }
  const caps = d.capabilities as Record<string, unknown>;
  if (!isArrayOfStrings(caps.protocols)) {
    return false;
  }
  if (
    'valid_for' in d &&
    d.valid_for !== undefined &&
    d.valid_for !== null &&
    !isNumber(d.valid_for)
  ) {
    return false;
  }
  return true;
}

export function isProposeMessage(value: unknown): value is ProposeMessage {
  if (!isDiscoveryMessage(value)) {
    return false;
  }
  const v = value as DiscoveryMessage;
  if (v.op !== DiscoveryOperation.PROPOSE) {
    return false;
  }
  if (!isRecord(v.data)) {
    return false;
  }
  const d = v.data as Record<string, unknown>;
  if (!isString(d.proposer)) {
    return false;
  }
  if (!isArray(d.members)) {
    return false;
  }
  const membersOk = (d.members as unknown[]).every(m => {
    if (!isRecord(m)) {
      return false;
    }
    const mr = m as Record<string, unknown>;
    if (!isString(mr.account)) {
      return false;
    }
    if (!('priority' in mr) || !isNumber(mr.priority)) {
      return false;
    }
    if ('announce_seq' in mr && mr.announce_seq !== undefined && mr.announce_seq !== null && !isNumber(mr.announce_seq)) {
      return false;
    }
    return true;
  });
  if (!membersOk) {
    return false;
  }
  if (!isRecord(d.config)) {
    return false;
  }
  const cfg = d.config as Record<string, unknown>;
  if (!isString(cfg.name) || !isNumber(cfg.threshold)) {
    return false;
  }
  return true;
}

export function isRespondMessage(value: unknown): value is RespondMessage {
  if (!isDiscoveryMessage(value)) {
    return false;
  }
  const v = value as DiscoveryMessage;
  if (v.op !== DiscoveryOperation.RESPOND) {
    return false;
  }
  if (!isRecord(v.data)) {
    return false;
  }
  const d = v.data as Record<string, unknown>;
  if (!isString(d.responder)) {
    return false;
  }
  if (!isNumber(d.proposal_seq)) {
    return false;
  }
  if (!isString(d.decision)) {
    return false;
  }
  if (!['accept', 'reject'].includes(d.decision as string)) {
    return false;
  }
  return true;
}

export function isCompleteMessage(value: unknown): value is CompleteMessage {
  if (!isDiscoveryMessage(value)) {
    return false;
  }
  const v = value as DiscoveryMessage;
  if (v.op !== DiscoveryOperation.COMPLETE) {
    return false;
  }
  if (!isRecord(v.data)) {
    return false;
  }
  const d = v.data as Record<string, unknown>;
  if (!isString(d.proposer)) {
    return false;
  }
  if (!isNumber(d.proposal_seq)) {
    return false;
  }
  if (!isString(d.flora_account)) {
    return false;
  }
  if (!isRecord(d.topics)) {
    return false;
  }
  const t = d.topics as Record<string, unknown>;
  if (!isString(t.communication) || !isString(t.transaction) || !isString(t.state)) {
    return false;
  }
  return true;
}

export function isWithdrawMessage(value: unknown): value is WithdrawMessage {
  if (!isDiscoveryMessage(value)) {
    return false;
  }
  const v = value as DiscoveryMessage;
  if (v.op !== DiscoveryOperation.WITHDRAW) {
    return false;
  }
  if (!isRecord(v.data)) {
    return false;
  }
  const d = v.data as Record<string, unknown>;
  if (!isString(d.account)) {
    return false;
  }
  if (!isNumber(d.announce_seq)) {
    return false;
  }
  if ('reason' in d && d.reason !== undefined && d.reason !== null && !isString(d.reason)) {
    return false;
  }
  return true;
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
  memberPrivateKeys?: Map<string, string>;
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
