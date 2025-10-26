import { Client, PrivateKey, PublicKey } from '@hashgraph/sdk';
import { HCS7BaseClient } from './base-client';
import {
  SDKHCS7ClientConfig,
  HCS7CreateRegistryOptions,
  HCS7TopicRegistrationResponse,
  HCS7RegisterConfigOptions,
  HCS7RegistryOperationResponse,
  HCS7RegisterMetadataOptions,
  HCS7Message,
} from './types';
import {
  NodeOperatorContext,
  createNodeOperatorContext,
} from '../common/node-operator-resolver';
import { buildHcs7CreateRegistryTx, buildHcs7SubmitMessageTx } from './tx';

export class HCS7Client extends HCS7BaseClient {
  private readonly operatorCtx: NodeOperatorContext;
  private readonly client: Client;
  private closed = false;

  constructor(config: SDKHCS7ClientConfig) {
    super(config);
    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: config.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
    });
    this.client = this.operatorCtx.client;
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.logger.info('HCS-7 client closed');
  }

  public getKeyType(): 'ed25519' | 'ecdsa' {
    return this.operatorCtx.keyType;
  }

  private async ensureInitialized(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  private resolvePublicKey(
    key?: string | boolean | PrivateKey,
  ): PublicKey | string | undefined {
    if (!key) {
      return undefined;
    }
    if (typeof key === 'boolean') {
      return key ? this.operatorCtx.operatorKey.publicKey : undefined;
    }
    if (typeof key === 'string') {
      try {
        return PublicKey.fromString(key);
      } catch {
        return undefined;
      }
    }
    return key.publicKey;
  }

  private coercePrivateKey(key: string | PrivateKey): PrivateKey {
    if (key instanceof PrivateKey) {
      return key;
    }
    try {
      return PrivateKey.fromStringED25519(key);
    } catch {
      return PrivateKey.fromStringECDSA(key);
    }
  }

  public async createRegistry(
    options: HCS7CreateRegistryOptions = {},
  ): Promise<HCS7TopicRegistrationResponse> {
    const ttl = options.ttl ?? 86_400;
    if (ttl < 3600) {
      return {
        success: false,
        error: 'TTL must be at least 3600 seconds',
      };
    }
    try {
      await this.ensureInitialized();
      const submitKey = this.resolvePublicKey(options.submitKey);
      const adminKey = this.resolvePublicKey(options.adminKey);
      let transaction = buildHcs7CreateRegistryTx({
        ttl,
        submitKey,
        adminKey,
        operatorPublicKey: this.operatorCtx.operatorKey.publicKey,
      });
      transaction = await transaction.freezeWith(this.client);
      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const topicId = receipt.topicId?.toString();
      if (!topicId) {
        return {
          success: false,
          error: 'Topic creation receipt did not include a topic ID',
        };
      }
      return {
        success: true,
        topicId,
        transactionId: response.transactionId?.toString(),
      };
    } catch (error) {
      this.logger.error('Failed to create HCS-7 registry topic', error);
      return { success: false, error: String(error) };
    }
  }

  public async registerConfig(
    options: HCS7RegisterConfigOptions,
  ): Promise<HCS7RegistryOperationResponse> {
    await this.ensureInitialized();
    const message = this.createConfigMessage({
      config: options.config,
      memo: options.memo,
    });
    return this.submitMessage({
      topicId: options.registryTopicId,
      message,
      submitKey: options.submitKey,
      transactionMemo: options.transactionMemo,
    });
  }

  public async registerMetadata(
    options: HCS7RegisterMetadataOptions,
  ): Promise<HCS7RegistryOperationResponse> {
    await this.ensureInitialized();
    const message = this.createMetadataMessage(options);
    return this.submitMessage({
      topicId: options.registryTopicId,
      message,
      submitKey: options.submitKey,
      transactionMemo: options.transactionMemo,
    });
  }

  private async submitMessage(params: {
    topicId: string;
    message: HCS7Message;
    submitKey?: string | PrivateKey;
    transactionMemo?: string;
  }): Promise<HCS7RegistryOperationResponse> {
    const { valid, errors } = this.validateMessage(params.message);
    if (!valid) {
      return {
        success: false,
        error: `Invalid HCS-7 payload: ${errors.join(', ')}`,
      };
    }
    try {
      let tx = buildHcs7SubmitMessageTx({
        topicId: params.topicId,
        message: params.message,
        transactionMemo: params.transactionMemo,
      });
      if (params.submitKey) {
        const submitKey = this.coercePrivateKey(params.submitKey);
        tx = await tx.freezeWith(this.client);
        await tx.sign(submitKey);
        const response = await tx.execute(this.client);
        const receipt = await response.getReceipt(this.client);
        return {
          success: true,
          receipt,
          sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
          transactionId: response.transactionId?.toString(),
        };
      }
      const response = await tx.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
        transactionId: response.transactionId?.toString(),
      };
    } catch (error) {
      this.logger.error('Failed to submit HCS-7 message', error);
      return { success: false, error: String(error) };
    }
  }
}
