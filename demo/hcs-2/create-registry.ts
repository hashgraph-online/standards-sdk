/**
 * HCS-2 Registry Creation Demo
 * Interactive CLI for creating HCS-2 registry topics
 */

import { HCS2Client, HCS2RegistryType } from '../../src/hcs-2';
import { Logger } from '../../src/utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline/promises';
import { NetworkType } from '../../src/utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function createRegistry() {
  try {
    console.log('🚀 HCS-2 Registry Creation Demo\n');

    const operatorId = process.env.HEDERA_ACCOUNT_ID;
    const defaultOperatorKey = process.env.HEDERA_PRIVATE_KEY;

    if (!operatorId) {
      throw new Error('Please set HEDERA_ACCOUNT_ID in .env file');
    }

    console.log(`Account ID: ${operatorId}`);

    const operatorKeyInput = await rl.question(
      `Private key (press Enter to use .env default): `,
    );
    const operatorKey = operatorKeyInput.trim() || defaultOperatorKey;

    if (!operatorKey) {
      throw new Error(
        'Please provide a private key or set HEDERA_PRIVATE_KEY in .env file',
      );
    }

    const networkInput = await rl.question(
      'Network (testnet/mainnet) [testnet]: ',
    );
    const network = networkInput.trim() || 'testnet';

    if (network !== 'testnet' && network !== 'mainnet') {
      throw new Error('Network must be "testnet" or "mainnet"');
    }

    const registryTypeInput = await rl.question(
      'Registry type (indexed/non-indexed) [indexed]: ',
    );
    const registryTypeStr = registryTypeInput.trim() || 'indexed';

    if (registryTypeStr !== 'indexed' && registryTypeStr !== 'non-indexed') {
      throw new Error('Registry type must be "indexed" or "non-indexed"');
    }

    const registryType =
      registryTypeStr === 'indexed'
        ? HCS2RegistryType.INDEXED
        : HCS2RegistryType.NON_INDEXED;

    const adminKeyInput = await rl.question('Add admin key? (y/n) [n]: ');
    const adminKey = adminKeyInput.toLowerCase().startsWith('y');

    const submitKeyInput = await rl.question('Add submit key? (y/n) [n]: ');
    const submitKey = submitKeyInput.toLowerCase().startsWith('y');

    const ttlInput = await rl.question('TTL in seconds [86400]: ');
    const ttl = parseInt(ttlInput.trim()) || 86400;

    rl.close();

    console.log('\n📊 Creating registry with configuration:');
    console.log(`   Network: ${network}`);
    console.log(`   Registry Type: ${registryTypeStr}`);
    console.log(`   Admin Key: ${adminKey ? 'Yes' : 'No'}`);
    console.log(`   Submit Key: ${submitKey ? 'Yes' : 'No'}`);
    console.log(`   TTL: ${ttl} seconds\n`);

    const logger = new Logger({
      module: 'HCS2Demo',
      level: 'info',
    });

    const client = new HCS2Client({
      network: network as NetworkType,
      operatorId,
      operatorKey,
      logger,
    });

    const result = await client.createRegistry({
      registryType,
      ttl,
      adminKey,
      submitKey,
    });

    if (result.success) {
      console.log('✅ Registry created successfully!');
      console.log(`   Topic ID: ${result.topicId}`);
      console.log(`   Transaction ID: ${result.transactionId}`);
      console.log(
        `   View on HashScan: https://hashscan.io/${network}/topic/${result.topicId}`,
      );
    } else {
      console.error('❌ Failed to create registry:', result.error);
      process.exit(1);
    }

    client.close();
    process.exit(0);
  } catch (error) {
    console.error('💥 Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

createRegistry();
