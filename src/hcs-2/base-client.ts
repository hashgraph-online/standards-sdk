import { Logger } from '../utils/logger';
import { HederaMirrorNode } from '../services/mirror-node';
import {
  HCS2ClientConfig,
  HCS2Message,
  HCS2Operation,
  HCS2RegisterMessage,
  HCS2UpdateMessage,
  HCS2DeleteMessage,
  HCS2MigrateMessage,
  HCS2RegistryType,
  TopicRegistrationResponse,
  RegistryOperationResponse,
  RegistryEntry,
  TopicRegistry,
  CreateRegistryOptions,
  RegisterEntryOptions,
  UpdateEntryOptions,
  DeleteEntryOptions,
  MigrateTopicOptions,
  QueryRegistryOptions,
  hcs2MessageSchema,
} from './types';
import { TransactionReceipt } from '@hashgraph/sdk';
import { NetworkType } from '../utils/types';
import { ZodError } from 'zod';

/**
 * Base client for HCS-2 operations
 * This abstract class provides shared functionality for both SDK and browser implementations
 */
export abstract class HCS2BaseClient {
  protected logger: Logger;
  protected mirrorNode: HederaMirrorNode;
  protected network: NetworkType;

  /**
   * Create a new HCS-2 base client
   * @param config Client configuration
   */
  constructor(config: HCS2ClientConfig) {
    this.network = config.network;

    this.logger =
      config.logger ||
      Logger.getInstance({
        level: config.logLevel || 'info',
        module: 'HCS2Client',
        silent: config.silent,
      });

    this.mirrorNode = new HederaMirrorNode(
      this.network,
      this.logger,
      config.mirrorNodeUrl ? { customUrl: config.mirrorNodeUrl } : undefined,
    );
  }

  /**
   * Create a new registry topic
   * @param options Registry creation options
   * @returns Promise resolving to the transaction result
   */
  abstract createRegistry(
    options: CreateRegistryOptions,
  ): Promise<TopicRegistrationResponse>;

  /**
   * Register a new entry in the registry
   * @param registryTopicId The topic ID of the registry
   * @param options Registration options
   * @returns Promise resolving to the operation result
   */
  abstract registerEntry(
    registryTopicId: string,
    options: RegisterEntryOptions,
  ): Promise<RegistryOperationResponse>;

  /**
   * Update an existing entry in the registry (indexed registries only)
   * @param registryTopicId The topic ID of the registry
   * @param options Update options
   * @returns Promise resolving to the operation result
   */
  abstract updateEntry(
    registryTopicId: string,
    options: UpdateEntryOptions,
  ): Promise<RegistryOperationResponse>;

  /**
   * Delete an entry from the registry (indexed registries only)
   * @param registryTopicId The topic ID of the registry
   * @param options Delete options
   * @returns Promise resolving to the operation result
   */
  abstract deleteEntry(
    registryTopicId: string,
    options: DeleteEntryOptions,
  ): Promise<RegistryOperationResponse>;

  /**
   * Migrate a registry to a new topic
   * @param registryTopicId The topic ID of the registry
   * @param options Migration options
   * @returns Promise resolving to the operation result
   */
  abstract migrateRegistry(
    registryTopicId: string,
    options: MigrateTopicOptions,
  ): Promise<RegistryOperationResponse>;

  /**
   * Get all entries from a registry
   * @param topicId The topic ID of the registry
   * @param options Query options
   * @returns Promise resolving to the registry information
   */
  abstract getRegistry(
    topicId: string,
    options?: QueryRegistryOptions,
  ): Promise<TopicRegistry>;

  /**
   * Submit a message to a topic
   * @param topicId The topic ID to submit to
   * @param payload The message payload
   * @returns Promise resolving to the transaction receipt
   */
  abstract submitMessage(
    topicId: string,
    payload: HCS2Message,
  ): Promise<TransactionReceipt>;

