/**
 * Browser implementation of HCS-20 client using Hashinals WalletConnect
 */

import {
  TopicId,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransactionReceipt,
  Hbar,
  AccountId,
} from '@hashgraph/sdk';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import { HCS20BaseClient } from './base-client';
import {
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
  TopicRegistrationError,
  PointsValidationError,
} from './errors';
import { BrowserHCS2Client } from '../hcs-2/browser';

/**
 * Browser-specific HCS-20 client configuration
 */
export interface BrowserHCS20Config {
  network: 'mainnet' | 'testnet';
  hwc: HashinalsWalletConnectSDK;
  mirrorNodeUrl?: string;
  logger?: any;
  registryTopicId?: string;
  publicTopicId?: string;
  feeAmount?: number;
}

/**
 * Browser HCS-20 client for managing auditable points
 */
export class BrowserHCS20Client extends HCS20BaseClient {
  private hwc: HashinalsWalletConnectSDK;
  private feeAmount: number;

  constructor(config: BrowserHCS20Config) {
    super({
      network: config.network,
      logger: config.logger,
      mirrorNodeUrl: config.mirrorNodeUrl,
      registryTopicId: config.registryTopicId,
      publicTopicId: config.publicTopicId,
    });

    this.hwc = config.hwc;
    this.feeAmount = config.feeAmount || 20;
  }

  /**
   * Get operator account ID
   */
  private getOperatorId(): string {
    const accountInfo = this.hwc.getAccountInfo();
    if (!accountInfo?.accountId) {
      throw new Error('Wallet not connected');
    }
    return accountInfo.accountId;
  }

  async createRegistryTopic(): Promise<string> {
    const hcs2Client = new BrowserHCS2Client({
      hwc: this.hwc,
      network: this.network,
    });

    const topicCreateResponse = await hcs2Client.createRegistry();

    if (!topicCreateResponse.success) {
      throw new Error('Failed to create topic');
    }

    return topicCreateResponse.topicId;
  }

