/**
 * SDK implementation of HCS-20 client for server-side usage
 */

import {
  AccountId,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PrivateKey,
  Client,
  TransactionReceipt,
  TransactionResponse,
  Status,
} from '@hashgraph/sdk';
import { HCS20BaseClient } from './base-client';
import {
  SDKHCS20ClientConfig,
  DeployPointsOptions,
  MintPointsOptions,
  TransferPointsOptions,
  BurnPointsOptions,
  RegisterTopicOptions,
  PointsInfo,
  PointsTransaction,
  HCS20DeployMessage,
  HCS20RegisterMessage,
} from './types';
import {
  PointsDeploymentError,
  PointsTransferError,
  PointsBurnError,
  PointsValidationError,
} from './errors';
import { sleep } from '../utils/sleep';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import { HCS2Client } from '../hcs-2/client';
import {
  buildHcs20DeployTx,
  buildHcs20MintTx,
  buildHcs20TransferTx,
  buildHcs20BurnTx,
  buildHcs20RegisterTx,
} from './tx';

/**
 * SDK-specific HCS-20 client for server-side operations
 */
export class HCS20Client extends HCS20BaseClient {
  private client: Client;
  private operatorAccountId: AccountId;
  private operatorId: string;
  private operatorCtx: NodeOperatorContext;

