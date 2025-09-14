import {
  Client,
  AccountId,
  PublicKey,
  KeyList,
  TransactionReceipt,
} from '@hashgraph/sdk';
import type { NetworkType } from '../utils/types';
import type { Logger } from '../utils/logger';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import { HederaMirrorNode } from '../services/mirror-node';
import { HCS16BaseClient } from './base-client';
import {
  buildHcs16CreateFloraTopicTx,
  buildHcs16FloraCreatedTx,
  buildHcs16TxProposalTx,
  buildHcs16StateUpdateTx,
} from './tx';
import { FloraTopicType } from './types';

export interface HCS16ClientConfig {
  network: NetworkType;
  operatorId: string;
  operatorKey: string;
  keyType?: 'ecdsa' | 'ed25519';
  logger?: Logger;
}

/**
 * Node SDK client for HCS‑16 Flora operations.
 */
export class HCS16Client extends HCS16BaseClient {
  private readonly client: Client;
  private readonly operatorId: AccountId;
  private readonly operatorCtx: NodeOperatorContext;

  constructor(config: HCS16ClientConfig) {
    super({ network: config.network, logger: config.logger });
    this.operatorId = AccountId.fromString(config.operatorId);
    const mirror = new HederaMirrorNode(config.network, this.logger);
    this.operatorCtx = createNodeOperatorContext({
      network: config.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: mirror,
      logger: this.logger,
      client:
        config.network === 'mainnet'
          ? Client.forMainnet()
          : Client.forTestnet(),
    });
    this.client = this.operatorCtx.client;
  }

  /**
   * Create a Flora topic with memo `hcs-16:<floraAccountId>:<topicType>`.
   */
  async createFloraTopic(params: {
    floraAccountId: string;
    topicType: FloraTopicType;
    adminKey?: PublicKey | KeyList;
    submitKey?: PublicKey | KeyList;
    autoRenewAccountId?: string;
  }): Promise<string> {
    const tx = buildHcs16CreateFloraTopicTx({
      floraAccountId: params.floraAccountId,
      topicType: params.topicType,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      operatorPublicKey: this.client.operatorPublicKey || undefined,
      autoRenewAccountId: params.autoRenewAccountId,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    if (!receipt.topicId) {
      throw new Error('Failed to create Flora topic');
    }
    return receipt.topicId.toString();
  }

  async sendFloraCreated(params: {
    topicId: string;
    operatorId: string;
    floraAccountId: string;
    topics: { communication: string; transaction: string; state: string };
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16FloraCreatedTx(params);
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  async sendTxProposal(params: {
    topicId: string;
    operatorId: string;
    scheduledTxId: string;
    description?: string;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16TxProposalTx(params);
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  async sendStateUpdate(params: {
    topicId: string;
    operatorId: string;
    hash: string;
    epoch?: number;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16StateUpdateTx(params);
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }
}
