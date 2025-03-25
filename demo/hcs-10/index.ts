import dotenv from 'dotenv';
import { FeeConfigBuilder, HCS10Client } from '../../src/hcs-10/sdk';
import { AgentBuilder } from '../../src/hcs-10/agent-builder';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { AIAgentCapability } from '../../src/hcs-11';
import {
  InboundTopicType,
  RegistrationProgressData,
} from '../../src/hcs-10/types.d';
import { Logger } from '../../src/utils/logger';
import { Hbar, TransferTransaction } from '@hashgraph/sdk';
import { HederaMirrorNode } from '../../src/services/mirror-node';

const logger = new Logger({ 
  module: 'HCS10Demo', 
  level: 'debug',
  prettyPrint: true 
});

const MIN_REQUIRED_USD_TOPIC = 3;
const MIN_REQUIRED_USD_MESSAGING = 0.1;

type EnvUpdateValues = Record<string, string>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

function updateEnvFile(newValues: EnvUpdateValues) {
  const envFilePath = path.resolve(__dirname, '../../.env');
  let envContent = '';

  logger.info(
    `Saving values to .env file: ${Object.keys(newValues).join(', ')}`
  );

  try {
    if (fs.existsSync(envFilePath)) {
      envContent = fs.readFileSync(envFilePath, 'utf8');
    }
  } catch (error) {
    logger.error(`Failed to read .env file: ${error}`);
    throw new Error(`Failed to read .env file: ${error}`);
  }

  const envLines = envContent.split('\n');
  const updatedLines = [...envLines];
  let updatedCount = 0;
  let addedCount = 0;

  Object.entries(newValues).forEach(([key, value]) => {
    if (!value) {
      logger.warn(`Skipping empty value for ${key}`);
      return;
    }

    const lineIndex = updatedLines.findIndex(
      (line) => line.startsWith(`${key}=`) || line.startsWith(`# ${key}=`)
    );

    const newLine = `${key}=${value}`;

    if (lineIndex >= 0) {
      updatedLines[lineIndex] = newLine;
      updatedCount++;
    } else {
      updatedLines.push(newLine);
      addedCount++;
    }

    process.env[key] = value;
  });

  try {
    const finalContent = updatedLines.join('\n');
    fs.writeFileSync(envFilePath, finalContent);
    logger.info(
      `Updated .env file: ${updatedCount} values updated, ${addedCount} values added`
    );
  } catch (error) {
    logger.error(`Failed to write to .env file: ${error}`);
    throw new Error(`Failed to write to .env file: ${error}`);
  }
}

async function monitorConnectionConfirmation(
  client: HCS10Client,
  bobInboundTopicId: string,
  aliceOutboundTopicId: string,
  connectionRequestId: number
): Promise<string> {
  try {
    logger.info(
      `Monitoring for connection confirmation on request #${connectionRequestId}`
    );

    const confirmation = await client.waitForConnectionConfirmation(
      bobInboundTopicId,
      connectionRequestId,
      60,
      2000
    );

    logger.info(
      `Connection confirmation received with ID: ${confirmation.connectionTopicId}`
    );

    await client.recordOutboundConnectionConfirmation({
      outboundTopicId: aliceOutboundTopicId,
      connectionRequestId,
      confirmedRequestId: confirmation.sequence_number,
      connectionTopicId: confirmation.connectionTopicId,
      operatorId: confirmation.confirmedBy,
      memo: confirmation.memo || 'Connection confirmed',
    });

    return confirmation.connectionTopicId;
  } catch (error) {
    logger.error(`Error monitoring connection confirmation:`, error);
    throw error;
  }
}

