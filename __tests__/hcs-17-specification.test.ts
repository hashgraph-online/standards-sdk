/**
 * HCS-17 Specification Compliance Tests
 *
 * These tests verify actual HCS-23 standard requirements from the specification
 */

import { createHash } from 'crypto';
import { PublicKey } from '@hashgraph/sdk';
import { HCS17BaseClient } from '../src/hcs-17/base-client';
import {
  AccountStateInput,
  CompositeStateInput,
  StateHashMessage,
  TopicState,
} from '../src/hcs-17/types';
import { Logger } from '../src/utils/logger';

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as any;

describe('HCS-17 Specification Compliance', () => {
  let calculator: HCS17BaseClient;

  beforeEach(() => {
    jest.clearAllMocks();
    calculator = new HCS17BaseClient({ network: 'testnet' as const, logger: mockLogger });
  });

  describe('State Hash Calculation Methodology (Spec Section: State Hash Calculation Methodology)', () => {
    it('should follow exact specification algorithm: SHA384(topicId || runningHash || ... || publicKey)', () => {
      const input: AccountStateInput = {
        accountId: '0.0.12345',
        publicKey: 'FGHKLJHDGK',
        topics: [
          { topicId: '0.0.12345', latestRunningHash: 'abcd1234' },
          { topicId: '0.0.67890', latestRunningHash: 'efgh5678' },
        ],
      };

      const result = calculator.calculateAccountStateHash(input);

      expect(result.stateHash).toHaveLength(96);
      expect(result.stateHash).toMatch(/^[0-9a-f]{96}$/);

      const expectedConcatenation =
        '0.0.12345abcd12340.0.67890efgh5678FGHKLJHDGK';
      const expectedHash = createHash('sha384')
        .update(expectedConcatenation)
        .digest('hex');
      expect(result.stateHash).toBe(expectedHash);
    });

    it('should sort topics by ID in ascending order (REQUIRED)', () => {
      const input: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'test-key',
        topics: [
          { topicId: '0.0.67890', latestRunningHash: 'hash2' },
          { topicId: '0.0.12345', latestRunningHash: 'hash1' },
          { topicId: '0.0.99999', latestRunningHash: 'hash3' },
        ],
      };

      const result = calculator.calculateAccountStateHash(input);

      const sortedConcatenation =
        '0.0.12345hash10.0.67890hash20.0.99999hash3test-key';
      const expectedHash = createHash('sha384')
        .update(sortedConcatenation)
        .digest('hex');
      expect(result.stateHash).toBe(expectedHash);
    });

    it('should handle both string and PublicKey objects for public key', () => {
      const mockPublicKey = {
        toString: () => 'mock-key-string',
      } as any;

      const input1: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'string-key',
        topics: [],
      };

      const input2: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: mockPublicKey,
        topics: [],
      };

      const result1 = calculator.calculateAccountStateHash(input1);
      const result2 = calculator.calculateAccountStateHash(input2);

      expect(result1.stateHash).toHaveLength(96);
      expect(result2.stateHash).toHaveLength(96);
      expect(result1.stateHash).not.toBe(result2.stateHash);
    });
  });

  describe('Composite State Hash (Spec Section: Composite State Hash Calculation)', () => {
    it('should follow spec algorithm: SHA384(accountId||StateHash + topicId||runningHash + fingerprint)', () => {
      const input: CompositeStateInput = {
        compositeAccountId: '0.0.777',
        compositePublicKeyFingerprint: '0xffff',
        memberStates: [
          { accountId: '0.0.111', stateHash: '0xaaa' },
          { accountId: '0.0.222', stateHash: '0xbbb' },
        ],
        compositeTopics: [
          { topicId: '0.0.333', latestRunningHash: '0xccc' },
          { topicId: '0.0.444', latestRunningHash: '0xddd' },
        ],
      };

      const result = calculator.calculateCompositeStateHash(input);

      expect(result.stateHash).toHaveLength(96);
      expect(result.stateHash).toMatch(/^[0-9a-f]{96}$/);

      const expectedConcatenation =
        '0.0.1110xaaa0.0.2220xbbb0.0.3330xccc0.0.4440xddd0xffff';
      const expectedHash = createHash('sha384')
        .update(expectedConcatenation)
        .digest('hex');
      expect(result.stateHash).toBe(expectedHash);
    });

    it('should sort member states by account ID lexicographically (REQUIRED)', () => {
      const input: CompositeStateInput = {
        compositeAccountId: '0.0.777',
        compositePublicKeyFingerprint: 'fingerprint',
        memberStates: [
          { accountId: '0.0.999', stateHash: 'hash3' },
          { accountId: '0.0.111', stateHash: 'hash1' },
          { accountId: '0.0.555', stateHash: 'hash2' },
        ],
        compositeTopics: [],
      };

      const result = calculator.calculateCompositeStateHash(input);

      const sortedConcatenation =
        '0.0.111hash10.0.555hash20.0.999hash3fingerprint';
      const expectedHash = createHash('sha384')
        .update(sortedConcatenation)
        .digest('hex');
      expect(result.stateHash).toBe(expectedHash);
    });

    it('should sort composite topics by ID lexicographically (REQUIRED)', () => {
      const input: CompositeStateInput = {
        compositeAccountId: '0.0.777',
        compositePublicKeyFingerprint: 'fingerprint',
        memberStates: [],
        compositeTopics: [
          { topicId: '0.0.999', latestRunningHash: 'hash3' },
          { topicId: '0.0.111', latestRunningHash: 'hash1' },
          { topicId: '0.0.555', latestRunningHash: 'hash2' },
        ],
      };

      const result = calculator.calculateCompositeStateHash(input);

      const sortedConcatenation =
        '0.0.111hash10.0.555hash20.0.999hash3fingerprint';
      const expectedHash = createHash('sha384')
        .update(sortedConcatenation)
        .digest('hex');
      expect(result.stateHash).toBe(expectedHash);
    });

    it('should handle empty member states and topics', () => {
      const input: CompositeStateInput = {
        compositeAccountId: '0.0.777',
        compositePublicKeyFingerprint: 'fingerprint',
        memberStates: [],
        compositeTopics: [],
      };

      const result = calculator.calculateCompositeStateHash(input);

      const expectedHash = createHash('sha384')
        .update('fingerprint')
        .digest('hex');
      expect(result.stateHash).toBe(expectedHash);
    });
  });

  describe('Public Key Fingerprinting (Spec Section: Deterministic KeyList Fingerprinting)', () => {
    it('should sort keys lexicographically before fingerprinting (REQUIRED)', () => {
      const keys = [
        { toString: () => 'key-zzz' },
        { toString: () => 'key-aaa' },
        { toString: () => 'key-mmm' },
      ] as any[];

      const fingerprint = calculator.calculateKeyFingerprint(keys, 2);

      expect(fingerprint).toHaveLength(96); // SHA384
      expect(fingerprint).toMatch(/^[0-9a-f]{96}$/);

      const fingerprint2 = calculator.calculateKeyFingerprint(keys, 2);
      expect(fingerprint).toBe(fingerprint2);

      const shuffledKeys = [keys[2], keys[0], keys[1]];
      const fingerprint3 = calculator.calculateKeyFingerprint(shuffledKeys, 2);
      expect(fingerprint).toBe(fingerprint3);
    });

    it('should include threshold in fingerprint calculation (REQUIRED)', () => {
      const keys = [
        { toString: () => 'key-1' },
        { toString: () => 'key-2' },
      ] as any[];

      const fingerprint1 = calculator.calculateKeyFingerprint(keys, 1);
      const fingerprint2 = calculator.calculateKeyFingerprint(keys, 2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should create deterministic fingerprint for Flora/Bloom accounts', () => {
      const petalKeys = [
        { toString: () => 'ecdsa-key-1' },
        { toString: () => 'ecdsa-key-2' },
        { toString: () => 'ecdsa-key-3' },
      ] as any[];

      const floraFingerprint = calculator.calculateKeyFingerprint(petalKeys, 2);

      const floraFingerprint2 = calculator.calculateKeyFingerprint(
        petalKeys,
        2,
      );
      expect(floraFingerprint).toBe(floraFingerprint2);

      expect(floraFingerprint).toHaveLength(96);
    });
  });

  describe('Message Format (Spec Section: HCS-17 Message Format)', () => {
    it('should create valid HCS-17 state hash message (REQUIRED)', () => {
      const message = calculator.createStateHashMessage(
        '0x9a1cfb...',
        '0.0.123456',
        ['0.0.topic1', '0.0.topic2'],
        'Change of state synchronization.',
      );

      expect(message).toEqual({
        p: 'hcs-17',
        op: 'state_hash',
        state_hash: '0x9a1cfb...',
        topics: ['0.0.topic1', '0.0.topic2'],
        account_id: '0.0.123456',
        timestamp: expect.any(String),
        m: 'Change of state synchronization.',
      });

      expect(message.p).toBe('hcs-17');
      expect(message.op).toBe('state_hash');
    });

    it('should include timestamp in ISO format', () => {
      const message = calculator.createStateHashMessage(
        'hash',
        '0.0.123',
        [],
        'test',
      );

      expect(message.timestamp).toBeDefined();
      expect(message.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('should handle optional memo field', () => {
      const messageWithMemo = calculator.createStateHashMessage(
        'hash',
        '0.0.123',
        [],
        'test memo',
      );

      const messageWithoutMemo = calculator.createStateHashMessage(
        'hash',
        '0.0.123',
        [],
      );

      expect(messageWithMemo.m).toBe('test memo');
      expect(messageWithoutMemo.m).toBeUndefined();
    });
  });

  describe('Recursive Composition (Spec Section: Composite State Hash)', () => {
    it('should support Bloom aggregating Flora hashes (REQUIRED)', () => {
      const floraHash1 = createHash('sha384')
        .update('flora-1-state')
        .digest('hex');
      const floraHash2 = createHash('sha384')
        .update('flora-2-state')
        .digest('hex');

      const bloomInput: CompositeStateInput = {
        compositeAccountId: '0.0.bloom',
        compositePublicKeyFingerprint: 'bloom-fingerprint',
        memberStates: [
          { accountId: '0.0.flora1', stateHash: floraHash1 },
          { accountId: '0.0.flora2', stateHash: floraHash2 },
        ],
        compositeTopics: [
          { topicId: '0.0.bloom-topic', latestRunningHash: 'bloom-hash' },
        ],
      };

      const bloomHash = calculator.calculateCompositeStateHash(bloomInput);

      expect(bloomHash.stateHash).toHaveLength(96);
      expect(bloomHash.memberCount).toBe(2);
      expect(bloomHash.compositeTopicCount).toBe(1);
    });

    it('should handle multi-level hierarchy (Meadow -> Bloom -> Flora -> Petal)', () => {
      const petalHash = calculator.calculateAccountStateHash({
        accountId: '0.0.petal',
        publicKey: 'petal-key',
        topics: [
          {
            topicId: '0.0.petal-topic',
            latestRunningHash: 'petal-running-hash',
          },
        ],
      });

      const floraHash = calculator.calculateCompositeStateHash({
        compositeAccountId: '0.0.flora',
        compositePublicKeyFingerprint: 'flora-fingerprint',
        memberStates: [
          { accountId: '0.0.petal', stateHash: petalHash.stateHash },
        ],
        compositeTopics: [],
      });

      const bloomHash = calculator.calculateCompositeStateHash({
        compositeAccountId: '0.0.bloom',
        compositePublicKeyFingerprint: 'bloom-fingerprint',
        memberStates: [
          { accountId: '0.0.flora', stateHash: floraHash.stateHash },
        ],
        compositeTopics: [],
      });

      expect(petalHash.stateHash).toHaveLength(96);
      expect(floraHash.stateHash).toHaveLength(96);
      expect(bloomHash.stateHash).toHaveLength(96);

      expect(petalHash.stateHash).not.toBe(floraHash.stateHash);
      expect(floraHash.stateHash).not.toBe(bloomHash.stateHash);
    });
  });

  describe('Hash Verification (Spec Section: Implementation Workflow)', () => {
    it('should verify account state hash by recalculation', async () => {
      const input: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'test-key',
        topics: [{ topicId: '0.0.456', latestRunningHash: 'test-hash' }],
      };

      const result = calculator.calculateAccountStateHash(input);
      const isValid = await calculator.verifyStateHash(input, result.stateHash);

      expect(isValid).toBe(true);

      const isInvalid = await calculator.verifyStateHash(input, 'wrong-hash');
      expect(isInvalid).toBe(false);
    });

    it('should verify composite state hash by recalculation', async () => {
      const input: CompositeStateInput = {
        compositeAccountId: '0.0.777',
        compositePublicKeyFingerprint: 'fingerprint',
        memberStates: [{ accountId: '0.0.123', stateHash: 'member-hash' }],
        compositeTopics: [],
      };

      const result = calculator.calculateCompositeStateHash(input);
      const isValid = await calculator.verifyStateHash(input, result.stateHash);

      expect(isValid).toBe(true);

      const isInvalid = await calculator.verifyStateHash(input, 'wrong-hash');
      expect(isInvalid).toBe(false);
    });
  });

  describe('Performance and Consistency (Spec Section: Implementation Notes)', () => {
    it('should produce deterministic results across multiple calculations', () => {
      const input: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'consistent-key',
        topics: [
          { topicId: '0.0.456', latestRunningHash: 'hash1' },
          { topicId: '0.0.789', latestRunningHash: 'hash2' },
        ],
      };

      const results = Array.from({ length: 10 }, () =>
        calculator.calculateAccountStateHash(input),
      );

      const firstHash = results[0].stateHash;
      results.forEach(result => {
        expect(result.stateHash).toBe(firstHash);
      });
    });

    it('should handle large numbers of topics efficiently', () => {
      const manyTopics: TopicState[] = Array.from({ length: 1000 }, (_, i) => ({
        topicId: `0.0.${1000 + i}`,
        latestRunningHash: `hash-${i}`,
      }));

      const input: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'test-key',
        topics: manyTopics,
      };

      const startTime = Date.now();
      const result = calculator.calculateAccountStateHash(input);
      const endTime = Date.now();

      expect(result.stateHash).toHaveLength(96);
      expect(result.topicCount).toBe(1000);

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle large composite datasets efficiently', () => {
      const manyMembers = Array.from({ length: 100 }, (_, i) => ({
        accountId: `0.0.${2000 + i}`,
        stateHash: createHash('sha384').update(`member-${i}`).digest('hex'),
      }));

      const manyTopics = Array.from({ length: 100 }, (_, i) => ({
        topicId: `0.0.${3000 + i}`,
        latestRunningHash: createHash('sha256')
          .update(`topic-${i}`)
          .digest('hex'),
      }));

      const input: CompositeStateInput = {
        compositeAccountId: '0.0.composite',
        compositePublicKeyFingerprint: 'large-fingerprint',
        memberStates: manyMembers,
        compositeTopics: manyTopics,
      };

      const startTime = Date.now();
      const result = calculator.calculateCompositeStateHash(input);
      const endTime = Date.now();

      expect(result.stateHash).toHaveLength(96);
      expect(result.memberCount).toBe(100);
      expect(result.compositeTopicCount).toBe(100);

      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty topic arrays gracefully', () => {
      const input: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'test-key',
        topics: [],
      };

      const result = calculator.calculateAccountStateHash(input);

      expect(result.stateHash).toHaveLength(96);
      expect(result.topicCount).toBe(0);
    });

    it('should handle very long topic IDs and hashes', () => {
      const longTopicId = '0.0.' + '9'.repeat(50);
      const longHash = 'a'.repeat(100);

      const input: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'test-key',
        topics: [{ topicId: longTopicId, latestRunningHash: longHash }],
      };

      const result = calculator.calculateAccountStateHash(input);

      expect(result.stateHash).toHaveLength(96);
      expect(() => calculator.calculateAccountStateHash(input)).not.toThrow();
    });

    it('should handle special characters in inputs gracefully', () => {
      const input: AccountStateInput = {
        accountId: '0.0.123',
        publicKey: 'key-with-special-chars-!@#$%^&*()',
        topics: [
          { topicId: '0.0.456', latestRunningHash: 'hash-with-unicode-🦎' },
        ],
      };

      expect(() => calculator.calculateAccountStateHash(input)).not.toThrow();
    });
  });
});
