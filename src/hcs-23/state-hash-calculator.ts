import { createHash } from 'crypto';
import { PublicKey, KeyList, Key } from '@hashgraph/sdk';
import { Logger } from '../utils/logger';
import {
  AccountStateInput,
  CompositeStateInput,
  StateHashResult,
  CompositeStateHashResult,
  StateHashMessage,
  TopicState,
  StateHashError,
} from './types';

/**
 * HCS-23 State Hash Calculator
 * Calculates state hashes for accounts and composite accounts (Flora/Bloom)
 */
export class StateHashCalculator {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger({ module: 'StateHashCalculator' });
  }

  /**
   * Calculate state hash for a single account
   * StateHash = SHA384(topicId_1 || latestRunningHash_1 || ... || topicId_n || latestRunningHash_n || account_publicKey)
   */
  calculateAccountStateHash(input: AccountStateInput): StateHashResult {
    try {
      this.logger.debug('Calculating account state hash', {
        accountId: input.accountId,
        topicCount: input.topics.length,
      });

      // Sort topics by ID in ascending order
      const sortedTopics = [...input.topics].sort((a, b) =>
        a.topicId.localeCompare(b.topicId)
      );

      // Concatenate topic IDs and running hashes
      let concatenated = '';
      for (const topic of sortedTopics) {
        concatenated += topic.topicId + topic.latestRunningHash;
      }

      // Append public key
      const publicKeyString =
        typeof input.publicKey === 'string'
          ? input.publicKey
          : input.publicKey.toString();
      concatenated += publicKeyString;

      // Calculate SHA384 hash
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
      throw new StateHashError(
        'Failed to calculate account state hash',
        'CALCULATION_FAILED'
      );
    }
  }

  /**
   * Calculate composite state hash for Flora/Bloom
   * CompositeStateHash = SHA384(
   *   Σ_sorted(accountId_i || StateHash_i) ||
   *   Σ_sorted(topicId_j || runningHash_j) ||
   *   composite_publicKeyFingerprint
   * )
   */
  calculateCompositeStateHash(
    input: CompositeStateInput
  ): CompositeStateHashResult {
    try {
      this.logger.debug('Calculating composite state hash', {
        compositeAccountId: input.compositeAccountId,
        memberCount: input.memberStates.length,
        topicCount: input.compositeTopics.length,
      });

      // Sort member states by account ID
      const sortedMembers = [...input.memberStates].sort((a, b) =>
        a.accountId.localeCompare(b.accountId)
      );

      // Sort composite topics by ID
      const sortedTopics = [...input.compositeTopics].sort((a, b) =>
        a.topicId.localeCompare(b.topicId)
      );

      // Concatenate member account IDs and state hashes
      let concatenated = '';
      for (const member of sortedMembers) {
        concatenated += member.accountId + member.stateHash;
      }

      // Concatenate topic IDs and running hashes
      for (const topic of sortedTopics) {
        concatenated += topic.topicId + topic.latestRunningHash;
      }

      // Append composite public key fingerprint
      concatenated += input.compositePublicKeyFingerprint;

      // Calculate SHA384 hash
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
      throw new StateHashError(
        'Failed to calculate composite state hash',
        'CALCULATION_FAILED'
      );
    }
  }

  /**
   * Calculate deterministic public key fingerprint for KeyList/Threshold keys
   * Used for Flora/Bloom accounts
   */
  calculateKeyFingerprint(
    keys: PublicKey[],
    threshold: number
  ): string {
    try {
      // Sort keys lexicographically by their string representation
      const sortedKeys = [...keys].sort((a, b) =>
        a.toString().localeCompare(b.toString())
      );

      // Create a deterministic representation
      const keyData = {
        threshold,
        keys: sortedKeys.map(k => k.toString()),
      };

      // Calculate SHA384 of the JSON representation
      const hash = createHash('sha384');
      hash.update(JSON.stringify(keyData));
      return hash.digest('hex');
    } catch (error) {
      this.logger.error('Failed to calculate key fingerprint', error);
      throw new StateHashError(
        'Failed to calculate key fingerprint',
        'FINGERPRINT_FAILED'
      );
    }
  }

  /**
   * Create HCS-23 state hash message
   */
  createStateHashMessage(
    stateHash: string,
    accountId: string,
    topicIds: string[],
    memo?: string
  ): StateHashMessage {
    return {
      p: 'hcs-23',
      op: 'state_hash',
      state_hash: stateHash,
      topics: topicIds,
      account_id: accountId,
      timestamp: new Date().toISOString(),
      m: memo,
    };
  }

  /**
   * Verify state hash by recalculating
   */
  async verifyStateHash(
    input: AccountStateInput | CompositeStateInput,
    expectedHash: string
  ): Promise<boolean> {
    try {
      let calculatedHash: string;

      if ('publicKey' in input) {
        // Account state hash
        const result = this.calculateAccountStateHash(input);
        calculatedHash = result.stateHash;
      } else {
        // Composite state hash
        const result = this.calculateCompositeStateHash(input);
        calculatedHash = result.stateHash;
      }

      const isValid = calculatedHash === expectedHash;

      const accountId = 'accountId' in input ? input.accountId : input.compositeAccountId;
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

  /**
   * Get latest running hashes for topics (mock implementation)
   * In production, this would query the actual Hedera network
   */
  async getTopicRunningHashes(topicIds: string[]): Promise<TopicState[]> {
    // Mock implementation - replace with actual Hedera queries
    return topicIds.map(topicId => ({
      topicId,
      latestRunningHash: createHash('sha256')
        .update(`mock-hash-${topicId}-${Date.now()}`)
        .digest('hex')
        .substring(0, 48),
    }));
  }

  /**
   * Calculate and publish state hash to a topic
   */
  async publishStateHash(
    stateHash: string,
    accountId: string,
    topicIds: string[],
    publishTopicId: string,
    client: any
  ): Promise<void> {
    try {
      const message = this.createStateHashMessage(
        stateHash,
        accountId,
        topicIds,
        'State synchronization'
      );

      // Import dynamically to avoid circular dependency
      const { TopicMessageSubmitTransaction } = await import('@hashgraph/sdk');

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(publishTopicId)
        .setMessage(JSON.stringify(message));

      const response = await transaction.execute(client);
      await response.getReceipt(client);

      this.logger.info('State hash published', {
        accountId,
        topicId: publishTopicId,
        stateHash,
      });
    } catch (error) {
      this.logger.error('Failed to publish state hash', error);
      throw new StateHashError(
        'Failed to publish state hash',
        'PUBLISH_FAILED'
      );
    }
  }
}