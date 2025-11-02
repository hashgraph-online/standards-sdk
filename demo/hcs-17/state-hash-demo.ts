import 'dotenv/config';
import { HCS17Client } from '../../src/hcs-17';
import { Client } from '@hashgraph/sdk';

async function main() {
  const network =
    (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet';
  const operatorId =
    process.env.HEDERA_OPERATOR_ID || process.env.HEDERA_ACCOUNT_ID;
  const operatorKey =
    process.env.HEDERA_OPERATOR_KEY || process.env.HEDERA_PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    console.error(
      'Missing HEDERA_OPERATOR_ID/HEDERA_OPERATOR_KEY in environment',
    );
    process.exit(1);
  }

  const client = new HCS17Client({
    network,
    operatorId,
    operatorKey,
    logLevel: 'info',
  });

  console.log('Creating HCS-17 state topic...');
  const publishTopicId = await client.createStateTopic();
  console.log('State topic:', publishTopicId);

  // Demo: compute state from no prior topics (just public key), publish to the created topic
  console.log('Computing and publishing state hash...');
  const result = await client.computeAndPublish({
    accountId: operatorId,
    accountPublicKey: client['client'].operatorPublicKey?.toString?.() || 'pk',
    topics: [],
    publishTopicId,
    memo: 'State synchronization',
  });
  console.log('Published state hash:', result.stateHash);

  // Validate querying helpers (allow brief mirror-node delay)
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  let recentCount = 0;
  let recentMsgs: Array<{
    message: any;
    consensus_timestamp?: string;
    sequence_number: number;
  }> = [];
  for (let i = 0; i < 3; i++) {
    const recent = await client.getRecentMessages(publishTopicId, {
      limit: 1,
      order: 'desc',
    });
    recentCount = recent.length;
    recentMsgs = recent as any;
    if (recentCount > 0) {
      const latest = await client.getLatestMessage(publishTopicId);
      if (latest) {
        console.log(
          'Latest message consensus/seq:',
          latest.consensus_timestamp,
          latest.sequence_number,
        );
        console.log('Latest HCS-17 message:', JSON.stringify(latest, null, 2));
      }
      break;
    }
    await sleep(1000);
  }
  console.log('Recent HCS-17 messages found:', recentCount);
  if (recentMsgs.length > 0) {
    console.log('Recent HCS-17 messages (parsed):');
    for (const m of recentMsgs) {
      console.log(`- seq=${m.sequence_number} ts=${m.consensus_timestamp}`);
      console.log(JSON.stringify(m.message, null, 2));
    }
  }

  console.log('Success');
  process.exit(0);
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
