import * as dotenv from 'dotenv';
import { Logger, NetworkType, AgentBuilder, FeeConfigBuilder, AIAgentCapability, InboundTopicType } from '../../src';
import { HCS10Client } from '../../src/hcs-10/sdk';
import {
  ensureAgentHasEnoughHbar,
  getOrCreateFoo,
  getOrCreateBar,
  AgentData,
  monitorIncomingRequests,
} from './utils';
import { HCSMessage } from '../../src';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const logger = new Logger({
  module: 'HCS10FeeDemo',
  level: 'debug',
  prettyPrint: true,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function monitorConnectionConfirmation(
  client: HCS10Client,
  targetInboundTopicId: string,
  connectionRequestId: number,
): Promise<string | null> {
  const agentId = client.getOperatorAccountId();
  logger.info(
    `(${agentId}) Waiting for confirmation for request #${connectionRequestId} on ${targetInboundTopicId}`,
  );
  try {
    const confirmation = await client.waitForConnectionConfirmation(
      targetInboundTopicId,
      connectionRequestId,
      30,
      2000,
    );
    logger.info(
      `(${agentId}) Confirmation received! Connection Topic: ${confirmation.connectionTopicId}`,
    );
    return confirmation.connectionTopicId;
  } catch (error) {
    logger.error(
      `(${agentId}) Did not receive confirmation for request #${connectionRequestId}:`,
      error,
    );
    return null;
  }
}

async function main() {
  try {
    const registryUrl = process.env.REGISTRY_URL;
    logger.info(`Using registry URL: ${registryUrl || 'Default Moonscape'}`);

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

    let foo = await getOrCreateFoo(logger, baseClient);
    if (!foo) throw new Error('Failed to get or create Agent Foo');

    await ensureAgentHasEnoughHbar(logger, baseClient, foo.accountId, 'Foo');

    let bar = await getOrCreateBar(logger, baseClient);
    if (!bar) throw new Error('Failed to get or create Agent Bar');

    await ensureAgentHasEnoughHbar(logger, baseClient, foo.accountId, 'Foo');
    await ensureAgentHasEnoughHbar(logger, baseClient, bar.accountId, 'Bar');

    logger.info('--- Starting Connection and Messaging ---');

    monitorIncomingRequests(
      baseClient,
      bar.client,
      bar.inboundTopicId,
      logger,
      new FeeConfigBuilder({ network: 'testnet', logger }).addHbarFee(
        1,
        bar.accountId,
      ),
    );

    await new Promise(resolve => setTimeout(resolve, 3000));

    const fooAccountId = foo.client.getOperatorAccountId();
    logger.info(
      `(${fooAccountId}) Foo initiating connection to ${bar.accountId}`,
    );
    const connectionRequest = await foo.client.submitConnectionRequest(
      bar.inboundTopicId,
      'Foo wants to connect to Bar (fee demo)',
    );
    const connectionRequestId =
      connectionRequest.topicSequenceNumber?.toNumber();
    if (!connectionRequestId) {
      throw new Error(
        'Failed to get connection request sequence number from Foo',
      );
    }
    logger.info(
      `(${fooAccountId}) Connection request #${connectionRequestId} sent to Bar's topic ${bar.inboundTopicId}`,
    );

    const connectionTopicId = await monitorConnectionConfirmation(
      foo.client,
      bar.inboundTopicId,
      connectionRequestId,
    );

    if (!connectionTopicId) {
      throw new Error(
        `Connection confirmation failed or timed out for request #${connectionRequestId}`,
      );
    }

    logger.info(
      `Connection successfully established on topic: ${connectionTopicId}`,
    );

    logger.info(
      `(${fooAccountId}) Foo sending message on connection topic ${connectionTopicId} (Bar set 0.1 HBAR fee)`,
    );
    const messagePayload = {
      text: 'Hello Bar from Foo via fee-based connection! DEMO',
    };
    const sendReceipt = await foo.client.sendMessage(
      connectionTopicId,
      JSON.stringify(messagePayload),
      'Test message Foo->Bar (fee demo)',
    );
    logger.info(
      `(${fooAccountId}) Message sent, status: ${sendReceipt.status.toString()}`,
    );

    await new Promise(resolve => setTimeout(resolve, 3000));

    const barAccountId = bar.client.getOperatorAccountId();
    logger.info(
      `(${barAccountId}) Bar checking for messages on ${connectionTopicId}`,
    );
    const receivedMessages = await bar.client.getMessages(connectionTopicId);
    logger.info(
      `(${barAccountId}) Bar received messages on connection topic:`,
      receivedMessages,
    );
    const fooMessageReceived = receivedMessages.messages.some(
      (msg: any) =>
        msg.op === 'message' &&
        msg.operator_id?.endsWith(`@${fooAccountId}`) &&
        msg.data === JSON.stringify(messagePayload),
    );
    if (fooMessageReceived) {
      logger.info(`(${barAccountId}) Successfully received Foo's message!`);
    } else {
      logger.warn(`(${barAccountId}) Did not find Foo's message in the list.`);
    }

    logger.info(
      `(${barAccountId}) Bar sending response message on ${connectionTopicId}`,
    );
    const responsePayload = {
      response: 'Acknowledged fee-based message from Foo!',
    };
    const responseReceipt = await bar.client.sendMessage(
      connectionTopicId,
      JSON.stringify(responsePayload),
      'Response from Bar (fee demo)',
    );
    logger.info(
      `(${barAccountId}) Response sent, status: ${responseReceipt.status.toString()}`,
    );

    logger.info('==== AGENT FEE DEMO COMPLETE (with full interaction) ====');
    logger.info('Agent Foo Details:');
    logger.info(`  Account ID: ${foo.accountId}`);
    logger.info(
      `  Inbound Topic: ${foo.inboundTopicId} (Should have 0.5 HBAR fee)`,
    );
    logger.info(`  Outbound Topic: ${foo.outboundTopicId}`);
    logger.info('-');
    logger.info('Agent Bar Details:');
    logger.info(`  Account ID: ${bar.accountId}`);
    logger.info(
      `  Inbound Topic: ${bar.inboundTopicId} (Should have 1.0 HBAR fee)`,
    );
    logger.info(`  Outbound Topic: ${bar.outboundTopicId}`);
    logger.info('==================================');

    logger.info('Verifying fees via Mirror Node...');
    try {
      const fooTopicInfo = await baseClient.getPublicTopicInfo(
        foo.inboundTopicId,
      );
      logger.info(
        'Foo Inbound Topic Custom Fees:',
        JSON.stringify(fooTopicInfo?.custom_fees, null, 2),
      );

      const barTopicInfo = await baseClient.getPublicTopicInfo(
        bar.inboundTopicId,
      );
      logger.info(
        'Bar Inbound Topic Custom Fees:',
        JSON.stringify(barTopicInfo?.custom_fees, null, 2),
      );

      const connectionTopicInfo =
        await baseClient.getPublicTopicInfo(connectionTopicId);
      logger.info(
        `Connection Topic (${connectionTopicId}) Custom Fees (set by Bar):`,
        JSON.stringify(connectionTopicInfo?.custom_fees, null, 2),
      );
    } catch (verifyError) {
      logger.error('Error verifying topic fees:', verifyError);
    }
  } catch (error) {
    console.log(error);
    logger.error('Error in fee demo:', error);
  }
}

main();
