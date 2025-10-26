import { TransactionReceipt } from '@hashgraph/sdk';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import { HCS7BaseClient } from './base-client';
import {
  type HCS7ClientConfig,
  type HCS7CreateRegistryOptions,
  type HCS7TopicRegistrationResponse,
  type HCS7RegisterConfigOptions,
  type HCS7RegisterMetadataOptions,
  type HCS7RegistryOperationResponse,
  type HCS7Message,
} from './types';

export interface BrowserHCS7ClientConfig extends HCS7ClientConfig {
  hwc: HashinalsWalletConnectSDK;
}

function getSequenceNumber(receipt: TransactionReceipt): number | undefined {
  const seq = receipt.topicSequenceNumber as
    | number
    | { toNumber?: () => number; low?: number }
    | undefined;
  if (typeof seq === 'number') {
    return seq;
  }
  if (typeof seq?.toNumber === 'function') {
    return seq.toNumber();
  }
  if (typeof seq?.low === 'number') {
    return seq.low;
  }
  return undefined;
}

export class HCS7BrowserClient extends HCS7BaseClient {
  private readonly hwc: HashinalsWalletConnectSDK;

  constructor(config: BrowserHCS7ClientConfig) {
    super(config);
    this.hwc = config.hwc;
  }

  private ensureConnected(): void {
    const info = this.hwc.getAccountInfo();
    if (!info?.accountId) {
      throw new Error('No active wallet connection');
    }
  }

  async createRegistry(
    options: HCS7CreateRegistryOptions = {},
  ): Promise<HCS7TopicRegistrationResponse> {
    try {
      this.ensureConnected();
      const ttl = options.ttl ?? 86_400;
      if (ttl < 3600) {
        throw new Error('TTL must be at least 3600 seconds');
      }
      const memo = this.generateRegistryMemo(ttl);
      const topicId = await this.hwc.createTopic(memo);
      this.logger.info(`Created HCS-7 registry topic ${topicId}`);
      return { success: true, topicId };
    } catch (error) {
      this.logger.error('Failed to create HCS-7 registry in browser', error);
      return { success: false, error: String(error) };
    }
  }

  async registerConfig(
    options: HCS7RegisterConfigOptions,
  ): Promise<HCS7RegistryOperationResponse> {
    const message = this.createConfigMessage({
      config: options.config,
      memo: options.memo,
    });
    return this.submitWithWallet({
      topicId: options.registryTopicId,
      message,
    });
  }

  async registerMetadata(
    options: HCS7RegisterMetadataOptions,
  ): Promise<HCS7RegistryOperationResponse> {
    const message = this.createMetadataMessage(options);
    return this.submitWithWallet({
      topicId: options.registryTopicId,
      message,
    });
  }

  private async submitWithWallet(params: {
    topicId: string;
    message: HCS7Message;
  }): Promise<HCS7RegistryOperationResponse> {
    try {
      this.ensureConnected();
      const { valid, errors } = this.validateMessage(params.message);
      if (!valid) {
        return {
          success: false,
          error: `Invalid HCS-7 payload: ${errors.join(', ')}`,
        };
      }
      const receipt = await this.hwc.submitMessageToTopic(
        params.topicId,
        JSON.stringify(params.message),
      );
      return {
        success: true,
        receipt,
        sequenceNumber: getSequenceNumber(receipt),
      };
    } catch (error) {
      this.logger.error('Failed to submit HCS-7 browser message', error);
      return { success: false, error: String(error) };
    }
  }
}
