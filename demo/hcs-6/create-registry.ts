/**
 * HCS-6 Registry Creation Demo
 * Interactive CLI for creating HCS-6 dynamic hashinal registry topics
 */

import { HCS6Client } from '../../src/hcs-6';
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
    console.log('🚀 HCS-6 Dynamic Hashinal Registry Creation Demo\n');

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

    const adminKeyInput = await rl.question('Add admin key? (y/n) [y]: ');
    const adminKey = !adminKeyInput.toLowerCase().startsWith('n');

    const submitKeyInput = await rl.question('Add submit key? (y/n) [y]: ');
    const submitKey = !submitKeyInput.toLowerCase().startsWith('n');

    const ttlInput = await rl.question('TTL in seconds [86400]: ');
    const ttl = parseInt(ttlInput.trim()) || 86400;

    if (ttl < 3600) {
      throw new Error('TTL must be at least 3600 seconds (1 hour)');
    }

    rl.close();

    console.log('\n📊 Creating HCS-6 registry with configuration:');
    console.log(`   Network: ${network}`);
    console.log(`   Registry Type: Non-indexed (dynamic hashinals)`);
    console.log(`   Admin Key: ${adminKey ? 'Yes' : 'No'}`);
    console.log(`   Submit Key: ${submitKey ? 'Yes' : 'No'}`);
    console.log(`   TTL: ${ttl} seconds\n`);

    const logger = new Logger({
      module: 'HCS6Demo',
      level: 'info',
    });

    const client = new HCS6Client({
      network: network as NetworkType,
      operatorId,
      operatorKey,
      logger,
    });

    const result = await client.createRegistry({
      ttl,
      adminKey,
      submitKey,
    });

    if (result.success) {
      console.log('✅ HCS-6 Registry created successfully!');
      console.log(`   Topic ID: ${result.topicId}`);
      console.log(`   Transaction ID: ${result.transactionId}`);
      console.log(`   Memo: hcs-6:1:${ttl}`);
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
