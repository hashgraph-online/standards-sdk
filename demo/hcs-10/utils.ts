import {
  HCS10Client,
  AgentBuilder,
  InboundTopicType,
  Logger,
  AIAgentCapability,
  HederaMirrorNode,
  NetworkType,
  TopicFeeConfig,
  FeeConfigBuilder,
} from '../../src';
import { TransferTransaction, Hbar } from '@hashgraph/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

export const MIN_REQUIRED_USD = 2.0;
export const MIN_REQUIRED_HBAR_USD = 30.0;

export const ENV_FILE_PATH = path.join(process.cwd(), '.env');

export interface AgentData {
  accountId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  client: HCS10Client;
}

export interface CreateAgentResult {
  client: HCS10Client;
  accountId: string;
  inboundTopicId: string;
  outboundTopicId: string;
}

export async function ensureAgentHasEnoughHbar(
  logger: Logger,
  baseClient: HCS10Client,
  accountId: string,
  agentName: string
): Promise<void> {
  try {
    const account = await baseClient.requestAccount(accountId);
    const balance = account.balance.balance;
    const hbarBalance = balance / 100_000_000;

    logger.info(`${agentName} account ${accountId} has ${hbarBalance} HBAR`);

    try {
      const mirrorNode = new HederaMirrorNode('testnet', logger);
      const hbarPrice = await mirrorNode.getHBARPrice(new Date());

      if (hbarPrice) {
        const balanceInUsd = hbarBalance * hbarPrice;
        logger.info(`${agentName} balance in USD: $${balanceInUsd.toFixed(2)}`);

        if (balanceInUsd < MIN_REQUIRED_USD) {
          logger.warn(
            `${agentName} account ${accountId} has less than $${MIN_REQUIRED_USD} (${balanceInUsd.toFixed(
              2
            )}). Attempting to fund.`
          );

          try {
            const funder = baseClient.getAccountAndSigner();
            const targetHbar = MIN_REQUIRED_HBAR_USD / hbarPrice;
            const amountToTransferHbar = Math.max(0, targetHbar - hbarBalance);

            if (amountToTransferHbar > 0) {
              const transferTx = new TransferTransaction()
                .addHbarTransfer(
                  funder.accountId,
                  Hbar.fromTinybars(
                    Math.round(amountToTransferHbar * -100_000_000)
                  )
                )
                .addHbarTransfer(
                  accountId,
                  Hbar.fromTinybars(
                    Math.round(amountToTransferHbar * 100_000_000)
                  )
                );

              logger.info(
                `Funding ${agentName} account ${accountId} with ${amountToTransferHbar.toFixed(
                  2
                )} HBAR from ${funder.accountId}`
              );

              const fundTxResponse = await transferTx.execute(
                baseClient.getClient()
              );
              await fundTxResponse.getReceipt(baseClient.getClient());
              logger.info(
                `Successfully funded ${agentName} account ${accountId}.`
              );
            } else {
              logger.info(
                `${agentName} account ${accountId} does not require additional funding.`
              );
            }
          } catch (fundingError) {
            logger.error(
              `Failed to automatically fund ${agentName} account ${accountId}:`,
              fundingError
            );
            logger.warn(
              `Please fund the account ${accountId} manually with at least ${(
                MIN_REQUIRED_HBAR_USD / hbarPrice
              ).toFixed(2)} HBAR.`
            );
          }
        }
      } else {
        logger.warn(
          'Failed to get HBAR price from Mirror Node. Please ensure the account has enough HBAR.'
        );
      }
    } catch (error) {
      logger.warn(
        'Failed to check USD balance. Please ensure the account has enough HBAR.'
      );
    }
  } catch (error) {
    logger.error(`Failed to check ${agentName} account balance:`, error);
  }
}

