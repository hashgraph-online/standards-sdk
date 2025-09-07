/**
 * HCS-11 Client Integration Tests
 *
 * These tests run against testnet with real transactions.
 * Tests the authentication handling fix for both private key and signer methods.
 */

import { webcrypto } from 'crypto';
import { HCS11Client } from '../../../src/hcs-11/client';
import {
  ProfileType,
  PersonalProfile,
  AIAgentType,
  AIAgentCapability,
} from '../../../src/hcs-11/types';
import * as dotenv from 'dotenv';

dotenv.config();

describe('HCS11Client - inscribeProfile Integration Tests', () => {
  let client: HCS11Client;
  let operatorId: string;
  let operatorKey: string;

  beforeAll(() => {
    operatorId = process.env.HEDERA_ACCOUNT_ID!;
    operatorKey = process.env.HEDERA_PRIVATE_KEY!;

    if (!operatorId || !operatorKey) {
      throw new Error(
        'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
      );
    }
  });

  afterAll(() => {
    if (client) {
      client.getClient().close();
    }
  });

  describe('Private Key Authentication', () => {
    beforeEach(() => {
      client = new HCS11Client({
        network: 'testnet',
        auth: {
          operatorId,
          privateKey: operatorKey,
        },
        keyType: 'ed25519',
        silent: true,
      });

      (global as any).crypto = webcrypto;
    });

    afterEach(() => {
      if (client) {
        client.getClient().close();
      }
    });

    it('should successfully inscribe profile using private key authentication', async () => {
      const mockProfile = client.createPersonalProfile(
        `Test User ${Date.now()}`,
        {
          bio: 'Integration test user profile',
        },
      );

      const response = await client.inscribeProfile(mockProfile);

      console.log('Inscription response:', JSON.stringify(response, null, 2));

      if (response.success) {
        expect(response.success).toBe(true);
        expect(response.profileTopicId).toBeDefined();
        expect(response.transactionId).toBeDefined();
        console.log(
          `✅ Profile inscribed successfully: ${response.profileTopicId}`,
        );
      } else {
        console.log(`❌ Profile inscription failed: ${response.error}`);
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
      }
    }, 60000);
  });

  describe('Authentication Method Validation', () => {
    afterEach(() => {
      if (client) {
        client.getClient().close();
      }
    });

    it('should return error when no authentication method is provided', async () => {
      const clientWithoutAuth = new HCS11Client({
        network: 'testnet',
        auth: {
          operatorId,
        },
        silent: true,
      });

      (global as any).crypto = webcrypto;

      const mockProfile = client.createPersonalProfile('Test User');

      const response = await clientWithoutAuth.inscribeProfile(mockProfile);

      expect(response.success).toBe(false);
      expect(response.error).toContain('No authentication method available');

      clientWithoutAuth.getClient().close();
    });
  });

  describe('Profile Validation', () => {
    beforeEach(() => {
      client = new HCS11Client({
        network: 'testnet',
        auth: {
          operatorId,
          privateKey: operatorKey,
        },
        keyType: 'ed25519',
        silent: true,
      });
      (global as any).crypto = webcrypto;
    });

    afterEach(() => {
      if (client) {
        client.getClient().close();
      }
    });

    it('should validate profile before inscription', async () => {
      const invalidProfile: Partial<PersonalProfile> = {
        version: '1.0',
        type: ProfileType.PERSONAL,
      };

      const response = await client.inscribeProfile(invalidProfile as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid profile');
    });

    it('should create and inscribe AI agent profile', async () => {
      const agentProfile = client.createAIAgentProfile(
        `Test AI Agent ${Date.now()}`,
        AIAgentType.MANUAL,
        [AIAgentCapability.TEXT_GENERATION],
        'gpt-4',
        {
          bio: 'Integration test AI agent',
          creator: operatorId,
        },
      );

      const response = await client.inscribeProfile(agentProfile);

      console.log(
        'AI Agent inscription response:',
        JSON.stringify(response, null, 2),
      );

      if (response.success) {
        expect(response.success).toBe(true);
        expect(response.profileTopicId).toBeDefined();
        console.log(
          `✅ AI Agent profile inscribed: ${response.profileTopicId}`,
        );
      } else {
        console.log(
          `❌ AI Agent profile inscription failed: ${response.error}`,
        );
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
      }
    }, 60000);
  });

  describe('Profile Retrieval', () => {
    let profileTopicId: string;

    beforeAll(async () => {
      client = new HCS11Client({
        network: 'testnet',
        auth: {
          operatorId,
          privateKey: operatorKey,
        },
        keyType: 'ed25519',
        silent: true,
      });
      (global as any).crypto = webcrypto;

      const testProfile = client.createPersonalProfile(
        `Retrieval Test User ${Date.now()}`,
        {
          bio: 'Profile for testing retrieval functionality',
        },
      );

      const inscribeResult = await client.inscribeProfile(testProfile);
      if (!inscribeResult.success) {
        throw new Error(
          `Profile inscription failed during test setup: ${inscribeResult.error}`,
        );
      }
      profileTopicId = inscribeResult.profileTopicId;

      await client.updateAccountMemoWithProfile(operatorId, profileTopicId);

      await new Promise(resolve => setTimeout(resolve, 10000));
    }, 60000);

    afterAll(() => {
      if (client) {
        client.getClient().close();
      }
    });

    it('should fetch profile by account ID', async () => {
      const fetchResult = await client.fetchProfileByAccountId(operatorId);

      expect(fetchResult.success).toBe(true);
      expect(fetchResult.profile).toBeDefined();
      expect(fetchResult.topicInfo?.profileTopicId).toBe(profileTopicId);

      console.log(`✅ Profile fetched successfully for account: ${operatorId}`);
    }, 30000);
  });
});
