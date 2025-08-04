import { Logger, ILogger } from '../utils/logger';
import { HederaMirrorNode } from '../services/mirror-node';
import {
  HCS6ClientConfig,
  HCS6Message,
  HCS6Operation,
  HCS6RegisterMessage,
  HCS6RegistryType,
  HCS6TopicRegistrationResponse,
  HCS6RegistryOperationResponse,
  HCS6TopicRegistry,
  HCS6CreateRegistryOptions,
  HCS6RegisterEntryOptions,
  HCS6QueryRegistryOptions,
  HCS6RegistryEntry,
  HCS6CreateHashinalOptions,
  HCS6CreateHashinalResponse,
  HCS6RegisterOptions,
  hcs6MessageSchema,
  validateHCS6TTL,
  generateHCS6RegistryMemo,
} from './types';
import { TransactionReceipt } from '@hashgraph/sdk';
import { NetworkType } from '../utils/types';
import { ZodError } from 'zod';

/**
 * Base client for HCS-6 operations
 * This abstract class provides shared functionality for both SDK and browser implementations
 */
export abstract class HCS6BaseClient {
  protected logger: ILogger;
  protected mirrorNode: HederaMirrorNode;
  protected network: NetworkType;

  /**
   * Create a new HCS-6 base client
   * @param config Client configuration
   */
  constructor(config: HCS6ClientConfig) {
    this.network = config.network;

    this.logger =
      config.logger ||
      Logger.getInstance({
        level: config.logLevel || 'info',
        module: 'HCS6Client',
        silent: config.silent,
      });

    this.mirrorNode = new HederaMirrorNode(
      this.network,
      this.logger,
      config.mirrorNodeUrl ? { customUrl: config.mirrorNodeUrl } : undefined,
    );
  }

  /**
   * Create a new HCS-6 registry topic (for dynamic hashinals)
   * @param options Registry creation options
   * @returns Promise resolving to the transaction result
   */
  abstract createRegistry(
    options: HCS6CreateRegistryOptions,
  ): Promise<HCS6TopicRegistrationResponse>;

  /**
   * Register a new dynamic hashinal update in the registry
   * @param registryTopicId The topic ID of the HCS-6 registry
   * @param options Registration options
   * @returns Promise resolving to the operation result
   */
  abstract registerEntry(
    registryTopicId: string,
    options: HCS6RegisterEntryOptions,
  ): Promise<HCS6RegistryOperationResponse>;

  /**
   * Get the latest entry from a HCS-6 registry (non-indexed, so only latest matters)
   * @param topicId The topic ID of the registry
   * @param options Query options
   * @returns Promise resolving to the registry information
   */
  abstract getRegistry(
    topicId: string,
    options?: HCS6QueryRegistryOptions,
  ): Promise<HCS6TopicRegistry>;

  /**
   * Submit a message to a HCS-6 topic
   * @param topicId The topic ID to submit to
   * @param payload The message payload
   * @returns Promise resolving to the transaction receipt
   */
  abstract submitMessage(
    topicId: string,
    payload: HCS6Message,
  ): Promise<TransactionReceipt>;

  /**
   * Create a complete dynamic hashinal with inscription and registry
   * @param options Options for creating the dynamic hashinal
   * @returns Promise resolving to the creation response
   */
  abstract createHashinal(
    options: HCS6CreateHashinalOptions,
  ): Promise<HCS6CreateHashinalResponse>;

  /**
   * Register a dynamic hashinal with combined inscription and registry creation
   * @param options Options for registering the dynamic hashinal
   * @returns Promise resolving to the creation response
   */
  abstract register(
    options: HCS6RegisterOptions,
  ): Promise<HCS6CreateHashinalResponse>;

