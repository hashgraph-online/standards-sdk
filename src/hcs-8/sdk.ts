import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
  TransactionReceipt,
  PublicKey,
  WebClient,
} from '@hashgraph/sdk';
import * as undici from 'undici';
import { Logger, type ILogger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import type { MirrorNodeConfig } from '../services';
import { Hcs8BaseClient } from './base-client';
import {
  buildManageMessage,
  buildRegisterChunks,
  buildUpdateMessage,
  buildVoteMessage,
  encodeMessagePayload,
} from './builders';
import { PollMetadata, VoteEntry } from '../hcs-9';
import { Hcs8ManageAction, UpdateChange } from './types';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';

export interface Hcs8SdkClientConfig {
  network: NetworkType;
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
  logLevel?: Parameters<typeof Logger.getInstance>[0]['level'];
  mirrorNode?: MirrorNodeConfig;
  silent?: boolean;
  logger?: ILogger;
  forceWebClient?: boolean;
}

export interface CreatePollTopicOptions {
  submitKey?: string | PublicKey | PrivateKey | boolean;
  adminKey?: string | PublicKey | PrivateKey | boolean;
  memo?: string;
}

export class Hcs8Client extends Hcs8BaseClient {
  private readonly client: Client;
  private readonly operatorCtx: NodeOperatorContext;
  private readonly shouldUseWebClient: boolean;
  private static proxyConfigured = false;

  constructor(config: Hcs8SdkClientConfig) {
    super({
      network: config.network,
      logLevel: config.logLevel,
      mirrorNode: config.mirrorNode,
      logger: config.logger,
      silent: config.silent,
    });

    this.shouldUseWebClient =
      Boolean(config.forceWebClient) || this.detectProxyUrl() !== undefined;

    this.operatorCtx = createNodeOperatorContext({
      network: config.network,
      operatorId: config.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client: this.createClient(config.network),
    });
    this.client = this.operatorCtx.client;
  }

  public async createPollTopic(
    options: CreatePollTopicOptions = {},
  ): Promise<{ topicId: string; receipt: TransactionReceipt }>
  {
    await this.ensureInitialized();
    const tx = new TopicCreateTransaction().setTopicMemo('hcs-8:poll');

    if (options.adminKey) {
      const key = this.resolveKey(options.adminKey);
      tx.setAdminKey(key);
    }

    if (options.submitKey) {
      const key = this.resolveKey(options.submitKey);
      tx.setSubmitKey(key);
    }

    if (options.memo) {
      tx.setTopicMemo(options.memo);
    }

    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    const topicId = receipt.topicId?.toString();
    if (!topicId) {
      throw new Error('Topic creation failed to return a topic ID');
    }
    return { topicId, receipt };
  }

  public async submitRegister(
    topicId: string,
    metadata: PollMetadata,
    memo?: string,
  ): Promise<TransactionReceipt[]> {
    await this.ensureInitialized();
    const messages = buildRegisterChunks(metadata, memo);
    const receipts: TransactionReceipt[] = [];
    for (const message of messages) {
      const tx = new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(topicId))
        .setMessage(JSON.stringify(message));
      const resp = await tx.execute(this.client);
      receipts.push(await resp.getReceipt(this.client));
    }
    return receipts;
  }

  public async submitManage(
    topicId: string,
    accountId: string,
    action: Hcs8ManageAction,
    memo?: string,
  ): Promise<TransactionReceipt> {
    await this.ensureInitialized();
    const message = buildManageMessage(accountId, action, memo);
    return this.submit(topicId, message);
  }

  public async submitUpdate(
    topicId: string,
    accountId: string,
    change: UpdateChange,
    memo?: string,
  ): Promise<TransactionReceipt> {
    await this.ensureInitialized();
    const message = buildUpdateMessage(accountId, change, memo);
    return this.submit(topicId, message);
  }

  public async submitVote(
    topicId: string,
    accountId: string,
    votes: VoteEntry[],
    memo?: string,
  ): Promise<TransactionReceipt> {
    await this.ensureInitialized();
    const message = buildVoteMessage(accountId, votes, memo);
    return this.submit(topicId, message);
  }

  public getClient(): Client {
    return this.client;
  }

  public close(): void {
    this.client.close();
  }

  private async submit(
    topicId: string,
    message: Parameters<typeof encodeMessagePayload>[0],
  ): Promise<TransactionReceipt> {
    const payload = encodeMessagePayload(message);
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(payload);
    const resp = await tx.execute(this.client);
    return await resp.getReceipt(this.client);
  }

  private resolveKey(key: string | PublicKey | PrivateKey | boolean): PublicKey {
    if (typeof key === 'boolean') {
      return this.operatorCtx.operatorKey.publicKey;
    }
    if (key instanceof PrivateKey) {
      return key.publicKey;
    }
    if (key instanceof PublicKey) {
      return key;
    }
    return PublicKey.fromString(key);
  }

  private createClient(network: NetworkType): Client {
    const proxyUrl = this.detectProxyUrl();

    if (this.shouldUseWebClient) {
      if (proxyUrl) {
        this.configureProxy(proxyUrl);
      }
      return this.createWebClient(network);
    }

    switch (network) {
      case 'mainnet':
        return Client.forMainnet();
      case 'previewnet':
        return Client.forPreviewnet();
      default:
        return Client.forTestnet();
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  private detectProxyUrl(): string | undefined {
    if (typeof process === 'undefined') {
      return undefined;
    }
    return (
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy
    );
  }

  private configureProxy(proxyUrl: string): void {
    if (Hcs8Client.proxyConfigured) {
      return;
    }
    try {
      undici.setGlobalDispatcher(new undici.ProxyAgent(proxyUrl));
      Hcs8Client.proxyConfigured = true;
    } catch (error) {
      this.logger.warn(
        `Failed to configure proxy agent for Hedera WebClient: ${error}`,
      );
    }
  }

  private createWebClient(network: NetworkType): Client {
    switch (network) {
      case 'mainnet':
        return WebClient.forMainnet();
      case 'previewnet':
        return WebClient.forPreviewnet();
      default:
        return WebClient.forTestnet();
    }
  }

  /**
   * @internal Testing utility to reset proxy configuration state.
   */
  public static __resetProxyAgentForTests(): void {
    Hcs8Client.proxyConfigured = false;
  }

  /**
   * @internal Testing helper to inspect proxy configuration state.
   */
  public static __isProxyConfiguredForTests(): boolean {
    return Hcs8Client.proxyConfigured;
  }
}
