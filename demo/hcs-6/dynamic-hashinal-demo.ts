/**
 * HCS-6 Dynamic Hashinal Demo
 * Demonstrates the complete flow of creating and querying dynamic hashinals
 */

import { HCS6Client } from '../../src/hcs-6';
import { Logger } from '../../src/utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NetworkType } from '../../src/utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function runDemo() {
  try {
    console.log('🎨 HCS-6 Dynamic Hashinal Demo\n');

    const operatorId = process.env.HEDERA_ACCOUNT_ID;
    const operatorKey = process.env.HEDERA_PRIVATE_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error(
        'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
      );
    }

    console.log(`Account ID: ${operatorId}\n`);

    const logger = new Logger({
      module: 'HCS6Demo',
      level: 'info',
    });

    const client = new HCS6Client({
      network: 'testnet' as NetworkType,
      operatorId,
      operatorKey,
      logger,
    });

    console.log(
      '📸 Step 1: Creating new registry with initial dynamic hashinal...\n',
    );

    const initialMetadata = {
      name: 'Dynamic Hashinal Demo - Version 1',
      creator: operatorId,
      description: 'A dynamic hashinal created with HCS-6 - Initial version',
      type: 'text/plain',
      version: '1.0',
      attributes: [
        {
          trait_type: 'Standard',
          value: 'HCS-6',
        },
        {
          trait_type: 'Dynamic',
          value: 'true',
        },
        {
          trait_type: 'Version',
          value: '1.0',
        },
      ],
    };

    const initialResult = await client.register({
      metadata: initialMetadata,
      data: {
        base64: Buffer.from(
          'This is version 1.0 of the dynamic hashinal content!',
          'utf-8',
        ).toString('base64'),
        mimeType: 'text/plain',
      },
      ttl: 3600,
      memo: 'Initial dynamic hashinal creation - v1.0',
    });

    if (!initialResult.success || !initialResult.registryTopicId) {
      console.error('❌ Initial registration failed:', initialResult.error);
      process.exit(1);
    }

    console.log('✅ Initial dynamic hashinal registered successfully!');
    console.log(`   Registry Topic ID: ${initialResult.registryTopicId}`);
    console.log(
      `   Initial Inscription Topic ID: ${initialResult.inscriptionTopicId}`,
    );
    console.log(`   Transaction ID: ${initialResult.transactionId}`);
    console.log(
      `\n   View Registry on HashScan: https://hashscan.io/testnet/topic/${initialResult.registryTopicId}`,
    );

    const submitKey = client.getOperatorKey();

    console.log('\n⏳ Waiting 5 seconds before updating...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log(
      '\n🔄 Step 2: Updating the dynamic hashinal with version 2...\n',
    );

    const updatedMetadata = {
      name: 'Dynamic Hashinal Demo - Version 2',
      creator: operatorId,
      description:
        'A dynamic hashinal updated with HCS-6 - New version with enhanced content',
      type: 'text/plain',
      version: '2.0',
      attributes: [
        {
          trait_type: 'Standard',
          value: 'HCS-6',
        },
        {
          trait_type: 'Dynamic',
          value: 'true',
        },
        {
          trait_type: 'Version',
          value: '2.0',
        },
        {
          trait_type: 'Updated',
          value: new Date().toISOString(),
        },
      ],
    };

    const updateResult = await client.register({
      metadata: updatedMetadata,
      data: {
        base64: Buffer.from(
          'This is version 2.0 of the dynamic hashinal - now with updated content and new features!',
          'utf-8',
        ).toString('base64'),
        mimeType: 'text/plain',
      },
      registryTopicId: initialResult.registryTopicId,
      submitKey: submitKey,
      memo: 'Dynamic hashinal update - v2.0',
    });

    if (!updateResult.success) {
      console.error('❌ Update failed:', updateResult.error);
      process.exit(1);
    }

    console.log('✅ Dynamic hashinal updated successfully!');
    console.log(
      `   Registry Topic ID: ${updateResult.registryTopicId} (same as before)`,
    );
    console.log(
      `   New Inscription Topic ID: ${updateResult.inscriptionTopicId}`,
    );
    if (updateResult.transactionId) {
      console.log(`   Update Transaction ID: ${updateResult.transactionId}`);
    }

    console.log(
      '\n⏳ Waiting 10 seconds for mirror node to index both entries...',
    );
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n🔍 Querying registry to verify update...');
    try {
      const registry = await client.getRegistry(initialResult.registryTopicId);
      console.log('✅ Registry query successful!');
      console.log(`   Registry Type: Non-indexed (HCS-6)`);
      console.log(`   TTL: ${registry.ttl} seconds`);
      console.log(`   Total entries: ${registry.entries.length}`);

      if (registry.latestEntry) {
        console.log(`\n   Latest Entry (Version 2.0):`);
        console.log(`     - Sequence: ${registry.latestEntry.sequence}`);
        console.log(
          `     - Target Topic: ${registry.latestEntry.message.t_id}`,
        );
        console.log(`     - Memo: ${registry.latestEntry.message.m || 'N/A'}`);
        console.log(`     - Timestamp: ${registry.latestEntry.timestamp}`);
        console.log(
          `     - View Updated Content: https://hashscan.io/testnet/topic/${registry.latestEntry.message.t_id}`,
        );
      }

      console.log('\n📝 About Dynamic Hashinals:');
      console.log('   - Only the latest entry matters (non-indexed)');
      console.log('   - Version 1.0 is now superseded by version 2.0');
      console.log('   - Updates require the registry submit key');
      console.log(
        '   - Perfect for evolving NFTs, game assets, profiles, etc.',
      );
    } catch (error) {
      console.log('⚠️  Registry query failed (mirror node may need more time)');
    }

    console.log('\n🎉 Demo completed successfully!');
    client.close();
    process.exit(0);
  } catch (error) {
    console.error('💥 Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runDemo();
