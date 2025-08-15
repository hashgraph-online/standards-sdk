/**
 * HCS-6 Integration Tests
 *
 * These tests run against testnet with real transactions.
 * No mocking - tests the actual HCS-6 implementation end-to-end.
 */

import { PrivateKey, TopicCreateTransaction } from '@hashgraph/sdk';
import { HCS6Client } from '../src/hcs-6/client';
import { HCS6Operation, HCS6RegistryType } from '../src/hcs-6/types';
import * as dotenv from 'dotenv';

dotenv.config();

describe('HCS-6 Integration Tests', () => {
  let client: HCS6Client;
  let operatorId: string;
  let registryTopicId: string;
  let targetTopicId: string;

  const DEFAULT_TTL = 86400;
  const MINIMUM_TTL = 3600;

  beforeAll(() => {
    operatorId = process.env.HEDERA_ACCOUNT_ID!;
    const operatorKey = process.env.HEDERA_PRIVATE_KEY!;

    if (!operatorId || !operatorKey) {
      throw new Error(
        'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
      );
    }

    client = new HCS6Client({
      operatorId,
      operatorKey,
      network: 'testnet',
    });
  });

  describe('Registry Creation', () => {
    it('should create a registry topic with correct memo format', async () => {
      const result = await client.createRegistry({
        ttl: DEFAULT_TTL,
        adminKey: true,
        submitKey: true,
      });

      expect(result.success).toBe(true);
      expect(result.topicId).toBeDefined();
      expect(result.transactionId).toBeDefined();

      registryTopicId = result.topicId!;

      const topicInfo = await (client as any).getTopicInfo(registryTopicId);
      expect(topicInfo.memo).toBe(`hcs-6:1:${DEFAULT_TTL}`);
    }, 30000);

    it('should create a registry with minimum TTL', async () => {
      const result = await client.createRegistry({
        ttl: MINIMUM_TTL,
      });

      expect(result.success).toBe(true);
      expect(result.topicId).toBeDefined();
      expect(result.transactionId).toBeDefined();

      const minTtlTopicId = result.topicId!;

      const topicInfo = await (client as any).getTopicInfo(minTtlTopicId);
      expect(topicInfo.memo).toBe(`hcs-6:1:${MINIMUM_TTL}`);
    }, 30000);

    it('should create a registry with a custom admin and submit key', async () => {
      const customKey = PrivateKey.generateED25519();
      const result = await client.createRegistry({
        ttl: DEFAULT_TTL,
        adminKey: customKey,
        submitKey: customKey,
      });

      expect(result.success).toBe(true);
      expect(result.topicId).toBeDefined();
      const customTopicId = result.topicId!;

      await new Promise(resolve => setTimeout(resolve, 8000));
      const topicInfo = await client.getTopicInfo(customTopicId);

      expect(topicInfo.admin_key).toBeDefined();
      expect(topicInfo.submit_key).toBeDefined();
    }, 30000);

    it('should create a target topic for testing', async () => {
      const result = await client.createRegistry({
        ttl: DEFAULT_TTL,
      });

      expect(result.success).toBe(true);
      expect(result.topicId).toBeDefined();

      targetTopicId = result.topicId!;
    }, 30000);

    it('should reject registry creation with TTL below minimum', async () => {
      const result = await client.createRegistry({
        ttl: 3599,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('TTL must be at least 3600 seconds');
    }, 10000);
  });

  describe('Registry Operations', () => {
    let updatedTargetTopicId: string;

    beforeAll(async () => {
      const result = await client.createRegistry({
        ttl: DEFAULT_TTL,
      });
      updatedTargetTopicId = result.topicId!;
    }, 30000);

    it('should register an entry in the registry with proper message format', async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const memo = 'First test entry';

      const result = await client.registerEntry(registryTopicId, {
        targetTopicId,
        memo,
      });

      expect(result.success).toBe(true);
      expect(result.receipt).toBeDefined();
      expect(result.sequenceNumber).toBeDefined();

      const sequenceNumber = result.sequenceNumber!;

      await new Promise(resolve => setTimeout(resolve, 8000));

      const registry = await client.getRegistry(registryTopicId);
      expect(registry.entries.length).toBe(1);
      expect(registry.latestEntry).toBeDefined();

      const entry = registry.entries[0];
      expect(entry.message.p).toBe('hcs-6');
      expect(entry.message.op).toBe(HCS6Operation.REGISTER);
      expect(entry.message.t_id).toBe(targetTopicId);
      expect(entry.message.m).toBe(memo);
    }, 40000);

    it('should register a second entry and only see that one when querying (non-indexed behavior)', async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const memo = 'Latest test entry';

      const result = await client.registerEntry(registryTopicId, {
        targetTopicId: updatedTargetTopicId,
        memo,
      });

      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 8000));

      const registry = await client.getRegistry(registryTopicId);

      expect(registry.registryType).toBe(HCS6RegistryType.NON_INDEXED);
      expect(registry.ttl).toBe(DEFAULT_TTL);
      expect(registry.entries.length).toBe(1);
      expect(registry.entries[0].message.t_id).toBe(updatedTargetTopicId);
      expect(registry.entries[0].message.m).toBe(memo);
      expect(registry.latestEntry).toBeDefined();
      expect(registry.latestEntry!.message.t_id).toBe(updatedTargetTopicId);
    }, 30000);

    it('should query the registry with pagination options', async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const registry = await client.getRegistry(registryTopicId, {
        limit: 10,
        order: 'desc',
      });

      expect(registry.registryType).toBe(HCS6RegistryType.NON_INDEXED);
      expect(registry.entries.length).toBe(1);
      expect(registry.ttl).toBe(DEFAULT_TTL);
    }, 30000);
  });

  describe('Message Validation', () => {
    it('should validate well-formed messages', async () => {
      const registerMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      };
      const validRegisterResult = (client as any).validateMessage(
        registerMessage,
      );
      expect(validRegisterResult.valid).toBe(true);

      const registerMessageNoMemo = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };
      const validRegisterNoMemoResult = (client as any).validateMessage(
        registerMessageNoMemo,
      );
      expect(validRegisterNoMemoResult.valid).toBe(true);
    });

    it('should reject malformed messages', async () => {
      const wrongProtocol = {
        p: 'wrong-protocol',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };
      const wrongProtocolResult = (client as any).validateMessage(
        wrongProtocol,
      );
      expect(wrongProtocolResult.valid).toBe(false);
      expect(wrongProtocolResult.errors).toContain(
        'p: Invalid literal value, expected "hcs-6"',
      );

      const missingTargetId = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
      };
      const missingTargetIdResult = (client as any).validateMessage(
        missingTargetId,
      );
      expect(missingTargetIdResult.valid).toBe(false);
      expect(missingTargetIdResult.errors).toContain(`t_id: Required`);

      const invalidOperation = {
        p: 'hcs-6',
        op: 'invalid-op' as HCS6Operation,
        t_id: '0.0.12345',
      };
      const invalidOperationResult = (client as any).validateMessage(
        invalidOperation,
      );
      expect(invalidOperationResult.valid).toBe(false);
      expect(invalidOperationResult.errors).toContain(
        "op: Invalid discriminator value. Expected 'register'",
      );

      const longMemo = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'a'.repeat(501),
      };
      const longMemoResult = (client as any).validateMessage(longMemo);
      expect(longMemoResult.valid).toBe(false);
      expect(longMemoResult.errors).toContain(
        'm: Memo must not exceed 500 characters',
      );
    });

    it('should handle attempts to get registry info from non-HCS-6 topics', async () => {
      const hederaClient = (client as any).client;

      const receipt = await new TopicCreateTransaction()
        .setTopicMemo('Regular topic without HCS-6 format')
        .execute(hederaClient)
        .then(resp => resp.getReceipt(hederaClient));

      const regularTopicId = receipt.topicId!.toString();

      await new Promise(resolve => setTimeout(resolve, 3000));

      await expect(client.getRegistry(regularTopicId)).rejects.toThrow(
        /not an HCS-6 registry/,
      );
    }, 30000);
  });

  describe('Key Type Detection', () => {
    it('should detect ED25519 key type and retain the correct operator key', () => {
      const privateKey = PrivateKey.generateED25519();
      const keyString = privateKey.toString();
      const testClient = new HCS6Client({
        operatorId,
        operatorKey: keyString,
        network: 'testnet',
      });
      expect(testClient.getKeyType()).toBe('ed25519');
      expect(testClient.getOperatorKey().toString()).toBe(keyString);
      testClient.close();
    });

    it('should detect ECDSA key type when explicitly set', () => {
      const privateKey = PrivateKey.generateECDSA();
      const raw = privateKey.toStringRaw();
      const testClient = new HCS6Client({
        operatorId,
        operatorKey: raw,
        network: 'testnet',
        keyType: 'ecdsa',
      });
      expect(testClient.getKeyType()).toBe('ecdsa');
      expect(testClient.getOperatorKey().toStringRaw()).toBe(raw);
      testClient.close();
    });

    it('should auto-detect ECDSA key with 0x prefix', () => {
      const privateKey = PrivateKey.generateECDSA();
      const raw = privateKey.toStringRaw();
      const keyString = '0x' + raw;
      const testClient = new HCS6Client({
        operatorId,
        operatorKey: keyString,
        network: 'testnet',
      });
      expect(testClient.getKeyType()).toBe('ecdsa');
      expect(testClient.getOperatorKey().toStringRaw()).toBe(raw);
      testClient.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid topic ID format in registerEntry', async () => {
      const result = await client.registerEntry('invalid-topic-id', {
        targetTopicId: '0.0.12345',
        memo: 'Test entry',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 10000);

    it('should handle attempts to register entry in non-HCS-6 topic', async () => {
      const hederaClient = (client as any).client;
      const receipt = await new TopicCreateTransaction()
        .setTopicMemo('Regular topic')
        .execute(hederaClient)
        .then(resp => resp.getReceipt(hederaClient));

      const regularTopicId = receipt.topicId!.toString();

      await new Promise(resolve => setTimeout(resolve, 3000));

      const result = await client.registerEntry(regularTopicId, {
        targetTopicId: '0.0.12345',
        memo: 'Test entry',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a valid HCS-6 registry');
    }, 30000);
  });

  afterAll(async () => {
    client.close();
  });
});
