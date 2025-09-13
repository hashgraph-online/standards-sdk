import * as dotenv from 'dotenv';
import { Logger, ConnectionsManager } from '../../src';
import { HCS10Client } from '../../src/hcs-10/sdk';
import {
  ensureAgentHasEnoughHbar,
  getOrCreateFoo,
  getOrCreateBar,
  monitorIncomingRequests,
} from './utils';
import { TransactMessage } from '../../src';
import { fileURLToPath } from 'url';
import {
  Hbar,
  TransferTransaction,
  ScheduleSignTransaction,
  ScheduleCreateTransaction,
  KeyList,
} from '@hashgraph/sdk';
import { ConversationalAgent } from '@hashgraphonline/conversational-agent';
import { format } from 'date-fns';
import * as path from 'path';

dotenv.config();

const logger = new Logger({
  module: 'HCS10TransactDemo',
  level: 'debug',
  prettyPrint: true,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Monitors connection confirmation process
 */
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

/**
 * Displays transaction details in a user-friendly format
 */
function displayTransaction(transaction: TransactMessage): void {
  logger.info(`
----- TRANSACTION REQUEST -----
ID: ${transaction.schedule_id}
From: ${transaction.operator_id}
Data: ${transaction.data}
Message: ${transaction.memo || 'N/A'}
Sequence #: ${transaction.sequence_number}
---------------------------
`);
}

/**
 * Display the status of a transaction
 */
function displayTransactionStatus(
  scheduleId: string,
  status: {
    executed: boolean;
    executedDate?: Date;
    deleted: boolean;
  },
): void {
  const formatDate = (date?: Date): string => {
    if (!date) return 'Not available';
    try {
      return date.toLocaleString();
    } catch (e) {
      return 'Invalid date format';
    }
  };

  logger.info(`
----- TRANSACTION STATUS -----
Schedule ID: ${scheduleId}
Status: ${status.executed ? 'EXECUTED' : status.deleted ? 'DELETED' : 'PENDING'}
Executed at: ${
    status.executed ? formatDate(status.executedDate) : 'Not yet executed'
  }
---------------------------
`);
}

/**
 * Uses ConversationalAgent to generate transaction bytes for multi-signature transfers
 */
async function generateMultiSigTransactionWithAgent(
  fooAccountId: string,
  barAccountId: string,
  amount: number,
  operatorAccountId: string,
  operatorPrivateKey: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<{
  transactionBytes: string;
  description: string;
  scheduleId?: string;
}> {
  logger.info(
    'Generating multi-signature transaction using ConversationalAgent...',
  );

  // Create a ConversationalAgent instance with returnBytes mode
  const agent = new ConversationalAgent({
    accountId: operatorAccountId,
    privateKey: operatorPrivateKey,
    network,
    openAIApiKey: process.env.OPENAI_API_KEY!,
    operationalMode: 'returnBytes',
    userAccountId: fooAccountId,
    scheduleUserTransactionsInBytesMode: true,
    verbose: false,
  });

  await agent.initialize();

  // Convert amount from tinybars to HBAR
  const hbarAmount = amount / 100000000;
  const halfAmount = hbarAmount / 2;

  const request = `I need to create a multi-signature transaction where ${fooAccountId} sends ${halfAmount} HBAR to Treasury (0.0.98) and ${barAccountId} sends ${halfAmount} HBAR to Treasury (0.0.98). Can you prepare this as a scheduled transaction?`;

  logger.info(`Agent request: ${request}`);

  // Process the message to get transaction bytes
  let response;
  try {
    response = await agent.processMessage(request);
  } catch (error: any) {
    logger.error('Agent processMessage error:', error);
    logger.error('Error details:', error.message);
    if (error.response) {
      logger.error('Error response:', error.response);
    }
    throw error;
  }

  if (!response.transactionBytes && !response.scheduleId) {
    logger.error('Agent response:', response);
    throw new Error('Agent did not return transaction bytes or schedule ID');
  }

  if (response.scheduleId && !response.transactionBytes) {
    logger.info('Agent created scheduled transaction successfully');
    logger.info('Schedule ID:', response.scheduleId);
    logger.info('The schedule can now be signed by the required parties');

    return {
      scheduleId: response.scheduleId,
      transactionBytes: 'SCHEDULE_CREATED',
      description:
        response.message ||
        `Schedule ${response.scheduleId} created successfully`,
    };
  }

  logger.info('Transaction bytes generated successfully');

  return {
    transactionBytes: response.transactionBytes,
    description:
      response.response ||
      `Multi-signature transfer of ${hbarAmount} HBAR to Treasury`,
  };
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

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY environment variable must be set for ConversationalAgent',
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

    await ensureAgentHasEnoughHbar(logger, baseClient, bar.accountId, 'Bar');

    logger.info('--- Starting Connection and Transaction Demo ---');

    monitorIncomingRequests(baseClient, bar.client, bar.inboundTopicId, logger);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const fooAccountId = foo.client.getOperatorAccountId();
    if (!fooAccountId) throw new Error('Failed to get Foo account ID');

    const barAccountId = bar.client.getOperatorAccountId();
    if (!barAccountId) throw new Error('Failed to get Bar account ID');

    logger.info(
      `(${fooAccountId}) Foo initiating connection to ${bar.accountId}`,
    );
    const connectionRequest = await foo.client.submitConnectionRequest(
      bar.inboundTopicId,
      'Foo wants to connect to Bar (transact demo)',
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
      `(${fooAccountId}) Creating a multi-signature transaction using ConversationalAgent`,
    );

    const { transactionBytes, description, scheduleId } =
      await generateMultiSigTransactionWithAgent(
        fooAccountId,
        barAccountId,
        200000000 + Math.floor(Math.random() * 1000000),
        process.env.HEDERA_ACCOUNT_ID!,
        process.env.HEDERA_PRIVATE_KEY!,
        'testnet',
      );

    let scheduledTxResult;

    if (scheduleId) {
      logger.info(`Schedule created successfully: ${scheduleId}`);
      logger.info('Schedule is ready for signing by participants');
      scheduledTxResult = { scheduleId };
    } else {
      const scheduleTx = ScheduleCreateTransaction.fromBytes(
        Buffer.from(transactionBytes, 'base64'),
      );

      scheduledTxResult = await foo.client.sendTransaction(
        connectionTopicId,
        scheduleTx,
        'Multi-signature transfer generated by ConversationalAgent',
        {
          scheduleMemo: description,
          expirationTime: 24 * 60 * 60,
          operationMemo:
            'Please approve this AI-generated transaction - it requires both our signatures',
        },
      );

      logger.info(`
      Scheduled transaction created:
      Schedule ID: ${scheduledTxResult.scheduleId}
      Transaction ID: ${scheduledTxResult.transactionId}
      `);
    }

    if (!scheduleId) {
      logger.info(
        `(${fooAccountId}) Transaction operation sent to Bar for approval`,
      );

      logger.info(`Transaction operation submitted successfully`);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    logger.info(`(${barAccountId}) Bar checking for transactions to approve`);

    const connectionManager = new ConnectionsManager({
      baseClient: bar.client,
      logLevel: 'debug',
    });

    let targetScheduleId = scheduledTxResult.scheduleId;

    if (!scheduleId) {
      const pendingTransactions =
        await connectionManager.getPendingTransactions(connectionTopicId);

      logger.info(`Found ${pendingTransactions.length} pending transactions`);

      if (pendingTransactions.length > 0) {
        pendingTransactions.forEach(displayTransaction);
        targetScheduleId = pendingTransactions[0].schedule_id;
      } else {
        logger.info('No pending transactions found in connection topic');
        return;
      }
    }

    logger.info(
      `(${barAccountId}) Checking status of transaction ${targetScheduleId}`,
    );

    const txStatus =
      await connectionManager.getScheduledTransactionStatus(targetScheduleId);

    displayTransactionStatus(targetScheduleId, txStatus);

    if (txStatus.executed) {
      logger.info(`Transaction has already been executed! No need to approve.`);
    } else {
      logger.info(
        `(${barAccountId}) Approval process starting for transaction ${targetScheduleId}`,
      );

      const MAX_ATTEMPTS = 3;
      let attemptCount = 0;
      let transactionApproved = false;

      while (attemptCount < MAX_ATTEMPTS && !transactionApproved) {
        attemptCount++;

        try {
          logger.info(`Approval attempt ${attemptCount}/${MAX_ATTEMPTS}...`);

          const freshStatus =
            await connectionManager.getScheduledTransactionStatus(
              targetScheduleId,
            );

          if (freshStatus.executed) {
            logger.info(`Transaction was already executed. Skipping approval.`);
            transactionApproved = true;
            break;
          }

          if (freshStatus.deleted) {
            logger.info(`Transaction was deleted. Skipping approval.`);
            break;
          }

          logger.info(
            `Transaction status before approval: ${
              freshStatus.executed ? 'EXECUTED' : 'PENDING'
            }`,
          );

          const scheduleSignTx = await new ScheduleSignTransaction()
            .setScheduleId(targetScheduleId)
            .execute(bar.client.getClient());

          logger.info(`Transaction approval submitted, waiting for receipt...`);

          try {
            const receipt = await scheduleSignTx.getReceipt(
              bar.client.getClient(),
            );
            logger.info(
              `Transaction approval status: ${receipt.status.toString()}`,
            );
            transactionApproved = true;
            break;
          } catch (receiptError: any) {
            if (receiptError?.status === 'SCHEDULE_ALREADY_EXECUTED') {
              logger.info(
                `Transaction was executed by someone else during our approval.`,
              );
              transactionApproved = true;
              break;
            } else {
              logger.error(
                `Error getting receipt: ${JSON.stringify(receiptError)}`,
              );
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (attemptError: any) {
          logger.error(
            `Approval attempt ${attemptCount} failed: ${attemptError}`,
          );

          if (attemptError?.status === 'SCHEDULE_ALREADY_EXECUTED') {
            logger.info(`Transaction was already executed.`);
            transactionApproved = true;
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      const finalStatus =
        await connectionManager.getScheduledTransactionStatus(targetScheduleId);

      logger.info(
        `Final transaction status after ${attemptCount} approval attempt(s):`,
      );
      displayTransactionStatus(targetScheduleId, finalStatus);

      if (finalStatus.executed) {
        logger.info(`✅ Transaction successfully executed!`);
      } else if (finalStatus.deleted) {
        logger.info(`⚠️ Transaction was deleted.`);
      } else {
        logger.info(`⏳ Transaction is still pending.`);
      }
    }

    logger.info(`(${fooAccountId}) Foo monitoring transaction status`);

    const fooConnectionManager = new ConnectionsManager({
      baseClient: foo.client,
      logLevel: 'debug',
    });
    const currentStatus =
      await fooConnectionManager.getScheduledTransactionStatus(
        scheduledTxResult.scheduleId,
      );

    displayTransactionStatus(scheduledTxResult.scheduleId, currentStatus);

    logger.info('');
    logger.info('--- DEMONSTRATING CONVERSATIONAL AGENT AGAIN ---');
    logger.info(
      `(${fooAccountId}) Creating another multi-sig transfer using ConversationalAgent`,
    );

    try {
      const {
        transactionBytes: smallTxBytes,
        description: smallTxDesc,
        scheduleId: smallScheduleId,
      } = await generateMultiSigTransactionWithAgent(
        fooAccountId,
        barAccountId,
        50000000 + Math.floor(Math.random() * 1000000),
        process.env.HEDERA_ACCOUNT_ID!,
        process.env.HEDERA_PRIVATE_KEY!,
        'testnet',
      );

      if (smallScheduleId) {
        logger.info(`Second schedule created successfully: ${smallScheduleId}`);
        logger.info('Demo complete - both schedules created for signing');
      } else {
        const smallScheduleTx = ScheduleCreateTransaction.fromBytes(
          Buffer.from(smallTxBytes, 'base64'),
        );

        const combinedResult = await foo.client.sendTransaction(
          connectionTopicId,
          smallScheduleTx,
          'Smaller multi-sig transfer generated by ConversationalAgent',
          {
            scheduleMemo: smallTxDesc,
            expirationTime: 12 * 60 * 60,
            operationMemo:
              'This demonstrates AI-generated multi-signature transactions',
          },
        );

        logger.info(`
        Combined operation completed:
        Schedule ID: ${combinedResult.scheduleId}
        Transaction ID: ${combinedResult.transactionId}
        `);

        await new Promise(resolve => setTimeout(resolve, 3000));

        const secondTxStatus =
          await fooConnectionManager.getScheduledTransactionStatus(
            combinedResult.scheduleId,
          );

        logger.info(`Second transaction status:`);
        displayTransactionStatus(combinedResult.scheduleId, secondTxStatus);

        logger.info(
          `(${barAccountId}) Bar checking for all pending transactions again`,
        );
        const allPendingTransactions =
          await connectionManager.getPendingTransactions(connectionTopicId);
        logger.info(
          `Found ${allPendingTransactions.length} total pending transactions`,
        );

        allPendingTransactions.forEach(displayTransaction);

        if (
          !secondTxStatus.executed &&
          allPendingTransactions.some(
            tx => tx.schedule_id === combinedResult.scheduleId,
          )
        ) {
          logger.info(`
          To approve this second transaction, Bar would run:
          new ScheduleSignTransaction()
            .setScheduleId("${combinedResult.scheduleId}")
            .execute(client);
          `);
        }
      }
    } catch (error) {
      logger.error(`Error with convenience method transaction: ${error}`);
    }

    logger.info('==== AGENT TRANSACT DEMO COMPLETE ====');
    logger.info('Agent Foo Details:');
    logger.info(`  Account ID: ${foo.accountId}`);
    logger.info(`  Inbound Topic: ${foo.inboundTopicId}`);
    logger.info('-');
    logger.info('Agent Bar Details:');
    logger.info(`  Account ID: ${bar.accountId}`);
    logger.info(`  Inbound Topic: ${bar.inboundTopicId}`);
    logger.info('-');
    logger.info(`Connection Topic: ${connectionTopicId}`);
    logger.info(`Scheduled Transaction ID: ${scheduledTxResult.scheduleId}`);
    logger.info('==================================');
    process.exit(0);
  } catch (error) {
    console.log(error);
    logger.error('Error in transact demo:', error);
    process.exit(1);
  }
}

main();
