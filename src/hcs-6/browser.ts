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
import { TransactionReceipt } from '@hashgraph/sdk';

/**
 * Browser client configuration for HCS-6
 */
export interface BrowserHCS6ClientConfig extends HCS6ClientConfig {}

/**
 * Browser client for HCS-6 operations
 * This client is designed to work in browser environments where direct key management is not available
 */
export class HCS6BrowserClient extends HCS6BaseClient {
  /**
   * Create a new HCS-6 browser client
   * @param config Client configuration
   */
  constructor(config: BrowserHCS6ClientConfig) {
    super(config);
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
    throw new Error(
      'Browser client requires wallet integration for registry creation. ' +
        'Please use a wallet-compatible method or proxy service.',
    );
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
    throw new Error(
      'Browser client requires wallet integration for entry registration. ' +
        'Please use a wallet-compatible method or proxy service.',
    );
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
    throw new Error(
      'Browser client requires wallet integration for message submission. ' +
        'Please use a wallet-compatible method or proxy service.',
    );
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
    throw new Error(
      'Browser client requires wallet integration for hashinal creation. ' +
        'Please use a wallet-compatible method or proxy service.',
    );
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
    throw new Error(
      'Browser client requires wallet integration for hashinal registration. ' +
        'Please use a wallet-compatible method or proxy service.',
    );
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