export async function getAgentFromEnv(
  logger: Logger,
  baseClient: HCS10Client,
  agentName: string,
  envPrefix: string
): Promise<AgentData | null> {
  const accountIdEnvVar = `${envPrefix}_ACCOUNT_ID`;
  const privateKeyEnvVar = `${envPrefix}_PRIVATE_KEY`;
  const inboundTopicIdEnvVar = `${envPrefix}_INBOUND_TOPIC_ID`;
  const outboundTopicIdEnvVar = `${envPrefix}_OUTBOUND_TOPIC_ID`;

  const accountId = process.env[accountIdEnvVar];
  const privateKey = process.env[privateKeyEnvVar];
  const inboundTopicId = process.env[inboundTopicIdEnvVar];
  const outboundTopicId = process.env[outboundTopicIdEnvVar];

  if (!accountId || !privateKey || !inboundTopicId || !outboundTopicId) {
    logger.info(`${agentName} agent not found in environment variables`);
    return null;
  }

  logger.info(`${agentName} agent found in environment variables`);
  logger.info(`${agentName} account ID: ${accountId}`);
  logger.info(`${agentName} inbound topic ID: ${inboundTopicId}`);
  logger.info(`${agentName} outbound topic ID: ${outboundTopicId}`);

  const client = new HCS10Client({
    network: 'testnet',
    operatorId: accountId,
    operatorPrivateKey: privateKey,
    guardedRegistryBaseUrl: process.env.REGISTRY_URL,
    prettyPrint: true,
    logLevel: 'debug',
  });

  await ensureAgentHasEnoughHbar(logger, baseClient, accountId, agentName);

  return {
    accountId,
    inboundTopicId,
    outboundTopicId,
    client,
  };
}

export async function createAgent(
  logger: Logger,
  baseClient: HCS10Client,
  agentName: string,
  agentBuilder: AgentBuilder,
  envPrefix: string,
  options: { initialBalance?: number } = {}
): Promise<AgentData | null> {
  try {
    logger.info(`Creating ${agentName} agent...`);

    const result = await baseClient.createAndRegisterAgent(
      agentBuilder,
      options
    );

    if (!result.metadata) {
      logger.error(`${agentName} agent creation failed`);
      return null;
    }

    const metadata = result.metadata;

    logger.info(`${agentName} agent created successfully`);
    logger.info(`${agentName} account ID: ${metadata.accountId}`);
    logger.info(`${agentName} private key: ${metadata.privateKey}`);
    logger.info(`${agentName} inbound topic ID: ${metadata.inboundTopicId}`);
    logger.info(`${agentName} outbound topic ID: ${metadata.outboundTopicId}`);

    const envVars = {
      [`${envPrefix}_ACCOUNT_ID`]: metadata.accountId,
      [`${envPrefix}_PRIVATE_KEY`]: metadata.privateKey,
      [`${envPrefix}_INBOUND_TOPIC_ID`]: metadata.inboundTopicId,
      [`${envPrefix}_OUTBOUND_TOPIC_ID`]: metadata.outboundTopicId,
    };

    await updateEnvFile(ENV_FILE_PATH, envVars);

    const client = new HCS10Client({
      network: 'testnet',
      operatorId: metadata.accountId,
      operatorPrivateKey: metadata.privateKey,
      guardedRegistryBaseUrl: process.env.REGISTRY_URL,
      prettyPrint: true,
      logLevel: 'debug',
    });

    return {
      accountId: metadata.accountId,
      inboundTopicId: metadata.inboundTopicId,
      outboundTopicId: metadata.outboundTopicId,
      client,
    };
  } catch (error) {
    logger.error(`Error creating ${agentName} agent:`, error);
    return null;
  }
}

export async function updateEnvFile(
  envFilePath: string,
  variables: Record<string, string>
): Promise<void> {
  let envContent = '';

  if (fs.existsSync(envFilePath)) {
    envContent = fs.readFileSync(envFilePath, 'utf8');
  }

  const envLines = envContent.split('\n');
  const updatedLines = [...envLines];

  for (const [key, value] of Object.entries(variables)) {
    const lineIndex = updatedLines.findIndex((line) =>
      line.startsWith(`${key}=`)
    );

    if (lineIndex !== -1) {
      updatedLines[lineIndex] = `${key}=${value}`;
    } else {
      updatedLines.push(`${key}=${value}`);
    }
  }

  if (updatedLines[updatedLines.length - 1] !== '') {
    updatedLines.push('');
  }

  fs.writeFileSync(envFilePath, updatedLines.join('\n'));
}

