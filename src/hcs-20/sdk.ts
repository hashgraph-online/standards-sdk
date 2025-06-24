/**
 * SDK implementation of HCS-20 client for server-side usage
 */

import {
  AccountId,
  TopicId,
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
  HCS20MintMessage,
  HCS20TransferMessage,
  HCS20BurnMessage,
  HCS20RegisterMessage,
} from './types';
import {
  PointsDeploymentError,
  PointsTransferError,
  PointsBurnError,
  PointsValidationError,
} from './errors';
import { sleep } from '../utils/sleep';
import { detectKeyTypeFromString } from '../utils/key-type-detector';
import { HCS2Client } from '../hcs-2/client';

/**
 * SDK-specific HCS-20 client for server-side operations
 */
export class HCS20Client extends HCS20BaseClient {
  private client: Client;
  private operatorId: AccountId;
  private operatorKey: PrivateKey;
  private operatorKeyString: string;
  private keyType?: 'ed25519' | 'ecdsa';
  private initialized = false;

  constructor(config: SDKHCS20ClientConfig) {
    super(config);

    this.operatorId =
      typeof config.operatorId === 'string'
        ? AccountId.fromString(config.operatorId)
        : config.operatorId;

    this.operatorKeyString = config.operatorKey;

    this.client =
      this.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    try {
      const { privateKey, detectedType } = detectKeyTypeFromString(
        config.operatorKey,
      );
      this.operatorKey = privateKey;
      this.keyType = detectedType;
      this.client.setOperator(this.operatorId, this.operatorKey);
      this.initialized = true;
    } catch (error) {
      this.logger.debug(
        'Failed to detect key type from string, will initialize later',
      );
    }
  }

  /**
   * Initialize operator by querying mirror node for key type
   */
  private async initializeOperator(): Promise<void> {
    if (this.initialized) return;

    try {
      const accountInfo = await this.mirrorNode.requestAccount(
        this.operatorId.toString(),
      );
      const keyType = accountInfo?.key?._type;

      if (keyType?.includes('ECDSA')) {
        this.keyType = 'ecdsa';
      } else if (keyType?.includes('ED25519')) {
        this.keyType = 'ed25519';
      } else {
        this.keyType = 'ed25519';
      }

      this.operatorKey =
        this.keyType === 'ecdsa'
          ? PrivateKey.fromStringECDSA(this.operatorKeyString)
          : PrivateKey.fromStringED25519(this.operatorKeyString);

      this.client.setOperator(this.operatorId, this.operatorKey);
      this.initialized = true;

      this.logger.debug(`Initialized operator with key type: ${this.keyType}`);
    } catch (error) {
      this.logger.warn(
        'Failed to query mirror node for key type, using ED25519',
      );
      this.keyType = 'ed25519';
      this.operatorKey = PrivateKey.fromStringED25519(this.operatorKeyString);
      this.client.setOperator(this.operatorId, this.operatorKey);
      this.initialized = true;
    }
  }

  /**
   * Ensure operator is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeOperator();
    }
  }

  /**
   * Submit a payload to a topic
   */
  private async submitPayload(
    topicId: string,
    payload: object | string,
    submitKey?: PrivateKey,
  ): Promise<{ receipt: TransactionReceipt; transactionId: string }> {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message);

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
      operatorKey: this.operatorKey,
      network: this.network,
    });

    const topicCreateResponse = await hcs2Client.createRegistry({
      submitKey: this.operatorKey,
      adminKey: this.operatorKey,
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
        operatorKey: this.operatorKey,
        network: this.network,
      });

      if (options.usePrivateTopic) {
        const topicCreateResponse = await hcs2Client.createRegistry({
          submitKey: this.operatorKey,
          adminKey: this.operatorKey,
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

      const { transactionId: deployTxId } = await this.submitPayload(
        topicId,
        deployMessage,
      );

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
        deployerAccountId: this.operatorId.toString(),
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

      const mintMessage: HCS20MintMessage = {
        p: 'hcs-20',
        op: 'mint',
        tick: normalizedTick,
        amt: options.amount,
        to: this.accountToString(options.to),
        m: options.memo,
      };

      const topicId = (options as any).topicId || this.publicTopicId;
      const { transactionId: mintTxId } = await this.submitPayload(
        topicId,
        mintMessage,
      );

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        mintTxId,
      });

      await this.waitForMirrorNodeConfirmation(topicId, mintTxId);

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

      if (fromAccount !== this.operatorId.toString()) {
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

      const transferMessage: HCS20TransferMessage = {
        p: 'hcs-20',
        op: 'transfer',
        tick: normalizedTick,
        amt: options.amount,
        from: fromAccount,
        to: toAccount,
        m: options.memo,
      };

      const topicId = (options as any).topicId || this.publicTopicId;
      const { transactionId: transferTxId } = await this.submitPayload(
        topicId,
        transferMessage,
      );

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

      if (fromAccount !== this.operatorId.toString()) {
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

      const burnMessage: HCS20BurnMessage = {
        p: 'hcs-20',
        op: 'burn',
        tick: normalizedTick,
        amt: options.amount,
        from: fromAccount,
        m: options.memo,
      };

      const topicId = (options as any).topicId || this.publicTopicId;
      const { transactionId: burnTxId } = await this.submitPayload(
        topicId,
        burnMessage,
      );

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

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const { transactionId: registerTxId } = await this.submitPayload(
        this.registryTopicId,
        registerMessage,
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

        const found = messages.some((msg: any) => msg.consensus_timestamp);

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