  constructor(config: SDKHCS20ClientConfig) {
    super(config);

    this.operatorAccountId =
      typeof config.operatorId === 'string'
        ? AccountId.fromString(config.operatorId)
        : config.operatorId;
    this.operatorId = this.operatorAccountId.toString();

    const baseClient =
      this.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client: baseClient,
    });

    this.client = this.operatorCtx.client;
    void this.operatorCtx.ensureInitialized();
  }

  /**
   * Ensure operator is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  /**
   * Submit a payload to a topic
   */
  private async submitPayload(
    transaction: TopicMessageSubmitTransaction,
    submitKey?: PrivateKey,
  ): Promise<{ receipt: TransactionReceipt; transactionId: string }> {
    let transactionResponse: TransactionResponse;
    if (submitKey) {
      const frozenTransaction = transaction.freezeWith(this.client);
      const signedTransaction = await frozenTransaction.sign(submitKey);
      transactionResponse = await signedTransaction.execute(this.client);
    } else {
      transactionResponse = await transaction.execute(this.client);
    }

    const receipt = await transactionResponse.getReceipt(this.client);
    if (!receipt || receipt.status !== Status.Success) {
      throw new Error('Failed to submit message to topic');
    }

    return {
      receipt,
      transactionId: transactionResponse.transactionId!.toString(),
    };
  }

  /**
   * Create a public topic for HCS-20 (for testnet)
   */
  async createPublicTopic(memo?: string): Promise<string> {
    await this.ensureInitialized();

    this.logger.info('Creating public HCS-20 topic...');

    const topicCreateTx = await new TopicCreateTransaction()
      .setTopicMemo(memo || 'HCS-20 Public Topic')
      .execute(this.client);

    const receipt = await topicCreateTx.getReceipt(this.client);
    if (receipt.status !== Status.Success || !receipt.topicId) {
      throw new Error('Failed to create public topic');
    }

    const topicId = receipt.topicId.toString();
    this.logger.info(`Created public topic: ${topicId}`);

    this.publicTopicId = topicId;

    return topicId;
  }

  /**
   * Create a registry topic for HCS-20
   */
  async createRegistryTopic(): Promise<string> {
    await this.ensureInitialized();

    this.logger.info('Creating HCS-20 registry topic...');

    const hcs2Client = new HCS2Client({
      operatorId: this.operatorId,
      operatorKey: this.operatorCtx.operatorKey,
      network: this.network,
    });

    const topicCreateResponse = await hcs2Client.createRegistry({
      submitKey: this.operatorCtx.operatorKey,
      adminKey: this.operatorCtx.operatorKey,
    });

    if (!topicCreateResponse.success) {
      throw new Error('Failed to create registry topic');
    }

    const topicId = topicCreateResponse.topicId;
    this.logger.info(`Created registry topic: ${topicId}`);

    this.registryTopicId = topicId;

    return topicId;
  }

  /**
   * Deploy new points
   */
  async deployPoints(options: DeployPointsOptions): Promise<PointsInfo> {
    await this.ensureInitialized();
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'creating-topic',
        percentage: 20,
      });

      let topicId: string;

      const hcs2Client = new HCS2Client({
        operatorId: this.operatorId,
        operatorKey: this.operatorCtx.operatorKey,
        network: this.network,
      });

      if (options.usePrivateTopic) {
        const topicCreateResponse = await hcs2Client.createRegistry({
          submitKey: this.operatorCtx.operatorKey,
          adminKey: this.operatorCtx.operatorKey,
        });

        if (!topicCreateResponse.success) {
          throw new PointsDeploymentError(
            'Failed to create topic',
            options.tick,
          );
        }

        topicId = topicCreateResponse.topicId;
        this.logger.info(`Created private topic: ${topicId}`);
      } else {
        topicId = this.publicTopicId;
      }

      progressCallback?.({
        stage: 'submitting-deploy',
        percentage: 50,
        topicId,
      });

      const deployMessage: HCS20DeployMessage = {
        p: 'hcs-20',
        op: 'deploy',
        name: options.name,
        tick: this.normalizeTick(options.tick),
        max: options.maxSupply,
        lim: options.limitPerMint,
        metadata: options.metadata,
        m: options.topicMemo,
      };

      const validation = this.validateMessage(deployMessage);
      if (!validation.valid) {
        throw new PointsValidationError(
          'Invalid deploy message',
          validation.errors!,
        );
      }

      const deployTransaction = buildHcs20DeployTx({
        topicId,
        name: options.name,
        tick: options.tick,
        max: options.maxSupply,
        lim: options.limitPerMint,
        metadata: options.metadata,
        memo: options.topicMemo,
      });

      const { transactionId: deployTxId } =
        await this.submitPayload(deployTransaction);

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        topicId,
        deployTxId,
      });

      await this.waitForMirrorNodeConfirmation(topicId, deployTxId);

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        topicId,
        deployTxId,
      });

      const pointsInfo: PointsInfo = {
        name: options.name,
        tick: this.normalizeTick(options.tick),
        maxSupply: options.maxSupply,
        limitPerMint: options.limitPerMint,
        metadata: options.metadata,
        topicId,
        deployerAccountId: this.operatorId,
        currentSupply: '0',
        deploymentTimestamp: new Date().toISOString(),
        isPrivate: options.usePrivateTopic || false,
      };

      return pointsInfo;
    } catch (error) {
      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mint points
   */
  async mintPoints(options: MintPointsOptions): Promise<PointsTransaction> {
    await this.ensureInitialized();
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'validating',
        percentage: 20,
      });

      const normalizedTick = this.normalizeTick(options.tick);

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const topicId = options.topicId
        ? this.topicToString(options.topicId)
        : this.publicTopicId;
      const mintTransaction = buildHcs20MintTx({
        topicId,
        tick: options.tick,
        amt: options.amount,
        to: this.accountToString(options.to),
        memo: options.memo,
      });

      const { transactionId: mintTxId } =
        await this.submitPayload(mintTransaction);

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        mintTxId,
      });

      if (!options.disableMirrorCheck) {
        await this.waitForMirrorNodeConfirmation(topicId, mintTxId);
      }

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        mintTxId,
      });

      const transaction: PointsTransaction = {
        id: mintTxId,
        operation: 'mint',
        tick: normalizedTick,
        amount: options.amount,
        to: this.accountToString(options.to),
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        topicId,
        transactionId: mintTxId,
        memo: options.memo,
      };

      return transaction;
    } catch (error) {
      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Transfer points
   */
  async transferPoints(
    options: TransferPointsOptions,
  ): Promise<PointsTransaction> {
    await this.ensureInitialized();
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'validating-balance',
        percentage: 20,
      });

      const normalizedTick = this.normalizeTick(options.tick);
      const fromAccount = this.accountToString(options.from);
      const toAccount = this.accountToString(options.to);

      if (fromAccount !== this.operatorId) {
        throw new PointsTransferError(
          'For public topics, transaction payer must match sender',
          options.tick,
          fromAccount,
          toAccount,
          options.amount,
        );
      }

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const topicId = options.topicId
        ? this.topicToString(options.topicId)
        : this.publicTopicId;
      const transferTransaction = buildHcs20TransferTx({
        topicId,
        tick: options.tick,
        amt: options.amount,
        from: fromAccount,
        to: toAccount,
        memo: options.memo,
      });

      const { transactionId: transferTxId } =
        await this.submitPayload(transferTransaction);

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        transferTxId,
      });

      await this.waitForMirrorNodeConfirmation(topicId, transferTxId);

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        transferTxId,
      });

      const transaction: PointsTransaction = {
        id: transferTxId,
        operation: 'transfer',
        tick: normalizedTick,
        amount: options.amount,
        from: fromAccount,
        to: toAccount,
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        topicId,
        transactionId: transferTxId,
        memo: options.memo,
      };

      return transaction;
    } catch (error) {
      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Burn points
   */
  async burnPoints(options: BurnPointsOptions): Promise<PointsTransaction> {
    await this.ensureInitialized();
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'validating-balance',
        percentage: 20,
      });

      const normalizedTick = this.normalizeTick(options.tick);
      const fromAccount = this.accountToString(options.from);

      if (fromAccount !== this.operatorId) {
        throw new PointsBurnError(
          'For public topics, transaction payer must match burner',
          options.tick,
          fromAccount,
          options.amount,
        );
      }

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const topicId = options.topicId
        ? this.topicToString(options.topicId)
        : this.publicTopicId;
      const burnTransaction = buildHcs20BurnTx({
        topicId,
        tick: options.tick,
        amt: options.amount,
        from: fromAccount,
        memo: options.memo,
      });

      const { transactionId: burnTxId } =
        await this.submitPayload(burnTransaction);

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        burnTxId,
      });

      await this.waitForMirrorNodeConfirmation(topicId, burnTxId);

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        burnTxId,
      });

      const transaction: PointsTransaction = {
        id: burnTxId,
        operation: 'burn',
        tick: normalizedTick,
        amount: options.amount,
        from: fromAccount,
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        topicId,
        transactionId: burnTxId,
        memo: options.memo,
      };

      return transaction;
    } catch (error) {
      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Register a topic in the registry
   */
  async registerTopic(options: RegisterTopicOptions): Promise<void> {
    await this.ensureInitialized();
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'validating',
        percentage: 20,
      });

      const registerMessage: HCS20RegisterMessage = {
        p: 'hcs-20',
        op: 'register',
        name: options.name,
        metadata: options.metadata,
        private: options.isPrivate,
        t_id: this.topicToString(options.topicId),
        m: options.memo,
      };

      const validation = this.validateMessage(registerMessage);
      if (!validation.valid) {
        throw new PointsValidationError(
          'Invalid register message',
          validation.errors!,
        );
      }

      if (!this.registryTopicId) {
        throw new PointsDeploymentError(
          'Registry topic not available',
          options.name,
        );
      }

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const registerTransaction = buildHcs20RegisterTx({
        registryTopicId: this.registryTopicId,
        name: options.name,
        topicId: this.topicToString(options.topicId),
        isPrivate: options.isPrivate,
        metadata: options.metadata,
        memo: options.memo,
      });

      const { transactionId: registerTxId } = await this.submitPayload(
        registerTransaction,
        this.operatorCtx.operatorKey,
      );

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        registerTxId,
      });

      await this.waitForMirrorNodeConfirmation(
        this.registryTopicId,
        registerTxId,
      );

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        registerTxId,
      });

      this.logger.info(`Registered topic ${options.topicId} in registry`);
    } catch (error) {
      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Wait for mirror node to index a message
   */
  private async waitForMirrorNodeConfirmation(
    topicId: string,
    transactionId: string,
    maxRetries = 10,
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const messages = await this.mirrorNode.getTopicMessages(topicId, {
          limit: 10,
          order: 'desc',
        });

        const found = messages.some(message => {
          if (typeof message !== 'object' || message === null) {
            return false;
          }
          const candidate = message as { consensus_timestamp?: unknown };
          return typeof candidate.consensus_timestamp === 'string';
        });

        if (found) {
          this.logger.debug(
            `Transaction ${transactionId} confirmed on mirror node`,
          );
          return;
        }
      } catch (error) {
        this.logger.debug(`Mirror node check attempt ${i + 1} failed:`, error);
      }

      await sleep(2000);
    }

    this.logger.warn(
      `Transaction ${transactionId} not found on mirror node after ${maxRetries} attempts`,
    );
  }
}