export function createFooBuilder(
  network: NetworkType,
  feeConfigBuilder: FeeConfigBuilder,
  pfpBuffer?: Buffer
): AgentBuilder {
  const builder = new AgentBuilder()
    .setName('Foo Agent')
    .setBio('Agent Foo - HBAR Fee Demo')
    .setCapabilities([AIAgentCapability.TEXT_GENERATION])
    .setInboundTopicType(InboundTopicType.FEE_BASED)
    .setType('autonomous')
    .setNetwork(network)
    .setFeeConfig(feeConfigBuilder);

  if (pfpBuffer) {
    builder.setProfilePicture(pfpBuffer, 'foo-icon.svg');
  }
  return builder;
}

export function createBarBuilder(
  network: NetworkType,
  feeConfigBuilder: FeeConfigBuilder,
  pfpBuffer?: Buffer
): AgentBuilder {
  const builder = new AgentBuilder()
    .setName('Bar Agent')
    .setBio('Agent Bar - HBAR Fee Demo')
    .setCapabilities([AIAgentCapability.KNOWLEDGE_RETRIEVAL])
    .setInboundTopicType(InboundTopicType.FEE_BASED)
    .setType('autonomous')
    .setNetwork(network)
    .setFeeConfig(feeConfigBuilder);

  if (pfpBuffer) {
    builder.setProfilePicture(pfpBuffer, 'bar-icon.svg');
  }
  return builder;
}

export function createBobBuilder(pfpBuffer?: Buffer): AgentBuilder {
  const bobBuilder = new AgentBuilder()
    .setName('Bob')
    .setAlias('bob')
    .setBio('A language processing agent')
    .setCapabilities([
      AIAgentCapability.TEXT_GENERATION,
      AIAgentCapability.CODE_GENERATION,
      AIAgentCapability.DATA_INTEGRATION,
      AIAgentCapability.KNOWLEDGE_RETRIEVAL,
    ])
    .setType('autonomous')
    .setModel('agent-model-2024')
    .addSocial('x', '@bob')
    .addProperty('name', 'Bob')
    .addProperty('description', 'A language processing agent')
    .addProperty('version', '1.0.0')
    .addProperty('permissions', ['read_network', 'propose_message'])
    .setNetwork('testnet')
    .setInboundTopicType(InboundTopicType.PUBLIC);

  if (pfpBuffer) {
    bobBuilder.setProfilePicture(pfpBuffer, 'bob-icon.svg');
  }

  return bobBuilder;
}