  /**
   * Determine the registry type from a topic memo (HCS-6 specific)
   * @param memo The topic memo
   * @returns The registry type or undefined if not found
   */
  protected parseRegistryTypeFromMemo(
    memo: string,
  ): { registryType: HCS6RegistryType; ttl: number } | undefined {
    try {
      const regex = /hcs-6:(\d):(\d+)/;
      const match = memo.match(regex);

      if (match && match.length === 3) {
        const registryType = parseInt(match[1]) as HCS6RegistryType;
        const ttl = parseInt(match[2]);

        if (
          registryType === HCS6RegistryType.NON_INDEXED &&
          validateHCS6TTL(ttl)
        ) {
          return { registryType, ttl };
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error(
        `Error parsing HCS-6 registry type from memo: ${error}`,
      );
      return undefined;
    }
  }

  /**
   * Generate a memo string for a HCS-6 registry topic
   * @param ttl The time-to-live in seconds
   * @returns The memo string
   */
  protected generateRegistryMemo(ttl: number): string {
    return generateHCS6RegistryMemo(ttl);
  }

  /**
   * Validate a HCS-6 message
   * @param message The message to validate
   * @returns Validation result
   */
  protected validateMessage(message: unknown): {
    valid: boolean;
    errors: string[];
  } {
    try {
      hcs6MessageSchema.parse(message);
      return { valid: true, errors: [] };
    } catch (error) {
      const errors: string[] = [];

      if (error instanceof ZodError) {
        error.errors.forEach(err => {
          const path = err.path.join('.');
          errors.push(`${path ? path + ': ' : ''}${err.message}`);
        });
      } else {
        errors.push(`Unexpected error: ${error}`);
      }

      this.logger.debug(
        `HCS-6 message validation failed: ${errors.join(', ')}`,
      );
      return { valid: false, errors };
    }
  }

  /**
   * Create a HCS-6 register message
   * @param targetTopicId The target HCS-1 topic ID
   * @param memo Optional memo
   * @returns The register message
   */
  protected createRegisterMessage(
    targetTopicId: string,
    memo?: string,
  ): HCS6RegisterMessage {
    return {
      p: 'hcs-6',
      op: HCS6Operation.REGISTER,
      t_id: targetTopicId,
      m: memo,
    };
  }

  /**
   * Parse HCS-6 registry entries from topic messages
   * @param topicId The topic ID
   * @param messages The messages to parse
   * @param registryType The registry type
   * @param ttl The time-to-live in seconds
   * @returns The parsed registry
   */
  protected parseRegistryEntries(
    topicId: string,
    messages: Array<{
      message?: string;
      sequence_number: number;
      consensus_timestamp: string;
      payer_account_id: string;
    }>,
    registryType: HCS6RegistryType,
    ttl: number,
  ): HCS6TopicRegistry {
    const entries: HCS6RegistryEntry[] = [];
    let latestEntry: HCS6RegistryEntry | undefined;

    this.logger.debug(
      `Parsing ${messages.length} messages for HCS-6 topic ${topicId}`,
    );

    for (const msg of messages) {
      try {
        if (!msg.message) {
          this.logger.debug(
            `Message is missing 'message' property: ${JSON.stringify(msg)}`,
          );
          continue;
        }

        const decodedMessage = Buffer.from(msg.message, 'base64').toString(
          'utf-8',
        );
        const message = JSON.parse(decodedMessage) as HCS6Message;

        this.logger.debug(
          `Successfully parsed HCS-6 message: ${JSON.stringify(message)}`,
        );

        const { valid, errors } = this.validateMessage(message);
        if (!valid) {
          this.logger.warn(`Invalid HCS-6 message: ${errors.join(', ')}`);
          continue;
        }

        const entry: HCS6RegistryEntry = {
          topicId,
          sequence: msg.sequence_number,
          timestamp: msg.consensus_timestamp,
          payer: msg.payer_account_id,
          message,
          consensus_timestamp: msg.consensus_timestamp,
          registry_type: registryType,
        };

        entries.push(entry);

        if (!latestEntry || entry.timestamp > latestEntry.timestamp) {
          latestEntry = entry;
        }
      } catch (error) {
        this.logger.warn(`Error parsing HCS-6 message: ${error}`);
      }
    }

    this.logger.debug(
      `Parsed ${entries.length} valid entries for HCS-6 topic ${topicId}`,
    );

    return {
      topicId,
      registryType,
      ttl,
      entries: latestEntry ? [latestEntry] : [],
      latestEntry,
    };
  }

  /**
   * Validate that a topic is a valid HCS-6 registry
   * @param topicId The topic ID to validate
   * @returns Promise resolving to true if valid, false otherwise
   */
  protected async validateHCS6Topic(topicId: string): Promise<boolean> {
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
