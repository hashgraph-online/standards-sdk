import * as dotenv from 'dotenv';
import { HCS10Client, Logger, ConnectionsManager } from '../../src';
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
  KeyList,
} from '@hashgraph/sdk';
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
  connectionRequestId: number
): Promise<string | null> {
  const agentId = client.getOperatorAccountId();
  logger.info(
    `(${agentId}) Waiting for confirmation for request #${connectionRequestId} on ${targetInboundTopicId}`
  );
  try {
    const confirmation = await client.waitForConnectionConfirmation(
      targetInboundTopicId,
      connectionRequestId,
      30,
      2000
    );
    logger.info(
      `(${agentId}) Confirmation received! Connection Topic: ${confirmation.connectionTopicId}`
    );
    return confirmation.connectionTopicId;
  } catch (error) {
    logger.error(
      `(${agentId}) Did not receive confirmation for request #${connectionRequestId}:`,
      error
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
  }
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
 * Creates a multi-signature transfer transaction that requires approval from both accounts
 */
function createMultiSigTransaction(
  fooAccountId: string,
  barAccountId: string,
  amount: number
): TransferTransaction {
  return new TransferTransaction()
    .addHbarTransfer(fooAccountId, Hbar.fromTinybars(-amount / 2))
    .addHbarTransfer(barAccountId, Hbar.fromTinybars(-amount / 2))
    .addHbarTransfer('0.0.98', Hbar.fromTinybars(amount));
}

async function main() {
  try {
    const registryUrl = process.env.REGISTRY_URL;
    logger.info(`Using registry URL: ${registryUrl || 'Default Moonscape'}`);

    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
      throw new Error(
        'HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables must be set'
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

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const fooAccountId = foo.client.getOperatorAccountId();
    if (!fooAccountId) throw new Error('Failed to get Foo account ID');

    const barAccountId = bar.client.getOperatorAccountId();
    if (!barAccountId) throw new Error('Failed to get Bar account ID');

    logger.info(
      `(${fooAccountId}) Foo initiating connection to ${bar.accountId}`
    );
    const connectionRequest = await foo.client.submitConnectionRequest(
      bar.inboundTopicId,
      'Foo wants to connect to Bar (transact demo)'
    );
    const connectionRequestId =
      connectionRequest.topicSequenceNumber?.toNumber();
    if (!connectionRequestId) {
      throw new Error(
        'Failed to get connection request sequence number from Foo'
      );
    }
    logger.info(
      `(${fooAccountId}) Connection request #${connectionRequestId} sent to Bar's topic ${bar.inboundTopicId}`
    );

    const connectionTopicId = await monitorConnectionConfirmation(
      foo.client,
      bar.inboundTopicId,
      connectionRequestId
    );

    if (!connectionTopicId) {
      throw new Error(
        `Connection confirmation failed or timed out for request #${connectionRequestId}`
      );
    }

    logger.info(
      `Connection successfully established on topic: ${connectionTopicId}`
    );

    logger.info(
      `(${fooAccountId}) Creating a multi-signature transaction that requires both Foo and Bar to sign`
    );

    const transferTx = createMultiSigTransaction(
      fooAccountId,
      barAccountId,
      200000000
    );

    const scheduledTxResult = await foo.client.sendTransaction(
      connectionTopicId,
      transferTx,
      'Transfer 2 HBAR to Treasury (requires both Foo and Bar)',
      {
        scheduleMemo: 'Transfer 2 HBAR to Treasury (requires both signatures)',
        expirationTime: 24 * 60 * 60,
        operationMemo:
          'Please approve this transaction - it requires both our signatures',
      }
    );

    logger.info(`
    Scheduled transaction created:
    Schedule ID: ${scheduledTxResult.scheduleId}
    Transaction ID: ${scheduledTxResult.transactionId}
    `);

    logger.info(
      `(${fooAccountId}) Transaction operation sent to Bar for approval`
    );

    logger.info(`Transaction operation submitted successfully`);

    await new Promise((resolve) => setTimeout(resolve, 5000));

    logger.info(`(${barAccountId}) Bar checking for pending transactions`);

    const connectionManager = new ConnectionsManager({
      baseClient: bar.client,
      logLevel: 'debug',
    });
    const pendingTransactions = await connectionManager.getPendingTransactions(
      connectionTopicId
    );

    logger.info(`Found ${pendingTransactions.length} pending transactions`);

    if (pendingTransactions.length > 0) {
      pendingTransactions.forEach(displayTransaction);

      const targetTransaction = pendingTransactions[0];
      logger.info(
        `(${barAccountId}) Checking status of transaction ${targetTransaction.schedule_id}`
      );

      const txStatus = await connectionManager.getScheduledTransactionStatus(
        targetTransaction.schedule_id
      );

      displayTransactionStatus(targetTransaction.schedule_id, txStatus);

      if (txStatus.executed) {
        logger.info(
          `Transaction has already been executed! No need to approve.`
        );
      } else {
        logger.info(
          `(${barAccountId}) Approval process starting for transaction ${targetTransaction.schedule_id}`
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
                targetTransaction.schedule_id
              );

            if (freshStatus.executed) {
              logger.info(
                `Transaction was already executed. Skipping approval.`
              );
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
              }`
            );

            const scheduleSignTx = await new ScheduleSignTransaction()
              .setScheduleId(targetTransaction.schedule_id)
              .execute(bar.client.getClient());

            logger.info(
              `Transaction approval submitted, waiting for receipt...`
            );

            try {
              const receipt = await scheduleSignTx.getReceipt(
                bar.client.getClient()
              );
              logger.info(
                `Transaction approval status: ${receipt.status.toString()}`
              );
              transactionApproved = true;
              break;
            } catch (receiptError: any) {
              if (receiptError?.status === 'SCHEDULE_ALREADY_EXECUTED') {
                logger.info(
                  `Transaction was executed by someone else during our approval.`
                );
                transactionApproved = true;
                break;
              } else {
                logger.error(
                  `Error getting receipt: ${JSON.stringify(receiptError)}`
                );
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          } catch (attemptError: any) {
            logger.error(
              `Approval attempt ${attemptCount} failed: ${attemptError}`
            );

            if (attemptError?.status === 'SCHEDULE_ALREADY_EXECUTED') {
              logger.info(`Transaction was already executed.`);
              transactionApproved = true;
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const finalStatus =
          await connectionManager.getScheduledTransactionStatus(
            targetTransaction.schedule_id
          );

        logger.info(
          `Final transaction status after ${attemptCount} approval attempt(s):`
        );
        displayTransactionStatus(targetTransaction.schedule_id, finalStatus);

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
          scheduledTxResult.scheduleId
        );

      displayTransactionStatus(scheduledTxResult.scheduleId, currentStatus);

      logger.info('');
      logger.info('--- DEMONSTRATING CONVENIENCE METHOD ---');
      logger.info(
        `(${fooAccountId}) Creating and sending another transaction in one step`
      );

      try {
        const smallTransferTx = createMultiSigTransaction(
          fooAccountId,
          barAccountId,
          50000000
        );

        const combinedResult = await foo.client.sendTransaction(
          connectionTopicId,
          smallTransferTx,
          'Small transfer requiring both signatures',
          {
            scheduleMemo:
              'Demo of combined method - multi-signature transaction',
            expirationTime: 12 * 60 * 60,
            operationMemo: 'This demonstrates the direct transaction method',
          }
        );

        logger.info(`
        Combined operation completed:
        Schedule ID: ${combinedResult.scheduleId}
        Transaction ID: ${combinedResult.transactionId}
        `);

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const secondTxStatus =
          await fooConnectionManager.getScheduledTransactionStatus(
            combinedResult.scheduleId
          );

        logger.info(`Second transaction status:`);
        displayTransactionStatus(combinedResult.scheduleId, secondTxStatus);

        logger.info(
          `(${barAccountId}) Bar checking for all pending transactions again`
        );
        const allPendingTransactions =
          await connectionManager.getPendingTransactions(connectionTopicId);
        logger.info(
          `Found ${allPendingTransactions.length} total pending transactions`
        );

        allPendingTransactions.forEach(displayTransaction);

        if (
          !secondTxStatus.executed &&
          allPendingTransactions.some(
            (tx) => tx.schedule_id === combinedResult.scheduleId
          )
        ) {
          logger.info(`
          To approve this second transaction, Bar would run:
          new ScheduleSignTransaction()
            .setScheduleId("${combinedResult.scheduleId}")
            .execute(client);
          `);
        }
      } catch (error) {
        logger.error(`Error with convenience method transaction: ${error}`);
      }
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
  } catch (error) {
    console.log(error);
    logger.error('Error in transact demo:', error);
  }
}

main();
