import { HCS6BaseClient } from './base-client';
import {
  HCS6ClientConfig,
  HCS6Message,
  HCS6TopicRegistrationResponse,
  HCS6RegistryOperationResponse,
  HCS6TopicRegistry,
  HCS6CreateRegistryOptions,
  HCS6RegisterEntryOptions,
  HCS6QueryRegistryOptions,
  HCS6CreateHashinalOptions,
  HCS6CreateHashinalResponse,
  HCS6RegisterOptions,
  HCS6RegistryType,
} from './types';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import { TransactionReceipt } from '@hashgraph/sdk';
import {
  inscribeWithSigner,
  type InscriptionInput,
  type InscriptionOptions,
  type InscriptionResponse,
} from '../inscribe/inscriber';
import { getTopicId as getInscriptionTopicId } from '../utils/topic-id-utils';

/**
 * Browser client configuration for HCS-6
 */
export interface BrowserHCS6ClientConfig extends HCS6ClientConfig {
  hwc: HashinalsWalletConnectSDK;
  signer?: DAppSigner;
}

/**
 * Browser client for HCS-6 operations
 * This client is designed to work in browser environments where direct key management is not available
 */
export class HCS6BrowserClient extends HCS6BaseClient {
  private hwc: HashinalsWalletConnectSDK;
  private signer?: DAppSigner;
  /**
   * Create a new HCS-6 browser client
   * @param config Client configuration
   */
  constructor(config: BrowserHCS6ClientConfig) {
    super(config);
    this.hwc = config.hwc;
    this.signer = config.signer;
  }

  private ensureConnected(): string {
    const info = this.hwc.getAccountInfo();
    const accountId = info?.accountId;
    if (!accountId) {
      throw new Error(
        'No active wallet connection: wallet integration required to perform write operations',
      );
    }
    return accountId;
  }

  private getSigner(): DAppSigner {
    const explicit = this.signer;
    if (explicit) return explicit;
    this.ensureConnected();
    const dc = this.hwc.dAppConnector;
    const signer = dc?.signers?.[0];
    if (!signer) throw new Error('No active wallet signer');
    return signer;
  }

