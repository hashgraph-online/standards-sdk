#!/usr/bin/env tsx
/**
 * HCS-12 Demo - Creates topics and sends transactions
 */

import { config } from 'dotenv';
import { Logger } from '../../src/utils/logger';
import { HCS12Client } from '../../src/hcs-12/sdk';
import {
  ActionRegistration,
  BlockRegistration,
  AssemblyRegistration,
  HashLinksRegistration,
  RegistryType,
} from '../../src/hcs-12/types';

config();

const operatorId = process.env.HEDERA_ACCOUNT_ID;
const operatorKey = process.env.HEDERA_PRIVATE_KEY;

if (!operatorId || !operatorKey) {
  console.error(
    '❌ HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables must be set',
  );
  process.exit(1);
}

async function main() {
  const logger = new Logger({ module: 'HCS12RealDemo' });

  console.log('\n🚀 HCS-12 Demo - Using account:', operatorId);
  console.log('================================================\n');

  const client = new HCS12Client({
    network: 'testnet',
    operatorId,
    operatorPrivateKey: operatorKey,
    logger,
  });

  console.log('📝 Creating Action Registry Topic...');
  const actionTopicId = await client.createRegistryTopic(RegistryType.ACTION);
  console.log('✅ Action Registry Topic:', actionTopicId);

  console.log('\n📝 Creating Block Registry Topic...');
  const blockTopicId = await client.createRegistryTopic(RegistryType.BLOCK);
  console.log('✅ Block Registry Topic:', blockTopicId);

  console.log('\n📝 Creating Assembly Registry Topic...');
  const assemblyTopicId = await client.createRegistryTopic(
    RegistryType.ASSEMBLY,
  );
  console.log('✅ Assembly Registry Topic:', assemblyTopicId);

  console.log('\n📝 Creating HashLinks Registry Topic...');
  const hashLinksTopicId = await client.createRegistryTopic(
    RegistryType.HASHLINKS,
  );
  console.log('✅ HashLinks Registry Topic:', hashLinksTopicId);

  client.initializeRegistries({
    action: actionTopicId,
    block: blockTopicId,
    assembly: assemblyTopicId,
    hashlinks: hashLinksTopicId,
  });

  console.log('\n📦 Registering WASM Action with real inscription...');

  const wasmModule = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60,
    0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x47, 0x45,
    0x54, 0x00, 0x00, 0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,
  ]);

  const moduleInfo = {
    name: 'demo-transfer-action',
    version: '1.0.0',
    hashlinks_version: '0.1.0',
    creator: operatorId,
    purpose: 'Demo transfer action for HCS-12',
    actions: [
      {
        name: 'transfer',
        description: 'Transfer HBARs to another account',
        inputs: [
          {
            name: 'to',
            param_type: 'address' as const,
            description: 'Recipient account ID',
            required: true,
          },
          {
            name: 'amount',
            param_type: 'bigint' as const,
            description: 'Amount in tinybars',
            required: true,
          },
        ],
        outputs: [
          {
            name: 'transactionId',
            param_type: 'string' as const,
            description: 'Transaction ID',
            required: false,
          },
        ],
        required_capabilities: [],
      },
    ],
    capabilities: [],
    plugins: [],
  };

  const actionRegistration = await client.actionRegistry!.registerWithWasm(
    Buffer.from(wasmModule),
    moduleInfo,
  );

  console.log('✅ Action registered with real WASM inscription:');
  console.log('  - WASM Topic ID:', actionRegistration.t_id);
  console.log('  - WASM Hash:', actionRegistration.wasm_hash);
  console.log('  - Info Hash:', actionRegistration.hash);

  console.log('\n🧱 Registering Block...');
  const blockRegistration: BlockRegistration = {
    p: 'hcs-12',
    op: 'register',
    name: 'hashlinks/transfer-button',
    version: '1.0.0',
    data: {
      apiVersion: 3,
      name: 'hashlinks/transfer-button',
      title: 'Transfer Button',
      category: 'widgets',
      description: 'A button that triggers the transfer action',
      icon: 'button',
      keywords: ['transfer', 'button', 'demo'],
      attributes: {
        label: {
          type: 'string',
          default: 'Transfer',
        },
        amount: {
          type: 'number',
          default: 1,
        },
      },
      supports: {
        align: true,
        customClassName: true,
      },
    },
    t_id: actionRegistration.t_id,
  };

  const blockId = await client.blockRegistry!.register(blockRegistration);
  console.log('✅ Block registered with ID:', blockId);

  console.log('\n🔧 Registering Assembly...');

  const assemblyDefinition = {
    name: 'demo-transfer-app',
    description: 'A complete transfer application using HCS-12',
    version: '1.0.0',
    tags: ['demo', 'transfer'],

    actions: [
      {
        id: 'transfer',
        registryId: actionTopicId,
        version: '1.0.0',
      },
    ],

    blocks: [
      {
        id: 'transfer-button',
        registryId: blockTopicId,
        version: '1.0.0',
        actions: ['transfer'],
      },
    ],
  };

  const assemblyRegistration: AssemblyRegistration = {
    p: 'hcs-12',
    op: 'register',
    name: assemblyDefinition.name,
    description: assemblyDefinition.description,
    version: assemblyDefinition.version,
    tags: assemblyDefinition.tags,
    actions: assemblyDefinition.actions,
    blocks: assemblyDefinition.blocks,
    m: 'Demo transfer application assembly',
  };

  const assemblyId =
    await client.assemblyRegistry!.register(assemblyRegistration);
  console.log('✅ Assembly registered with ID:', assemblyId);

  console.log('\n🌐 Registering in HashLinks Directory...');
  const hashLinksRegistration: HashLinksRegistration = {
    p: 'hcs-12',
    op: 'register',
    t_id: assemblyTopicId,
    name: 'Demo Transfer Application',
    description: 'A demonstration of HCS-12 HashLinks with real WASM actions',
    tags: ['demo', 'transfer', 'hedera'],
    category: 'finance',
    featured: true,
    author: operatorId,
  };

  const hashLinkId = await client.hashLinksRegistry!.register(
    hashLinksRegistration,
  );
  console.log('✅ HashLink registered in directory with ID:', hashLinkId);

  console.log('\n🔄 Syncing registries...');

  await client.actionRegistry!.sync();
  const actionEntries = await client.actionRegistry!.listEntries();
  console.log(`✅ Action Registry: ${actionEntries.length} entries`);

  await client.blockRegistry!.sync();
  const blockEntries = await client.blockRegistry!.listEntries();
  console.log(`✅ Block Registry: ${blockEntries.length} entries`);

  await client.assemblyRegistry!.sync();
  const assemblyEntries = await client.assemblyRegistry!.listEntries();
  console.log(`✅ Assembly Registry: ${assemblyEntries.length} entries`);

  await client.hashLinksRegistry!.sync();
  const hashLinksEntries = await client.hashLinksRegistry!.listEntries();
  console.log(`✅ HashLinks Registry: ${hashLinksEntries.length} entries`);

  console.log('\n📊 Summary');
  console.log('==========');
  console.log('Account:', operatorId);
  console.log('Action Registry Topic:', actionTopicId);
  console.log('Block Registry Topic:', blockTopicId);
  console.log('Assembly Registry Topic:', assemblyTopicId);
  console.log('HashLinks Registry Topic:', hashLinksTopicId);
  console.log('WASM Inscription Topic:', actionRegistration.t_id);
  console.log('\n✅ Demo completed successfully!');
  console.log('Check your account on HashScan to see the transactions.');
}

main().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
