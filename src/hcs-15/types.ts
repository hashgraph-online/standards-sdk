/**
 * HCS-15 Petal Account Structure Types
 */

import { PrivateKey, PublicKey, AccountId } from '@hashgraph/sdk';
import { PersonalProfile, AIAgentProfile, MCPServerProfile, ProfileType } from '../hcs-11/types';
import { AgentBuilder, PersonBuilder, MCPServerBuilder } from '../hcs-11';

export interface PetalConfig {
  baseAccountId: string;
  basePrivateKey: string;
  displayName: string;
  alias?: string;
  bio?: string;
  profileType: ProfileType;
  initialBalance?: number;
  maxAutomaticTokenAssociations?: number;
  stateTopicId?: string;
}

export interface PetalAccount {
  accountId: AccountId;
  baseAccountId: string;
  privateKey: PrivateKey;
  publicKey: PublicKey;
  profileTopicId: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  stateTopicId?: string;
}

export type PetalProfile = (PersonalProfile | AIAgentProfile | MCPServerProfile) & {
  base_account: string;
};

export interface PetalCreationResult {
  petalAccount: PetalAccount;
  transactionId: string;
  profileTopicId: string;
}

export type ProfileBuilder = AgentBuilder | PersonBuilder | MCPServerBuilder;

export interface PetalCreationOptions {
  baseAccountId: string;
  basePrivateKey: string;
  initialBalance?: number;
  maxAutomaticTokenAssociations?: number;
  ttl?: number;
}