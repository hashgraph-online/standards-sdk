import {
  AgentBuilder,
  InboundTopicType,
  Logger,
  AIAgentCapability,
  HederaMirrorNode,
  NetworkType,
  TopicFeeConfig,
  FeeConfigBuilder,
  ConnectionsManager,
  Connection,
  HCSMessage,
  RegistrationProgressData,
  AgentCreationState,
  MCPServerBuilder,
  MCPServerCapability,
} from '../../src';
import { HCS10Client } from '../../src/hcs-10/sdk';
import { TransferTransaction, Hbar } from '@hashgraph/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { HCSMessageWithCommonFields } from '../../src/services/types';

export const MIN_REQUIRED_USD = 2.0;
export const MIN_REQUIRED_HBAR_USD = 30.0;

export const ENV_FILE_PATH = path.join(process.cwd(), '.env');

const NETWORK_ENV: NetworkType =
  (process.env.HEDERA_NETWORK ?? process.env.HCS10_NETWORK ?? 'testnet')
    .trim()
    .toLowerCase() === 'mainnet'
    ? 'mainnet'
    : 'testnet';

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
  agentName: string,
): Promise<void> {
  try {
    const account = await baseClient.requestAccount(accountId);
    const balance = account.balance.balance;
    const hbarBalance = balance / 100_000_000;

    logger.info(`${agentName} account ${accountId} has ${hbarBalance} HBAR`);

    try {
      const mirrorNode = new HederaMirrorNode(NETWORK_ENV, logger);
      const hbarPrice = await mirrorNode.getHBARPrice(new Date());

      if (hbarPrice) {
        const balanceInUsd = hbarBalance * hbarPrice;
        logger.info(`${agentName} balance in USD: $${balanceInUsd.toFixed(2)}`);

        if (balanceInUsd < MIN_REQUIRED_USD) {
          logger.warn(
            `${agentName} account ${accountId} has less than $${MIN_REQUIRED_USD} (${balanceInUsd.toFixed(
              2,
            )}). Attempting to fund.`,
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
                    Math.round(amountToTransferHbar * -100_000_000),
                  ),
                )
                .addHbarTransfer(
                  accountId,
                  Hbar.fromTinybars(
                    Math.round(amountToTransferHbar * 100_000_000),
                  ),
                );

              logger.info(
                `Funding ${agentName} account ${accountId} with ${amountToTransferHbar.toFixed(
                  2,
                )} HBAR from ${funder.accountId}`,
              );

              const fundTxResponse = await transferTx.execute(
                baseClient.getClient(),
              );
              await fundTxResponse.getReceipt(baseClient.getClient());
              logger.info(
                `Successfully funded ${agentName} account ${accountId}.`,
              );
            } else {
              logger.info(
                `${agentName} account ${accountId} does not require additional funding.`,
              );
            }
          } catch (fundingError) {
            logger.error(
              `Failed to automatically fund ${agentName} account ${accountId}:`,
              fundingError,
            );
            logger.warn(
              `Please fund the account ${accountId} manually with at least ${(
                MIN_REQUIRED_HBAR_USD / hbarPrice
              ).toFixed(2)} HBAR.`,
            );
          }
        }
      } else {
        logger.warn(
          'Failed to get HBAR price from Mirror Node. Please ensure the account has enough HBAR.',
        );
      }
    } catch (error) {
      logger.warn(
        'Failed to check USD balance. Please ensure the account has enough HBAR.',
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
  envPrefix: string,
): Promise<AgentData | null> {
  const accountIdEnvVar = `${envPrefix}_ACCOUNT_ID`;
  const privateKeyEnvVar = `${envPrefix}_PRIVATE_KEY`;
  const inboundTopicIdEnvVar = `${envPrefix}_INBOUND_TOPIC_ID`;
  const outboundTopicIdEnvVar = `${envPrefix}_OUTBOUND_TOPIC_ID`;
  const profileTopicIdEnvVar = `${envPrefix}_PROFILE_TOPIC_ID`;

  const accountId = process.env[accountIdEnvVar];
  const privateKey = process.env[privateKeyEnvVar];
  const inboundTopicId = process.env[inboundTopicIdEnvVar];
  const outboundTopicId = process.env[outboundTopicIdEnvVar];
  const profileTopicId = process.env[profileTopicIdEnvVar];

  if (
    !accountId ||
    !privateKey ||
    !inboundTopicId ||
    !outboundTopicId ||
    !profileTopicId
  ) {
    logger.info(`${agentName} agent not found in environment variables`);
    return null;
  }

  logger.info(`${agentName} agent found in environment variables`);
  logger.info(`${agentName} account ID: ${accountId}`);
  logger.info(`${agentName} inbound topic ID: ${inboundTopicId}`);
  logger.info(`${agentName} outbound topic ID: ${outboundTopicId}`);

  const client = new HCS10Client({
    network: NETWORK_ENV,
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
  agentBuilder: AgentBuilder | MCPServerBuilder,
  envPrefix: string,
  options: { initialBalance?: number } = {},
): Promise<AgentData | null> {
  try {
    logger.info(`Creating ${agentName} agent...`);

    // Check for existing partial state in env
    const existingState: Partial<AgentCreationState> = {};

    const pfpTopicId = process.env[`${envPrefix}_PFP_TOPIC_ID`];
    const inboundTopicId = process.env[`${envPrefix}_INBOUND_TOPIC_ID`];
    const outboundTopicId = process.env[`${envPrefix}_OUTBOUND_TOPIC_ID`];
    const profileTopicId = process.env[`${envPrefix}_PROFILE_TOPIC_ID`];
    const accountId = process.env[`${envPrefix}_ACCOUNT_ID`];
    const privateKey = process.env[`${envPrefix}_PRIVATE_KEY`];

    if (pfpTopicId) {
      existingState.pfpTopicId = pfpTopicId;
    }
    if (inboundTopicId) {
      existingState.inboundTopicId = inboundTopicId;
    }
    if (outboundTopicId) {
      existingState.outboundTopicId = outboundTopicId;
    }
    if (profileTopicId) {
      existingState.profileTopicId = profileTopicId;
    }

    // Determine current stage based on what we have
    if (profileTopicId && inboundTopicId && outboundTopicId) {
      existingState.currentStage = 'registration';
      existingState.completedPercentage = 80;
    } else if (inboundTopicId && outboundTopicId) {
      existingState.currentStage = 'profile';
      existingState.completedPercentage = 60;
    } else if (pfpTopicId) {
      existingState.currentStage = 'topics';
      existingState.completedPercentage = 40;
    } else if (accountId && privateKey) {
      existingState.currentStage = 'pfp';
      existingState.completedPercentage = 20;
    } else {
      existingState.currentStage = 'init';
      existingState.completedPercentage = 0;
    }

    // Add created resources based on what exists
    existingState.createdResources = [];
    if (accountId) {
      existingState.createdResources.push(`account:${accountId}`);
    }
    if (pfpTopicId) {
      existingState.createdResources.push(`pfp:${pfpTopicId}`);
    }
    if (inboundTopicId) {
      existingState.createdResources.push(`inbound:${inboundTopicId}`);
    }
    if (outboundTopicId) {
      existingState.createdResources.push(`outbound:${outboundTopicId}`);
    }
    if (profileTopicId) {
      existingState.createdResources.push(`profile:${profileTopicId}`);
    }

    const hasPartialState = Object.keys(existingState).length > 2; // More than just currentStage and completedPercentage

    if (hasPartialState) {
      logger.info(`Found partial state for ${agentName}:`);
      logger.info(
        `  Stage: ${existingState.currentStage} (${existingState.completedPercentage}%)`,
      );
      logger.info(`  Resources: ${existingState.createdResources?.join(', ')}`);

      // If we have an existing account, update the builder
      if (accountId && privateKey) {
        agentBuilder.setExistingAccount(accountId, privateKey);
      }
    }

    const method =
      agentBuilder instanceof AgentBuilder
        ? 'createAndRegisterAgent'
        : 'createAndRegisterMCPServer';

    const currentBuilder = agentBuilder.setAlias(`${agentName}-${Date.now()}`);

    const result = await baseClient[method](currentBuilder, {
      ...options,
      existingState: hasPartialState
        ? (existingState as AgentCreationState)
        : undefined,
      progressCallback: async (data: RegistrationProgressData) => {
        logger.info(`[${data.stage}] ${data.message}`);

        if (data.progressPercent !== undefined) {
          logger.info(`Progress: ${data.progressPercent}%`);
        }

        const envUpdates: Record<string, string> = {};

        if (data.details) {
          if (data.details.account?.accountId) {
            envUpdates[`${envPrefix}_ACCOUNT_ID`] =
              data.details.account.accountId;
          }
          if (data.details.account?.privateKey) {
            envUpdates[`${envPrefix}_PRIVATE_KEY`] =
              data.details.account.privateKey;
          }
          if (data.details.outboundTopicId) {
            envUpdates[`${envPrefix}_OUTBOUND_TOPIC_ID`] =
              data.details.outboundTopicId;
          }
          if (data.details.inboundTopicId) {
            envUpdates[`${envPrefix}_INBOUND_TOPIC_ID`] =
              data.details.inboundTopicId;
          }
          if (data.details.pfpTopicId) {
            envUpdates[`${envPrefix}_PFP_TOPIC_ID`] = data.details.pfpTopicId;
          }
          if (data.details.profileTopicId) {
            envUpdates[`${envPrefix}_PROFILE_TOPIC_ID`] =
              data.details.profileTopicId;
          }
          if (data.details.operatorId) {
            envUpdates[`${envPrefix}_OPERATOR_ID`] = data.details.operatorId;
          }

          // Save stage information for recovery
          if (data.details.state) {
            if (data.details.state.currentStage) {
              envUpdates[`${envPrefix}_CREATION_STAGE`] =
                data.details.state.currentStage;
            } else {
              envUpdates[`${envPrefix}_CREATION_STAGE`] = '';
            }

            let progressPercent: number;
            if (
              data.details.state.completedPercentage !== undefined &&
              data.details.state.completedPercentage !== null
            ) {
              progressPercent = data.details.state.completedPercentage;
            } else {
              progressPercent = 0;
            }
            envUpdates[`${envPrefix}_CREATION_PROGRESS`] =
              progressPercent.toString();
          }
        }

        // Update env file if there are any new values
        if (Object.keys(envUpdates).length > 0) {
          await updateEnvFile(ENV_FILE_PATH, envUpdates);
        }
      },
    });

    if (!result.metadata) {
      logger.info('result is', result);
      logger.error(`${agentName} agent creation failed`, result);
      return null;
    }

    const metadata = result.metadata;

    logger.info(`${agentName} agent created successfully`);
    logger.info(`${agentName} account ID: ${metadata.accountId}`);
    logger.info(`${agentName} inbound topic ID: ${metadata.inboundTopicId}`);
    logger.info(`${agentName} outbound topic ID: ${metadata.outboundTopicId}`);

    const client = new HCS10Client({
      network: NETWORK_ENV,
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
  variables: Record<string, string>,
): Promise<void> {
  let envContent = '';

  if (fs.existsSync(envFilePath)) {
    envContent = fs.readFileSync(envFilePath, 'utf8');
  }

  const envLines = envContent.split('\n');
  const updatedLines = [...envLines];

  for (const [key, value] of Object.entries(variables)) {
    const lineIndex = updatedLines.findIndex(line =>
      line.startsWith(`${key}=`),
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
  pfpBuffer?: Buffer,
): AgentBuilder {
  const builder = new AgentBuilder()
    .setName('Foo Agent')
    .setAlias('foo-agent')
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
  pfpBuffer?: Buffer,
): AgentBuilder {
  const builder = new AgentBuilder()
    .setName('Bar Agent')
    .setAlias('bar-agent')
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

export function createBobBuilder(
  pfpBuffer?: Buffer,
  randomSuffix?: string,
): AgentBuilder {
  const suffix = randomSuffix || Math.random().toString(36).substring(2, 8);
  const bobBuilder = new AgentBuilder()
    .setName(`Bob`)
    .setAlias(`bob-${suffix}`)
    .setBio('A test agent for debugging registration issues')
    .setCapabilities([
      AIAgentCapability.TEXT_GENERATION,
      AIAgentCapability.CODE_GENERATION,
    ])
    .setType('autonomous')
    .setModel('test-model-2024')
    .addSocial('github', `@bob${suffix}`)
    .addProperty('name', `Bob`)
    .addProperty(
      'description',
      'A test agent for debugging registration issues',
    )
    .addProperty('version', '2.0.0')
    .addProperty('permissions', ['read_network'])
    .setNetwork(NETWORK_ENV)
    .setInboundTopicType(InboundTopicType.PUBLIC);

  if (pfpBuffer) {
    bobBuilder.setProfilePicture(pfpBuffer, `bob-${suffix}-icon.svg`);
  }

  return bobBuilder;
}

export async function createMCPServer(
  logger: Logger,
  baseClient: HCS10Client,
  serverName: string,
): Promise<AgentData | null> {
  const existingServer = await getAgentFromEnv(
    logger,
    baseClient,
    serverName,
    serverName,
  );

  if (existingServer) {
    return existingServer;
  }

  const operator = baseClient.getAccountAndSigner();

  const mcpServerBuilder = new MCPServerBuilder()
    .setName(serverName)
    .setBio(serverName)
    .setNetworkType(NETWORK_ENV)
    .setServerDescription(serverName)
    .setExistingAccount(operator.accountId, operator.signer.toString())
    .setVersion('1.0.0')
    .setServices([MCPServerCapability.COMMUNICATION])
    .setConnectionInfo('https://mcp.hashgraphonline.com', 'sse');

  return await createAgent(
    logger,
    baseClient,
    serverName,
    mcpServerBuilder,
    serverName,
  );
}

export async function getOrCreateBob(
  logger: Logger,
  baseClient: HCS10Client,
): Promise<AgentData | null> {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const agentName = `Bob`;
  const envPrefix = `BOB`;

  const existingBob = await getAgentFromEnv(
    logger,
    baseClient,
    agentName,
    envPrefix,
  );

  if (existingBob) {
    return existingBob;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const bobPfpPath = path.join(__dirname, 'assets', 'bob-icon.svg');
  let pfpBuffer: Buffer | undefined;
  if (fs.existsSync(bobPfpPath)) {
    pfpBuffer = fs.readFileSync(bobPfpPath);
  } else {
    pfpBuffer = undefined;
  }

  const enableImageCreation = process.env.ENABLE_DEMO_PFP === 'true';
  let pfpForBuilder: Buffer | undefined;
  if (enableImageCreation) {
    pfpForBuilder = pfpBuffer;
  } else {
    pfpForBuilder = undefined;
  }
  const bobBuilder = createBobBuilder(pfpForBuilder, randomSuffix);

  const createdBob = await createAgent(
    logger,
    baseClient,
    agentName,
    bobBuilder,
    envPrefix,
  );

  if (createdBob) {
    return createdBob;
  }

  logger.warn(
    'Bob agent creation returned no metadata; attempting to reload from environment.',
  );
  return await getAgentFromEnv(logger, baseClient, agentName, envPrefix);
}

export async function getOrCreateAlice(
  logger: Logger,
  baseClient: HCS10Client,
): Promise<AgentData | null> {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const agentName = `Alice`;
  const envPrefix = `ALICE`;

  const existingAlice = await getAgentFromEnv(
    logger,
    baseClient,
    agentName,
    envPrefix,
  );

  if (existingAlice) {
    return existingAlice;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const alicePfpPath = path.join(__dirname, 'assets', 'alice-icon.svg');
  let pfpBuffer: Buffer | undefined;
  if (fs.existsSync(alicePfpPath)) {
    pfpBuffer = fs.readFileSync(alicePfpPath);
  } else {
    pfpBuffer = undefined;
  }

  if (!pfpBuffer) {
    logger.warn(`${agentName} profile picture not found, using default`);
  }

  const aliceBuilder = new AgentBuilder()
    .setName(`Alice`)
    .setAlias(`alice-${randomSuffix}`)
    .setBio('A test agent for data processing and analysis')
    .setCapabilities([
      AIAgentCapability.KNOWLEDGE_RETRIEVAL,
      AIAgentCapability.DATA_INTEGRATION,
    ])
    .setType('manual')
    .setModel('test-model-2024-v2')
    .addSocial('linkedin', `@alice${randomSuffix}`)
    .addProperty('name', `Alice`)
    .addProperty('description', 'A test agent for data processing and analysis')
    .addProperty('version', '3.0.0')
    .addProperty('permissions', ['read_network', 'write_data'])
    .setNetwork(NETWORK_ENV)
    .setInboundTopicType(InboundTopicType.PUBLIC);

  const enableImageCreation = process.env.ENABLE_DEMO_PFP === 'true';
  if (pfpBuffer && enableImageCreation) {
    aliceBuilder.setProfilePicture(pfpBuffer, `alice-${randomSuffix}-icon.svg`);
  }

  return await createAgent(
    logger,
    baseClient,
    agentName,
    aliceBuilder,
    envPrefix,
  );
}

export async function getOrCreateFoo(
  logger: Logger,
  baseClient: HCS10Client,
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
  let pfpBuffer: Buffer | undefined;
  if (fs.existsSync(fooPfpPath)) {
    pfpBuffer = fs.readFileSync(fooPfpPath);
  } else {
    pfpBuffer = undefined;
  }

  if (!pfpBuffer) {
    logger.warn('Foo profile picture not found, proceeding without it');
  }

  const feeConfigBuilder = FeeConfigBuilder.forHbar(
    0.5,
    undefined,
    network,
    logger,
  );

  const fooBuilder = createFooBuilder(network, feeConfigBuilder, pfpBuffer);
  return await createAgent(logger, baseClient, 'Foo', fooBuilder, 'FOO');
}

export async function getOrCreateBar(
  logger: Logger,
  baseClient: HCS10Client,
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
  let pfpBuffer: Buffer | undefined;
  if (fs.existsSync(barPfpPath)) {
    pfpBuffer = fs.readFileSync(barPfpPath);
  } else {
    pfpBuffer = undefined;
  }

  if (!pfpBuffer) {
    logger.warn('Bar profile picture not found, proceeding without it.');
  }

  const feeConfigBuilder = FeeConfigBuilder.forHbar(
    1.0,
    undefined,
    network,
    logger,
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
  connectionFeeConfig?: FeeConfigBuilder,
): Promise<void> {
  if (!inboundTopicId) {
    throw new Error(
      'Cannot monitor incoming requests: inboundTopicId is undefined',
    );
  }

  let lastProcessedMessage = 0;
  const processedRequestIds = new Set<number>();

  logger.info(`Monitoring incoming requests on topic ${inboundTopicId}`);
  const operatorAccountId = client?.getClient()?.operatorAccountId?.toString();

  if (!operatorAccountId) {
    throw new Error('Operator account ID is not set');
  }

  while (true) {
    try {
      const messages = await client.getMessages(inboundTopicId);

      const connectionCreatedMessages = messages.messages.filter(
        msg => msg.op === 'connection_created',
      );

      connectionCreatedMessages.forEach(msg => {
        if (msg.connection_id) {
          processedRequestIds.add(msg.connection_id);
        }
      });

      const connectionRequests = messages.messages.filter(
        msg =>
          msg.op === 'connection_request' &&
          msg.sequence_number > lastProcessedMessage,
      );

      for (const message of connectionRequests) {
        lastProcessedMessage = Math.max(
          lastProcessedMessage,
          message.sequence_number,
        );

        const operatorId: string = message.operator_id || '';

        const accountId = client.extractAccountFromOperatorId(operatorId);

        if (!accountId) {
          console.warn(
            'Invalid operator_id format, missing account ID',
            accountId,
            'message',
            message,
          );
          continue;
        }

        const connectionRequestId = message.sequence_number;

        if (processedRequestIds.has(connectionRequestId)) {
          logger.info(
            `Request #${connectionRequestId} already processed, skipping`,
          );
          continue;
        }

        logger.info(
          `Processing connection request #${connectionRequestId} from ${accountId}`,
        );

        try {
          const currentAccount = client
            .getClient()
            .operatorAccountId?.toString();
          if (!currentAccount) {
            logger.error(
              'Operator account ID is not defined, cannot proceed with handling request',
            );
            continue;
          }
          logger.info(`Ensuring agent has enough hbar: ${currentAccount}`);
          await ensureAgentHasEnoughHbar(
            new Logger({
              module: 'HCS10Demo',
              level: 'debug',
              prettyPrint: true,
            }),
            baseClient,
            currentAccount,
            `Agent ${currentAccount}-${inboundTopicId}`,
          );
          logger.info('Ensured agent has enough hbar');
          const operatorAccountId = client
            .getClient()
            .operatorAccountId?.toString();

          if (!operatorAccountId) {
            logger.error(
              'Operator account ID is not defined, cannot proceed with handling request',
            );
            continue;
          }

          const { connectionTopicId, confirmedConnectionSequenceNumber } =
            await client.handleConnectionRequest(
              inboundTopicId,
              accountId,
              connectionRequestId,
              connectionFeeConfig,
            );

          processedRequestIds.add(connectionRequestId);

          logger.info(
            `Connection confirmed with topic ID: ${connectionTopicId}`,
          );
        } catch (error) {
          logger.error(`Error handling request #${connectionRequestId}:`);
          logger.error(error);
        }
      }
    } catch (error) {
      logger.error('Error monitoring requests:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Loads existing connections using ConnectionsManager
 * @param agent - The agent configuration data
 * @returns A map of connections and the last processed timestamp
 */
export async function loadConnectionsUsingManager(
  logger: Logger,
  agent: {
    client: HCS10Client;
    accountId: string;
    inboundTopicId: string;
    outboundTopicId: string;
  },
): Promise<{
  connections: Map<string, Connection>;
  connectionManager: ConnectionsManager;
  lastProcessedTimestamp: Date;
}> {
  logger.info('Loading existing connections using ConnectionsManager');

  const connectionManager = new ConnectionsManager({
    baseClient: agent.client,
    logLevel: 'debug',
  });

  const connectionsArray = await connectionManager.fetchConnectionData(
    agent.accountId,
  );
  logger.info(`Found ${connectionsArray.length} connections`);

  const connections = new Map<string, Connection>();
  let lastTimestamp = new Date(0);

  for (const connection of connectionsArray) {
    connections.set(connection.connectionTopicId, connection);

    if (
      connection.created &&
      connection.created.getTime() > lastTimestamp.getTime()
    ) {
      lastTimestamp = connection.created;
    }
    if (
      connection.lastActivity &&
      connection.lastActivity.getTime() > lastTimestamp.getTime()
    ) {
      lastTimestamp = connection.lastActivity;
    }
  }

  logger.info(
    `Finished loading. ${connections.size} active connections found, last outbound timestamp: ${lastTimestamp}`,
  );

  return {
    connections,
    connectionManager,
    lastProcessedTimestamp: lastTimestamp,
  };
}

export async function monitorTopics(
  logger: Logger,
  handleConnectionRequest: (
    agent: {
      client: HCS10Client;
      accountId: string;
      operatorId: string;
      inboundTopicId: string;
      outboundTopicId: string;
    },
    message: HCSMessageWithCommonFields,
    connectionManager: ConnectionsManager,
  ) => Promise<string | null>,
  handleStandardMessage: (
    agent: {
      client: HCS10Client;
      accountId: string;
      operatorId: string;
      inboundTopicId: string;
      outboundTopicId: string;
    },
    message: HCSMessageWithCommonFields,
    topicId: string,
  ) => Promise<void>,
  filterMessageOut: (message: HCSMessageWithCommonFields) => boolean,
  agent: {
    client: HCS10Client;
    accountId: string;
    operatorId: string;
    inboundTopicId: string;
    outboundTopicId: string;
  },
) {
  let { connections, connectionManager } = await loadConnectionsUsingManager(
    logger,
    agent,
  );

  const processedMessages = new Map<string, Set<number>>();
  processedMessages.set(agent.inboundTopicId, new Set<number>());

  const connectionTopics = new Set<string>();
  for (const [topicId, connection] of connections.entries()) {
    if (topicId.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
      connectionTopics.add(topicId);
    } else {
      logger.debug(`Skipping invalid topic ID format: ${topicId}`);
    }
  }

  logger.info('Pre-populating processed messages for existing connections...');

  for (const topicId of connectionTopics) {
    const initialProcessedSet = new Set<number>();
    processedMessages.set(topicId, initialProcessedSet);

    const connection = connections.get(topicId);
    if (!connection) continue;

    try {
      const lastOperatorActivity =
        await connectionManager.getLastOperatorActivity(
          topicId,
          agent.accountId,
        );

      if (lastOperatorActivity) {
        const history = await agent.client.getMessageStream(topicId);

        for (const msg of history.messages) {
          if (Number(msg.sequence_number) > 0 && msg.created) {
            if (msg.created.getTime() <= lastOperatorActivity.getTime()) {
              initialProcessedSet.add(msg.sequence_number);
              logger.debug(
                `Pre-populated message #${msg.sequence_number} on topic ${topicId} based on last operator activity`,
              );
            } else if (
              msg.operator_id &&
              msg.operator_id.endsWith(`@${agent.accountId}`)
            ) {
              initialProcessedSet.add(msg.sequence_number);
            }
          }
        }
      }

      logger.debug(
        `Pre-populated ${initialProcessedSet.size} messages for topic ${topicId}`,
      );
    } catch (error: any) {
      logger.warn(
        `Failed to pre-populate messages for topic ${topicId}: ${error.message}. It might be closed or invalid.`,
      );
      if (
        error.message &&
        (error.message.includes('INVALID_TOPIC_ID') ||
          error.message.includes('TopicId Does Not Exist'))
      ) {
        connectionTopics.delete(topicId);
        processedMessages.delete(topicId);
        connections.delete(topicId);
      }
    }
  }

  logger.info(`Starting polling agent for ${agent.operatorId}`);
  logger.info(`Monitoring inbound topic: ${agent.inboundTopicId}`);
  logger.info(
    `Monitoring ${connectionTopics.size} active connection topics after pre-population.`,
  );

  while (true) {
    try {
      await connectionManager.fetchConnectionData(agent.accountId);
      const updatedConnections = connectionManager.getAllConnections();

      // Update our local map of connections
      connections.clear();
      for (const connection of updatedConnections) {
        connections.set(connection.connectionTopicId, connection);
      }

      const currentTrackedTopics = new Set<string>();
      for (const [topicId, _] of connections.entries()) {
        if (topicId.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
          currentTrackedTopics.add(topicId);
        }
      }

      const previousTrackedTopics = new Set(connectionTopics);

      for (const topicId of currentTrackedTopics) {
        if (!previousTrackedTopics.has(topicId)) {
          connectionTopics.add(topicId);
          if (!processedMessages.has(topicId)) {
            processedMessages.set(topicId, new Set<number>());
          }
          logger.info(
            `Discovered new connection topic: ${topicId} for ${
              connections.get(topicId)?.targetAccountId
            }`,
          );
        }
      }

      for (const topicId of previousTrackedTopics) {
        if (!currentTrackedTopics.has(topicId)) {
          connectionTopics.delete(topicId);
          processedMessages.delete(topicId);
          logger.info(`Removed connection topic: ${topicId}`);
        }
      }

      const inboundMessages = await agent.client.getMessages(
        agent.inboundTopicId,
      );
      const inboundProcessed = processedMessages.get(agent.inboundTopicId)!;

      inboundMessages.messages.sort(
        (a: HCSMessageWithCommonFields, b: HCSMessageWithCommonFields) => {
          const seqA =
            typeof a.sequence_number === 'number' ? a.sequence_number : 0;
          const seqB =
            typeof b.sequence_number === 'number' ? b.sequence_number : 0;
          return seqA - seqB;
        },
      );

      for (const message of inboundMessages.messages) {
        if (
          !message.created ||
          typeof message.sequence_number !== 'number' ||
          message.sequence_number <= 0
        )
          continue;

        if (!inboundProcessed.has(message.sequence_number)) {
          inboundProcessed.add(message.sequence_number);

          if (
            message.operator_id &&
            message.operator_id.endsWith(`@${agent.accountId}`)
          ) {
            logger.debug(
              `Skipping own inbound message #${message.sequence_number}`,
            );
            continue;
          }

          if (message.op === 'connection_request') {
            // Find any existing connection for this sequence number
            let existingConnection;
            for (const conn of connectionManager.getAllConnections()) {
              if (conn.inboundRequestId === message.sequence_number) {
                existingConnection = conn;
                break;
              }
            }

            if (existingConnection) {
              // Make sure we have a valid topic ID, not a reference key
              if (
                existingConnection.connectionTopicId.match(
                  /^[0-9]+\.[0-9]+\.[0-9]+$/,
                )
              ) {
                logger.debug(
                  `Skipping already handled connection request #${message.sequence_number}. Connection exists with topic: ${existingConnection.connectionTopicId}`,
                );
                continue;
              }
            }

            logger.info(
              `Processing inbound connection request #${message.sequence_number}`,
            );
            const newTopicId = await handleConnectionRequest(
              agent,
              message,
              connectionManager,
            );
            if (newTopicId && !connectionTopics.has(newTopicId)) {
              connectionTopics.add(newTopicId);
              if (!processedMessages.has(newTopicId)) {
                processedMessages.set(newTopicId, new Set<number>());
              }
              logger.info(`Now monitoring new connection topic: ${newTopicId}`);
            }
          } else if (message.op === 'connection_created') {
            logger.info(
              `Received connection_created confirmation #${message.sequence_number} on inbound topic for topic ${message.connection_topic_id}`,
            );
          }
        }
      }

      const topicsToProcess = Array.from(connectionTopics);
      for (const topicId of topicsToProcess) {
        try {
          if (!connections.has(topicId)) {
            logger.warn(
              `Skipping processing for topic ${topicId} as it's no longer in the active connections map.`,
            );
            if (connectionTopics.has(topicId)) connectionTopics.delete(topicId);
            if (processedMessages.has(topicId))
              processedMessages.delete(topicId);
            continue;
          }

          const messages = await agent.client.getMessageStream(topicId);

          if (!processedMessages.has(topicId)) {
            processedMessages.set(topicId, new Set<number>());
          }
          const processedSet = processedMessages.get(topicId)!;

          messages.messages.sort(
            (a: HCSMessageWithCommonFields, b: HCSMessageWithCommonFields) => {
              const seqA =
                typeof a.sequence_number === 'number' ? a.sequence_number : 0;
              const seqB =
                typeof b.sequence_number === 'number' ? b.sequence_number : 0;
              return seqA - seqB;
            },
          );

          const lastOperatorActivity =
            await connectionManager.getLastOperatorActivity(
              topicId,
              agent.accountId,
            );

          const lastActivityTimestamp = lastOperatorActivity?.getTime() || 0;

          for (const message of messages.messages) {
            if (
              !message.created ||
              typeof message.sequence_number !== 'number' ||
              message.sequence_number <= 0
            )
              continue;

            if (message.created.getTime() <= lastActivityTimestamp) {
              processedSet.add(message.sequence_number);
              continue;
            }

            if (!processedSet.has(message.sequence_number)) {
              processedSet.add(message.sequence_number);

              if (
                message.operator_id &&
                message.operator_id.endsWith(`@${agent.accountId}`)
              ) {
                logger.debug(
                  `Skipping own message #${message.sequence_number} on connection topic ${topicId}`,
                );
                continue;
              }

              if (filterMessageOut(message)) {
                logger.debug(
                  `Skipping message #${message.sequence_number} on topic ${topicId} because it was filtered out`,
                );
                continue;
              }

              if (message.op === 'message') {
                logger.info(
                  `Processing message #${message.sequence_number} on topic ${topicId}`,
                );
                await handleStandardMessage(agent, message, topicId);
              } else if (message.op === 'close_connection') {
                logger.info(
                  `Received close_connection message #${message.sequence_number} on topic ${topicId}. Removing topic from monitoring.`,
                );
                connections.delete(topicId);
                connectionTopics.delete(topicId);
                processedMessages.delete(topicId);
                break;
              }
            }
          }
        } catch (error: any) {
          if (
            error.message &&
            (error.message.includes('INVALID_TOPIC_ID') ||
              error.message.includes('TopicId Does Not Exist'))
          ) {
            logger.warn(
              `Connection topic ${topicId} likely deleted or expired. Removing from monitoring.`,
            );
            connections.delete(topicId);
            connectionTopics.delete(topicId);
            processedMessages.delete(topicId);
          } else {
            console.log(error);
            logger.error(
              `Error processing connection topic ${topicId}: ${error}`,
            );
          }
        }
      }
    } catch (error) {
      logger.error(`Error in main monitoring loop: ${error}`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

export function stripAnsiCodes(text: string): string {
  return text.replace(/\u001b\[\d+m/g, '');
}

export function extractAllText(obj: any): string {
  if (typeof obj === 'string') return stripAnsiCodes(obj);
  if (!obj || typeof obj !== 'object') return '';

  if (Array.isArray(obj)) {
    return obj.map(extractAllText).filter(Boolean).join(' ');
  }

  if (obj.text && typeof obj.text === 'string') return stripAnsiCodes(obj.text);

  return Object.values(obj).map(extractAllText).filter(Boolean).join(' ');
}
