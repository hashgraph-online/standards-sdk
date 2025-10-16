import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import type { PublicKey, KeyList } from '@hashgraph/sdk';
import { ScheduleSignTransaction } from '@hashgraph/sdk';
import {
  buildHcs16CreateFloraTopicTx,
  buildHcs16FloraCreatedTx,
  buildHcs16TransactionTx,
  buildHcs16StateUpdateTx,
  buildHcs16StateHashTx,
  buildHcs16FloraJoinRequestTx,
  buildHcs16FloraJoinVoteTx,
  buildHcs16FloraJoinAcceptedTx,
  buildHcs16CreateAccountTx,
  buildHcs16ScheduleAccountKeyUpdateTx,
  buildHcs16ScheduleTopicKeyUpdateTx,
  buildHcs16ScheduleAccountDeleteTx,
} from './tx';
import { FloraTopicType } from './types';
import { HCS16BaseClient } from './base-client';

export interface HCS16BrowserClientConfig {
  network: 'testnet' | 'mainnet';
  hwc?: HashinalsWalletConnectSDK;
  signer?: DAppSigner;
}

/**
 * Browser client for HCS‑16 operations using a DAppSigner.
 */
export class HCS16BrowserClient extends HCS16BaseClient {
  private readonly hwc?: HashinalsWalletConnectSDK;
  private readonly signer?: DAppSigner;

  constructor(config: HCS16BrowserClientConfig) {
    super({ network: config.network });
    this.hwc = config.hwc;
    this.signer = config.signer;
  }

  private ensureConnected(): string {
    if (
      this.signer &&
      typeof (this.signer as DAppSigner).getAccountId === 'function'
    ) {
      return (this.signer as DAppSigner).getAccountId().toString();
    }
    const info = this.hwc?.getAccountInfo?.();
    const accountId = info?.accountId;
    if (!accountId) {
      throw new Error('No active wallet connection');
    }
    return accountId;
  }

  /** Create schedule to update Flora account KeyList (membership change) using wallet signer. */
  async scheduleAccountKeyUpdate(params: {
    floraAccountId: string;
    newKeyList: KeyList;
    memo?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16ScheduleAccountKeyUpdateTx({
      floraAccountId: params.floraAccountId,
      newKeyList: params.newKeyList,
      memo: params.memo,
    });
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /** Create schedule to update topic keys using wallet signer. */
  async scheduleTopicKeyUpdate(params: {
    topicId: string;
    adminKey?: PublicKey | KeyList;
    submitKey?: PublicKey | KeyList;
    memo?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16ScheduleTopicKeyUpdateTx({
      topicId: params.topicId,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      memo: params.memo,
    });
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /** Schedule Flora account deletion. */
  async scheduleFloraDeletion(params: {
    floraAccountId: string;
    transferAccountId: string;
    memo?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16ScheduleAccountDeleteTx({
      floraAccountId: params.floraAccountId,
      transferAccountId: params.transferAccountId,
      memo: params.memo,
    });
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }
  private getSigner(): DAppSigner {
    if (this.signer) {
      return this.signer;
    }
    this.ensureConnected();
    const s = this.hwc?.dAppConnector?.signers?.[0];
    if (!s) {
      throw new Error('No active wallet signer');
    }
    return s as unknown as DAppSigner;
  }

  async createFloraTopic(params: {
    floraAccountId: string;
    topicType: FloraTopicType;
    adminKey?: PublicKey | KeyList;
    submitKey?: PublicKey | KeyList;
    autoRenewAccountId?: string;
  }): Promise<string> {
    this.ensureConnected();
    const signer = this.getSigner();
    const tx = buildHcs16CreateFloraTopicTx({
      floraAccountId: params.floraAccountId,
      topicType: params.topicType,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      autoRenewAccountId: params.autoRenewAccountId,
    });
    const frozen = await tx.freezeWithSigner(signer);
    const res = await frozen.executeWithSigner(signer);
    const receipt = await res.getReceiptWithSigner(signer);
    const topicId = receipt?.topicId?.toString?.() || '';
    return topicId;
  }

  async sendFloraCreated(params: {
    topicId: string;
    operatorId: string;
    floraAccountId: string;
    topics: { communication: string; transaction: string; state: string };
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16FloraCreatedTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  async sendTransaction(params: {
    topicId: string;
    operatorId: string;
    scheduleId: string;
    data?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16TransactionTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /**
   * Wallet-signed ScheduleSign for a given scheduleId.
   */
  async signSchedule(params: { scheduleId: string }): Promise<void> {
    const signer = this.getSigner();
    const tx = await new ScheduleSignTransaction()
      .setScheduleId(params.scheduleId)
      .freezeWithSigner(signer);
    await tx.executeWithSigner(signer);
  }

  async sendStateUpdate(params: {
    topicId: string;
    operatorId: string;
    hash: string;
    epoch?: number;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16StateUpdateTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  async sendStateHash(params: {
    topicId: string;
    stateHash: string;
    accountId: string;
    topics: string[];
    memo?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16StateHashTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /** credit_purchase is not part of HCS-16 specification */

  /**
   * Create Flora account and C/T/S topics using DAppSigner.
   * - Account KeyList = threshold of members
   * - Topic submitKey = 1-of-M KeyList of members
   * Returns created Flora account ID and topic IDs.
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
    const signer = this.getSigner();
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
    const accFrozen = await createAcc.freezeWithSigner(signer);
    const accExec = await accFrozen.executeWithSigner(signer);
    const accReceipt = await accExec.getReceiptWithSigner(signer);
    const floraAccountId = accReceipt?.accountId?.toString?.();
    if (!floraAccountId) {
      throw new Error('Failed to create Flora account');
    }

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

    const commR = await (
      await (await commTx.freezeWithSigner(signer)).executeWithSigner(signer)
    ).getReceiptWithSigner(signer);
    const trnR = await (
      await (await trnTx.freezeWithSigner(signer)).executeWithSigner(signer)
    ).getReceiptWithSigner(signer);
    const stateR = await (
      await (await stateTx.freezeWithSigner(signer)).executeWithSigner(signer)
    ).getReceiptWithSigner(signer);
    const topics = {
      communication: commR?.topicId?.toString?.() || '',
      transaction: trnR?.topicId?.toString?.() || '',
      state: stateR?.topicId?.toString?.() || '',
    };
    return { floraAccountId, topics };
  }

  /** Publish flora_created on the communication topic. */
  async publishFloraCreated(params: {
    communicationTopicId: string;
    operatorId: string;
    floraAccountId: string;
    topics: { communication: string; transaction: string; state: string };
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16FloraCreatedTx({
      topicId: params.communicationTopicId,
      operatorId: params.operatorId,
      floraAccountId: params.floraAccountId,
      topics: params.topics,
    });
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /**
   * Post flora_join_request on Flora communication topic.
   * If submitKey=1/M, a member must relay the message.
   */
  async sendFloraJoinRequest(params: {
    topicId: string;
    operatorId: string;
    accountId: string;
    connectionRequestId: number;
    connectionTopicId: string;
    connectionSeq: number;
    memo?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16FloraJoinRequestTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /** Post flora_join_vote approval/rejection on the communication topic. */
  async sendFloraJoinVote(params: {
    topicId: string;
    operatorId: string;
    accountId: string;
    approve: boolean;
    connectionRequestId: number;
    connectionSeq: number;
    memo?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16FloraJoinVoteTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /** Post flora_join_accepted after threshold approval. */
  async sendFloraJoinAccepted(params: {
    topicId: string;
    operatorId: string;
    members: string[];
    epoch: number;
    memo?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16FloraJoinAcceptedTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }
}
