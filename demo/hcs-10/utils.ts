import { HCS10Client, AgentBuilder } from '../../src/hcs-10';
import { InboundTopicType } from '../../src/hcs-10/types.d';
import { Logger } from '../../src/utils/logger';
import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { HederaMirrorNode } from '../../src/services/mirror-node';
import { AIAgentCapability } from '../../src/hcs-11';

export const MIN_REQUIRED_USD = 2.0;
export const MIN_REQUIRED_HBAR_USD = 5.0;

export const ENV_FILE_PATH = path.join(process.cwd(), '.env');

export interface AgentData {
  accountId: string;
  operatorId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  client: HCS10Client;
}

export interface RegistrationProgressData {
  registered: boolean;
  accountId?: string;
  privateKey?: string;
  publicKey?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
}

export async function ensureAgentHasEnoughHbar(
  logger: Logger,
  client: HCS10Client,
  accountId: string,
  agentName: string
): Promise<void> {
  try {
    const account = await client.requestAccount(accountId);
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
            )}). Please fund the account with at least ${(
              MIN_REQUIRED_HBAR_USD / hbarPrice
            ).toFixed(2)} HBAR.`
          );
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
    operatorId: `${inboundTopicId}@${accountId}`,
    inboundTopicId,
    outboundTopicId,
    client,
  };
}

export async function createAgent(
  logger: Logger,
  baseClient: HCS10Client,
  agentName: string,
  agentBuilder: any,
  envPrefix: string
): Promise<AgentData | null> {
  try {
    logger.info(`Creating ${agentName} agent...`);

    const result = await baseClient.createAndRegisterAgent(agentBuilder);

    if (!result.metadata) {
      logger.error(`${agentName} agent creation failed`);
      return null;
    }

    logger.info(`${agentName} agent created successfully`);
    logger.info(`${agentName} account ID: ${result.metadata.accountId}`);
    logger.info(`${agentName} private key: ${result.metadata.privateKey}`);
    logger.info(
      `${agentName} inbound topic ID: ${result.metadata.inboundTopicId}`
    );
    logger.info(
      `${agentName} outbound topic ID: ${result.metadata.outboundTopicId}`
    );

    const envVars = {
      [`${envPrefix}_ACCOUNT_ID`]: result.metadata.accountId,
      [`${envPrefix}_PRIVATE_KEY`]: result.metadata.privateKey,
      [`${envPrefix}_INBOUND_TOPIC_ID`]: result.metadata.inboundTopicId,
      [`${envPrefix}_OUTBOUND_TOPIC_ID`]: result.metadata.outboundTopicId,
    };

    await updateEnvFile(ENV_FILE_PATH, envVars);

    const client = new HCS10Client({
      network: 'testnet',
      operatorId: result.metadata.accountId,
      operatorPrivateKey: result.metadata.privateKey,
      guardedRegistryBaseUrl: process.env.REGISTRY_URL,
      prettyPrint: true,
      logLevel: 'debug',
    });

    return {
      accountId: result.metadata.accountId,
      operatorId: `${result.metadata.inboundTopicId}@${result.metadata.accountId}`,
      inboundTopicId: result.metadata.inboundTopicId,
      outboundTopicId: result.metadata.outboundTopicId,
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

  fs.writeFileSync(envFilePath, updatedLines.join('\n'));
}

export function createBobBuilder(pfpBuffer?: Buffer): any {
  const bobBuilder = new AgentBuilder()
    .setName('Bob')
    .setDescription('A language processing agent')
    .setCapabilities([
      AIAgentCapability.TEXT_GENERATION,
      AIAgentCapability.CODE_GENERATION,
      AIAgentCapability.DATA_INTEGRATION,
      AIAgentCapability.KNOWLEDGE_RETRIEVAL,
    ])
    .setAgentType('autonomous')
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

  const alicePfpPath = path.join(__dirname, 'assets', 'alice-icon.svg');
  const pfpBuffer = fs.existsSync(alicePfpPath)
    ? fs.readFileSync(alicePfpPath)
    : undefined;

  if (!pfpBuffer) {
    logger.warn('Alice profile picture not found, using default');
  }

  const AgentBuilder = require('../../src/hcs-10/agent-builder').AgentBuilder;
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
    .setNetwork('testnet')
    .setInboundTopicType(InboundTopicType.PUBLIC);

  if (pfpBuffer) {
    aliceBuilder.setProfilePicture(pfpBuffer, 'alice-icon.svg');
  }

  return await createAgent(logger, baseClient, 'Alice', aliceBuilder, 'ALICE');
}
