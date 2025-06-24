/**
 * HCS-10 Registry Creation Demo
 * Interactive CLI for creating HCS-10 registry topics with optional metadata
 */

import { HCS10Client } from '../../src/hcs-10';
import { Logger } from '../../src/utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline/promises';
import { NetworkType } from '../../src/utils';
import { RegistryMetadata } from '../../src/hcs-10/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function createRegistryTopic() {
  try {
    console.log('🚀 HCS-10 Registry Topic Creation Demo\n');

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

    const adminKeyInput = await rl.question('Add admin key? (y/n) [n]: ');
    const adminKey = adminKeyInput.toLowerCase().startsWith('y');

    const submitKeyInput = await rl.question('Add submit key? (y/n) [n]: ');
    const submitKey = submitKeyInput.toLowerCase().startsWith('y');

    const ttlInput = await rl.question('TTL in seconds [86400]: ');
    const ttl = parseInt(ttlInput.trim()) || 86400;

    const metadataInput = await rl.question(
      'Include registry metadata? (y/n) [n]: ',
    );
    const includeMetadata = metadataInput.toLowerCase().startsWith('y');

    let metadata: RegistryMetadata | undefined;

    if (includeMetadata) {
      console.log('\n📝 Registry Metadata Configuration:');

      const name = await rl.question('Registry name: ');
      if (!name.trim()) {
        throw new Error('Registry name is required');
      }

      const description = await rl.question('Registry description: ');
      if (!description.trim()) {
        throw new Error('Registry description is required');
      }

      const operatorName = await rl.question(
        'Operator organization name (optional): ',
      );
      const operatorContact = await rl.question(
        'Operator contact (URL/email) (optional): ',
      );

      const categoriesInput = await rl.question(
        'Categories (comma-separated, optional): ',
      );
      const categories = categoriesInput
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      const tagsInput = await rl.question('Tags (comma-separated, optional): ');
      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const websiteUrl = await rl.question('Website URL (optional): ');
      const documentationUrl = await rl.question(
        'Documentation URL (optional): ',
      );
      const communityUrl = await rl.question('Community URL (optional): ');

      metadata = {
        version: '1.0',
        name: name.trim(),
        description: description.trim(),
        operator: {
          account: operatorId,
          ...(operatorName.trim() && { name: operatorName.trim() }),
          ...(operatorContact.trim() && { contact: operatorContact.trim() }),
        },
        ...(categories.length > 0 && { categories }),
        ...(tags.length > 0 && { tags }),
        ...(websiteUrl.trim() ||
          documentationUrl.trim() ||
          (communityUrl.trim() && {
            links: {
              ...(websiteUrl.trim() && { website: websiteUrl.trim() }),
              ...(documentationUrl.trim() && {
                documentation: documentationUrl.trim(),
              }),
              ...(communityUrl.trim() && { community: communityUrl.trim() }),
            },
          })),
      };
    }

    rl.close();

    console.log('\n📊 Creating registry topic with configuration:');
    console.log(`   Network: ${network}`);
    console.log(`   Admin Key: ${adminKey ? 'Yes' : 'No'}`);
    console.log(`   Submit Key: ${submitKey ? 'Yes' : 'No'}`);
    console.log(`   TTL: ${ttl} seconds`);
    console.log(`   Include Metadata: ${includeMetadata ? 'Yes' : 'No'}`);
    if (metadata) {
      console.log(`   Registry Name: ${metadata.name}`);
      console.log(`   Registry Description: ${metadata.description}`);
    }
    console.log();

    const logger = new Logger({
      module: 'HCS10Demo',
      level: 'info',
    });

    const client = new HCS10Client({
      network: network as NetworkType,
      operatorId,
      operatorPrivateKey: operatorKey,
      logLevel: 'info',
    });

    const result = await client.createRegistryTopic({
      ttl,
      metadata,
      adminKey,
      submitKey,
      waitForConfirmation: true,
      progressCallback: progress => {
        console.log(
          `⏳ ${progress.stage}: ${progress.message} (${progress.progressPercent}%)`,
        );
      },
    });

    if (result.success) {
      console.log('\n✅ Registry topic created successfully!');
      console.log(`   Topic ID: ${result.topicId}`);
      console.log(`   Transaction ID: ${result.transactionId}`);
      if (result.metadataTopicId) {
        console.log(`   Metadata Topic ID: ${result.metadataTopicId}`);
      }
      console.log(
        `   View on HashScan: https://hashscan.io/${network}/topic/${result.topicId}`,
      );
      if (result.metadataTopicId) {
        console.log(
          `   View Metadata: https://hashscan.io/${network}/topic/${result.metadataTopicId}`,
        );
      }

      console.log(
        `\n📋 Registry Memo: hcs-10:0:${ttl}:3${result.metadataTopicId ? `:${result.metadataTopicId}` : ''}`,
      );
    } else {
      console.error('❌ Failed to create registry topic:', result.error);
      process.exit(1);
    }

    client.close();
  } catch (error) {
    console.error('💥 Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

createRegistryTopic();
