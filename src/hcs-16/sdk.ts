import {
  Client,
  AccountId,
  PublicKey,
  KeyList,
  TransactionReceipt,
  Hbar,
  ScheduleSignTransaction,
  PrivateKey,
  Transaction,
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
  buildHcs16StateHashTx,
} from './tx';
import { FloraTopicType } from './types';
import {
  buildHcs16FloraJoinRequestTx,
  buildHcs16FloraJoinVoteTx,
  buildHcs16FloraJoinAcceptedTx,
  buildHcs16CreateAccountTx,
} from './tx';
import {
  buildHcs16ScheduleAccountKeyUpdateTx,
  buildHcs16ScheduleTopicKeyUpdateTx,
  buildHcs16ScheduleAccountDeleteTx,
} from './tx';
import type { FloraProfile } from './types';
import { HCS11Client } from '../hcs-11/client';
import { FloraProfileSchema } from './schemas';
import { buildHcs16UpdateFloraMemoToProfileTx } from './tx';

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

  private async executeWithOptionalSigner<T extends Transaction>(
    tx: T,
    signerKey?: PrivateKey,
  ): Promise<TransactionReceipt> {
    const frozen = tx.freezeWith(this.client);
    if (signerKey) {
      await frozen.sign(signerKey);
    }
    const resp = await frozen.execute(this.client);
    return resp.getReceipt(this.client);
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
    signerKeys?: PrivateKey[];
  }): Promise<string> {
    const {
      floraAccountId,
      topicType,
      adminKey,
      submitKey,
      autoRenewAccountId,
      signerKeys,
    } = params;

    const tx = buildHcs16CreateFloraTopicTx({
      floraAccountId,
      topicType,
      adminKey,
      submitKey,
      operatorPublicKey: this.client.operatorPublicKey || undefined,
      autoRenewAccountId,
    });

    const frozen = await tx.freezeWith(this.client);
    if (signerKeys?.length) {
      for (const key of signerKeys) {
        await frozen.sign(key);
      }
    }

    const resp = await frozen.execute(this.client);
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
    signerKey?: PrivateKey;
  }): Promise<TransactionReceipt> {
    const { signerKey, ...rest } = params;
    const tx = buildHcs16FloraCreatedTx(rest);
    return this.executeWithOptionalSigner(tx, signerKey);
  }

  /**
   * Send HCS-16 transaction (preferred). scheduleId is the ScheduleId entity (e.g., 0.0.12345).
   */
  async sendTransaction(params: {
    topicId: string;
    operatorId: string;
    scheduleId: string;
    data?: string;
    signerKey?: PrivateKey;
  }): Promise<TransactionReceipt> {
    const { signerKey, ...rest } = params;
    const tx = buildHcs16TransactionTx(rest);
    return this.executeWithOptionalSigner(tx, signerKey);
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
    signerKey?: PrivateKey;
  }): Promise<TransactionReceipt> {
    const { signerKey, ...rest } = params;
    const tx = buildHcs16StateUpdateTx(rest);
    return this.executeWithOptionalSigner(tx, signerKey);
  }

  async sendStateHash(params: {
    topicId: string;
    stateHash: string;
    accountId: string;
    topics: string[];
    memo?: string;
    signerKey?: PrivateKey;
  }): Promise<TransactionReceipt> {
    const { signerKey, ...rest } = params;
    const tx = buildHcs16StateHashTx(rest);
    return this.executeWithOptionalSigner(tx, signerKey);
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

  /**
   * Update Flora account memo to point at an HCS-11 profile resource (hcs-11:<resource>).
   */
  async updateFloraAccountMemoToProfile(params: {
    floraAccountId: string;
    profileResource: string;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16UpdateFloraMemoToProfileTx({
      floraAccountId: params.floraAccountId,
      profileResource: params.profileResource,
    });
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  /**
   * Publish Flora profile via provided HCS-11 client and update Flora memo to reference it.
   * Caller constructs `profile` and HCS11Client (to avoid circular SDK wiring).
   */
  async publishFloraProfileAndMemo(params: {
    hcs11: HCS11Client;
    floraAccountId: string;
    profile: FloraProfile | any;
  }): Promise<{ profileResource: string; receipt: TransactionReceipt }> {
    const parsed = FloraProfileSchema.parse(params.profile);
    const result = await params.hcs11.inscribeProfile(parsed as any);
    if (!result.success) {
      throw new Error(
        `Failed to inscribe HCS-11 profile: ${result.error || 'unknown'}`,
      );
    }
    const resource = `hcs://1/${result.profileTopicId}`;
    const receipt = await this.updateFloraAccountMemoToProfile({
      floraAccountId: params.floraAccountId,
      profileResource: resource,
    });
    return { profileResource: resource, receipt };
  }

  /** Create a schedule to update Flora account KeyList (membership change). */
  async scheduleAccountKeyUpdate(params: {
    floraAccountId: string;
    newKeyList: KeyList;
    memo?: string;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16ScheduleAccountKeyUpdateTx({
      floraAccountId: params.floraAccountId,
      newKeyList: params.newKeyList,
      memo: params.memo,
    });
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  /** Create a schedule to update topic admin/submit keys. */
  async scheduleTopicKeyUpdate(params: {
    topicId: string;
    adminKey?: PublicKey | KeyList;
    submitKey?: PublicKey | KeyList;
    memo?: string;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16ScheduleTopicKeyUpdateTx({
      topicId: params.topicId,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      memo: params.memo,
    });
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }

  /** Schedule Flora account deletion with transfer to beneficiary (requires cleanup preconditions). */
  async scheduleFloraDeletion(params: {
    floraAccountId: string;
    transferAccountId: string;
    memo?: string;
  }): Promise<TransactionReceipt> {
    const tx = buildHcs16ScheduleAccountDeleteTx({
      floraAccountId: params.floraAccountId,
      transferAccountId: params.transferAccountId,
      memo: params.memo,
    });
    const resp = await tx.execute(this.client);
    return resp.getReceipt(this.client);
  }
}
