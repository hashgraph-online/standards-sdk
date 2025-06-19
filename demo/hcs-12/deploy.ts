/**
 * Deployment script for Counter HashLink
 *
 * Deploys the counter application to Hedera testnet
 */

import { config } from 'dotenv';
import { HashLinkClient } from '../../src/hcs-12/client/hashlink-client';
import { ActionRegistry } from '../../src/hcs-12/action-registry';
import { BlockRegistry } from '../../src/hcs-12/block-registry';
import { AssemblyRegistry } from '../../src/hcs-12/assembly-registry';
import { Logger } from '../../src/utils/logger';
import { buildCounterAction, counterWasmBytes } from './actions/counter-action';
import { buildCounterBlock } from './blocks/counter-block';
import { buildCounterAssembly } from './assembly/counter-assembly';
import { PrivateKey } from '@hashgraph/sdk';

config();

async function deployCounterApp() {
  const logger = new Logger({ module: 'CounterDeploy' });

  console.log('🚀 Deploying Counter HashLink to Hedera Testnet\n');

  try {
    const client = new HashLinkClient({
      network: 'testnet' as any,
      operator: {
        accountId: process.env.HEDERA_OPERATOR_ID!,
        privateKey: process.env.HEDERA_OPERATOR_KEY!,
      },
      logger,
    });

    await client.initialize();
    console.log('✅ Client initialized\n');

    const actionRegistry = new ActionRegistry('testnet' as any, logger);
    const blockRegistry = new BlockRegistry('testnet' as any, logger);
    const assemblyRegistry = new AssemblyRegistry('testnet' as any, logger);

    const signingKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY!);

    console.log('📦 Uploading WASM module...');
    const wasmFileId = await client.uploadFile(counterWasmBytes);
    console.log(`✅ WASM uploaded: ${wasmFileId}\n`);

    console.log('⚡ Registering counter action...');
    const action = buildCounterAction();
    action.wasmFileId = wasmFileId;
    action.creator = signingKey.publicKey.toString();
    action.signature = 'pending';

    const actionTx = await actionRegistry.register(action);
    console.log(`✅ Action registered: ${actionTx.transactionId}`);
    console.log(`   Topic ID: ${actionTx.topicId}`);
    console.log(`   Action ID: ${action.id}\n`);

    console.log('🎨 Uploading block resources...');
    const block = buildCounterBlock();

    const templateFileId = await client.uploadFile(
      Buffer.from(block.template || ''),
    );
    block.template = templateFileId;

    const stylesFileId = await client.uploadFile(
      Buffer.from(block.styles || ''),
    );
    block.styles = stylesFileId;

    console.log(`✅ Template uploaded: ${templateFileId}`);
    console.log(`✅ Styles uploaded: ${stylesFileId}\n`);

    console.log('🧱 Registering counter block...');
    block.creator = signingKey.publicKey.toString();
    block.signature = 'pending';

    const blockTx = await blockRegistry.register(block);
    console.log(`✅ Block registered: ${blockTx.transactionId}`);
    console.log(`   Topic ID: ${blockTx.topicId}`);
    console.log(`   Block ID: ${block.id}\n`);

    console.log('🔗 Registering counter assembly...');
    const assembly = buildCounterAssembly();
    assembly.creator = signingKey.publicKey.toString();
    assembly.signature = 'pending';

    const assemblyTx = await assemblyRegistry.register(assembly);
    console.log(`✅ Assembly registered: ${assemblyTx.transactionId}`);
    console.log(`   Topic ID: ${assemblyTx.topicId}`);
    console.log(`   Assembly ID: ${assembly.id}\n`);

    console.log('🎉 Counter HashLink deployed successfully!\n');
    console.log('📋 Deployment Summary:');
    console.log('━'.repeat(50));
    console.log(`Network:     Testnet`);
    console.log(`Action ID:   ${action.id}`);
    console.log(`Block ID:    ${block.id}`);
    console.log(`Assembly ID: ${assembly.id}`);
    console.log(
      `Topic IDs:   ${actionTx.topicId}, ${blockTx.topicId}, ${assemblyTx.topicId}`,
    );
    console.log('━'.repeat(50));

    console.log('\n📖 Usage Instructions:');
    console.log('```javascript');
    console.log(`const client = new HashLinkClient({ network: 'testnet' });`);
    console.log(
      `const assembly = await client.loadAssembly('${assembly.id}');`,
    );
    console.log(`await client.render(assembly, { container: '#app' });`);
    console.log('```\n');

    const deploymentInfo = {
      network: 'testnet',
      timestamp: new Date().toISOString(),
      action: {
        id: action.id,
        topicId: actionTx.topicId,
        wasmFileId,
      },
      block: {
        id: block.id,
        topicId: blockTx.topicId,
        templateFileId,
        stylesFileId,
      },
      assembly: {
        id: assembly.id,
        topicId: assemblyTx.topicId,
      },
    };

    await client.saveDeploymentInfo(deploymentInfo, './deployment.json');
    console.log('💾 Deployment info saved to deployment.json');
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

deployCounterApp().then(() => {
  console.log('\n✨ Done!');
  process.exit(0);
});
