import * as fs from 'fs';
import * as path from 'path';
import { AccountId, PrivateKey, PublicKey, Client, TransferTransaction, Hbar } from '@hashgraph/sdk';
import { Logger, HCS15PetalManager, AgentBuilder, AIAgentCapability, InboundTopicType, HederaMirrorNode } from '../../src';

export const ENV_FILE_PATH = path.join(process.cwd(), '.env');

export interface PetalData {
  accountId: AccountId;
  privateKey: PrivateKey;
  publicKey: PublicKey;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
  baseAccountId: string;
  basePrivateKeyHex: string;
}

export interface BaseAccountData {
  accountId: AccountId;
  privateKey: PrivateKey;
  privateKeyHex: string;
  publicKey: PublicKey;
  evmAddress: string;
}

/**
 * Updates the .env file with new values
 */
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

/**
 * Get or create base account from environment
 */
export async function getOrCreateBaseAccount(
  client: Client,
  petalManager: HCS15PetalManager,
  logger: Logger,
  baseNumber: number,
): Promise<BaseAccountData> {
  const envPrefix = `FLORA_BASE_${baseNumber}`;
  const baseAccountId = process.env[`${envPrefix}_ACCOUNT_ID`];
  const basePrivateKey = process.env[`${envPrefix}_PRIVATE_KEY`];
  const baseEvmAddress = process.env[`${envPrefix}_EVM_ADDRESS`];

  let baseAccount: BaseAccountData;

  if (baseAccountId && basePrivateKey && baseEvmAddress) {
    logger.info(`Using existing base account ${baseNumber} from environment`);
    logger.info(`Base account ${baseNumber}: ${baseAccountId}`);
    logger.info(`EVM address: ${baseEvmAddress}`);

    const privateKey = PrivateKey.fromStringECDSA(basePrivateKey);
    baseAccount = {
      accountId: AccountId.fromString(baseAccountId),
      privateKey,
      privateKeyHex: basePrivateKey,
      publicKey: privateKey.publicKey,
      evmAddress: baseEvmAddress,
    };
  } else {
    logger.info(`Creating new base account ${baseNumber}...`);
    const newAccount = await petalManager.createBaseAccount(10);
    
    await updateEnvFile(ENV_FILE_PATH, {
      [`${envPrefix}_ACCOUNT_ID`]: newAccount.accountId.toString(),
      [`${envPrefix}_PRIVATE_KEY`]: newAccount.privateKeyHex,
      [`${envPrefix}_EVM_ADDRESS`]: newAccount.evmAddress,
    });

    logger.info(`Base account ${baseNumber} created and saved: ${newAccount.accountId}`);
    logger.info(`EVM address: ${newAccount.evmAddress}`);

    baseAccount = newAccount;
  }

  await ensureAccountHasEnoughHbar(client, logger, baseAccount.accountId.toString(), `Base ${baseNumber}`, 10.0);

  return baseAccount;
}

/**
 * Get or create Petal account from environment
 */
