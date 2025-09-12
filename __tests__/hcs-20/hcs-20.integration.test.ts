/**
 * HCS-20 Integration Tests
 *
 * These tests run against testnet with real transactions.
 * No mocking - tests the actual HCS-20 implementation end-to-end.
 */

import { HCS20Client, HCS20PointsIndexer, HederaMirrorNode } from '../src';
import * as dotenv from 'dotenv';
import { describe, it, beforeAll, expect } from '@jest/globals';

dotenv.config();

const describeBlock = process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeBlock('HCS-20 Integration Tests', () => {
  let client: HCS20Client;
  let operatorId: string;
  const testTick = `TEST${Date.now()}`;
  let deployedTopicId: string;

  beforeAll(() => {
    operatorId = process.env.HEDERA_ACCOUNT_ID!;
    const operatorKey = process.env.HEDERA_PRIVATE_KEY!;

    if (!operatorId || !operatorKey) {
      throw new Error(
        'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
      );
    }

    client = new HCS20Client({
      operatorId,
      operatorKey,
      network: 'testnet',
    });
  });

  describe('Deploy Points', () => {
    it('should deploy points to public topic', async () => {
      const result = await client.deployPoints({
        name: 'Integration Test Points',
        tick: testTick,
        maxSupply: '1000000',
        limitPerMint: '10000',
        metadata: 'Integration test points',
        usePrivateTopic: true,
        progressCallback: progress => {
          console.log(
            `Deploy progress: ${progress.stage} - ${progress.percentage}%`,
          );
        },
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Integration Test Points');
      expect(result.tick).toBe(testTick.toLowerCase());
      expect(result.maxSupply).toBe('1000000');
      expect(result.limitPerMint).toBe('10000');
      expect(result.deployerAccountId).toBe(operatorId);
      expect(result.topicId).toBeDefined();
      expect(result.isPrivate).toBe(true);

      deployedTopicId = result.topicId;
      console.log(`Deployed to topic: ${deployedTopicId}`);
    }, 30000);

    it('should deploy points to private topic', async () => {
      const privateTick = `PRIV${Date.now()}`;

      const result = await client.deployPoints({
        name: 'Private Test Points',
        tick: privateTick,
        maxSupply: '500000',
        limitPerMint: '5000',
        metadata: 'Private integration test points',
        usePrivateTopic: true,
        topicMemo: 'Private test topic',
        progressCallback: progress => {
          console.log(
            `Private deploy progress: ${progress.stage} - ${progress.percentage}%`,
          );
        },
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Private Test Points');
      expect(result.tick).toBe(privateTick.toLowerCase());
      expect(result.isPrivate).toBe(true);
      expect(result.topicId).not.toBe(deployedTopicId);
      console.log(`Deployed private points to topic: ${result.topicId}`);
    }, 30000);
  });

  describe('Mint Points', () => {
    it('should mint points to operator account', async () => {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const result = await client.mintPoints({
        tick: testTick,
        amount: '5000',
        to: operatorId,
        memo: 'Integration test mint',
        topicId: deployedTopicId,
        progressCallback: progress => {
          console.log(
            `Mint progress: ${progress.stage} - ${progress.percentage}%`,
          );
        },
      } as any);

      expect(result).toBeDefined();
      expect(result.operation).toBe('mint');
      expect(result.tick).toBe(testTick.toLowerCase());
      expect(result.amount).toBe('5000');
      expect(result.to).toBe(operatorId);
      expect(result.topicId).toBe(deployedTopicId);
      expect(result.transactionId).toBeDefined();
      console.log(`Minted 5000 points, tx: ${result.transactionId}`);
    }, 30000);

    it('should handle multiple mints', async () => {
      const recipientAccount = process.env.BOB_ACCOUNT_ID || operatorId;

      const result = await client.mintPoints({
        tick: testTick,
        amount: '2500',
        to: recipientAccount,
        memo: 'Second mint',
        topicId: deployedTopicId,
      } as any);

      expect(result).toBeDefined();
      expect(result.amount).toBe('2500');
      expect(result.to).toBe(recipientAccount);
    }, 30000);
  });

  describe('Transfer Points', () => {
    it('should transfer points between accounts', async () => {
      const recipientAccount = process.env.BOB_ACCOUNT_ID || operatorId;

      await new Promise(resolve => setTimeout(resolve, 3000));

      const result = await client.transferPoints({
        tick: testTick,
        amount: '1000',
        from: operatorId,
        to: recipientAccount,
        memo: 'Integration test transfer',
        topicId: deployedTopicId,
        progressCallback: progress => {
          console.log(
            `Transfer progress: ${progress.stage} - ${progress.percentage}%`,
          );
        },
      } as any);

      expect(result).toBeDefined();
      expect(result.operation).toBe('transfer');
      expect(result.tick).toBe(testTick.toLowerCase());
      expect(result.amount).toBe('1000');
      expect(result.from).toBe(operatorId);
      expect(result.to).toBe(recipientAccount);
      expect(result.transactionId).toBeDefined();
      console.log(`Transferred 1000 points, tx: ${result.transactionId}`);
    }, 30000);

    it('should reject transfer from non-payer account', async () => {
      const otherAccount = '0.0.123456';

      await expect(
        client.transferPoints({
          tick: testTick,
          amount: '100',
          from: otherAccount,
          to: operatorId,
          memo: 'Should fail',
          topicId: deployedTopicId,
        } as any),
      ).rejects.toThrow('transaction payer must match sender');
    });
  });

  describe('Burn Points', () => {
    it('should burn points from operator account', async () => {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const result = await client.burnPoints({
        tick: testTick,
        amount: '500',
        from: operatorId,
        memo: 'Integration test burn',
        topicId: deployedTopicId,
        progressCallback: progress => {
          console.log(
            `Burn progress: ${progress.stage} - ${progress.percentage}%`,
          );
        },
      } as any);

      expect(result).toBeDefined();
      expect(result.operation).toBe('burn');
      expect(result.tick).toBe(testTick.toLowerCase());
      expect(result.amount).toBe('500');
      expect(result.from).toBe(operatorId);
      expect(result.transactionId).toBeDefined();
      console.log(`Burned 500 points, tx: ${result.transactionId}`);
    }, 30000);

    it('should reject burn from non-payer account', async () => {
      const otherAccount = '0.0.123456';

      await expect(
        client.burnPoints({
          tick: testTick,
          amount: '100',
          from: otherAccount,
          memo: 'Should fail',
          topicId: deployedTopicId,
        } as any),
      ).rejects.toThrow('transaction payer must match burner');
    });
  });

  describe('Register Topic', () => {
    it('should register a topic in the registry', async () => {
      const registryTestTick = `REG${Date.now()}`;

      const deployResult = await client.deployPoints({
        name: 'Registry Test Points',
        tick: registryTestTick,
        maxSupply: '100000',
        limitPerMint: '1000',
        metadata: 'Points for registry test',
        usePrivateTopic: true,
      });

      const deployedTopicId = deployResult.topicId;

      console.log('Creating registry topic for testnet...');
      const registryTopicId = await client.createRegistryTopic('Test Registry');
      console.log(`Created registry topic: ${registryTopicId}`);

      await client.registerTopic({
        topicId: deployedTopicId,
        name: 'Integration Test Points',
        metadata: 'Registered for testing',
        isPrivate: false,
        progressCallback: progress => {
          console.log(
            `Register progress: ${progress.stage} - ${progress.percentage}%`,
          );
        },
      });

      console.log(
        `Registered topic ${deployedTopicId} in registry ${registryTopicId}`,
      );

      await new Promise(resolve => setTimeout(resolve, 5000));

      const mirrorNode = new HederaMirrorNode('testnet');
      const messages = await mirrorNode.getTopicMessages(registryTopicId, {
        limit: 10,
        order: 'desc',
      });

      const registrationMessage = messages.find((msg: any) => {
        return (
          msg.p === 'hcs-20' &&
          msg.op === 'register' &&
          msg.t_id === deployedTopicId
        );
      });

      expect(registrationMessage).toBeDefined();
      expect(registrationMessage).toBeTruthy();

      expect(registrationMessage.p).toBe('hcs-20');
      expect(registrationMessage.op).toBe('register');
      expect(registrationMessage.t_id).toBe(deployedTopicId);
      expect(registrationMessage.name).toBe('Integration Test Points');
      expect(registrationMessage.metadata).toBe('Registered for testing');
      expect(registrationMessage.private).toBe(false);
    }, 30000);
  });

  describe('Message Validation', () => {
    it('should validate message format', () => {
      const validMessage = {
        p: 'hcs-20',
        op: 'mint',
        tick: 'test',
        amt: '1000',
        to: '0.0.12345',
      };

      const validation = (client as any).validateMessage(validMessage);
      expect(validation.valid).toBe(true);
    });

    it('should reject invalid message format', () => {
      const invalidMessage = {
        p: 'hcs-20',
        op: 'mint',
        tick: 'test',
        amt: 'not-a-number',
        to: '0.0.12345',
      };

      const validation = (client as any).validateMessage(invalidMessage);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
    });
  });

  describe('Tick Normalization', () => {
    it('should normalize tick to lowercase', () => {
      const normalized = (client as any).normalizeTick('TEST');
      expect(normalized).toBe('test');
    });

    it('should trim whitespace from tick', () => {
      const normalized = (client as any).normalizeTick('  test  ');
      expect(normalized).toBe('test');
    });
  });

  describe('State Indexer', () => {
    it('should correctly track balances and supply through multiple operations', async () => {
      const indexerTick = `IDX${Date.now()}`;
      const bobAccount = process.env.BOB_ACCOUNT_ID || operatorId;
      let topicId: string;

      const deployResult = await client.deployPoints({
        name: 'Indexer Test Points',
        tick: indexerTick,
        maxSupply: '1000000',
        limitPerMint: '10000',
        metadata: 'Points for indexer test',
        usePrivateTopic: true,
      });
      topicId = deployResult.topicId;

      await client.mintPoints({
        tick: indexerTick,
        amount: '5000',
        to: operatorId,
        topicId,
      } as any);

      await client.mintPoints({
        tick: indexerTick,
        amount: '3000',
        to: bobAccount,
        topicId,
      } as any);

      await client.transferPoints({
        tick: indexerTick,
        amount: '1500',
        from: operatorId,
        to: bobAccount,
        topicId,
      } as any);

      await client.burnPoints({
        tick: indexerTick,
        amount: '500',
        from: operatorId,
        topicId,
      } as any);

      console.log('Waiting 15s for network propagation...');
      await new Promise(resolve => setTimeout(resolve, 15000));

      const indexer = new HCS20PointsIndexer('testnet');

      console.log(`Indexing topic ${topicId}...`);
      await indexer.indexOnce({
        privateTopics: [topicId],
      });

      const pointsInfo = await indexer.getPointsInfo(indexerTick.toLowerCase());
      const operatorBalance = await indexer.getBalance(
        indexerTick.toLowerCase(),
        operatorId,
      );
      const bobBalance = await indexer.getBalance(
        indexerTick.toLowerCase(),
        bobAccount,
      );

      console.log('Indexer results:', {
        pointsInfo,
        operatorBalance,
        bobBalance,
      });

      expect(operatorBalance).toBe('3000');
      expect(bobBalance).toBe('4500');
      expect(pointsInfo?.currentSupply).toBe('7500');
    }, 60000);
  });
});
