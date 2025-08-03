/**
 * Base client for HCS-20 Auditable Points operations
 */

import { AccountId, TopicId } from '@hashgraph/sdk';
import { Logger , ILogger } from '../utils/logger';
import { HederaMirrorNode } from '../services/mirror-node';
import type { NetworkType } from '../utils/types';
import {
  HCS20ClientConfig,
  HCS20MessageSchema,
  PointsInfo,
  PointsTransaction,
  HCS20_CONSTANTS,
  DeployPointsOptions,
  MintPointsOptions,
  TransferPointsOptions,
  BurnPointsOptions,
  RegisterTopicOptions,
} from './types';
import { InvalidAccountFormatError } from './errors';

/**
 * Abstract base class for HCS-20 clients
 */
export abstract class HCS20BaseClient {
  protected logger: ILogger;
  protected mirrorNode: HederaMirrorNode;
  protected network: NetworkType;
  protected registryTopicId: string;
  protected publicTopicId: string;

  constructor(config: HCS20ClientConfig) {
    this.logger = config.logger || new Logger({ module: 'HCS20Client' });
    this.network = config.network === 'mainnet' ? 'mainnet' : 'testnet';
    this.mirrorNode = new HederaMirrorNode(
      this.network,
      this.logger,
      config.mirrorNodeUrl ? { customUrl: config.mirrorNodeUrl } : undefined,
    );
    this.registryTopicId =
      config.registryTopicId || HCS20_CONSTANTS.REGISTRY_TOPIC_ID;
    this.publicTopicId =
      config.publicTopicId || HCS20_CONSTANTS.PUBLIC_TOPIC_ID;
  }

  /**
   * Deploy new points
   */
  abstract deployPoints(options: DeployPointsOptions): Promise<PointsInfo>;

  /**
   * Mint points
   */
  abstract mintPoints(options: MintPointsOptions): Promise<PointsTransaction>;

  /**
   * Transfer points
   */
  abstract transferPoints(
    options: TransferPointsOptions,
  ): Promise<PointsTransaction>;

  /**
   * Burn points
   */
  abstract burnPoints(options: BurnPointsOptions): Promise<PointsTransaction>;

  /**
   * Register a topic in the registry
   */
  abstract registerTopic(options: RegisterTopicOptions): Promise<void>;

  /**
   * Validate HCS-20 message using Zod schema
   */
  protected validateMessage(message: any): {
    valid: boolean;
    errors?: string[];
  } {
    try {
      HCS20MessageSchema.parse(message);
      return { valid: true };
    } catch (error: any) {
      if (error.errors) {
        const errors = error.errors.map(
          (e: any) => `${e.path.join('.')}: ${e.message}`,
        );
        return { valid: false, errors };
      }
      return { valid: false, errors: [error.message] };
    }
  }

  /**
   * Normalize tick to lowercase and trimmed
   */
  protected normalizeTick(tick: string): string {
    return tick.toLowerCase().trim();
  }

  /**
   * Convert account to string format
   */
  protected accountToString(account: string | AccountId): string {
    if (typeof account === 'string') {
      if (!HCS20_CONSTANTS.HEDERA_ACCOUNT_REGEX.test(account)) {
        throw new InvalidAccountFormatError(account);
      }
      return account;
    }
    return account.toString();
  }

  /**
   * Convert topic to string format
   */
  protected topicToString(topic: string | TopicId): string {
    if (typeof topic === 'string') {
      if (!HCS20_CONSTANTS.HEDERA_ACCOUNT_REGEX.test(topic)) {
        throw new InvalidAccountFormatError(topic);
      }
      return topic;
    }
    return topic.toString();
  }

  /**
   * NOTE: State queries (getPointsInfo, getBalance, etc.) require an external indexing service.
   * The HCS-20 clients only handle message submission. Use HCS20PointsIndexer for state management.
   */
}
