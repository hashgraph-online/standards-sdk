/**
 * HCS-6 Registry Query Demo
 * Interactive CLI for querying HCS-6 dynamic hashinal registries
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

async function queryRegistry() {
  try {
    console.log('🔍 HCS-6 Registry Query Demo\n');

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

    const topicId = await rl.question('Registry Topic ID (e.g., 0.0.123456): ');
    if (!topicId.trim()) {
      throw new Error('Topic ID is required');
    }

    const limitInput = await rl.question('Limit messages [100]: ');
    const limit = parseInt(limitInput.trim()) || 100;

    rl.close();

    console.log('\n📊 Querying registry:');
    console.log(`   Network: ${network}`);
    console.log(`   Topic ID: ${topicId}`);
    console.log(`   Limit: ${limit}\n`);

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

    console.log('🔄 Fetching registry information...');

    try {
      const registry = await client.getRegistry(topicId, { limit });

      console.log('\n📋 Registry Information:');
      console.log(`   Topic ID: ${registry.topicId}`);
      console.log(`   Registry Type: Non-indexed (HCS-6)`);
      console.log(`   TTL: ${registry.ttl} seconds`);
      console.log(`   Total Entries: ${registry.entries.length}`);

      if (registry.latestEntry) {
        console.log('\n🎨 Latest Dynamic Hashinal:');
        console.log(`   Sequence: ${registry.latestEntry.sequence}`);
        console.log(`   Timestamp: ${registry.latestEntry.timestamp}`);
        console.log(`   Payer: ${registry.latestEntry.payer}`);
        console.log(`   Target Topic: ${registry.latestEntry.message.t_id}`);
        if (registry.latestEntry.message.m) {
          console.log(`   Memo: ${registry.latestEntry.message.m}`);
        }
        console.log(
          `\n   View Target on HashScan: https://hashscan.io/${network}/topic/${registry.latestEntry.message.t_id}`,
        );
      } else {
        console.log('\n   No entries found in registry');
      }

      console.log(
        `\n   View Registry on HashScan: https://hashscan.io/${network}/topic/${topicId}`,
      );
    } catch (error) {
      console.error('❌ Failed to query registry:', error);
      process.exit(1);
    }

    client.close();
    process.exit(0);
  } catch (error) {
    console.error('💥 Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

queryRegistry();
