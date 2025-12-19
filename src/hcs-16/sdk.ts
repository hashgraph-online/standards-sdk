import {
  Client,
  AccountId,
  PublicKey,
  KeyList,
  TransactionReceipt,
  Hbar,
  ScheduleSignTransaction,
  PrivateKey,
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
  buildHcs16TransactionTx,
  buildHcs16StateUpdateTx,
} from './tx';
import { FloraTopicType } from './types';
import {
  buildHcs16FloraJoinRequestTx,
  buildHcs16FloraJoinVoteTx,
  buildHcs16FloraJoinAcceptedTx,
  buildHcs16CreateAccountTx,
} from './tx';

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

  /**
   * Send HCS-16 transaction (preferred). scheduleId is the ScheduleId entity (e.g., 0.0.12345).
   */
  async sendTransaction(params: {
    topicId: string;
    operatorId: string;
    scheduleId: string;
    data?: string;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16TransactionTx(params);
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  /**
   * Sign a scheduled transaction by ScheduleId entity using provided signer key (PrivateKey).
   * The signer must be a valid member key for the scheduled transaction to count toward threshold.
   */
  async signSchedule(params: {
    scheduleId: string;
    signerKey: PrivateKey;
  }): Promise<TransactionReceipt> {
    const tx = await new ScheduleSignTransaction()
      .setScheduleId(params.scheduleId)
      .freezeWith(this.client);
    const signed = await tx.sign(params.signerKey);
    const resp = await signed.execute(this.client);
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

  async sendFloraJoinRequest(params: {
    topicId: string;
    operatorId: string;
    accountId: string;
    connectionRequestId: number;
    connectionTopicId: string;
    connectionSeq: number;
    signerKey?: PrivateKey;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16FloraJoinRequestTx(params);
    if (params.signerKey) {
      const frozen = await tx.freezeWith(this.client);
      const signed = await frozen.sign(params.signerKey);
      const resp = await signed.execute(this.client);
      return resp.getReceipt(this.client);
    }
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  async sendFloraJoinVote(params: {
    topicId: string;
    operatorId: string;
    accountId: string;
    approve: boolean;
    connectionRequestId: number;
    connectionSeq: number;
    signerKey?: PrivateKey;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16FloraJoinVoteTx(params);
    if (params.signerKey) {
      const frozen = await tx.freezeWith(this.client);
      const signed = await frozen.sign(params.signerKey);
      const resp = await signed.execute(this.client);
      return resp.getReceipt(this.client);
    }
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  async sendFloraJoinAccepted(params: {
    topicId: string;
    operatorId: string;
    members: string[];
    epoch?: number;
    signerKeys?: PrivateKey[];
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16FloraJoinAcceptedTx(params);
    if (params.signerKeys && params.signerKeys.length > 0) {
      const frozen = await tx.freezeWith(this.client);
      let signed = frozen;
      for (const key of params.signerKeys) {
        signed = await signed.sign(key);
      }
      const resp = await signed.execute(this.client);
      return resp.getReceipt(this.client);
    }
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  /**
   * Resolve member public keys from Mirror Node and build a KeyList with the given threshold.
   */
  async assembleKeyList(params: {
    members: string[];
    threshold: number;
  }): Promise<KeyList> {
    return super.assembleKeyList(params);
  }

  /**
   * Create a Flora account with a threshold KeyList, then create the three Flora topics.
   * Returns the Flora account ID and the topic IDs.
   */
  async createFloraAccountWithTopics(params: {
    members: string[];
    threshold: number;
    initialBalanceHbar?: number;
    autoRenewAccountId?: string;
  }): Promise<{
    floraAccountId: string;
    topics: { communication: string; transaction: string; state: string };
  }> {
    const keyList = await this.assembleKeyList({
      members: params.members,
      threshold: params.threshold,
    });
    const submitList = await this.assembleSubmitKeyList(params.members);

    const createAcc = buildHcs16CreateAccountTx({
      keyList,
      initialBalanceHbar:
        typeof params.initialBalanceHbar === 'number'
          ? params.initialBalanceHbar
          : 5,
      maxAutomaticTokenAssociations: -1,
    });
    const accResp = await createAcc.execute(this.client);
    const accReceipt = await accResp.getReceipt(this.client);
    if (!accReceipt.accountId) {
      throw new Error('Failed to create Flora account');
    }
    const floraAccountId = accReceipt.accountId.toString();

    const {
      communication: commTx,
      transaction: trnTx,
      state: stateTx,
    } = this.buildFloraTopicCreateTxs({
      floraAccountId,
      keyList,
      submitList,
      autoRenewAccountId: params.autoRenewAccountId,
    });

    const commR = await commTx
      .execute(this.client)
      .then(r => r.getReceipt(this.client));
    const trnR = await trnTx
      .execute(this.client)
      .then(r => r.getReceipt(this.client));
    const stateR = await stateTx
      .execute(this.client)
      .then(r => r.getReceipt(this.client));
    const topics = {
      communication: commR.topicId!.toString(),
      transaction: trnR.topicId!.toString(),
      state: stateR.topicId!.toString(),
    };
    return { floraAccountId, topics };
  }

  /**
   * Convenience: publish flora_created on the communication topic.
   */
  async publishFloraCreated(params: {
    communicationTopicId: string;
    operatorId: string;
    floraAccountId: string;
    topics: { communication: string; transaction: string; state: string };
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16FloraCreatedTx({
      topicId: params.communicationTopicId,
      operatorId: params.operatorId,
      floraAccountId: params.floraAccountId,
      topics: params.topics,
    });
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }
}
