/**
 * HCS-20 Demo: Deploy and Mint Points
 *
 * This demo shows how to:
 * 1. Deploy a new points system
 * 2. Mint points to accounts
 * 3. Transfer points between accounts
 * 4. Burn points
 */

import { HCS20Client, HCS20PointsIndexer } from '../../src';
import { PrivateKey } from '@hashgraph/sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

async function main() {
  const operatorId = process.env.HEDERA_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
    );
  }

  let publicTopicId = process.env.HCS20_PUBLIC_TOPIC_ID_TESTNET;
  let registryTopicId = process.env.HCS20_REGISTRY_TOPIC_ID_TESTNET;

  const client = new HCS20Client({
    operatorId,
    operatorKey,
    network: 'testnet',
    publicTopicId,
    registryTopicId,
  });

  if (!publicTopicId || !registryTopicId) {
    console.log('\n📝 Setting up HCS-20 testnet topics...');

    if (!publicTopicId) {
      console.log('Creating public topic...');
      publicTopicId = await client.createPublicTopic(
        'HCS-20 Public Topic (Testnet)',
      );
      console.log(`✅ Public topic created: ${publicTopicId}`);
    }

    if (!registryTopicId) {
      console.log('Creating registry topic...');
      registryTopicId = await client.createRegistryTopic(
        'HCS-20 Registry (Testnet)',
      );
      console.log(`✅ Registry topic created: ${registryTopicId}`);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    const updateEnvVar = (name: string, value: string) => {
      const index = lines.findIndex(line => line.startsWith(`${name}=`));
      if (index !== -1) {
        lines[index] = `${name}=${value}`;
      } else {
        lines.push(`${name}=${value}`);
      }
    };

    if (!process.env.HCS20_PUBLIC_TOPIC_ID_TESTNET) {
      updateEnvVar('HCS20_PUBLIC_TOPIC_ID_TESTNET', publicTopicId);
    }
    if (!process.env.HCS20_REGISTRY_TOPIC_ID_TESTNET) {
      updateEnvVar('HCS20_REGISTRY_TOPIC_ID_TESTNET', registryTopicId);
    }

    fs.writeFileSync(envPath, lines.join('\n'));
    console.log('✅ Topic IDs saved to .env file');
  }

  console.log('\n🚀 Starting HCS-20 Demo...');
  console.log(`Operator Account: ${operatorId}`);

  try {
    // Step 1: Deploy a new points system
    console.log('\n📝 Step 1: Deploying new points system...');
    const pointsInfo = await client.deployPoints({
      name: 'Demo Loyalty Points',
      tick: 'DEMO',
      maxSupply: '1000000',
      limitPerMint: '10000',
      metadata: 'Demo loyalty points for testing',
      usePrivateTopic: false,
      progressCallback: progress => {
        console.log(`  ${progress.stage}: ${progress.percentage}%`);
        if (progress.topicId) console.log(`  Topic ID: ${progress.topicId}`);
        if (progress.deployTxId)
          console.log(`  Deploy Tx: ${progress.deployTxId}`);
      },
    });

    console.log('\n✅ Points deployed successfully!');
    console.log('Points Info:', pointsInfo);

    // Wait a bit for indexers to catch up
    console.log('\n⏳ Waiting 5 seconds for network propagation...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 2: Mint points to the operator account
    console.log('\n💰 Step 2: Minting points...');
    const mintTx = await client.mintPoints({
      tick: 'DEMO',
      amount: '5000',
      to: operatorId,
      memo: 'Initial mint for demo',
      progressCallback: progress => {
        console.log(`  ${progress.stage}: ${progress.percentage}%`);
        if (progress.mintTxId) console.log(`  Mint Tx: ${progress.mintTxId}`);
      },
    });

    console.log('\n✅ Points minted successfully!');
    console.log('Transaction:', mintTx);

    // Step 3: Transfer some points to another account (optional)
    const recipientAccount = process.env.BOB_ACCOUNT_ID;
    if (recipientAccount) {
      console.log('\n📤 Step 3: Transferring points...');
      const transferTx = await client.transferPoints({
        tick: 'DEMO',
        amount: '1000',
        from: operatorId,
        to: recipientAccount,
        memo: 'Demo transfer',
        progressCallback: progress => {
          console.log(`  ${progress.stage}: ${progress.percentage}%`);
          if (progress.transferTxId)
            console.log(`  Transfer Tx: ${progress.transferTxId}`);
        },
      });

      console.log('\n✅ Points transferred successfully!');
      console.log('Transaction:', transferTx);
    } else {
      console.log('\n⚠️  Skipping transfer (no BOB_ACCOUNT_ID set)');
    }

    // Step 4: Burn some points
    console.log('\n🔥 Step 4: Burning points...');
    const burnTx = await client.burnPoints({
      tick: 'DEMO',
      amount: '500',
      from: operatorId,
      memo: 'Demo burn',
      progressCallback: progress => {
        console.log(`  ${progress.stage}: ${progress.percentage}%`);
        if (progress.burnTxId) console.log(`  Burn Tx: ${progress.burnTxId}`);
      },
    });

    console.log('\n✅ Points burned successfully!');
    console.log('Transaction:', burnTx);

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- Deployed DEMO points with 1M max supply');
    console.log('- Minted 5,000 points to operator');
    if (recipientAccount) {
      console.log('- Transferred 1,000 points to recipient');
    }
    console.log('- Burned 500 points');

    console.log('\n📊 Starting indexer to verify final balances...');
    const indexer = new HCS20PointsIndexer('testnet');

    console.log('⏳ Waiting 10s for mirror node propagation...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('📖 Indexing all messages...');
    await indexer.indexOnce({
      publicTopicId,
      registryTopicId,
    });

    const indexedPointsInfo = await indexer.getPointsInfo('demo');
    const operatorBalance = await indexer.getBalance('demo', operatorId);
    const recipientBalance = recipientAccount
      ? await indexer.getBalance('demo', recipientAccount)
      : '0';

    console.log('\n💵 Final Balances:');
    console.log(`- Operator: ${operatorBalance} DEMO`);
    if (recipientAccount) {
      console.log(`- Recipient: ${recipientBalance} DEMO`);
    }
    console.log(`- Total Supply: ${indexedPointsInfo?.currentSupply} DEMO`);

    const expectedOperatorBalance = recipientAccount ? '3500' : '4500';
    const expectedRecipientBalance = '1000';
    const expectedSupply = '4500';

    console.log('\n✅ Verification:');
    console.log(
      `- Operator balance correct: ${operatorBalance === expectedOperatorBalance ? '✅' : '❌'}`,
    );
    if (recipientAccount) {
      console.log(
        `- Recipient balance correct: ${recipientBalance === expectedRecipientBalance ? '✅' : '❌'}`,
      );
    }
    console.log(
      `- Total supply correct: ${indexedPointsInfo?.currentSupply === expectedSupply ? '✅' : '❌'}`,
    );
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the demo
main().catch(console.error);