export async function getOrCreatePetal(
  petalManager: HCS15PetalManager,
  logger: Logger,
  baseAccount: BaseAccountData,
  petalNumber: number,
): Promise<PetalData> {
  const envPrefix = `PETAL_${petalNumber}`;
  
  const accountId = process.env[`${envPrefix}_ACCOUNT_ID`];
  const profileTopicId = process.env[`${envPrefix}_PROFILE_TOPIC_ID`];
  const inboundTopicId = process.env[`${envPrefix}_INBOUND_TOPIC_ID`];
  const outboundTopicId = process.env[`${envPrefix}_OUTBOUND_TOPIC_ID`];


  if (accountId && profileTopicId && inboundTopicId && outboundTopicId) {
    logger.info(`Petal-${petalNumber} found in environment`);
    logger.info(`  Account: ${accountId}`);
    logger.info(`  Profile: ${profileTopicId}`);
    logger.info(`  Inbound: ${inboundTopicId}`);
    logger.info(`  Outbound: ${outboundTopicId}`);

    return {
      accountId: AccountId.fromString(accountId),
      privateKey: baseAccount.privateKey,
      publicKey: baseAccount.publicKey,
      inboundTopicId,
      outboundTopicId,
      profileTopicId,
      baseAccountId: baseAccount.accountId.toString(),
      basePrivateKeyHex: baseAccount.privateKeyHex,
    };
  }

  logger.info(`Creating Petal-${petalNumber}...`);
  
  const agentBuilder = new AgentBuilder()
    .setName(`Demo Petal ${petalNumber}`)
    .setBio(`A demo Petal account for HCS-18 testing`)
    .setModel('unknown')
    .setType('autonomous')
    .setInboundTopicType(InboundTopicType.PUBLIC)
    .setCapabilities([AIAgentCapability.TEXT_GENERATION]);

  const result = await petalManager.createPetal(agentBuilder, {
    baseAccountId: baseAccount.accountId.toString(),
    basePrivateKey: baseAccount.privateKeyHex,
    initialBalance: 0.5,
  });

  await updateEnvFile(ENV_FILE_PATH, {
    [`${envPrefix}_ACCOUNT_ID`]: result.petalAccount.accountId.toString(),
    [`${envPrefix}_PROFILE_TOPIC_ID`]: result.petalAccount.profileTopicId || '',
    [`${envPrefix}_INBOUND_TOPIC_ID`]: result.petalAccount.inboundTopicId || '',
    [`${envPrefix}_OUTBOUND_TOPIC_ID`]: result.petalAccount.outboundTopicId || '',
  });

  logger.info(`Created and saved Petal-${petalNumber}: ${result.petalAccount.accountId}`);
  logger.info(`  Profile: ${result.petalAccount.profileTopicId}`);
  logger.info(`  Inbound: ${result.petalAccount.inboundTopicId}`);
  logger.info(`  Outbound: ${result.petalAccount.outboundTopicId}`);

  const isValid = await petalManager.verifyPetalAccount(
    result.petalAccount.accountId.toString(),
    baseAccount.accountId.toString(),
  );
  logger.info(`  Valid petal: ${isValid}`);

  return {
    accountId: result.petalAccount.accountId,
    privateKey: result.petalAccount.privateKey,
    publicKey: result.petalAccount.publicKey,
    inboundTopicId: result.petalAccount.inboundTopicId,
    outboundTopicId: result.petalAccount.outboundTopicId,
    profileTopicId: result.petalAccount.profileTopicId,
    baseAccountId: result.petalAccount.baseAccountId,
    basePrivateKeyHex: baseAccount.privateKeyHex,
  };
}

/**
 * Helper function to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure account has enough HBAR balance
 */
export async function ensureAccountHasEnoughHbar(
  client: Client,
  logger: Logger,
  accountId: string,
  accountName: string,
  minRequiredHbar: number = 5.0,
): Promise<void> {
  try {
    const mirrorNode = new HederaMirrorNode('testnet', logger);
    const account = await mirrorNode.requestAccount(accountId);
    const balance = account.balance.balance;
    const hbarBalance = balance / 100_000_000;

    logger.info(`${accountName} account ${accountId} has ${hbarBalance} HBAR`);

    if (hbarBalance < minRequiredHbar) {
      logger.info(`${accountName} needs funding. Current: ${hbarBalance} HBAR, Required: ${minRequiredHbar} HBAR`);

      const operatorId = client.operatorAccountId;
      const amountToTransfer = minRequiredHbar - hbarBalance + 1;

      const transferTx = new TransferTransaction()
        .addHbarTransfer(operatorId!, Hbar.fromTinybars(Math.round(amountToTransfer * -100_000_000)))
        .addHbarTransfer(accountId, Hbar.fromTinybars(Math.round(amountToTransfer * 100_000_000)));

      logger.info(`Funding ${accountName} with ${amountToTransfer.toFixed(2)} HBAR from ${operatorId}`);

      const txResponse = await transferTx.execute(client);
      await txResponse.getReceipt(client);
      
      logger.info(`Successfully funded ${accountName} account ${accountId}`);
    } else {
      logger.info(`${accountName} has sufficient balance`);
    }
  } catch (error) {
    logger.error(`Failed to check/fund ${accountName} balance:`, error);
    throw error;
  }
}