export async function getOrCreateBob(
  logger: Logger,
  baseClient: HCS10Client
): Promise<AgentData | null> {
  const existingBob = await getAgentFromEnv(logger, baseClient, 'Bob', 'BOB');

  if (existingBob) {
    return existingBob;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const bobPfpPath = path.join(__dirname, 'assets', 'bob-icon.svg');
  const pfpBuffer = fs.existsSync(bobPfpPath)
    ? fs.readFileSync(bobPfpPath)
    : undefined;

  if (!pfpBuffer) {
    logger.warn('Bob profile picture not found, using default');
  }

  const bobBuilder = createBobBuilder(pfpBuffer);
  return await createAgent(logger, baseClient, 'Bob', bobBuilder, 'BOB');
}

export async function getOrCreateAlice(
  logger: Logger,
  baseClient: HCS10Client
): Promise<AgentData | null> {
  const existingAlice = await getAgentFromEnv(
    logger,
    baseClient,
    'Alice',
    'ALICE'
  );

  if (existingAlice) {
    return existingAlice;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const alicePfpPath = path.join(__dirname, 'assets', 'alice-icon.svg');
  const pfpBuffer = fs.existsSync(alicePfpPath)
    ? fs.readFileSync(alicePfpPath)
    : undefined;

  if (!pfpBuffer) {
    logger.warn('Alice profile picture not found, using default');
  }

  const aliceBuilder = new AgentBuilder()
    .setName('Alice')
    .setBio('A helpful AI assistant for data analysis')
    .setCapabilities([
      AIAgentCapability.TEXT_GENERATION,
      AIAgentCapability.KNOWLEDGE_RETRIEVAL,
    ])
    .setType('manual')
    .setModel('agent-model-2024')
    .addSocial('x', '@alice')
    .addProperty('name', 'Alice')
    .addProperty('description', 'A helpful AI assistant for data analysis')
    .addProperty('version', '1.0.0')
    .addProperty('permissions', ['read_network', 'propose_message'])
    .setNetwork('testnet')
    .setInboundTopicType(InboundTopicType.PUBLIC);

  if (pfpBuffer) {
    aliceBuilder.setProfilePicture(pfpBuffer, 'alice-icon.svg');
  }

  return await createAgent(logger, baseClient, 'Alice', aliceBuilder, 'ALICE');
}

export async function getOrCreateFoo(
  logger: Logger,
  baseClient: HCS10Client
): Promise<AgentData | null> {
  const existingFoo = await getAgentFromEnv(logger, baseClient, 'Foo', 'FOO');

  if (existingFoo) {
    return existingFoo;
  }

  logger.info('Creating Foo agent as it was not found in env...');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const network = baseClient.getNetwork() as NetworkType;

  const fooPfpPath = path.join(__dirname, 'assets', 'foo-icon.svg');
  const pfpBuffer = fs.existsSync(fooPfpPath)
    ? fs.readFileSync(fooPfpPath)
    : undefined;

  if (!pfpBuffer) {
    logger.warn('Foo profile picture not found, proceeding without it');
  }

  const feeConfigBuilder = FeeConfigBuilder.forHbar(
    0.5,
    undefined,
    network,
    logger
  );

  const fooBuilder = createFooBuilder(network, feeConfigBuilder, pfpBuffer);
  return await createAgent(logger, baseClient, 'Foo', fooBuilder, 'FOO');
}

export async function getOrCreateBar(
  logger: Logger,
  baseClient: HCS10Client
): Promise<AgentData | null> {
  const existingBar = await getAgentFromEnv(logger, baseClient, 'Bar', 'BAR');

  if (existingBar) {
    return existingBar;
  }

  logger.info('Creating Bar agent as it was not found in env...');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const network = baseClient.getNetwork() as NetworkType;

  const barPfpPath = path.join(__dirname, 'assets', 'bar-icon.svg');
  const pfpBuffer = fs.existsSync(barPfpPath)
    ? fs.readFileSync(barPfpPath)
    : undefined;

  if (!pfpBuffer) {
    logger.warn('Bar profile picture not found, proceeding without it.');
  }

  const feeConfigBuilder = FeeConfigBuilder.forHbar(
    1.0,
    undefined,
    network,
    logger
  );

  const barBuilder = createBarBuilder(network, feeConfigBuilder, pfpBuffer);
  return await createAgent(logger, baseClient, 'Bar', barBuilder, 'BAR', {
    initialBalance: 60,
  });
}

export async function monitorIncomingRequests(
  baseClient: HCS10Client,
  client: HCS10Client,
  inboundTopicId: string,
  logger: Logger,
  connectionFeeConfig?: FeeConfigBuilder
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
          const currentAccount = client
            .getClient()
            .operatorAccountId?.toString();
          logger.info(`Ensuring agent has enough hbar: ${currentAccount}`);
          await ensureAgentHasEnoughHbar(
            new Logger({
              module: 'HCS10Demo',
              level: 'debug',
              prettyPrint: true,
            }),
            baseClient,
            currentAccount,
            `Agent ${currentAccount}-${inboundTopicId}`
          );
          logger.info('Ensured agent has enough hbar');
          const operatorAccountId = client
            .getClient()
            .operatorAccountId?.toString();

          if (!operatorAccountId) {
            logger.error(
              'Operator account ID is not defined, cannot proceed with handling request'
            );
            continue;
          }

          const { connectionTopicId, confirmedConnectionSequenceNumber } =
            await client.handleConnectionRequest(
              inboundTopicId,
              accountId,
              connectionRequestId,
              connectionFeeConfig
            );

          processedRequestIds.add(connectionRequestId);

          logger.info(
            `Connection confirmed with topic ID: ${connectionTopicId}`
          );
        } catch (error) {
          logger.error(`Error handling request #${connectionRequestId}:`);
          logger.error(error);
        }
      }
    } catch (error) {
      logger.error('Error monitoring requests:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
