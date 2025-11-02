import 'dotenv/config';
import { Client, PrivateKey, KeyList } from '@hashgraph/sdk';
import { HCS16Client } from '../../src/hcs-16/sdk';
import { HCS16BaseClient } from '../../src/hcs-16/base-client';
import { FloraTopicType } from '../../src/hcs-16/types';

async function main() {
  const network =
    (process.env.HEDERA_NETWORK as 'mainnet' | 'testnet') || 'testnet';
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

  const client = new HCS16Client({ network, operatorId, operatorKey });

  const k1 = PrivateKey.generateECDSA();
  const k2 = PrivateKey.generateECDSA();
  const k3 = PrivateKey.generateECDSA();
  const keyList = new KeyList([k1.publicKey, k2.publicKey, k3.publicKey], 2);

  const payerClient =
    network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  payerClient.setOperator(operatorId, operatorKey);
  const { buildHcs16CreateAccountTx } = await import('../../src/hcs-16/tx');
  const accountTx = buildHcs16CreateAccountTx({
    keyList,
    initialBalanceHbar: 2,
    maxAutomaticTokenAssociations: -1,
  });
  const accountResp = await accountTx.execute(payerClient);
  const accountReceipt = await accountResp.getReceipt(payerClient);
  if (!accountReceipt.accountId) {
    throw new Error('Failed to create Flora account');
  }
  const floraAccountId = accountReceipt.accountId.toString();
  console.log('Flora account created:', floraAccountId);

  const comm = await client.createFloraTopic({
    floraAccountId,
    topicType: FloraTopicType.COMMUNICATION,
  });
  const tx = await client.createFloraTopic({
    floraAccountId,
    topicType: FloraTopicType.TRANSACTION,
  });
  const state = await client.createFloraTopic({
    floraAccountId,
    topicType: FloraTopicType.STATE,
  });
  console.log('Flora topics:', { communication: comm, transaction: tx, state });

  const receipt = await client.sendFloraCreated({
    topicId: comm,
    operatorId: `${operatorId}@${floraAccountId}`,
    floraAccountId,
    topics: { communication: comm, transaction: tx, state },
  });
  console.log('flora_created receipt status:', receipt.status.toString());
  const stateHash = '0x' + Date.now().toString(16);
  await client.sendStateUpdate({
    topicId: state,
    operatorId: `${operatorId}@${floraAccountId}`,
    hash: stateHash,
  });
  console.log('state_update sent with hash:', stateHash);

  const helper = new HCS16BaseClient({ network });
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  let printed = false;
  for (let i = 0; i < 5; i++) {
    try {
      const commMsgs = await helper.getRecentMessages(comm, {
        limit: 1,
        order: 'desc',
      });
      const stateMsgs = await helper.getRecentMessages(state, {
        limit: 1,
        order: 'desc',
      });
      if (commMsgs.length > 0) {
        console.log('Latest flora_created message:', commMsgs[0]);
        printed = true;
      }
      if (stateMsgs.length > 0) {
        console.log('Latest state_update message:', stateMsgs[0]);
        printed = true;
      }
      if (printed) {
        break;
      }
    } catch {}
    await sleep(1000);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('HCS-16 demo failed:', err);
  process.exit(1);
});