async function monitorIncomingRequests(
  baseClient: HCS10Client,
  client: HCS10Client,
  inboundTopicId: string
): Promise<void> {
  if (!inboundTopicId) {
    throw new Error(
      'Cannot monitor incoming requests: inboundTopicId is undefined'
    );
  }

  let lastProcessedMessage = 0;
  const processedRequestIds = new Set<number>();

  logger.info(`Monitoring incoming requests on topic ${inboundTopicId}`);
  const operatorAccountId = client.getClient().operatorAccountId?.toString();

  if (!operatorAccountId) {
    throw new Error('Operator account ID is not set');
  }

  while (true) {
    try {
      const messages = await client.getMessages(inboundTopicId);

      const connectionCreatedMessages = messages.messages.filter(
        (msg) => msg.op === 'connection_created'
      );

      connectionCreatedMessages.forEach((msg) => {
        if (msg.connection_id) {
          processedRequestIds.add(msg.connection_id);
        }
      });

      const connectionRequests = messages.messages.filter(
        (msg) =>
          msg.op === 'connection_request' &&
          msg.sequence_number > lastProcessedMessage
      );

      for (const message of connectionRequests) {
        lastProcessedMessage = Math.max(
          lastProcessedMessage,
          message.sequence_number
        );

        const operator_id = message.operator_id || '';
        const accountId = operator_id.split('@')[1] || '';

        if (!accountId) {
          logger.warn('Invalid operator_id format, missing account ID');
          continue;
        }

        const connectionRequestId = message.sequence_number;

        if (processedRequestIds.has(connectionRequestId)) {
          logger.info(
            `Request #${connectionRequestId} already processed, skipping`
          );
          continue;
        }

        logger.info(
          `Processing connection request #${connectionRequestId} from ${accountId}`
        );

        try {
          await ensureAgentHasEnoughHbar(
            baseClient,
            accountId,
            `Agent ${accountId}-${inboundTopicId}`
          );
          const { connectionTopicId, confirmedConnectionSequenceNumber } =
            await client.handleConnectionRequest(
              inboundTopicId,
              accountId,
              connectionRequestId,
              FeeConfigBuilder.forHbar(1, operatorAccountId)
            );

          processedRequestIds.add(connectionRequestId);

          logger.info(
            `Connection confirmed with topic ID: ${connectionTopicId}`
          );
        } catch (error) {
          logger.error(
            `Error handling request #${connectionRequestId}:`,
            error
          );
        }
      }
    } catch (error) {
      logger.error('Error monitoring requests:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * Handles and displays progress data during agent creation and registration
 */
function createProgressHandler(agentName: string) {
  return (progress: RegistrationProgressData) => {
    const percentage =
      progress.progressPercent !== undefined
        ? Math.round(progress.progressPercent)
        : 0;

    const progressBar = createProgressBar(percentage);

    logger.info(
      `${agentName} | ${progress.stage.toUpperCase()} | ${progressBar} ${percentage}% | ${
        progress.message
      }`
    );

    if (progress.stage === 'completed') {
      logger.info(`${agentName} creation completed successfully!`);
    } else if (progress.stage === 'failed') {
      logger.error(`${agentName} creation failed: ${progress.message}`);
    }
  };
}

/**
 * Creates a visual progress bar
 */
function createProgressBar(percentage: number): string {
  const barLength = 20;
  const filledLength = Math.round((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;

  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(emptyLength);

  return `[${filled}${empty}]`;
}

async function ensureAgentHasEnoughHbar(
  baseClient: HCS10Client,
  targetAccountId: string,
  agentName: string
): Promise<boolean> {
  try {
    logger.info(`Checking ${agentName}'s HBAR balance via mirror node`);

    const baseAccount = baseClient.getClient().operatorAccountId?.toString();
    if (!baseAccount) {
      logger.error("Base client's operator account ID is not set");
      return false;
    }

    const mirrorNode = new HederaMirrorNode('testnet', logger);

    try {
      const accountInfo = await mirrorNode.requestAccount(targetAccountId);
      const currentBalance = accountInfo.balance.balance / 100_000_000;

      logger.info(`${agentName}'s current balance: ${currentBalance} HBAR`);

      const hbarPrice = await mirrorNode.getHBARPrice(new Date());

      if (!hbarPrice) {
        logger.error(
          'Failed to get current HBAR price, using default value of $0.07'
        );
        const defaultHbarPrice = 0.2;

        const requiredHbarForTopic = MIN_REQUIRED_USD_TOPIC / defaultHbarPrice;
        const requiredHbarForMessaging =
          MIN_REQUIRED_USD_MESSAGING / defaultHbarPrice;
        const totalRequiredHbar =
          requiredHbarForTopic + requiredHbarForMessaging + 1;

        if (currentBalance >= totalRequiredHbar) {
          logger.info(
            `${agentName} has sufficient HBAR (${currentBalance}) for operations (required: ${totalRequiredHbar.toFixed(
              2
            )})`
          );
          return true;
        }

        const transferAmount = Math.ceil(totalRequiredHbar - currentBalance);
        logger.info(
          `${agentName} needs more HBAR. Transferring ${transferAmount} HBAR (estimated $${(
            transferAmount * defaultHbarPrice
          ).toFixed(2)} USD)`
        );

        const transaction = new TransferTransaction()
          .addHbarTransfer(baseAccount, new Hbar(-transferAmount))
          .addHbarTransfer(targetAccountId, new Hbar(transferAmount))
          .setTransactionMemo(`Funding ${agentName} for fee topics`);

        const txResponse = await transaction.execute(baseClient.getClient());

        try {
          const receipt = await txResponse.getReceipt(baseClient.getClient());
          logger.info(
            `Successfully transferred ${transferAmount} HBAR to ${agentName} (status: ${receipt.status})`
          );
          return true;
        } catch (error) {
          logger.error(
            `Failed to get receipt for HBAR transfer to ${agentName}:`,
            error
          );
          return false;
        }
      }

      logger.info(`Current HBAR price: $${hbarPrice.toFixed(4)}`);

      const requiredHbarForTopic = MIN_REQUIRED_USD_TOPIC / hbarPrice;
      const requiredHbarForMessaging = MIN_REQUIRED_USD_MESSAGING / hbarPrice;
      const totalRequiredHbar =
        requiredHbarForTopic + requiredHbarForMessaging + 1;

      if (currentBalance >= totalRequiredHbar) {
        logger.info(
          `${agentName} has sufficient HBAR (${currentBalance}) for operations (required: ${totalRequiredHbar.toFixed(
            2
          )})`
        );
        return true;
      }

      const transferAmount = Math.ceil(totalRequiredHbar - currentBalance);
      logger.info(
        `${agentName} needs more HBAR. Transferring ${transferAmount} HBAR (${(
          transferAmount * hbarPrice
        ).toFixed(2)} USD)`
      );

      const transaction = new TransferTransaction()
        .addHbarTransfer(baseAccount, new Hbar(-transferAmount))
        .addHbarTransfer(targetAccountId, new Hbar(transferAmount))
        .setTransactionMemo(`Funding ${agentName} for fee topics`);

      const txResponse = await transaction.execute(baseClient.getClient());

      try {
        const receipt = await txResponse.getReceipt(baseClient.getClient());
        logger.info(
          `Successfully transferred ${transferAmount} HBAR to ${agentName} (status: ${receipt.status})`
        );
        return true;
      } catch (error) {
        logger.error(
          `Failed to get receipt for HBAR transfer to ${agentName}:`,
          error
        );
        return false;
      }
    } catch (accountError) {
      logger.error(
        `Failed to get ${agentName}'s account info from mirror node:`,
        accountError
      );

      const defaultHbarPrice = 0.07;
      const totalRequiredHbar =
        (MIN_REQUIRED_USD_TOPIC + MIN_REQUIRED_USD_MESSAGING) /
          defaultHbarPrice +
        1;
      const transferAmount = Math.ceil(totalRequiredHbar);

      logger.info(
        `Unable to check balance. Transferring ${transferAmount} HBAR to ensure sufficient funds`
      );

      const transaction = new TransferTransaction()
        .addHbarTransfer(baseAccount, new Hbar(-transferAmount))
        .addHbarTransfer(targetAccountId, new Hbar(transferAmount))
        .setTransactionMemo(`Funding ${agentName} for fee topics`);

      const txResponse = await transaction.execute(baseClient.getClient());

      try {
        const receipt = await txResponse.getReceipt(baseClient.getClient());
        logger.info(
          `Successfully transferred ${transferAmount} HBAR to ${agentName} (status: ${receipt.status})`
        );
        return true;
      } catch (error) {
        logger.error(
          `Failed to get receipt for HBAR transfer to ${agentName}:`,
          error
        );
        return false;
      }
    }
  } catch (error) {
    logger.error(`Error ensuring ${agentName} has enough HBAR:`, error);
    return false;
  }
}

/**
 * Creates an agent using the builder pattern with progress reporting
 */
async function createAgentWithProgress(
  baseClient: HCS10Client,
  builder: AgentBuilder,
  agentName: string,
  existingEnvVars?: {
    accountId: string;
    privateKey: string;
    operatorId: string;
    inboundTopicId: string;
    outboundTopicId: string;
    profileTopicId: string;
    pfpTopicId: string;
  }
) {
  if (
    existingEnvVars &&
    existingEnvVars.accountId &&
    existingEnvVars.privateKey &&
    existingEnvVars.inboundTopicId &&
    existingEnvVars.outboundTopicId
  ) {
    logger.info(`Using existing ${agentName} account`);

    try {
      const agentClient = new HCS10Client({
        network: 'testnet',
        operatorId: existingEnvVars.accountId,
        operatorPrivateKey: existingEnvVars.privateKey,
        guardedRegistryBaseUrl: process.env.REGISTRY_URL,
        prettyPrint: true,
        logLevel: 'debug',
      });

      await ensureAgentHasEnoughHbar(
        baseClient,
        existingEnvVars.accountId,
        agentName
      );

      return {
        accountId: existingEnvVars.accountId,
        privateKey: existingEnvVars.privateKey,
        operatorId:
          existingEnvVars.operatorId ||
          `${existingEnvVars.inboundTopicId}@${existingEnvVars.accountId}`,
        inboundTopicId: existingEnvVars.inboundTopicId,
        outboundTopicId: existingEnvVars.outboundTopicId,
        profileTopicId: existingEnvVars.profileTopicId,
        pfpTopicId: existingEnvVars.pfpTopicId,
        client: agentClient,
      };
    } catch (error) {
      logger.error(
        `Error initializing client for existing ${agentName}:`,
        error
      );
      throw new Error(
        `Failed to initialize client for existing ${agentName}: ${error}`
      );
    }
  }

  logger.info(`Creating new ${agentName} account with progress reporting`);

  const progressHandler = createProgressHandler(agentName);

  try {
    const agent = await baseClient.createAndRegisterAgent(builder, {
      progressCallback: progressHandler,
      baseUrl: process.env.REGISTRY_URL,
    });

    if (!agent.success) {
      throw new Error(`Agent creation failed: ${agent.error}`);
    }

    if (!agent.metadata) {
      logger.error(`Agent metadata is missing in the result`);
      throw new Error('Agent creation failed: metadata is missing');
    }

    const metadata = agent.metadata;

    if (!metadata.accountId || !metadata.privateKey) {
      logger.error(
        `Metadata missing required fields: accountId=${!!metadata.accountId}, privateKey=${!!metadata.privateKey}`
      );
      throw new Error(
        `Agent creation succeeded but metadata is missing required fields`
      );
    }

    await ensureAgentHasEnoughHbar(baseClient, metadata.accountId, agentName);

    let agentClient;
    try {
      agentClient = new HCS10Client({
        network: 'testnet',
        operatorId: metadata.accountId,
        operatorPrivateKey: metadata.privateKey,
        guardedRegistryBaseUrl: process.env.REGISTRY_URL,
        prettyPrint: true,
        logLevel: 'debug',
      });
    } catch (clientError) {
      logger.error(`Failed to create client with metadata:`, clientError);
      throw new Error(
        `Agent created but client initialization failed: ${clientError}`
      );
    }

    const result = {
      accountId: metadata.accountId,
      privateKey: metadata.privateKey,
      operatorId: metadata.operatorId,
      inboundTopicId: metadata.inboundTopicId,
      outboundTopicId: metadata.outboundTopicId,
      profileTopicId: metadata.profileTopicId,
      pfpTopicId: metadata.pfpTopicId,
      client: agentClient,
    };

    const missingFields: string[] = [];
    if (!result.accountId) missingFields.push('accountId');
    if (!result.privateKey) missingFields.push('privateKey');
    if (!result.inboundTopicId) missingFields.push('inboundTopicId');
    if (!result.outboundTopicId) missingFields.push('outboundTopicId');

    if (missingFields.length > 0) {
      throw new Error(
        `Agent creation succeeded but missing required fields: ${missingFields.join(
          ', '
        )}`
      );
    }

    if (!result.operatorId) {
      result.operatorId = `${result.inboundTopicId}@${result.accountId}`;
    }

    return result;
  } catch (error) {
    logger.error(`Error creating ${agentName} agent:`, error);
    throw error;
  }
}

async function main() {
  try {
    const registryUrl = process.env.REGISTRY_URL;
    logger.info(`Using registry URL: ${registryUrl}`);

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

    const alicePfpPath = path.join(__dirname, 'assets', 'alice-icon.svg');
    const bobPfpPath = path.join(__dirname, 'assets', 'bob-icon.svg');

    if (!fs.existsSync(alicePfpPath) || !fs.existsSync(bobPfpPath)) {
      throw new Error(
        `Asset files not found. Please ensure the files exist at:\n- ${alicePfpPath}\n- ${bobPfpPath}`
      );
    }

    const alicePfpBuffer = fs.readFileSync(alicePfpPath);
    const bobPfpBuffer = fs.readFileSync(bobPfpPath);

    let alice;
    let bob;

    const hasExistingAlice =
      process.env.ALICE_ACCOUNT_ID &&
      process.env.ALICE_PRIVATE_KEY &&
      process.env.ALICE_INBOUND_TOPIC_ID &&
      process.env.ALICE_OUTBOUND_TOPIC_ID;

    if (hasExistingAlice) {
      logger.info('Using existing Alice account from environment variables');
      alice = await createAgentWithProgress(
        baseClient,
        new AgentBuilder(),
        'Alice',
        {
          accountId: process.env.ALICE_ACCOUNT_ID!,
          privateKey: process.env.ALICE_PRIVATE_KEY!,
          operatorId: process.env.ALICE_OPERATOR_ID!,
          inboundTopicId: process.env.ALICE_INBOUND_TOPIC_ID!,
          outboundTopicId: process.env.ALICE_OUTBOUND_TOPIC_ID!,
          profileTopicId: process.env.ALICE_PROFILE_TOPIC_ID!,
          pfpTopicId: process.env.ALICE_PFP_TOPIC_ID!,
        }
      );
    } else {
      logger.info('Creating new Alice agent with progress reporting');
      const aliceBuilder = new AgentBuilder()
        .setName('Alice')
        .setDescription('A helpful AI assistant for data analysis')
        .setCapabilities([
          AIAgentCapability.TEXT_GENERATION,
          AIAgentCapability.KNOWLEDGE_RETRIEVAL,
        ])
        .setAgentType('manual')
        .setModel('agent-model-2024')
        .addSocial('x', '@alice')
        .addProperty('name', 'Alice')
        .addProperty('description', 'A helpful AI assistant for data analysis')
        .addProperty('version', '1.0.0')
        .addProperty('permissions', ['read_network', 'propose_message'])
        .setProfilePicture(alicePfpBuffer, 'alice-icon.svg')
        .setNetwork('testnet')
        .setInboundTopicType(InboundTopicType.PUBLIC);

      alice = await createAgentWithProgress(baseClient, aliceBuilder, 'Alice');

      if (alice) {
        logger.info('Saving Alice agent details to .env file');

        const envValues: Record<string, string> = {};

        if (alice.accountId) {
          envValues.ALICE_ACCOUNT_ID = alice.accountId;
        } else {
          logger.error('Missing ALICE_ACCOUNT_ID, cannot save to .env');
        }

        if (alice.privateKey) {
          envValues.ALICE_PRIVATE_KEY = alice.privateKey;
        } else {
          logger.error('Missing ALICE_PRIVATE_KEY, cannot save to .env');
        }

        if (alice.operatorId) {
          envValues.ALICE_OPERATOR_ID = alice.operatorId;
        } else {
          logger.error('Missing ALICE_OPERATOR_ID, cannot save to .env');
        }

        if (alice.inboundTopicId) {
          envValues.ALICE_INBOUND_TOPIC_ID = alice.inboundTopicId;
        } else {
          logger.error('Missing ALICE_INBOUND_TOPIC_ID, cannot save to .env');
        }

        if (alice.outboundTopicId) {
          envValues.ALICE_OUTBOUND_TOPIC_ID = alice.outboundTopicId;
        } else {
          logger.error('Missing ALICE_OUTBOUND_TOPIC_ID, cannot save to .env');
        }

        if (alice.profileTopicId) {
          envValues.ALICE_PROFILE_TOPIC_ID = alice.profileTopicId;
        } else {
          envValues.ALICE_PROFILE_TOPIC_ID = '';
        }

        if (alice.pfpTopicId) {
          envValues.ALICE_PFP_TOPIC_ID = alice.pfpTopicId;
        } else {
          envValues.ALICE_PFP_TOPIC_ID = '';
        }

        if (
          envValues.ALICE_ACCOUNT_ID &&
          envValues.ALICE_PRIVATE_KEY &&
          envValues.ALICE_INBOUND_TOPIC_ID &&
          envValues.ALICE_OUTBOUND_TOPIC_ID
        ) {
          try {
            updateEnvFile(envValues);
            logger.info('Successfully saved Alice agent details to .env file');
          } catch (envError) {
            logger.error('Error saving Alice details to .env:', envError);
          }
        } else {
          logger.error(
            'Missing required Alice fields, will not save to .env file'
          );
        }
      } else {
        logger.error(
          'Alice agent creation failed, no data to save to .env file'
        );
      }
    }

    const hasExistingBob =
      process.env.BOB_ACCOUNT_ID &&
      process.env.BOB_PRIVATE_KEY &&
      process.env.BOB_INBOUND_TOPIC_ID &&
      process.env.BOB_OUTBOUND_TOPIC_ID;

    if (hasExistingBob) {
      logger.info('Using existing Bob account from environment variables');
      bob = await createAgentWithProgress(
        baseClient,
        new AgentBuilder(),
        'Bob',
        {
          accountId: process.env.BOB_ACCOUNT_ID!,
          privateKey: process.env.BOB_PRIVATE_KEY!,
          operatorId: process.env.BOB_OPERATOR_ID!,
          inboundTopicId: process.env.BOB_INBOUND_TOPIC_ID!,
          outboundTopicId: process.env.BOB_OUTBOUND_TOPIC_ID!,
          profileTopicId: process.env.BOB_PROFILE_TOPIC_ID!,
          pfpTopicId: process.env.BOB_PFP_TOPIC_ID!,
        }
      );
    } else {
      logger.info('Creating new Bob agent with progress reporting');
      const bobBuilder = new AgentBuilder()
        .setName('Bob')
        .setDescription(
          'A specialized AI agent for natural language processing'
        )
        .setCapabilities([
          AIAgentCapability.TEXT_GENERATION,
          AIAgentCapability.LANGUAGE_TRANSLATION,
        ])
        .setAgentType('manual')
        .setModel('agent-model-2024')
        .addSocial('x', '@bob')
        .addProperty('name', 'Bob')
        .addProperty(
          'description',
          'A specialized AI agent for natural language processing'
        )
        .addProperty('version', '1.0.0')
        .addProperty('permissions', ['read_network', 'propose_message'])
        .setProfilePicture(bobPfpBuffer, 'bob-icon.svg')
        .setNetwork('testnet')
        .setInboundTopicType(InboundTopicType.PUBLIC);

      bob = await createAgentWithProgress(baseClient, bobBuilder, 'Bob');

      if (bob) {
        logger.info('Saving Bob agent details to .env file');

        const envValues: Record<string, string> = {};

        if (bob.accountId) {
          envValues.BOB_ACCOUNT_ID = bob.accountId;
        } else {
          logger.error('Missing BOB_ACCOUNT_ID, cannot save to .env');
        }

        if (bob.privateKey) {
          envValues.BOB_PRIVATE_KEY = bob.privateKey;
        } else {
          logger.error('Missing BOB_PRIVATE_KEY, cannot save to .env');
        }

        if (bob.operatorId) {
          envValues.BOB_OPERATOR_ID = bob.operatorId;
        } else {
          logger.error('Missing BOB_OPERATOR_ID, cannot save to .env');
        }

        if (bob.inboundTopicId) {
          envValues.BOB_INBOUND_TOPIC_ID = bob.inboundTopicId;
        } else {
          logger.error('Missing BOB_INBOUND_TOPIC_ID, cannot save to .env');
        }

        if (bob.outboundTopicId) {
          envValues.BOB_OUTBOUND_TOPIC_ID = bob.outboundTopicId;
        } else {
          logger.error('Missing BOB_OUTBOUND_TOPIC_ID, cannot save to .env');
        }

        if (bob.profileTopicId) {
          envValues.BOB_PROFILE_TOPIC_ID = bob.profileTopicId;
        } else {
          envValues.BOB_PROFILE_TOPIC_ID = '';
        }

        if (bob.pfpTopicId) {
          envValues.BOB_PFP_TOPIC_ID = bob.pfpTopicId;
        } else {
          envValues.BOB_PFP_TOPIC_ID = '';
        }

        if (
          envValues.BOB_ACCOUNT_ID &&
          envValues.BOB_PRIVATE_KEY &&
          envValues.BOB_INBOUND_TOPIC_ID &&
          envValues.BOB_OUTBOUND_TOPIC_ID
        ) {
          try {
            updateEnvFile(envValues);
            logger.info('Successfully saved Bob agent details to .env file');
          } catch (envError) {
            logger.error('Error saving Bob details to .env:', envError);
          }
        } else {
          logger.error(
            'Missing required Bob fields, will not save to .env file'
          );
        }
      } else {
        logger.error('Bob agent creation failed, no data to save to .env file');
      }
    }

    if (
      !alice ||
      !alice.inboundTopicId ||
      !alice.outboundTopicId ||
      !alice.client
    ) {
      throw new Error(
        'Failed to create or retrieve Alice agent with required topics'
      );
    }

    if (!bob || !bob.inboundTopicId || !bob.outboundTopicId || !bob.client) {
      throw new Error(
        'Failed to create or retrieve Bob agent with required topics'
      );
    }

    logger.info('==== AGENT DETAILS ====');
    logger.info(
      `Alice ID: ${alice.accountId}, Inbound: ${alice.inboundTopicId}, Outbound: ${alice.outboundTopicId}`
    );
    logger.info(
      `Bob ID: ${bob.accountId}, Inbound: ${bob.inboundTopicId}, Outbound: ${bob.outboundTopicId}`
    );
    logger.info('======================');

    const bobMonitor = monitorIncomingRequests(
      baseClient,
      bob.client,
      bob.inboundTopicId
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    logger.info('Alice submitting connection request to Bob');
    const aliceConnectionResponse = await alice.client.submitConnectionRequest(
      bob.inboundTopicId,
      alice.accountId,
      alice.operatorId,
      'Hello Bob, I would like to collaborate on data analysis.'
    );

    const connectionRequestId =
      aliceConnectionResponse.topicSequenceNumber?.toNumber()!;
    logger.info(
      `Connection request submitted with sequence number: ${connectionRequestId}`
    );

    logger.info('Waiting for connection confirmation...');
    const aliceMonitor = monitorConnectionConfirmation(
      alice.client,
      bob.inboundTopicId,
      alice.outboundTopicId,
      connectionRequestId
    );

    try {
      const connectionTopicId = (await Promise.race([
        aliceMonitor,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 60000)
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
          alice.operatorId,
          JSON.stringify(aliceSmallMessage),
          'Requesting sentiment analysis on Q4 2024 customer feedback'
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
          alice.operatorId,
          JSON.stringify(largeSampleData),
          'Requesting detailed analysis with many parameters'
        );
        logger.info('Large message sent successfully');

        logger.info("Bob retrieving Alice's messages...");
        const messages = await bob.client.getMessages(connectionTopicId);
        const largeMessage = messages.messages.find(
          (msg) =>
            msg.op === 'message' &&
            typeof msg.data === 'string' &&
            msg.data.startsWith('hcs://1/')
        );

        if (largeMessage) {
          logger.info('Found large message reference:', largeMessage.data);
          try {
            const resolvedContent = await bob.client.getMessageContent(
              largeMessage.data
            );
            logger.info('Successfully resolved large message');
          } catch (error) {
            logger.error('Error resolving large message content:', error);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

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
          bob.operatorId,
          JSON.stringify(bobMessage),
          'Analysis complete. Sending results.'
        );
        logger.info('Response message sent successfully');
      }
    } catch (error) {
      throw new Error(`Connection process failed: ${error}`);
    }

    logger.info('Demo complete!');
    logger.info(`Alice ID: ${alice.accountId}`);
    logger.info(`Bob ID: ${bob.accountId}`);
  } catch (error) {
    logger.error('Error in demo:', error);
  }
}

main();
