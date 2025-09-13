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
  HCS18Client,
  FloraAccountManager,
  TrackedAnnouncement,
  TrackedProposal,
  isAnnounceMessage,
  isProposeMessage,
  isRespondMessage,
  Logger,
  NetworkType,
  AIAgentProfile,
  AIAgentType,
  AIAgentCapability,
  AgentBuilder,
  InboundTopicType,
  HCS15Client,
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
  const hcs15 = new HCS15Client({
    network: 'testnet' as NetworkType,
    operatorId,
    operatorKey,
  });

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
      const hcs18 = new HCS18Client({
        network: 'testnet' as NetworkType,
        operatorId: operatorId,
        operatorKey: operatorKey,
      });
      const created = await hcs18.createDiscoveryTopic({ ttlSeconds: 300 });
      discoveryTopicId = TopicId.fromString(created.topicId);

      await updateEnvFile(ENV_FILE_PATH, {
        FLORA_DISCOVERY_TOPIC_ID: discoveryTopicId.toString(),
      });

      logger.info(`Discovery topic created: ${discoveryTopicId}`);
    }

    logger.info('Creating base accounts and Petal accounts...');
    const { baseAccounts, petals } = await createPetals(client, logger, hcs15);

    const memberPrivateKeys = new Map<string, string>();
    baseAccounts.forEach(base => {
      memberPrivateKeys.set(base.accountId.toString(), base.privateKeyHex);
    });

    const discoveryTopic = discoveryTopicId.toString();

    const discoveryClients = await Promise.all(
      petals.map(async (petal, index) => {
        const hcs10Client = new HCS10Client({
          network: 'testnet' as NetworkType,
          operatorId: petal.baseAccountId,
          operatorPrivateKey: petal.basePrivateKeyHex,
          keyType: 'ecdsa',
        });
        const hcs18Client = new HCS18Client({
          network: 'testnet' as NetworkType,
          operatorId: petal.accountId.toString(),
          operatorKey: petal.privateKey,
        });
        return {
          accountId: petal.accountId.toString(),
          name: `Petal-${index + 1}`,
          priority: 500 + index * 100,
          capabilities: { protocols: ['hcs-16', 'hcs-17', 'hcs-18'] },
          hcs10Client,
          hcs18Client,
          privateKey: petal.privateKey.toString(),
        };
      }),
    );

    logger.info('Petals announcing availability...');

    await sleep(3000);

    const announcements = new Map<number, TrackedAnnouncement>();
    const proposals = new Map<number, TrackedProposal>();
    let lastSeq = 0;

    const syncMessages = async (): Promise<void> => {
      const msgs = await discoveryClients[0].hcs18Client.getDiscoveryMessages(
        discoveryTopic,
        { sequenceNumber: lastSeq + 1 },
      );
      for (const m of msgs) {
        lastSeq = m.sequence_number;
        if (isAnnounceMessage(m)) {
          const a: TrackedAnnouncement = {
            account: m.data.account,
            sequenceNumber: m.sequence_number,
            consensusTimestamp: m.consensus_timestamp || '',
            data: m.data,
          };
          announcements.set(m.sequence_number, a);
        } else if (isProposeMessage(m)) {
          const p: TrackedProposal = {
            sequenceNumber: m.sequence_number,
            consensusTimestamp: m.consensus_timestamp || '',
            proposer: m.data.proposer,
            data: m.data,
            responses: new Map<string, ReturnType<typeof Object.assign>>(),
          };
          proposals.set(m.sequence_number, p);
        } else if (isRespondMessage(m)) {
          const p = proposals.get(m.data.proposal_seq);
          if (p) {
            p.responses.set(m.data.responder, m.data);
          }
        }
      }
    };

    for (let i = 0; i < discoveryClients.length; i++) {
      const dc = discoveryClients[i];
      const { sequenceNumber } = await dc.hcs18Client.announce({
        discoveryTopicId: discoveryTopic,
        data: {
          account: dc.accountId,
          petal: { name: dc.name, priority: dc.priority },
          capabilities: dc.capabilities,
          valid_for: 10000,
        },
      });
      logger.info(`Petal-${i + 1} announced (seq: ${sequenceNumber})`);
      await sleep(1000);
      await syncMessages();
    }

    await sleep(5000);
    await syncMessages();

    logger.info('Petal-1 searching for compatible Petals...');
    const compatiblePetals = Array.from(announcements.values())
      .filter(a => a.account !== discoveryClients[0].accountId)
      .filter(a => a.data.capabilities.protocols.includes('hcs-16'))
      .filter(a => a.data.petal.priority >= 400)
      .sort((a, b) => b.data.petal.priority - a.data.petal.priority);

    logger.info(`Found ${compatiblePetals.length} compatible Petals`);

    if (compatiblePetals.length >= 2) {
      logger.info('Proposing Flora formation...');

      const memberAccounts = discoveryClients.map(dc => dc.accountId);

      const members = memberAccounts.map(account => {
        const ann = Array.from(announcements.values()).find(
          a => a.account === account,
        );
        return {
          account,
          announce_seq: ann ? ann.sequenceNumber : undefined,
          priority: ann ? ann.data.petal.priority : 500,
        };
      });
      const { sequenceNumber: proposalSeq } =
        await discoveryClients[0].hcs18Client.propose({
          discoveryTopicId: discoveryTopic,
          data: {
            proposer: discoveryClients[0].accountId,
            members,
            config: {
              name: 'Demo Flora',
              threshold: 2,
              purpose: 'Testing HCS-18 Flora Discovery',
            },
          },
        });

      logger.info(`Flora proposal created (seq: ${proposalSeq})`);

      await sleep(5000);
      await syncMessages();

      for (let i = 1; i < 3; i++) {
        logger.info(`Petal-${i + 1} responding to proposal...`);
        await discoveryClients[i].hcs18Client.respond({
          discoveryTopicId: discoveryTopic,
          data: {
            responder: discoveryClients[i].accountId,
            proposal_seq: proposalSeq,
            decision: 'accept',
          },
        });
      }

      logger.info('Waiting for enough acceptances to create Flora...');
      {
        const deadline = Date.now() + 60000;
        let ready = false;
        while (Date.now() < deadline) {
          await sleep(2000);
          await syncMessages();
          const p = proposals.get(proposalSeq);
          if (p) {
            const acc = Array.from(p.responses.values()).filter(
              r => r.decision === 'accept',
            ).length;
            const req = Math.max(0, (p.data.config.threshold || 1) - 1);
            if (acc >= req) {
              ready = true;
              break;
            }
          }
        }
        if (!ready) {
          logger.info('Timed out waiting for acceptances');
        }
      }

      const ourProposal = proposals.get(proposalSeq);
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

        const acceptances = Array.from(ourProposal.responses.values()).filter(
          r => r.decision === 'accept',
        ).length;
        const required = Math.max(
          0,
          (ourProposal.data.config.threshold || 1) - 1,
        );
        if (acceptances >= required) {
          logger.info('Creating Flora via HCS-16...');
          const floraMgr = new FloraAccountManager(
            client,
            'testnet' as NetworkType,
            logger,
          );

          const memberAccounts = ourProposal.data.members.map(
            m => m.account as string,
          );
          const memberPubKeys = await Promise.all(
            memberAccounts.map(async account => {
              const pub =
                await discoveryClients[0].hcs18Client.mirrorNode.getPublicKey(
                  account,
                );
              return { account, publicKey: pub.toString() };
            }),
          );

          const proposerIdx = memberAccounts.findIndex(
            a => a === discoveryClients[0].accountId,
          );
          const operatorIdx = proposerIdx >= 0 ? proposerIdx : 0;
          const operatorAccount = memberAccounts[operatorIdx];
          const operatorPrivateKey = discoveryClients.find(
            dc => dc.accountId === operatorAccount,
          )?.privateKey;

          const members = memberPubKeys.map((m, idx) => ({
            accountId: m.account,
            publicKey: m.publicKey,
            privateKey:
              idx === operatorIdx && operatorPrivateKey
                ? operatorPrivateKey
                : undefined,
          }));

          const flora = await floraMgr.createFlora({
            displayName: ourProposal.data.config.name,
            members,
            threshold: ourProposal.data.config.threshold,
            initialBalance: 10,
          });

          await discoveryClients[0].hcs18Client.complete({
            discoveryTopicId: discoveryTopic,
            data: {
              proposer: discoveryClients[0].accountId,
              proposal_seq: proposalSeq,
              flora_account: flora.floraAccountId.toString(),
              topics: {
                communication: flora.topics.communication.toString(),
                transaction: flora.topics.transaction.toString(),
                state: flora.topics.state.toString(),
              },
            },
          });

          logger.info('🌺 Flora created and completion announced', {
            floraAccountId: flora.floraAccountId.toString(),
            communication: flora.topics.communication.toString(),
            transaction: flora.topics.transaction.toString(),
            state: flora.topics.state.toString(),
          });
        } else {
          logger.info('Not enough acceptances to create Flora');
        }
      } else {
        logger.info('No proposal details found');
      }
    }

    logger.info('🎉 Demo completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Demo failed:', error);
    process.exit(1);
  }
}

/**
 * Create Petal accounts with HCS-15 standard using unique base accounts
 */
async function createPetals(
  client: Client,
  logger: Logger,
  hcs15: HCS15Client,
): Promise<{ baseAccounts: any[]; petals: PetalData[] }> {
  const petals: PetalData[] = [];
  const baseAccounts: any[] = [];

  for (let i = 1; i <= 3; i++) {
    try {
      const baseAccount = await getOrCreateBaseAccount(
        client,
        hcs15,
        logger,
        i,
      );
      baseAccounts.push(baseAccount);

      const petal = await getOrCreatePetal(
        hcs15,
        logger,
        baseAccount,
        i,
        'testnet',
      );
      petals.push(petal);
    } catch (error) {
      logger.error(`Failed to create base account and Petal-${i}:`, error);
      throw error;
    }
  }

  return { baseAccounts, petals };
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
