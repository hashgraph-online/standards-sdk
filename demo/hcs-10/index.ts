import dotenv from 'dotenv';
import { FeeConfigBuilder, Logger } from '../../src';
import { HCS10Client } from '../../src/hcs-10/sdk';
import * as fs from 'fs';
import * as path from 'path';
import {
  getOrCreateBob,
  getOrCreateAlice,
  monitorIncomingRequests,
} from './utils';
import { fileURLToPath } from 'url';

dotenv.config();

const logger = new Logger({
  module: 'HCS10Demo',
  level: 'debug',
  prettyPrint: true,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function monitorConnectionConfirmation(
  client: HCS10Client,
  bobInboundTopicId: string,
  aliceOutboundTopicId: string,
  connectionRequestId: number,
): Promise<string> {
  try {
    logger.info(
      `Monitoring for connection confirmation on request #${connectionRequestId}`,
    );

    const confirmation = await client.waitForConnectionConfirmation(
      bobInboundTopicId,
      connectionRequestId,
      60,
      2000,
    );

    logger.info(
      `Connection confirmation received with ID: ${confirmation.connectionTopicId}`,
    );

    return confirmation.connectionTopicId;
  } catch (error) {
    logger.error(`Error monitoring connection confirmation:`, error);
    throw error;
  }
}

async function main() {
  try {
    const registryUrl = process.env.REGISTRY_URL;
    logger.info(`Using registry URL: ${registryUrl}`);

    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
      throw new Error(
        'HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables must be set',
      );
    }

    const baseClient = new HCS10Client({
      network: 'testnet',
      operatorId: process.env.HEDERA_ACCOUNT_ID!,
      operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY!,
      guardedRegistryBaseUrl: registryUrl,
      prettyPrint: true,
      logLevel: 'debug',
    });

    const alicePfpPath = path.join(__dirname, 'assets', 'alice-icon.svg');
    const bobPfpPath = path.join(__dirname, 'assets', 'bob-icon.svg');

    if (!fs.existsSync(alicePfpPath) || !fs.existsSync(bobPfpPath)) {
      throw new Error(
        `Asset files not found. Please ensure the files exist at:\n- ${alicePfpPath}\n- ${bobPfpPath}`,
      );
    }

    let alice;
    try {
      logger.info('Attempting to create Alice using new create() method...');
      alice = await getOrCreateAlice(logger, baseClient);
    } catch (error) {
      logger.warn(
        'Failed to create Alice using create() method, falling back to legacy method:',
        error,
      );
      alice = await getOrCreateAlice(logger, baseClient);
    }

    const bob = await getOrCreateBob(logger, baseClient);

    if (!alice) {
      throw new Error('Failed to create or retrieve Alice agent');
    }

    if (!bob) {
      throw new Error('Failed to create or retrieve Bob agent');
    }

    logger.info('==== AGENT DETAILS ====');
    logger.info(
      `Alice ID: ${alice.accountId}, Inbound: ${alice.inboundTopicId}, Outbound: ${alice.outboundTopicId}`,
    );
    logger.info(
      `Bob ID: ${bob.accountId}, Inbound: ${bob.inboundTopicId}, Outbound: ${bob.outboundTopicId}`,
    );
    logger.info('======================');

    const bobMonitor = monitorIncomingRequests(
      baseClient,
      bob.client,
      bob.inboundTopicId,
      logger,
      new FeeConfigBuilder({ network: 'testnet', logger })
        .addHbarFee(1, bob.accountId)
        .addHbarFee(2, '0.0.800'),
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('Alice submitting connection request to Bob');
    const aliceConnectionResponse = await alice.client.submitConnectionRequest(
      bob.inboundTopicId,
      'Hello Bob, I would like to collaborate on data analysis.',
    );

    const connectionRequestId =
      aliceConnectionResponse.topicSequenceNumber?.toNumber()!;
    logger.info(
      `Connection request submitted with sequence number: ${connectionRequestId}`,
    );

    logger.info('Waiting for connection confirmation...');
    const aliceMonitor = monitorConnectionConfirmation(
      alice.client,
      bob.inboundTopicId,
      alice.outboundTopicId,
      connectionRequestId,
    );

    try {
      const connectionTopicId = (await Promise.race([
        aliceMonitor,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 60000),
        ),
      ])) as string;

      logger.info(`Connection confirmed with topic ID: ${connectionTopicId}`);

      if (connectionTopicId) {
        logger.info('Alice sending small message...');
        const aliceSmallMessage = {
          type: 'data_analysis_request',
          dataset: 'customer_feedback_q4_2024',
          analysis_type: 'sentiment',
        };

        await alice.client.sendMessage(
          connectionTopicId,
          JSON.stringify(aliceSmallMessage),
          'Requesting sentiment analysis on Q4 2024 customer feedback',
        );
        logger.info('Small message sent successfully');

        logger.info('Alice sending large message...');

        const largeSampleData = {
          type: 'detailed_analysis_request',
          dataset: 'customer_feedback_q4_2024',
          analysis_types: [
            'sentiment',
            'topic_modeling',
            'emotion_detection',
            'intent_classification',
            'entity_recognition',
          ],
          parameters: {
            sentiment: {
              granularity: 'sentence',
              includeNeutral: true,
              includeCompound: true,
              normalization: 'weighted_average',
              includeRawScores: true,
              confidenceThreshold: 0.75,
              languages: [
                'en',
                'es',
                'fr',
                'de',
                'it',
                'pt',
                'nl',
                'ru',
                'ja',
                'zh',
              ],
            },
            topic_modeling: {
              algorithm: 'lda',
              numTopics: 20,
              iterations: 500,
              minTopicCoherence: 0.85,
              keywordsPerTopic: 15,
              removeStopwords: true,
              includeNgrams: true,
              maxNgramSize: 3,
            },
            emotion_detection: {
              emotions: [
                'joy',
                'sadness',
                'anger',
                'fear',
                'surprise',
                'disgust',
                'trust',
                'anticipation',
              ],
              thresholdPerEmotion: {
                joy: 0.6,
                sadness: 0.6,
                anger: 0.7,
                fear: 0.7,
                surprise: 0.65,
                disgust: 0.8,
                trust: 0.5,
                anticipation: 0.55,
              },
              includeIntensity: true,
              includeContextualFactors: true,
            },
            intent_classification: {
              intents: [
                'purchase',
                'inquiry',
                'complaint',
                'praise',
                'suggestion',
                'support',
                'cancellation',
                'comparison',
                'clarification',
              ],
              confidenceThreshold: 0.8,
              allowMultipleIntents: true,
              includeIntentStrength: true,
            },
            entity_recognition: {
              entityTypes: [
                'product',
                'feature',
                'service',
                'competitor',
                'location',
                'datetime',
                'price',
                'person',
                'organization',
                'rating',
              ],
              includeRelations: true,
              includeAttributes: true,
              includeHierarchies: true,
              fuzzyMatching: true,
              fuzzyThreshold: 0.85,
            },
          },
          filters: {
            dateRange: {
              start: '2024-10-01',
              end: '2024-12-31',
            },
            channels: [
              'website',
              'mobile_app',
              'call_center',
              'email',
              'social_media',
              'in_store',
              'surveys',
            ],
            productLines: [
              'premium',
              'standard',
              'budget',
              'enterprise',
              'small_business',
            ],
            customerSegments: [
              'new',
              'returning',
              'premium',
              'enterprise',
              'small_business',
              'inactive',
              'churned',
            ],
            sentimentPrefilter: 'all',
            minFeedbackLength: 20,
            maxFeedbackLength: 1000,
          },
          outputFormat: {
            type: 'json',
            includeRawText: true,
            includeMetadata: true,
            includeSummaryStatistics: true,
            includeVisualizationData: true,
            includeRecommendations: true,
            includeConfidenceScores: true,
          },
          priorityLevel: 'high',
          callbackEndpoint: 'https://api.example.com/callback/analysis-results',
          requestId: 'req-' + Date.now(),
          batchSize: 1000,
          deliveryPreference: 'complete',
        };

        await alice.client.sendMessage(
          connectionTopicId,
          JSON.stringify(largeSampleData),
          'Requesting detailed analysis with many parameters',
        );
        logger.info('Large message sent successfully');

        logger.info("Bob retrieving Alice's messages...");
        const messages = await bob.client.getMessages(connectionTopicId);
        const largeMessage = messages.messages.find(
          msg =>
            msg.op === 'message' &&
            typeof msg.data === 'string' &&
            msg.data.startsWith('hcs://1/'),
        );

        if (largeMessage && largeMessage.data) {
          logger.info('Found large message reference:', largeMessage.data);
          try {
            const resolvedContent = await bob.client.getMessageContent(
              largeMessage.data,
            );
            logger.info('Successfully resolved large message');
          } catch (error) {
            logger.error('Error resolving large message content:', error);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        logger.info('Bob sending response message...');
        const bobMessage = {
          type: 'analysis_result',
          dataset: 'customer_feedback_q4_2024',
          sentiment_scores: {
            positive: 0.75,
            neutral: 0.15,
            negative: 0.1,
          },
          key_topics: ['product_quality', 'customer_service', 'pricing'],
        };

        await bob.client.sendMessage(
          connectionTopicId,
          JSON.stringify(bobMessage),
          'Analysis complete. Sending results.',
        );
        logger.info('Response message sent successfully');
      }
    } catch (error) {
      throw new Error(`Connection process failed: ${error}`);
    }

    logger.info('Demo complete!');
    logger.info(`Alice ID: ${alice.accountId}`);
    logger.info(`Bob ID: ${bob.accountId}`);

    process.exit(0);
  } catch (error) {
    console.log(error);
    logger.error('Error in demo:', error);
    process.exit(1);
  }
}

main();
