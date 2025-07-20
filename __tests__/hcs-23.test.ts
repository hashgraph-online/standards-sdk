/**
 * HCS-23 State Hash Calculator Tests
 *
 * Tests for calculating SHA384 state hashes for accounts and composite accounts
 */

import { StateHashCalculator } from '../src/hcs-23/state-hash-calculator';
import {
  AccountStateInput,
  CompositeStateInput,
  TopicState,
  StateHashResult,
  CompositeStateHashResult,
} from '../src/hcs-23/types';
import { PublicKey } from '@hashgraph/sdk';

describe('StateHashCalculator', () => {
  let calculator: StateHashCalculator;

  beforeEach(() => {
    calculator = new StateHashCalculator();
  });

  describe('calculateAccountStateHash', () => {
    it('should calculate SHA384 hash for a single account state', () => {
      const accountInput: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'pubkey123',
        topics: [
          {
            topicId: '0.0.8001',
            latestRunningHash: 'abc123def456',
          },
          {
            topicId: '0.0.8002',
            latestRunningHash: 'def456ghi789',
          },
        ],
      };

      const result = calculator.calculateAccountStateHash(accountInput);

      expect(result).toBeDefined();
      expect(typeof result.stateHash).toBe('string');
      expect(result.stateHash.length).toBe(96);
      expect(result.stateHash).toMatch(/^[a-f0-9]+$/);
      expect(result.accountId).toBe('0.0.12345');
      expect(result.topicCount).toBe(2);
    });

    it('should produce different hashes for different public keys', () => {
      const input1: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'pubkey123',
        topics: [],
      };

      const input2: AccountStateInput = {
        accountId: '0.0.54321',
        publicKey: 'pubkey456',
        topics: [],
      };

      const result1 = calculator.calculateAccountStateHash(input1);
      const result2 = calculator.calculateAccountStateHash(input2);

      expect(result1.stateHash).not.toBe(result2.stateHash);
    });

    it('should produce same hash for accounts with same public key and topics', () => {
      const input1: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'pubkey123',
        topics: [],
      };

      const input2: AccountStateInput = {
        accountId: '0.0.54321',
        publicKey: 'pubkey123',
        topics: [],
      };

      const result1 = calculator.calculateAccountStateHash(input1);
      const result2 = calculator.calculateAccountStateHash(input2);

      expect(result1.stateHash).toBe(result2.stateHash);
    });

    it('should produce consistent hashes for identical states', () => {
      const accountInput: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'same_key',
        topics: [
          {
            topicId: '0.0.8001',
            latestRunningHash: 'consistent_hash',
          },
        ],
      };

      const result1 = calculator.calculateAccountStateHash(accountInput);
      const result2 = calculator.calculateAccountStateHash(accountInput);

      expect(result1.stateHash).toBe(result2.stateHash);
    });

    it('should handle account state with no topics', () => {
      const accountInput: AccountStateInput = {
        accountId: '0.0.99999',
        publicKey: 'empty_topics_key',
        topics: [],
      };

      const result = calculator.calculateAccountStateHash(accountInput);

      expect(result).toBeDefined();
      expect(result.stateHash.length).toBe(96);
      expect(result.topicCount).toBe(0);
    });

    it('should sort topics by ID before hashing', () => {
      const input1: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'test_key',
        topics: [
          {
            topicId: '0.0.8002',
            latestRunningHash: 'hash2',
          },
          {
            topicId: '0.0.8001',
            latestRunningHash: 'hash1',
          },
        ],
      };

      const input2: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'test_key',
        topics: [
          {
            topicId: '0.0.8001',
            latestRunningHash: 'hash1',
          },
          {
            topicId: '0.0.8002',
            latestRunningHash: 'hash2',
          },
        ],
      };

      const result1 = calculator.calculateAccountStateHash(input1);
      const result2 = calculator.calculateAccountStateHash(input2);

      expect(result1.stateHash).toBe(result2.stateHash);
    });
  });

  describe('calculateCompositeStateHash', () => {
    it('should calculate SHA384 hash for composite state', () => {
      const compositeInput: CompositeStateInput = {
        compositeAccountId: '0.0.99999',
        compositePublicKeyFingerprint: 'flora_composite_key',
        memberStates: [
          {
            accountId: '0.0.1001',
            stateHash: 'member1_hash_48_chars_long_abcdef123456789012',
          },
          {
            accountId: '0.0.1002',
            stateHash: 'member2_hash_48_chars_long_fedcba987654321098',
          },
        ],
        compositeTopics: [
          {
            topicId: '0.0.8001',
            latestRunningHash: 'composite_topic1_hash',
          },
          {
            topicId: '0.0.8002',
            latestRunningHash: 'composite_topic2_hash',
          },
        ],
      };

      const result = calculator.calculateCompositeStateHash(compositeInput);

      expect(result).toBeDefined();
      expect(typeof result.stateHash).toBe('string');
      expect(result.stateHash.length).toBe(96);
      expect(result.stateHash).toMatch(/^[a-f0-9]+$/);
      expect(result.accountId).toBe('0.0.99999');
      expect(result.memberCount).toBe(2);
      expect(result.compositeTopicCount).toBe(2);
    });

    it('should sort member states by account ID before hashing', () => {
      const input1: CompositeStateInput = {
        compositeAccountId: '0.0.99999',
        compositePublicKeyFingerprint: 'flora_key',
        memberStates: [
          {
            accountId: '0.0.1002',
            stateHash: 'member2_hash',
          },
          {
            accountId: '0.0.1001',
            stateHash: 'member1_hash',
          },
        ],
        compositeTopics: [],
      };

      const input2: CompositeStateInput = {
        compositeAccountId: '0.0.99999',
        compositePublicKeyFingerprint: 'flora_key',
        memberStates: [
          {
            accountId: '0.0.1001',
            stateHash: 'member1_hash',
          },
          {
            accountId: '0.0.1002',
            stateHash: 'member2_hash',
          },
        ],
        compositeTopics: [],
      };

      const result1 = calculator.calculateCompositeStateHash(input1);
      const result2 = calculator.calculateCompositeStateHash(input2);

      expect(result1.stateHash).toBe(result2.stateHash);
    });

    it('should sort composite topics by ID before hashing', () => {
      const input1: CompositeStateInput = {
        compositeAccountId: '0.0.99999',
        compositePublicKeyFingerprint: 'flora_key',
        memberStates: [],
        compositeTopics: [
          {
            topicId: '0.0.8002',
            latestRunningHash: 'topic2_hash',
          },
          {
            topicId: '0.0.8001',
            latestRunningHash: 'topic1_hash',
          },
        ],
      };

      const input2: CompositeStateInput = {
        compositeAccountId: '0.0.99999',
        compositePublicKeyFingerprint: 'flora_key',
        memberStates: [],
        compositeTopics: [
          {
            topicId: '0.0.8001',
            latestRunningHash: 'topic1_hash',
          },
          {
            topicId: '0.0.8002',
            latestRunningHash: 'topic2_hash',
          },
        ],
      };

      const result1 = calculator.calculateCompositeStateHash(input1);
      const result2 = calculator.calculateCompositeStateHash(input2);

      expect(result1.stateHash).toBe(result2.stateHash);
    });

    it('should handle empty member states and topics', () => {
      const input: CompositeStateInput = {
        compositeAccountId: '0.0.99999',
        compositePublicKeyFingerprint: 'empty_flora_key',
        memberStates: [],
        compositeTopics: [],
      };

      const result = calculator.calculateCompositeStateHash(input);

      expect(result).toBeDefined();
      expect(result.stateHash.length).toBe(96);
      expect(result.memberCount).toBe(0);
      expect(result.compositeTopicCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle very large topic counts', () => {
      const largeTopics: TopicState[] = [];
      for (let i = 0; i < 1000; i++) {
        largeTopics.push({
          topicId: `0.0.${8000 + i}`,
          latestRunningHash: `hash_${i}`,
        });
      }

      const input: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'test_key',
        topics: largeTopics,
      };

      const result = calculator.calculateAccountStateHash(input);

      expect(result).toBeDefined();
      expect(result.topicCount).toBe(1000);
      expect(result.stateHash.length).toBe(96);
    });

    it('should handle very long running hashes', () => {
      const veryLongHash = 'a'.repeat(10000);
      const input: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'test_key',
        topics: [
          {
            topicId: '0.0.8001',
            latestRunningHash: veryLongHash,
          },
        ],
      };

      const result = calculator.calculateAccountStateHash(input);

      expect(result).toBeDefined();
      expect(result.stateHash.length).toBe(96);
    });

    it('should handle empty string inputs gracefully', () => {
      const input: AccountStateInput = {
        accountId: '',
        publicKey: '',
        topics: [],
      };

      const result = calculator.calculateAccountStateHash(input);

      expect(result).toBeDefined();
      expect(result.stateHash.length).toBe(96);
    });
  });

  describe('Performance and Consistency', () => {
    it('should produce deterministic results across multiple calculations', () => {
      const input: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'deterministic_key',
        topics: [
          {
            topicId: '0.0.8001',
            latestRunningHash: 'deterministic_test_hash',
          },
        ],
      };

      const hashes: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = calculator.calculateAccountStateHash(input);
        hashes.push(result.stateHash);
      }

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });

    it('should calculate state hashes efficiently for large composite datasets', () => {
      const largeMemberStates = [];
      for (let i = 0; i < 100; i++) {
        largeMemberStates.push({
          accountId: `0.0.${1000 + i}`,
          stateHash: `state_hash_${i}_48_chars_long_padding_abcdef12345`,
        });
      }

      const largeTopics = [];
      for (let i = 0; i < 50; i++) {
        largeTopics.push({
          topicId: `0.0.${8000 + i}`,
          latestRunningHash: `running_hash_${i}`,
        });
      }

      const input: CompositeStateInput = {
        compositeAccountId: '0.0.99999',
        compositePublicKeyFingerprint: 'large_dataset_key',
        memberStates: largeMemberStates,
        compositeTopics: largeTopics,
      };

      const startTime = Date.now();
      const result = calculator.calculateCompositeStateHash(input);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(result.stateHash.length).toBe(96);
      expect(result.memberCount).toBe(100);
      expect(result.compositeTopicCount).toBe(50);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});