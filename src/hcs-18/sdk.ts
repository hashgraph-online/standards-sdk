import {
  Client,
  TopicCreateTransaction,
  TransactionReceipt,
} from '@hashgraph/sdk';
import { Logger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import type { MaybeKey } from '../common/tx/tx-utils';
import { buildHcs18CreateDiscoveryTopicTx } from './tx';
import { HCS18BaseClient } from './base-client';
import type {
  AnnounceData,
  ProposeData,
  RespondData,
  CompleteMessage,
  WithdrawMessage,
  DiscoveryMessage,
} from './types';
import {
  buildHcs18SubmitDiscoveryMessageTx,
  buildHcs18AnnounceMessage,
  buildHcs18ProposeMessage,
  buildHcs18RespondMessage,
  buildHcs18CompleteMessage,
  buildHcs18WithdrawMessage,
} from './tx';

export interface SDKHCS18ClientConfig {
  network: NetworkType;
  operatorId: string;
  operatorKey: string | import('@hashgraph/sdk').PrivateKey;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  silent?: boolean;
}

export class HCS18Client extends HCS18BaseClient {
  private readonly operatorCtx: NodeOperatorContext;
  private readonly client: Client;

  constructor(config: SDKHCS18ClientConfig) {
    super({
      network: config.network,
      logger: Logger.getInstance({
        level: config.logLevel || 'info',
        module: 'HCS-18',
        silent: config.silent,
      }),
    });
    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: config.operatorId,
      operatorKey: config.operatorKey,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client: Client.forName(this.network),
    });
    this.client = this.operatorCtx.client;
  }

  private async ensureInitialized(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  async createDiscoveryTopic(options?: {
    ttlSeconds?: number;
    adminKey?: MaybeKey;
    submitKey?: MaybeKey;
    memoOverride?: string;
  }): Promise<{ topicId: string; receipt: TransactionReceipt }> {
    await this.ensureInitialized();
    const ttl = options?.ttlSeconds;

    let operatorPublicKey: import('@hashgraph/sdk').PublicKey | undefined;
    try {
      operatorPublicKey = this.operatorCtx.operatorKey.publicKey;
    } catch {
      operatorPublicKey = undefined;
    }
    const tx: TopicCreateTransaction = buildHcs18CreateDiscoveryTopicTx({
      ttlSeconds: ttl,
      adminKey: options?.adminKey,
      submitKey: options?.submitKey,
      operatorPublicKey,
      memoOverride: options?.memoOverride,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    const topicId = receipt.topicId?.toString();
    if (!topicId) {
      throw new Error('Failed to create discovery topic');
    }
    return { topicId, receipt };
  }

  async announce(params: {
    discoveryTopicId: string;
    data: AnnounceData;
    memo?: string;
  }): Promise<{ receipt: TransactionReceipt; sequenceNumber: number }> {
    await this.ensureInitialized();
    const message: DiscoveryMessage = buildHcs18AnnounceMessage(params.data);
    const tx = buildHcs18SubmitDiscoveryMessageTx({
      topicId: params.discoveryTopicId,
      message,
      transactionMemo: params.memo,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    const seq = receipt.topicSequenceNumber.toNumber();
    return { receipt, sequenceNumber: seq };
  }

  async propose(params: {
    discoveryTopicId: string;
    data: ProposeData;
    memo?: string;
  }): Promise<{ receipt: TransactionReceipt; sequenceNumber: number }> {
    await this.ensureInitialized();
    const message: DiscoveryMessage = buildHcs18ProposeMessage(params.data);
    const tx = buildHcs18SubmitDiscoveryMessageTx({
      topicId: params.discoveryTopicId,
      message,
      transactionMemo: params.memo,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    const seq = receipt.topicSequenceNumber.toNumber();
    return { receipt, sequenceNumber: seq };
  }

  async respond(params: {
    discoveryTopicId: string;
    data: RespondData;
    memo?: string;
  }): Promise<TransactionReceipt> {
    await this.ensureInitialized();
    const message: DiscoveryMessage = buildHcs18RespondMessage(params.data);
    const tx = buildHcs18SubmitDiscoveryMessageTx({
      topicId: params.discoveryTopicId,
      message,
      transactionMemo: params.memo,
    });
    const resp = await tx.execute(this.client);
    return await resp.getReceipt(this.client);
  }

  async complete(params: {
    discoveryTopicId: string;
    data: CompleteMessage['data'];
    memo?: string;
  }): Promise<TransactionReceipt> {
    await this.ensureInitialized();
    const message: DiscoveryMessage = buildHcs18CompleteMessage(params.data);
    const tx = buildHcs18SubmitDiscoveryMessageTx({
      topicId: params.discoveryTopicId,
      message,
      transactionMemo: params.memo,
    });
    const resp = await tx.execute(this.client);
    return await resp.getReceipt(this.client);
  }

  async withdraw(params: {
    discoveryTopicId: string;
    data: WithdrawMessage['data'];
    memo?: string;
  }): Promise<TransactionReceipt> {
    await this.ensureInitialized();
    const message: DiscoveryMessage = buildHcs18WithdrawMessage(params.data);
    const tx = buildHcs18SubmitDiscoveryMessageTx({
      topicId: params.discoveryTopicId,
      message,
      transactionMemo: params.memo,
    });
    const resp = await tx.execute(this.client);
    return await resp.getReceipt(this.client);
  }
}
