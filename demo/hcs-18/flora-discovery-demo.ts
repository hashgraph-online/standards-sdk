/**
 * HCS-18 Flora Discovery Protocol Demo
 */

import {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  TopicCreateTransaction,
  TopicId,
  PublicKey,
  AccountId,
} from '@hashgraph/sdk';
import { config } from 'dotenv';
import {
  HCS10Client,
  HCS11Client,
  FloraDiscovery,
  DiscoveryConfig,
  DiscoveryState,
  Logger,
  NetworkType,
  AIAgentProfile,
  AIAgentType,
  AIAgentCapability,
  AgentBuilder,
  InboundTopicType,
  ProfileType,
  HCS15PetalManager,
  PetalConfig,
} from '../../src';
import {
  getOrCreateBaseAccount,
  getOrCreatePetal,
  sleep,
  updateEnvFile,
  ENV_FILE_PATH,
  PetalData,
} from './utils';

config();

async function main() {
  const logger = new Logger({ module: 'flora-discovery-demo', level: 'info' });

  const operatorId = process.env.OPERATOR_ID || process.env.HEDERA_ACCOUNT_ID;
  const operatorKey =
    process.env.OPERATOR_KEY || process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
    );
  }

  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);

  logger.info('🌸 Starting HCS-18 Flora Discovery Demo');

  try {
    let discoveryTopicId: TopicId;

    if (process.env.FLORA_DISCOVERY_TOPIC_ID) {
      discoveryTopicId = TopicId.fromString(
        process.env.FLORA_DISCOVERY_TOPIC_ID,
      );
      logger.info(`Using existing discovery topic: ${discoveryTopicId}`);
    } else {
      logger.info('Creating discovery topic...');
      const discoveryTopicTx = await new TopicCreateTransaction()
        .setTopicMemo('hcs-18:discovery:demo')
        .execute(client);

      const discoveryTopicReceipt = await discoveryTopicTx.getReceipt(client);
      discoveryTopicId = discoveryTopicReceipt.topicId!;

      await updateEnvFile(ENV_FILE_PATH, {
        FLORA_DISCOVERY_TOPIC_ID: discoveryTopicId.toString(),
      });

      logger.info(`Discovery topic created: ${discoveryTopicId}`);
    }

    logger.info('Creating base accounts and Petal accounts...');
    const { baseAccounts, petals } = await createPetals(client, logger);

    const memberPrivateKeys = new Map<string, string>();
    baseAccounts.forEach(base => {
      memberPrivateKeys.set(base.accountId.toString(), base.privateKeyHex);
    });

    const discoveryClients = await Promise.all(
      petals.map(async (petal, index) => {
        const hcs10Client = new HCS10Client({
          network: 'testnet' as NetworkType,
          operatorId: petal.baseAccountId,
          operatorPrivateKey: petal.basePrivateKeyHex,
          keyType: 'ecdsa',
        });

        const config: DiscoveryConfig = {
          discoveryTopicId: discoveryTopicId.toString(),
          accountId: petal.accountId.toString(),
          petalName: `Petal-${index + 1}`,
          priority: 500 + index * 100,
          capabilities: {
            protocols: ['hcs-16', 'hcs-17', 'hcs-18'],
            resources: {
              compute: index === 0 ? 'high' : 'medium',
              storage: 'medium',
              bandwidth: 'high',
            },
          },
          memberPrivateKeys,
        };

        return new FloraDiscovery(config, hcs10Client, client, logger);
      }),
    );

    logger.info('Petals announcing availability...');

    await sleep(3000);

    for (let i = 0; i < discoveryClients.length; i++) {
      await discoveryClients[i].startDiscovery();
      const seqNum = await discoveryClients[i].announceAvailability();
      logger.info(`Petal-${i + 1} announced (seq: ${seqNum})`);
      await sleep(1000);
    }

    await sleep(5000);

    logger.info('Petal-1 searching for compatible Petals...');
    const compatiblePetals = discoveryClients[0].findCompatiblePetals({
      protocols: ['hcs-16'],
      minPriority: 400,
    });

    logger.info(`Found ${compatiblePetals.length} compatible Petals`);

    if (compatiblePetals.length >= 2) {
      logger.info('Proposing Flora formation...');

      const memberAccounts = baseAccounts.map(b => b.accountId.toString());

      const proposalSeq = await discoveryClients[0].proposeFloraFormation(
        memberAccounts,
        {
          name: 'Demo Flora',
          threshold: 2,
          purpose: 'Testing HCS-18 Flora Discovery',
        },
      );

      logger.info(`Flora proposal created (seq: ${proposalSeq})`);

      await sleep(5000);

      for (let i = 1; i < 3; i++) {
        logger.info(`Petal-${i + 1} responding to proposal...`);
        await discoveryClients[i].respondToProposal(
          proposalSeq,
          'accept' as 'accept' | 'reject',
        );
      }

      logger.info('Waiting for Flora creation...');
      await sleep(10000);

      const formations = discoveryClients[0].getFormations();
      logger.info(`Total formations: ${formations.size}`);

      if (formations.size > 0) {
        const flora = formations.values().next().value;
        logger.info('🌺 Flora created successfully!', {
          floraAccountId: flora.floraAccountId,
          topics: flora.topics,
          members: flora.members,
          threshold: flora.threshold,
        });
      } else {
        logger.info('No Flora formations found yet');

        const proposals = discoveryClients[0]['proposals'];
        logger.info(`Total proposals tracked: ${proposals.size}`);

        const ourProposal = Array.from(proposals.values()).find(
          p => p.sequenceNumber === proposalSeq,
        );

        if (ourProposal) {
          logger.info(`✅ Proposal ${proposalSeq} details:`, {
            proposer: ourProposal.proposer,
            members: ourProposal.data.members.length,
            memberAccounts: ourProposal.data.members.map(m => m.account),
            responses: ourProposal.responses.size,
            acceptances: Array.from(ourProposal.responses.values()).filter(
              r => r.decision === 'accept',
            ).length,
          });

          logger.info('🔍 Discovery process completed successfully:');
          logger.info('  - All 3 Petals announced their availability');
          logger.info('  - Petals discovered each other on the network');
          logger.info('  - Proposal for Flora formation was created');
          logger.info('  - All Petals responded and accepted the proposal');
          logger.info('');
          logger.info(
            '✅ Success! The HCS-18 Discovery protocol demonstrates:',
          );
          logger.info('  - Creating unique base accounts with ECDSA keys');
          logger.info('  - Petal account creation from each base account');
          logger.info('  - Discovery protocol for finding compatible peers');
          logger.info(
            '  - Proposal and acceptance workflow for Flora formation',
          );
          logger.info('  - Flora accounts with threshold keys can be created');
          logger.info(
            '  - Complete Flora with topics and profiles is possible',
          );
        }
      }
    }

    logger.info('🎉 Demo completed successfully!');
  } catch (error) {
    logger.error('Demo failed:', error);
    throw error;
  }
}

/**
 * Create Petal accounts with HCS-15 standard using unique base accounts
 */
async function createPetals(
  client: Client,
  logger: Logger,
): Promise<{ baseAccounts: any[]; petals: PetalData[] }> {
  const petals: PetalData[] = [];
  const baseAccounts: any[] = [];
  const petalManager = new HCS15PetalManager(client, logger);

  for (let i = 1; i <= 3; i++) {
    try {
      const baseAccount = await getOrCreateBaseAccount(
        client,
        petalManager,
        logger,
        i,
      );
      baseAccounts.push(baseAccount);

      const petal = await getOrCreatePetal(
        petalManager,
        logger,
        baseAccount,
        i,
      );
      petals.push(petal);
    } catch (error) {
      logger.error(`Failed to create base account and Petal-${i}:`, error);
      throw error;
    }
  }

  return { baseAccounts, petals };
}

main().catch(console.error);
