/**
 * HCS-16 Flora Account Manager Integration Tests
 *
 * Tests actual Flora profile inscription using HCS-11
 */

import {
  Client,
  PrivateKey,
  AccountId,
  Hbar,
  AccountCreateTransaction,
} from '@hashgraph/sdk';
import { FloraAccountManager } from '../src/hcs-16/flora-account-manager';
import { FloraConfig, FloraMember } from '../src/hcs-16/types';
import { HederaMirrorNode } from '../src/services/hedera-mirror-node';
import { Logger } from '../src/utils/logger';
import { NetworkType } from '../src/utils/types';
import { HCS11Client } from '../src/hcs-11/client';
import * as dotenv from 'dotenv';

dotenv.config();

describe('FloraAccountManager Integration', () => {
  let client: Client;
  let manager: FloraAccountManager;
  let mirrorNode: HederaMirrorNode;
  let testMembers: FloraMember[];
  let operatorId: string;
  let operatorKey: string;

  beforeAll(async () => {
    operatorId = process.env.HEDERA_ACCOUNT_ID || process.env.OPERATOR_ID;
    operatorKey = process.env.HEDERA_PRIVATE_KEY || process.env.OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error(
        'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
      );
    }

    client = Client.forTestnet();
    client.setOperator(operatorId, operatorKey);

    mirrorNode = new HederaMirrorNode(
      NetworkType.TESTNET,
      new Logger({ module: 'MirrorNode', silent: true }),
    );

    const member1PrivateKey = PrivateKey.generateECDSA();
    const member1PublicKey = member1PrivateKey.publicKey;

    const member1Tx = await new AccountCreateTransaction()
      .setKey(member1PublicKey)
      .setInitialBalance(new Hbar(2))
      .execute(client);

    const member1Receipt = await member1Tx.getReceipt(client);
    const member1AccountId = member1Receipt.accountId!;

    const member2PrivateKey = PrivateKey.generateECDSA();
    const member2PublicKey = member2PrivateKey.publicKey;

    const member2Tx = await new AccountCreateTransaction()
      .setKey(member2PublicKey)
      .setInitialBalance(new Hbar(2))
      .execute(client);

    const member2Receipt = await member2Tx.getReceipt(client);
    const member2AccountId = member2Receipt.accountId!;

    const member3PrivateKey = PrivateKey.generateECDSA();
    const member3PublicKey = member3PrivateKey.publicKey;

    const member3Tx = await new AccountCreateTransaction()
      .setKey(member3PublicKey)
      .setInitialBalance(new Hbar(2))
      .execute(client);

    const member3Receipt = await member3Tx.getReceipt(client);
    const member3AccountId = member3Receipt.accountId!;

    testMembers = [
      {
        accountId: member1AccountId.toString(),
        publicKey: member1PublicKey,
        privateKey: member1PrivateKey.toStringRaw(),
        weight: 1,
      },
      {
        accountId: member2AccountId.toString(),
        publicKey: member2PublicKey,
        weight: 1,
      },
      {
        accountId: member3AccountId.toString(),
        publicKey: member3PublicKey,
        weight: 1,
      },
    ];

    manager = new FloraAccountManager(client);
  }, 60000);

  afterAll(() => {
    client.close();
  });

  describe('createFlora with HCS-11 inscription', () => {
    it('should create a Flora account and inscribe profile to HCS-11', async () => {
      const config: FloraConfig = {
        displayName: 'Integration Test Flora',
        members: testMembers,
        threshold: 2,
        initialBalance: 5,
        bio: 'Flora account created for integration testing',
        metadata: {
          purpose: 'integration-test',
          testId: Date.now(),
        },
        policies: {
          proposalThreshold: 2,
          executionDelay: 0,
        },
      };

      const result = await manager.createFlora(config);

      expect(result).toBeDefined();
      expect(result.floraAccountId).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.topics.communication).toBeDefined();
      expect(result.topics.transaction).toBeDefined();
      expect(result.topics.state).toBeDefined();
      expect(result.keyList).toBeDefined();
      expect(result.profileTopicId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 10000));

      const accountInfo = await mirrorNode.getAccountInfo(
        result.floraAccountId.toString(),
      );
      expect(accountInfo).toBeDefined();
      expect(accountInfo.memo).toMatch(
        /^hcs-11:hrl:hedera:(testnet|mainnet):0\.0\.\d+$/,
      );

      const memoMatch = accountInfo.memo.match(
        /^hcs-11:hrl:hedera:(testnet|mainnet):(0\.0\.\d+)$/,
      );
      expect(memoMatch).toBeTruthy();
      const profileTopicId = memoMatch![2];
      expect(profileTopicId).toBe(result.profileTopicId);

      const profileData = await mirrorNode.getMessagesFromTopic(profileTopicId);
      expect(profileData).toBeDefined();
      expect(profileData.length).toBeGreaterThan(0);

      const firstMessage = profileData[0];
      const decodedMessage = Buffer.from(firstMessage.message, 'base64').toString(
        'utf-8',
      );
      const profileContent = JSON.parse(decodedMessage);

      expect(profileContent.display_name).toBe('Integration Test Flora');
      expect(profileContent.type).toBe(3);
      expect(profileContent.bio).toBe(
        'Flora account created for integration testing',
      );
      expect(profileContent.members).toHaveLength(3);
      expect(profileContent.threshold).toBe(2);
      expect(profileContent.topics).toEqual({
        communication: result.topics.communication.toString(),
        transaction: result.topics.transaction.toString(),
        state: result.topics.state.toString(),
      });
      expect(profileContent.metadata).toEqual({
        purpose: 'integration-test',
        testId: expect.any(Number),
      });
      expect(profileContent.policies).toEqual({
        proposalThreshold: 2,
        executionDelay: 0,
      });
    }, 120000);

    it('should handle profile inscription failure gracefully', async () => {
      const invalidMembers = [
        {
          accountId: '0.0.1001',
          publicKey: PrivateKey.generateECDSA().publicKey,
          weight: 1,
        },
      ];

      const config: FloraConfig = {
        displayName: 'Invalid Flora',
        members: invalidMembers,
        threshold: 1,
      };

      await expect(manager.createFlora(config)).rejects.toThrow();
    }, 60000);
  });

  describe('verifyFloraProfile', () => {
    it('should verify a Flora profile was properly inscribed', async () => {
      const config: FloraConfig = {
        displayName: 'Verification Test Flora',
        members: testMembers,
        threshold: 2,
        alias: 'verify-flora',
      };

      const result = await manager.createFlora(config);

      await new Promise(resolve => setTimeout(resolve, 10000));

      const hcs11Client = new HCS11Client({
        network: NetworkType.TESTNET,
        auth: {
          operatorId: testMembers[0].accountId,
          privateKey: testMembers[0].privateKey!,
        },
      });

      const profileMessages = await mirrorNode.getMessagesFromTopic(
        result.profileTopicId,
      );
      expect(profileMessages.length).toBeGreaterThan(0);

      const profileData = JSON.parse(
        Buffer.from(profileMessages[0].message, 'base64').toString('utf-8'),
      );

      expect(profileData.version).toBe('1.0');
      expect(profileData.type).toBe(3);
      expect(profileData.display_name).toBe('Verification Test Flora');
      expect(profileData.alias).toBe('verify-flora');
      expect(profileData.inboundTopicId).toBe(
        result.topics.communication.toString(),
      );
      expect(profileData.outboundTopicId).toBe(
        result.topics.transaction.toString(),
      );
    }, 120000);
  });
});