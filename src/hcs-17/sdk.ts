import { Client, PublicKey, KeyList, TransactionReceipt, AccountId } from '@hashgraph/sdk';
import { HCS17BaseClient } from './base-client';
import {
  SDKHCS17ClientConfig,
  StateHashMessage,
  TopicState,
  AccountStateInput,
} from './types';
import { buildHcs17CreateTopicTx, buildHcs17MessageTx } from './tx';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';

/**
 * Node SDK client for HCS‑17 operations.
 * Creates topics, submits messages, and can compute + publish state hashes.
 */
export class HCS17Client extends HCS17BaseClient {
  private client: Client;
  private operatorId: AccountId;
  private operatorCtx: NodeOperatorContext;

  constructor(config: SDKHCS17ClientConfig) {
    super(config);
    this.operatorId = AccountId.fromString(config.operatorId);
    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client:
        config.network === 'mainnet'
          ? Client.forMainnet()
          : Client.forTestnet(),
    });
    this.client = this.operatorCtx.client;
  }

  public getKeyType(): 'ed25519' | 'ecdsa' {
    return this.operatorCtx.keyType;
  }

  /**
   * Create an HCS topic intended for HCS‑17 state messages.
   */
  async createStateTopic(options?: {
    ttl?: number;
    adminKey?: boolean | string | PublicKey | KeyList;
    submitKey?: boolean | string | PublicKey | KeyList;
  }): Promise<string> {
    const ttl = options?.ttl ?? 86400;
    const tx = buildHcs17CreateTopicTx({
      ttl,
      adminKey: options?.adminKey,
      submitKey: options?.submitKey,
      operatorPublicKey: this.client.operatorPublicKey || undefined,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    if (!receipt.topicId) {
      throw new Error('Failed to create topic: topicId empty');
    }
    const topicId = receipt.topicId.toString();
    this.logger.info(`Created HCS-17 state topic ${topicId}`);
    return topicId;
  }

  /**
   * Submit a pre‑built HCS‑17 state hash message to a topic.
   */
  async submitMessage(
    topicId: string,
    message: StateHashMessage,
  ): Promise<TransactionReceipt> {
    const { valid, errors } = this.validateMessage(message);
    if (!valid) {
      throw new Error(`Invalid HCS-17 message: ${errors.join(', ')}`);
    }
    const tx = buildHcs17MessageTx({
      topicId,
      stateHash: message.state_hash,
      accountId: message.account_id,
      topics: message.topics,
      memo: message.m,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    return receipt;
  }

  /**
   * Compute current account state hash from topic running hashes and publish it.
   */
  async computeAndPublish(params: {
    accountId: string;
    accountPublicKey: string | PublicKey;
    topics: string[];
    publishTopicId: string;
    memo?: string;
  }): Promise<{ stateHash: string; receipt: TransactionReceipt }> {
    const topicStates: TopicState[] = [];
    for (const t of params.topics) {
      const msgs = await this.mirrorNode.getTopicMessages(t, {
        limit: 1,
        order: 'desc',
      });
      const latest = msgs[0];
      const running = latest?.running_hash || '';
      topicStates.push({ topicId: t, latestRunningHash: running });
    }

    const input: AccountStateInput = {
      accountId: params.accountId,
      publicKey: params.accountPublicKey,
      topics: topicStates,
    };
    const result = this.calculateAccountStateHash(input);
    const message: StateHashMessage = this.createStateHashMessage(
      result.stateHash,
      params.accountId,
      params.topics,
      params.memo,
    );
    const tx = buildHcs17MessageTx({
      topicId: params.publishTopicId,
      stateHash: result.stateHash,
      accountId: params.accountId,
      topics: params.topics,
      memo: params.memo,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    return { stateHash: result.stateHash, receipt };
  }
}