  /**
   * Create a new HCS-6 registry topic (for dynamic hashinals)
   * Note: In browser environment, this would typically be called through a wallet or proxy service
   * @param options Registry creation options
   * @returns Promise resolving to the transaction result
   */
  async createRegistry(
    options: HCS6CreateRegistryOptions,
  ): Promise<HCS6TopicRegistrationResponse> {
    try {
      this.ensureConnected();
      const ttl = options?.ttl ?? 86400;
      const memo = this.generateRegistryMemo(ttl);
      const topicId = await this.hwc.createTopic(memo);
      this.logger.info(
        `Created HCS-6 registry topic via wallet: ${topicId} (TTL ${ttl})`,
      );
      return { success: true, topicId };
    } catch (error) {
      this.logger.error(`Failed to create HCS-6 registry: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Register a new dynamic hashinal update in the registry
   * Note: In browser environment, this would typically be called through a wallet or proxy service
   * @param registryTopicId The topic ID of the HCS-6 registry
   * @param options Registration options
   * @returns Promise resolving to the operation result
   */
  async registerEntry(
    registryTopicId: string,
    options: HCS6RegisterEntryOptions,
  ): Promise<HCS6RegistryOperationResponse> {
    try {
      const valid = await this.validateHCS6Topic(registryTopicId);
      if (!valid) {
        throw new Error(
          `Topic ${registryTopicId} is not a valid HCS-6 registry`,
        );
      }

      const message = this.createRegisterMessage(
        options.targetTopicId,
        options.memo,
      );
      const receipt = await this.submitMessage(registryTopicId, message);
      const seqField = receipt.topicSequenceNumber as
        | number
        | { low: number }
        | undefined;
      const sequenceNumber =
        typeof seqField === 'number' ? seqField : seqField?.low;
      return { success: true, receipt, sequenceNumber };
    } catch (error) {
      this.logger.error(`Failed to register HCS-6 entry: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get the latest entry from a HCS-6 registry (non-indexed, so only latest matters)
   * @param topicId The topic ID of the registry
   * @param options Query options
   * @returns Promise resolving to the registry information
   */
  async getRegistry(
    topicId: string,
    options: HCS6QueryRegistryOptions = {},
  ): Promise<HCS6TopicRegistry> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
      this.logger.debug(
        `Retrieved topic info for HCS-6 ${topicId}: ${JSON.stringify(topicInfo)}`,
      );

      const memoInfo = this.parseRegistryTypeFromMemo(topicInfo.memo);

      if (!memoInfo) {
        throw new Error(
          `Topic ${topicId} is not an HCS-6 registry (invalid memo format)`,
        );
      }

      this.logger.debug(
        `Retrieving messages for HCS-6 topic ${topicId} with limit ${options.limit ?? 100}`,
      );
      const rawMessagesResult = (await this.mirrorNode.getTopicMessages(
        topicId,
        {
          sequenceNumber:
            options.skip && options.skip > 0 ? `gt:${options.skip}` : undefined,
          limit: options.limit ?? 100,
          order: options.order ?? 'asc',
        },
      )) as unknown as Array<{
        message?: string;
        sequence_number: number;
        consensus_timestamp: string;
        payer_account_id: string;
      }>;

      const rawMessages = options.limit
        ? rawMessagesResult.slice(0, options.limit)
        : rawMessagesResult;

      this.logger.debug(
        `Retrieved ${rawMessagesResult.length} messages, using ${rawMessages.length} after applying limit.`,
      );

      return this.parseRegistryEntries(
        topicId,
        rawMessages,
        memoInfo.registryType,
        memoInfo.ttl,
      );
    } catch (error) {
      this.logger.error(`Failed to get HCS-6 registry: ${error}`);
      throw error;
    }
  }

  /**
   * Submit a message to a HCS-6 topic
   * Note: In browser environment, this would typically be called through a wallet or proxy service
   * @param topicId The topic ID to submit to
   * @param payload The message payload
   * @returns Promise resolving to the transaction receipt
   */
  async submitMessage(
    topicId: string,
    payload: HCS6Message,
  ): Promise<TransactionReceipt> {
    this.ensureConnected();
    const { valid, errors } = this.validateMessage(payload);
    if (!valid) {
      throw new Error(`Invalid HCS-6 message: ${errors.join(', ')}`);
    }
    const receipt = await this.hwc.submitMessageToTopic(
      topicId,
      JSON.stringify(payload),
    );
    return receipt;
  }

  /**
   * Create a complete dynamic hashinal with inscription and registry
   * Note: In browser environment, this would typically be called through a wallet or proxy service
   * @param options Options for creating the dynamic hashinal
   * @returns Promise resolving to the creation response
   */
  async createHashinal(
    options: HCS6CreateHashinalOptions,
  ): Promise<HCS6CreateHashinalResponse> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No signer configured for browser createHashinal',
        };
      }

      const inscriptionOptions: InscriptionOptions = {
        ...(options.inscriptionOptions as InscriptionOptions | undefined),
        mode: 'hashinal',
        metadata: options.metadata,
        waitForConfirmation: true,
        network: this.network,
      };

      const input: InscriptionInput = {
        type: 'buffer',
        buffer: Buffer.from(JSON.stringify(options.metadata)),
        fileName: 'metadata.json',
        mimeType: 'application/json',
      };

      const res: InscriptionResponse = await inscribeWithSigner(
        input,
        this.signer,
        inscriptionOptions,
      );
      const inscriptionTopicId =
        res.inscription?.jsonTopicId || getInscriptionTopicId(res.inscription);
      if (!inscriptionTopicId) {
        return { success: false, error: 'Failed to inscribe metadata' };
      }

      let registryTopicId = options.registryTopicId;
      if (!registryTopicId) {
        const reg = await this.createRegistry({ ttl: options.ttl });
        if (!reg.success || !reg.topicId)
          return { success: false, error: reg.error };
        registryTopicId = reg.topicId;
      }

      const regRes = await this.registerEntry(registryTopicId, {
        targetTopicId: inscriptionTopicId,
        memo: options.memo || 'Initial dynamic hashinal registration',
      });
      if (!regRes.success) return { success: false, error: regRes.error };

      return {
        success: true,
        registryTopicId,
        inscriptionTopicId,
      };
    } catch (error) {
      this.logger.error(`Failed to create dynamic hashinal: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Register a dynamic hashinal with combined inscription and registry creation
   * Note: In browser environment, this would typically be called through a wallet or proxy service
   * @param options Options for registering the dynamic hashinal
   * @returns Promise resolving to the creation response
   */
  async register(
    options: HCS6RegisterOptions,
  ): Promise<HCS6CreateHashinalResponse> {
    try {
      if (!this.signer) {
        return {
          success: false,
          error: 'No signer configured for browser register',
        };
      }

      let input: InscriptionInput;
      if (options.data?.base64) {
        input = {
          type: 'buffer',
          buffer: Buffer.from(options.data.base64, 'base64'),
          fileName: 'data.' + (options.data.mimeType?.split('/')[1] || 'bin'),
          mimeType: options.data.mimeType || 'application/octet-stream',
        };
      } else if (options.data?.url) {
        input = { type: 'url', url: options.data.url };
      } else {
        input = {
          type: 'buffer',
          buffer: Buffer.from(JSON.stringify(options.metadata)),
          fileName: 'metadata.json',
          mimeType: 'application/json',
        };
      }

      const inscriptionOptions: InscriptionOptions = {
        ...(options.inscriptionOptions as InscriptionOptions | undefined),
        mode: 'hashinal',
        metadata: options.metadata,
        waitForConfirmation: true,
        network: this.network,
      };

      const res: InscriptionResponse = await inscribeWithSigner(
        input,
        this.signer,
        inscriptionOptions,
      );
      const inscriptionTopicId =
        res.inscription?.jsonTopicId || getInscriptionTopicId(res.inscription);
      if (!inscriptionTopicId)
        return { success: false, error: 'Failed to inscribe data' };

      let registryTopicId = options.registryTopicId;
      if (!registryTopicId) {
        const reg = await this.createRegistry({ ttl: options.ttl });
        if (!reg.success || !reg.topicId)
          return { success: false, error: reg.error };
        registryTopicId = reg.topicId;
      }

      const regRes = await this.registerEntry(registryTopicId, {
        targetTopicId: inscriptionTopicId,
        memo: options.memo || 'Dynamic hashinal registration',
      });
      if (!regRes.success) return { success: false, error: regRes.error };

      return {
        success: true,
        registryTopicId,
        inscriptionTopicId,
      };
    } catch (error) {
      this.logger.error(`Failed to register dynamic hashinal: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Validate that a topic is a valid HCS-6 registry
   * @param topicId The topic ID to validate
   * @returns Promise resolving to true if valid, false otherwise
   */
  async validateHCS6Topic(topicId: string): Promise<boolean> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
      const memoInfo = this.parseRegistryTypeFromMemo(topicInfo.memo);

      if (!memoInfo) {
        this.logger.warn(
          `Topic ${topicId} is not a valid HCS-6 registry (invalid memo format)`,
        );
        return false;
      }

      if (memoInfo.registryType !== HCS6RegistryType.NON_INDEXED) {
        this.logger.warn(
          `Topic ${topicId} is not a valid HCS-6 registry (must be non-indexed)`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating HCS-6 topic ${topicId}: ${error}`);
      return false;
    }
  }
}

function getTopicSequenceNumber(
  receipt: TransactionReceipt & { topicSequenceNumber?: number | Long },
): number | undefined {
  const v = receipt.topicSequenceNumber;
  if (typeof v === 'number') return v;
  return v ? (v as Long).toInt() : undefined;
}
