/**
 * Example: Deploy HCS-20 Points
 */

import { HCS20Client, HCS20PointsIndexer } from '../../src/hcs-20';
import { Logger } from '../../src/utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function deployPoints() {
  const operatorId = process.env.HEDERA_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env file',
    );
  }

  // Initialize client
  const client = new HCS20Client({
    network: 'testnet',
    operatorId,
    operatorKey,
    logger: new Logger({ module: 'HCS20Demo' }),
  });

  try {
    console.log('Deploying loyalty points...\n');

    // Deploy points with progress tracking
    const pointsInfo = await client.deployPoints({
      name: 'Demo Loyalty Points',
      tick: 'dlp',
      maxSupply: '1000000000', // 1 billion points
      limitPerMint: '10000', // Max 10k per mint
      metadata: 'Demo loyalty points for testing',
      usePrivateTopic: true, // Create a private topic
      topicMemo: 'DLP Points Topic',
      progressCallback: progress => {
        console.log(`[${progress.stage}] ${progress.percentage}% complete`);
        if (progress.topicId) {
          console.log(`Topic ID: ${progress.topicId}`);
        }
        if (progress.deployTxId) {
          console.log(`Deploy Transaction: ${progress.deployTxId}`);
        }
        if (progress.error) {
          console.error(`Error: ${progress.error}`);
        }
      },
    });

    console.log('\nPoints deployed successfully!');
    console.log('Points Info:', JSON.stringify(pointsInfo, null, 2));
    
    console.log('\n📊 Starting indexer to verify deployment...');
    const indexer = new HCS20PointsIndexer('testnet');

    console.log('⏳ Waiting 10s for mirror node propagation...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('📖 Indexing topic messages...');
    await indexer.indexOnce({
      privateTopics: [pointsInfo.topicId],
    });

    const indexedPointsInfo = await indexer.getPointsInfo(pointsInfo.tick);
    const deployerBalance = await indexer.getBalance(pointsInfo.tick, operatorId);

    console.log('\n💵 Deployment Verification:');
    console.log(`- Points name: ${indexedPointsInfo?.name}`);
    console.log(`- Tick: ${indexedPointsInfo?.tick}`);
    console.log(`- Max supply: ${indexedPointsInfo?.maxSupply}`);
    console.log(`- Current supply: ${indexedPointsInfo?.currentSupply}`);
    console.log(`- Deployer balance: ${deployerBalance}`);
    
    console.log('\n✅ Verification Results:');
    console.log(`- Deployment found: ${indexedPointsInfo ? '✅' : '❌'}`);
    console.log(`- Initial supply is 0: ${indexedPointsInfo?.currentSupply === '0' ? '✅' : '❌'}`);
    console.log(`- Deployer balance is 0: ${deployerBalance === '0' ? '✅' : '❌'}`);
  } catch (error) {
    console.error('Failed to deploy points:', error);
  }
}

// Run the demo
deployPoints().catch(console.error);
