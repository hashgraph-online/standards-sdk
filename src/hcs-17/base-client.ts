import { HederaMirrorNode } from '../services/mirror-node';
import { Logger, ILogger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { createHash } from 'crypto';
import {
  hcs17MessageSchema,
  StateHashMessage,
  HCS17ClientConfig,
  parseHCS17Memo,
  generateHCS17Memo,
  HCS17TopicType,
  AccountStateInput,
  CompositeStateInput,
  StateHashResult,
  CompositeStateHashResult,
} from './types';
import { PublicKey } from '@hashgraph/sdk';

/**
 * Base client for HCS‑17 functionality, shared between Node and Browser clients.
 * Provides logging, mirror‑node access, message creation/validation,
 * topic memo helpers, and registry/message querying utilities.
 */
export class HCS17BaseClient {
  protected readonly network: NetworkType;
  protected readonly mirrorNode: HederaMirrorNode;
  protected readonly logger: ILogger;

  constructor(config: HCS17ClientConfig) {
    this.network = config.network;
    this.logger =
      config.logger ||
      new Logger({ level: config.logLevel || 'info', module: 'HCS-17' });
    this.mirrorNode = new HederaMirrorNode(this.network, this.logger, {
      customUrl: config.mirrorNodeUrl,
    });
  }

  /**
   * Create a valid HCS‑17 state hash message payload.
   */
  protected createMessage(params: {
    stateHash: string;
    accountId: string;
    topics: string[];
    memo?: string;
    epoch?: number;
  }): StateHashMessage {
    const msg: StateHashMessage = {
      p: 'hcs-17',
      op: 'state_hash',
      state_hash: params.stateHash,
      topics: params.topics,
      account_id: params.accountId,
      epoch: params.epoch,
      timestamp: new Date().toISOString(),
      m: params.memo,
    };
    return msg;
  }

  /**
   * Validate an HCS‑17 message against the schema.
   */
  protected validateMessage(message: unknown): {
    valid: boolean;
    errors: string[];
  } {
    const res = hcs17MessageSchema.safeParse(message);
    if (res.success) {
      return { valid: true, errors: [] };
    }
    const errors = res.error.errors.map(
      e => `${e.path.join('.')}: ${e.message}`,
    );
    this.logger.debug(`HCS-17 message validation failed: ${errors.join(', ')}`);
    return { valid: false, errors };
  }

  /**
   * Generate default HCS‑17 topic memo using numeric enum codes.
   */
  protected generateTopicMemo(ttl: number): string {
    return generateHCS17Memo(ttl);
  }

  /**
   * Validate that a topic is a valid HCS‑17 topic and return parsed info.
   */
  async validateHCS17Topic(topicId: string): Promise<{
    valid: boolean;
    type?: HCS17TopicType;
    ttl?: number;
    error?: string;
  }> {
    try {
      const info = await this.mirrorNode.getTopicInfo(topicId);
      const parsed = parseHCS17Memo(info.memo);
      if (!parsed) {
        return { valid: false, error: 'Invalid HCS-17 memo format' };
      }
      if (parsed.type !== HCS17TopicType.STATE) {
        return { valid: false, error: 'Unsupported HCS-17 topic type' };
      }
      return { valid: true, type: parsed.type, ttl: parsed.ttl };
    } catch (e: unknown) {
      return { valid: false, error: String(e) };
    }
  }

  /**
   * Fetch recent HCS‑17 messages from a topic via Mirror Node.
   */
  async getRecentMessages(
    topicId: string,
    options?: { limit?: number; order?: 'asc' | 'desc' },
  ): Promise<
    Array<{
      message: StateHashMessage;
      consensus_timestamp?: string;
      sequence_number: number;
      payer?: string;
    }>
  > {
    const limit = options?.limit ?? 25;
    const order = options?.order ?? 'desc';
    const items = await this.mirrorNode.getTopicMessages(topicId, {
      limit,
      order,
    });
    type HCS17Envelope = StateHashMessage & {
      consensus_timestamp?: string;
      sequence_number: number;
      payer?: string;
    };
    const results: Array<{
      message: StateHashMessage;
      consensus_timestamp?: string;
      sequence_number: number;
      payer?: string;
    }> = [];
    for (const m of items) {
      try {
        if (m.p !== 'hcs-17' || m.op !== 'state_hash') {
          continue;
        }
        const envelope = m as unknown as HCS17Envelope;
        const { valid } = this.validateMessage(envelope);
        if (!valid) {
          continue;
        }
        results.push({
          message: {
            p: 'hcs-17',
            op: 'state_hash',
            state_hash: envelope.state_hash,
            topics: envelope.topics,
            account_id: envelope.account_id,
            epoch: envelope.epoch,
            timestamp: envelope.timestamp,
            m: envelope.m,
          },
          consensus_timestamp: envelope.consensus_timestamp,
          sequence_number: Number(envelope.sequence_number),
          payer: envelope.payer,
        });
      } catch (err) {
        this.logger.debug(`Failed to parse HCS-17 message: ${err}`);
      }
    }
    return results;
  }

  /**
   * Return the latest valid HCS‑17 message on a topic, if any.
   */
  async getLatestMessage(topicId: string): Promise<
    | (StateHashMessage & {
        consensus_timestamp?: string;
        sequence_number: number;
      })
    | null
  > {
    const items = await this.getRecentMessages(topicId, {
      limit: 1,
      order: 'desc',
    });
    if (!items.length) {
      return null;
    }
    const { message, consensus_timestamp, sequence_number } = items[0];
    return Object.assign({}, message, { consensus_timestamp, sequence_number });
  }

  /**
   * Calculate state hash for a single account.
   */
  public calculateAccountStateHash(input: AccountStateInput): StateHashResult {
    try {
      this.logger.debug('Calculating account state hash', {
        accountId: input.accountId,
        topicCount: input.topics.length,
      });

      const sortedTopics = [...input.topics].sort((a, b) =>
        a.topicId.localeCompare(b.topicId),
      );

      let concatenated = '';
      for (const topic of sortedTopics) {
        concatenated += topic.topicId + topic.latestRunningHash;
      }

      let publicKeyString = '';
      if (typeof input.publicKey === 'string') {
        publicKeyString = input.publicKey;
      } else {
        publicKeyString = input.publicKey.toString();
      }
      concatenated += publicKeyString;
      const hash = createHash('sha384');
      hash.update(concatenated);
      const stateHash = hash.digest('hex');

      this.logger.debug('Account state hash calculated', {
        accountId: input.accountId,
        stateHash,
      });

      return {
        stateHash,
        accountId: input.accountId,
        timestamp: new Date(),
        topicCount: input.topics.length,
      };
    } catch (error) {
      this.logger.error('Failed to calculate account state hash', error);
      throw new Error('HCS-17 CALCULATION_FAILED');
    }
  }

  /**
   * Calculate composite state hash for composite accounts (e.g., Flora/Bloom).
   */
  public calculateCompositeStateHash(
    input: CompositeStateInput,
  ): CompositeStateHashResult {
    try {
      this.logger.debug('Calculating composite state hash', {
        compositeAccountId: input.compositeAccountId,
        memberCount: input.memberStates.length,
        topicCount: input.compositeTopics.length,
      });

      const sortedMembers = [...input.memberStates].sort((a, b) =>
        a.accountId.localeCompare(b.accountId),
      );

      const sortedTopics = [...input.compositeTopics].sort((a, b) =>
        a.topicId.localeCompare(b.topicId),
      );

      let concatenated = '';
      for (const member of sortedMembers) {
        concatenated += member.accountId + member.stateHash;
      }
      for (const topic of sortedTopics) {
        concatenated += topic.topicId + topic.latestRunningHash;
      }

      concatenated += input.compositePublicKeyFingerprint;
      const hash = createHash('sha384');
      hash.update(concatenated);
      const stateHash = hash.digest('hex');

      this.logger.debug('Composite state hash calculated', {
        compositeAccountId: input.compositeAccountId,
        stateHash,
      });

      return {
        stateHash,
        accountId: input.compositeAccountId,
        timestamp: new Date(),
        topicCount: input.compositeTopics.length,
        memberCount: input.memberStates.length,
        compositeTopicCount: input.compositeTopics.length,
      };
    } catch (error) {
      this.logger.error('Failed to calculate composite state hash', error);
      throw new Error('HCS-17 COMPOSITE_CALCULATION_FAILED');
    }
  }

  /**
   * Calculate deterministic fingerprint for a threshold key from member public keys.
   */
  public calculateKeyFingerprint(keys: PublicKey[], threshold: number): string {
    try {
      const sortedKeys = [...keys].sort((a, b) =>
        a.toString().localeCompare(b.toString()),
      );
      const keyData = { threshold, keys: sortedKeys.map(k => k.toString()) };
      const hash = createHash('sha384');
      hash.update(JSON.stringify(keyData));
      return hash.digest('hex');
    } catch (error) {
      this.logger.error('Failed to calculate key fingerprint', error);
      throw new Error('HCS-17 FINGERPRINT_FAILED');
    }
  }

  /**
   * Build a valid HCS‑17 state hash message.
   */
  public createStateHashMessage(
    stateHash: string,
    accountId: string,
    topicIds: string[],
    memo?: string,
  ): StateHashMessage {
    return {
      p: 'hcs-17',
      op: 'state_hash',
      state_hash: stateHash,
      topics: topicIds,
      account_id: accountId,
      timestamp: new Date().toISOString(),
      m: memo,
    };
  }

  /**
   * Recompute and verify a state hash input against an expected value.
   */
  public async verifyStateHash(
    input: AccountStateInput | CompositeStateInput,
    expectedHash: string,
  ): Promise<boolean> {
    try {
      let calculatedHash: string;
      if ('publicKey' in input) {
        calculatedHash = this.calculateAccountStateHash(input).stateHash;
      } else {
        calculatedHash = this.calculateCompositeStateHash(input).stateHash;
      }
      const isValid = calculatedHash === expectedHash;
      const accountId =
        'accountId' in input ? input.accountId : input.compositeAccountId;
      this.logger.debug('State hash verification', {
        accountId,
        isValid,
        expected: expectedHash,
        calculated: calculatedHash,
      });
      return isValid;
    } catch (error) {
      this.logger.error('Failed to verify state hash', error);
      return false;
    }
  }
}