  /**
   * Deploy new points
   */
  async deployPoints(options: DeployPointsOptions): Promise<PointsInfo> {
    const operatorId = this.getOperatorId();
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'creating-topic',
        percentage: 20,
      });

      let topicId: string;

      if (options.usePrivateTopic) {
        const publicKey = await this.mirrorNode.getPublicKey(operatorId);

        const hcs2Client = new BrowserHCS2Client({
          hwc: this.hwc,
          network: this.network,
        });

        const topicCreateResponse = await hcs2Client.createRegistry({
          submitKey: publicKey.toString(),
          adminKey: publicKey.toString(),
        });

        if (!topicCreateResponse.success) {
          throw new Error('Failed to create topic');
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

      const deployResult = await this.submitPayload(
        topicId,
        deployMessage,
        options.usePrivateTopic,
      );

      const deployTxId =
        (deployResult as any).transactionHash?.toString() || '';

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        topicId,
        deployTxId,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        topicId,
        deployTxId,
      });

      return {
        name: options.name,
        tick: this.normalizeTick(options.tick),
        maxSupply: options.maxSupply,
        limitPerMint: options.limitPerMint,
        metadata: options.metadata,
        topicId,
        deployerAccountId: operatorId,
        currentSupply: '0',
        deploymentTimestamp: new Date().toISOString(),
        isPrivate: options.usePrivateTopic || false,
      };
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
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'validating',
        percentage: 20,
      });

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const mintMessage: HCS20MintMessage = {
        p: 'hcs-20',
        op: 'mint',
        tick: this.normalizeTick(options.tick),
        amt: options.amount,
        to: this.accountToString(options.to),
        m: options.memo,
      };

      const topicId = (options as any).topicId || this.publicTopicId;
      const mintResult = await this.submitPayload(topicId, mintMessage, false);

      const mintTxId = (mintResult as any).transactionHash?.toString() || '';

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        mintTxId,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        mintTxId,
      });

      return {
        id: mintTxId,
        operation: 'mint',
        tick: this.normalizeTick(options.tick),
        amount: options.amount,
        to: this.accountToString(options.to),
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        topicId,
        transactionId: mintTxId,
        memo: options.memo,
      };
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
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'validating-balance',
        percentage: 20,
      });

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const transferMessage: HCS20TransferMessage = {
        p: 'hcs-20',
        op: 'transfer',
        tick: this.normalizeTick(options.tick),
        amt: options.amount,
        from: this.accountToString(options.from),
        to: this.accountToString(options.to),
        m: options.memo,
      };

      const topicId = (options as any).topicId || this.publicTopicId;
      const transferResult = await this.submitPayload(
        topicId,
        transferMessage,
        false,
      );

      const transferTxId =
        (transferResult as any).transactionHash?.toString() || '';

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        transferTxId,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        transferTxId,
      });

      return {
        id: transferTxId,
        operation: 'transfer',
        tick: this.normalizeTick(options.tick),
        amount: options.amount,
        from: this.accountToString(options.from),
        to: this.accountToString(options.to),
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        topicId,
        transactionId: transferTxId,
        memo: options.memo,
      };
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
    const { progressCallback } = options;

    try {
      progressCallback?.({
        stage: 'validating-balance',
        percentage: 20,
      });

      progressCallback?.({
        stage: 'submitting',
        percentage: 50,
      });

      const burnMessage: HCS20BurnMessage = {
        p: 'hcs-20',
        op: 'burn',
        tick: this.normalizeTick(options.tick),
        amt: options.amount,
        from: this.accountToString(options.from),
        m: options.memo,
      };

      const topicId = (options as any).topicId || this.publicTopicId;
      const burnResult = await this.submitPayload(topicId, burnMessage, false);

      const burnTxId = (burnResult as any).transactionHash?.toString() || '';

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        burnTxId,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        burnTxId,
      });

      return {
        id: burnTxId,
        operation: 'burn',
        tick: this.normalizeTick(options.tick),
        amount: options.amount,
        from: this.accountToString(options.from),
        timestamp: new Date().toISOString(),
        sequenceNumber: 0,
        topicId,
        transactionId: burnTxId,
        memo: options.memo,
      };
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

      const registerResult = await this.submitPayload(
        this.registryTopicId,
        registerMessage,
        false,
      );

      const registerTxId =
        (registerResult as any).transactionHash?.toString() || '';

      progressCallback?.({
        stage: 'confirming',
        percentage: 80,
        registerTxId,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        registerTxId,
      });
    } catch (error) {
      progressCallback?.({
        stage: 'complete',
        percentage: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new TopicRegistrationError(
        error instanceof Error ? error.message : 'Unknown error',
        this.topicToString(options.topicId),
      );
    }
  }

  /**
   * Submit payload to topic using HWC
   */
  private async submitPayload(
    topicId: string,
    payload: object | string,
    requiresFee?: boolean,
  ): Promise<TransactionReceipt> {
    this.logger.debug(`Submitting payload to topic ${topicId}`);

    let message: string;
    if (typeof payload === 'string') {
      message = payload;
    } else {
      message = JSON.stringify(payload);
    }

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message);

    if (requiresFee) {
      this.logger.info(
        'Topic requires fee payment, setting max transaction fee',
      );
      transaction.setMaxTransactionFee(new Hbar(this.feeAmount));
    }

    const transactionResponse =
      await this.hwc.executeTransactionWithErrorHandling(
        transaction as any,
        false,
      );

    if (transactionResponse?.error) {
      this.logger.error(
        `Failed to submit payload: ${transactionResponse.error}`,
      );
      throw new Error(`Failed to submit payload: ${transactionResponse.error}`);
    }

    if (!transactionResponse?.result) {
      this.logger.error(
        'Failed to submit message: receipt is null or undefined',
      );
      throw new Error('Failed to submit message: receipt is null or undefined');
    }

    this.logger.debug('Payload submitted successfully via HWC');
    return transactionResponse.result;
  }
}
