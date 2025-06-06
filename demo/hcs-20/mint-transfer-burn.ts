/**
 * Example: Mint, Transfer, and Burn HCS-20 Points
 * 
 * Note: This example assumes you have already deployed points
 * and know the topic ID where they are deployed.
 */

import { HCS20Client, HCS20PointsIndexer } from '../../src/hcs-20';
import { Logger } from '../../src/utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function mintTransferBurnExample() {
  const operatorId = process.env.HEDERA_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
    );
  }

  // Initialize client with testnet topics
  const publicTopicId = process.env.HCS20_PUBLIC_TOPIC_ID_TESTNET;
  const registryTopicId = process.env.HCS20_REGISTRY_TOPIC_ID_TESTNET;

  if (!publicTopicId || !registryTopicId) {
    throw new Error(
      'Please run demo:hcs-20:deploy-and-mint first to create testnet topics',
    );
  }

  const client = new HCS20Client({
    network: 'testnet',
    operatorId,
    operatorKey,
    publicTopicId,
    registryTopicId,
    logger: new Logger({ module: 'HCS20Demo' }),
  });

  // Configuration
  const tick = 'demo'; // Use the same tick as deploy-and-mint demo
  const recipientAccount = process.env.BOB_ACCOUNT_ID || operatorId;

  try {
    // Step 1: Mint points
    console.log('Step 1: Minting points...\n');

    const mintTx = await client.mintPoints({
      tick,
      amount: '5000',
      to: recipientAccount,
      memo: 'Initial mint for demo',
      progressCallback: (progress) => {
        console.log(`[MINT ${progress.stage}] ${progress.percentage}%`);
        if (progress.mintTxId) {
          console.log(`Mint Transaction: ${progress.mintTxId}`);
        }
      },
    });

    console.log('\nMint successful!');
    console.log('Transaction:', JSON.stringify(mintTx, null, 2));
    console.log('\nNote: Balance queries require an external indexer service.');

    // Step 2: Transfer points
    console.log('\n\nStep 2: Transferring points...\n');
    console.log('Note: For public topics, only the account owner can transfer their points.');

    const transferTx = await client.transferPoints({
      tick,
      amount: '1500',
      from: operatorId, // Must be the operator for SDK client
      to: recipientAccount,
      memo: 'Transfer demo',
      progressCallback: (progress) => {
        console.log(`[TRANSFER ${progress.stage}] ${progress.percentage}%`);
        if (progress.transferTxId) {
          console.log(`Transfer Transaction: ${progress.transferTxId}`);
        }
      },
    });

    console.log('\nTransfer successful!');
    console.log('Transaction:', JSON.stringify(transferTx, null, 2));

    // Step 3: Burn points
    console.log('\n\nStep 3: Burning points...\n');

    const burnTx = await client.burnPoints({
      tick,
      amount: '500',
      from: operatorId, // Must be the operator for SDK client
      memo: 'Burn demo',
      progressCallback: (progress) => {
        console.log(`[BURN ${progress.stage}] ${progress.percentage}%`);
        if (progress.burnTxId) {
          console.log(`Burn Transaction: ${progress.burnTxId}`);
        }
      },
    });

    console.log('\nBurn successful!');
    console.log('Transaction:', JSON.stringify(burnTx, null, 2));

    console.log('\n\nDemo completed!');
    console.log('Summary:');
    console.log(`- Minted 5000 ${tick} to ${recipientAccount}`);
    console.log(`- Transferred 1500 ${tick} from operator to ${recipientAccount}`); 
    console.log(`- Burned 500 ${tick} from operator`);
    
    console.log('\n📊 Starting indexer to verify final state...');
    const indexer = new HCS20PointsIndexer('testnet');

    console.log('⏳ Waiting 10s for mirror node propagation...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('📖 Indexing all messages...');
    await indexer.indexOnce({
      publicTopicId,
      registryTopicId,
    });

    const pointsInfo = await indexer.getPointsInfo(tick);
    const operatorBalance = await indexer.getBalance(tick, operatorId);
    const recipientBalance = await indexer.getBalance(tick, recipientAccount);
    const totalSupply = pointsInfo?.currentSupply || '0';

    console.log('\n💵 Final State:');
    console.log(`- Operator balance: ${operatorBalance} ${tick}`);
    console.log(`- Recipient balance: ${recipientBalance} ${tick}`);
    console.log(`- Total supply: ${totalSupply} ${tick}`);
    
    console.log('\n✅ Verification:');
    console.log('Expected state after operations:');
    console.log('- Minted 5000 to recipient');
    console.log('- Transferred 1500 from operator to recipient'); 
    console.log('- Burned 500 from operator');
    console.log('- Total minted: 5000, Total burned: 500');
    console.log(`- Expected total supply: 4500 (actual: ${totalSupply})`);
  } catch (error) {
    console.error('Operation failed:', error);
  }
}

// Run the demo
mintTransferBurnExample().catch(console.error);