  /**
   * Determine the registry type from a topic memo
   * @param memo The topic memo
   * @returns The registry type or undefined if not found
   */
  protected parseRegistryTypeFromMemo(
    memo: string,
  ): { registryType: HCS2RegistryType; ttl: number } | undefined {
    try {
      const regex = /hcs-2:(\d):(\d+)/;
      const match = memo.match(regex);

      if (match && match.length === 3) {
        const registryType = parseInt(match[1]) as HCS2RegistryType;
        const ttl = parseInt(match[2]);

        if (registryType !== undefined && !isNaN(ttl)) {
          return { registryType, ttl };
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error(`Error parsing registry type from memo: ${error}`);
      return undefined;
    }
  }

  /**
   * Generate a memo string for a registry topic
   * @param registryType The registry type
   * @param ttl The time-to-live in seconds
   * @returns The memo string
   */
  protected generateRegistryMemo(
    registryType: HCS2RegistryType,
    ttl: number,
  ): string {
    return `hcs-2:${registryType}:${ttl}`;
  }

  /**
   * Validate a HCS-2 message
   * @param message The message to validate
   * @returns Validation result
   */
  protected validateMessage(message: any): {
    valid: boolean;
    errors: string[];
  } {
    try {
      // Use Zod schema for validation
      hcs2MessageSchema.parse(message);
      return { valid: true, errors: [] };
    } catch (error) {
      const errors: string[] = [];

      if (error instanceof ZodError) {
        // Format Zod errors for better readability
        error.errors.forEach(err => {
          const path = err.path.join('.');
          errors.push(`${path ? path + ': ' : ''}${err.message}`);
        });
      } else {
        // Handle non-Zod errors
        errors.push(`Unexpected error: ${error}`);
      }

      this.logger.debug(`Message validation failed: ${errors.join(', ')}`);
      return { valid: false, errors };
    }
  }

  /**
   * Create a register message
   * @param targetTopicId The target topic ID
   * @param metadata Optional metadata URI
   * @param memo Optional memo
   * @returns The register message
   */
  protected createRegisterMessage(
    targetTopicId: string,
    metadata?: string,
    memo?: string,
  ): HCS2RegisterMessage {
    return {
      p: 'hcs-2',
      op: HCS2Operation.REGISTER,
      t_id: targetTopicId,
      metadata,
      m: memo,
    };
  }

  /**
   * Create an update message
   * @param targetTopicId The target topic ID
   * @param uid The unique ID to update
   * @param metadata Optional metadata URI
   * @param memo Optional memo
   * @returns The update message
   */
  protected createUpdateMessage(
    targetTopicId: string,
    uid: string,
    metadata?: string,
    memo?: string,
  ): HCS2UpdateMessage {
    return {
      p: 'hcs-2',
      op: HCS2Operation.UPDATE,
      t_id: targetTopicId,
      uid,
      metadata,
      m: memo,
    };
  }

  /**
   * Create a delete message
   * @param uid The unique ID to delete
   * @param memo Optional memo
   * @returns The delete message
   */
  protected createDeleteMessage(uid: string, memo?: string): HCS2DeleteMessage {
    return {
      p: 'hcs-2',
      op: HCS2Operation.DELETE,
      uid,
      m: memo,
    };
  }

  /**
   * Create a migrate message
   * @param targetTopicId The target topic ID to migrate to
   * @param metadata Optional metadata URI
   * @param memo Optional memo
   * @returns The migrate message
   */
  protected createMigrateMessage(
    targetTopicId: string,
    metadata?: string,
    memo?: string,
  ): HCS2MigrateMessage {
    return {
      p: 'hcs-2',
      op: HCS2Operation.MIGRATE,
      t_id: targetTopicId,
      metadata,
      m: memo,
    };
  }

  /**
   * Parse registry entries from topic messages
   * @param topicId The topic ID
   * @param messages The messages to parse
   * @param registryType The registry type
   * @param ttl The time-to-live in seconds
   * @returns The parsed registry
   */
  protected parseRegistryEntries(
    topicId: string,
    messages: any[],
    registryType: HCS2RegistryType,
    ttl: number,
  ): TopicRegistry {
    const entries: RegistryEntry[] = [];
    let latestEntry: RegistryEntry | undefined;

    this.logger.debug(
      `Parsing ${messages.length} messages for topic ${topicId}`,
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
        const message = JSON.parse(decodedMessage);

        this.logger.debug(
          `Successfully parsed message: ${JSON.stringify(message)}`,
        );

        // Validate message
        const { valid, errors } = this.validateMessage(message);
        if (!valid) {
          this.logger.warn(`Invalid HCS-2 message: ${errors.join(', ')}`);
          continue;
        }

        const entry: RegistryEntry = {
          topicId,
          sequence: msg.sequence_number,
          timestamp: msg.consensus_timestamp,
          payer: msg.payer_account_id,
          message,
          consensus_timestamp: msg.consensus_timestamp,
          registry_type: registryType,
        };

        entries.push(entry);

        // For non-indexed registries, we only care about the latest message
        if (
          registryType === HCS2RegistryType.NON_INDEXED ||
          !latestEntry ||
          entry.timestamp > latestEntry.timestamp
        ) {
          latestEntry = entry;
        }
      } catch (error) {
        this.logger.warn(`Error parsing message: ${error}`);
      }
    }

    this.logger.debug(
      `Parsed ${entries.length} valid entries for topic ${topicId}`,
    );

    return {
      topicId,
      registryType,
      ttl,
      entries:
        registryType === HCS2RegistryType.INDEXED
          ? entries
          : latestEntry
            ? [latestEntry]
            : [],
      latestEntry,
    };
  }
}
