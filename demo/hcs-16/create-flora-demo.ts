import 'dotenv/config';
import {
  Client,
  PrivateKey,
  KeyList,
  AccountCreateTransaction,
  Hbar,
} from '@hashgraph/sdk';
import { HCS16Client } from '../../src/hcs-16/sdk';
import { HCS11Client } from '../../src/hcs-11/client';
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
  const hcs11 = new HCS11Client({
    network,
    auth: { operatorId, privateKey: operatorKey } as any,
  } as any);

  console.log('1) 🔐 Creating Flora member keys (2-of-3 threshold)');
  const threshold = 2;
  const k1 = PrivateKey.generateECDSA();
  const k2 = PrivateKey.generateECDSA();
  const k3 = PrivateKey.generateECDSA();
  const memberKeys = [k1, k2, k3];

  const payerClient =
    network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  payerClient.setOperator(operatorId, operatorKey);
  console.log('   ↳ 🧾 Creating member accounts');
  const memberAccounts: string[] = [];
  for (const [index, key] of memberKeys.entries()) {
    const resp = await new AccountCreateTransaction()
      .setKey(key.publicKey)
      .setInitialBalance(new Hbar(5))
      .execute(payerClient);
    const receipt = await resp.getReceipt(payerClient);
    if (!receipt.accountId) {
      throw new Error(`Failed to create Flora member account ${index + 1}`);
    }
    const accountId = receipt.accountId.toString();
    memberAccounts.push(accountId);
    console.log(`      • Member ${index + 1}: ${accountId}`);
  }

  const keyList = new KeyList(
    memberKeys.map(key => key.publicKey),
    threshold,
  );
  const submitKeyList = new KeyList(
    memberKeys.map(key => key.publicKey),
    1,
  );

  const { buildHcs16CreateAccountTx } = await import('../../src/hcs-16/tx');
  const accountTx = buildHcs16CreateAccountTx({
    keyList,
    initialBalanceHbar: 2,
    maxAutomaticTokenAssociations: -1,
  });
  console.log('   ↳ 🧾 Submitting AccountCreateTransaction');
  const accountResp = await accountTx.execute(payerClient);
  const accountReceipt = await accountResp.getReceipt(payerClient);
  if (!accountReceipt.accountId) {
    throw new Error('Failed to create Flora account');
  }
  const floraAccountId = accountReceipt.accountId.toString();
  console.log('   ✅ Flora account created:', floraAccountId);

  console.log('2) 🧵 Creating Flora topics (CTopic/TTopic/STopic)');
  const comm = await client.createFloraTopic({
    floraAccountId,
    topicType: FloraTopicType.COMMUNICATION,
    adminKey: keyList,
    submitKey: submitKeyList,
    signerKeys: memberKeys.slice(0, threshold),
  });
  const tx = await client.createFloraTopic({
    floraAccountId,
    topicType: FloraTopicType.TRANSACTION,
    adminKey: keyList,
    submitKey: submitKeyList,
    signerKeys: memberKeys.slice(0, threshold),
  });
  const state = await client.createFloraTopic({
    floraAccountId,
    topicType: FloraTopicType.STATE,
    adminKey: keyList,
    submitKey: submitKeyList,
    signerKeys: memberKeys.slice(0, threshold),
  });
  console.log('   ✅ Topics ready:', {
    communication: comm,
    transaction: tx,
    state,
  });

  // Publish minimal Flora profile and update Flora memo (hcs-11:<resource>)
  const profile: any = {
    version: '1.0',
    type: 3,
    display_name: 'Example Flora',
    // Minimal valid profile per HCS-11 Flora schema
    members: memberAccounts.map(accountId => ({ accountId })),
    threshold,
    topics: { communication: comm, transaction: tx, state },
    inboundTopicId: comm,
    outboundTopicId: tx,
  };
  try {
    console.log('3) 🗂️ Publishing HCS-11 Flora profile and updating memo');
    const { profileResource } = await client.publishFloraProfileAndMemo({
      hcs11,
      floraAccountId,
      profile,
    });
    console.log('   ✅ Profile published:', profileResource);
  } catch (e) {
    console.warn(
      '   ⚠️ Skipping profile inscription in demo environment:',
      (e as Error).message,
    );
    console.warn(
      '   ℹ️ Ensure registrar availability and correct operator signatures to enable inscription.',
    );
  }

  const signingMemberAccount = memberAccounts[0];
  const signingKey = memberKeys[0];

  console.log('4) 📣 Publishing flora_created (CTopic)');
  const receipt = await client.sendFloraCreated({
    topicId: comm,
    operatorId: `${signingMemberAccount}@${floraAccountId}`,
    floraAccountId,
    topics: { communication: comm, transaction: tx, state },
    signerKey: signingKey,
  });
  console.log('   ✅ flora_created status:', receipt.status.toString());
  const stateHash = '0x' + Date.now().toString(16);
  console.log('5) 🧩 Publishing state_update (STopic)');
  await client.sendStateUpdate({
    topicId: state,
    operatorId: `${signingMemberAccount}@${floraAccountId}`,
    hash: stateHash,
    signerKey: signingKey,
  });
  console.log('   ✅ state_update hash:', stateHash);
  console.log('6) 🧾 Publishing state_hash (HCS-17 on STopic)');
  await client.sendStateHash({
    topicId: state,
    stateHash,
    accountId: floraAccountId,
    topics: [comm, tx, state],
    signerKey: signingKey,
  });
  console.log('   ✅ state_hash committed via HCS-17');

  const helper = new HCS16BaseClient({ network });
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  let printed = false;
  console.log('7) 🔎 Reading back latest messages');
  for (let i = 0; i < 6; i++) {
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
        console.log('   📨 Latest flora_created message:', commMsgs[0]);
        printed = true;
      }
      if (stateMsgs.length > 0) {
        console.log('   📨 Latest state_update message:', stateMsgs[0]);
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
