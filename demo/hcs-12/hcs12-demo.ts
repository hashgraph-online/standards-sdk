#!/usr/bin/env node
/**
 * HCS-12 HashLinks Complete Demo
 *
 * This script demonstrates the complete HashLinks workflow:
 * 1. Build and compile Rust WASM module
 * 2. Extract INFO from the WASM module (per HCS-12 standard)
 * 3. Inscribe the WASM module via HCS-1
 * 4. Register the action with the INFO hash
 * 5. Register blocks
 * 6. Create assembly using incremental approach
 */

import dotenv from 'dotenv';
import { Logger } from '../../src/utils/logger';
import type { NetworkType } from '../../src/utils/types';
import { inscribe } from '../../src/inscribe';
import { HCS12Client } from '../../src/hcs-12/sdk';
import {
  ActionRegistration,
  AssemblyRegistration,
  AssemblyAddBlock,
  AssemblyAddAction,
  RegistryType,
} from '../../src/hcs-12/types';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

dotenv.config();

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NETWORK: NetworkType = 'testnet';
const WASM_DIR = path.join(__dirname, 'rust-wasm');
const WASM_FILE = path.join(WASM_DIR, 'pkg', 'hashlink_counter_bg.wasm');
const JS_FILE = path.join(WASM_DIR, 'pkg', 'hashlink_counter.js');

async function buildWasmModule(logger: Logger): Promise<void> {
  logger.info('Building Rust WASM module...');

  try {
    await execAsync('rustc --version');
    await execAsync('wasm-pack --version');
  } catch (error) {
    logger.error('Rust or wasm-pack not installed. Please install them first:');
    logger.error('- Install Rust: https://rustup.rs/');
    logger.error('- Install wasm-pack: cargo install wasm-pack');
    throw error;
  }

  const { stdout, stderr } = await execAsync(
    'wasm-pack build --target web --out-dir pkg',
    {
      cwd: WASM_DIR,
    },
  );

  if (stderr && !stderr.includes('warning')) {
    logger.warn('Build warnings:', { stderr });
  }

  logger.info('WASM module built successfully');
}

async function inscribeWasmModule(
  wasmBuffer: Buffer,
  logger: Logger,
  operatorId: string,
  operatorKey: string,
): Promise<{ topicId: string; wasmHash: string }> {
  logger.info('Inscribing WASM module via HCS-1...');

  const wasmHash = createHash('sha256').update(wasmBuffer).digest('hex');

  const response = await inscribe(
    {
      type: 'buffer',
      buffer: wasmBuffer,
      fileName: 'counter-module.wasm',
      mimeType: 'application/wasm',
    },
    {
      accountId: operatorId,
      privateKey: operatorKey,
      network: 'testnet',
    },
    {
      mode: 'file',
      metadata: {
        name: 'counter-module.wasm',
        description: 'HCS-12 Counter Module',
        hash: wasmHash,
      },
      waitForConfirmation: true,
    },
  );

  if (!response.confirmed || !response.inscription.topic_id) {
    throw new Error('Failed to inscribe WASM module');
  }

  const topicId = response.inscription.topic_id;
  logger.info('WASM module inscribed', { topicId, wasmHash });

  return { topicId, wasmHash };
}

async function inscribeJsWrapper(
  jsBuffer: Buffer,
  logger: Logger,
  operatorId: string,
  operatorKey: string,
): Promise<{ topicId: string; jsHash: string }> {
  logger.info('Inscribing JavaScript wrapper via HCS-1...');

  const jsHash = createHash('sha256').update(jsBuffer).digest('hex');

  const response = await inscribe(
    {
      type: 'buffer',
      buffer: jsBuffer,
      fileName: 'counter-module.js',
      mimeType: 'application/javascript',
    },
    {
      accountId: operatorId,
      privateKey: operatorKey,
      network: 'testnet',
    },
    {
      mode: 'file',
      metadata: {
        name: 'counter-module.js',
        description: 'HCS-12 Counter Module JavaScript Wrapper',
        hash: jsHash,
      },
      waitForConfirmation: true,
    },
  );

  if (!response.confirmed || !response.inscription.topic_id) {
    throw new Error('Failed to inscribe JavaScript wrapper');
  }

  const topicId = response.inscription.topic_id;
  logger.info('JavaScript wrapper inscribed', { topicId, jsHash });

  return { topicId, jsHash };
}

/**
 * Extract module INFO from the WASM module itself
 *
 * According to HCS-12 standard, the WASM module must export an INFO method
 * that returns the module metadata. This ensures the hash in the action
 * registration can be verified by loading and calling the WASM module.
 */
async function getModuleInfoFromWasm(
  wasmPath: string,
  jsPath: string,
  logger: Logger,
): Promise<{ info: string; hash: string }> {
  logger.info('Loading WASM module with JavaScript wrapper...');

  try {
    // Read the WASM binary
    const wasmBuffer = await fs.readFile(wasmPath);

    // Dynamic import the JavaScript wrapper
    const jsModulePath = path.resolve(jsPath);
    const wasmModule = await import(jsModulePath);

    // Initialize the WASM module using initSync with the buffer
    wasmModule.initSync(wasmBuffer);

    // Create an instance of WasmInterface
    const wasmInterface = new wasmModule.WasmInterface();

    // Call the INFO method
    const infoString = wasmInterface.INFO();

    // Calculate hash
    const hash = createHash('sha256').update(infoString).digest('hex');

    logger.info('Module INFO extracted from WASM', {
      infoLength: infoString.length,
      hash,
    });

    // Clean up
    wasmInterface.free();

    return { info: infoString, hash };
  } catch (error) {
    logger.error('Failed to extract INFO from WASM module', { error });
    throw new Error(`Failed to load WASM module: ${error}`);
  }
}

async function main() {
  const logger = new Logger({
    module: 'HCS12-Demo',
    level: 'debug',
    prettyPrint: true,
  });

  try {
    logger.info('Starting HCS-12 HashLinks Demo');

    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
      throw new Error(
        'HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables must be set',
      );
    }

    const operatorId = process.env.HEDERA_ACCOUNT_ID;
    const operatorKey = process.env.HEDERA_PRIVATE_KEY;

    const client = new HCS12Client({
      network: NETWORK,
      operatorId,
      operatorPrivateKey: operatorKey,
      logger,
    });

    /**
     * Step 1: Create registry topics
     */
    logger.info('Creating registry topics...');

    const actionTopicId = await client.createRegistryTopic(RegistryType.ACTION);
    logger.info('Action registry topic created', { actionTopicId });

    const assemblyTopicId = await client.createRegistryTopic(
      RegistryType.ASSEMBLY,
    );
    logger.info('Assembly registry topic created', { assemblyTopicId });

    client.initializeRegistries({
      action: actionTopicId,
      assembly: assemblyTopicId,
    });

    /**
     * Step 2: Build and inscribe WASM module
     */
    await buildWasmModule(logger);

    const wasmBuffer = await fs.readFile(WASM_FILE);
    logger.info('WASM module loaded', { size: wasmBuffer.length });

    const jsBuffer = await fs.readFile(JS_FILE);
    logger.info('JavaScript wrapper loaded', { size: jsBuffer.length });

    const [{ topicId: wasmTopicId, wasmHash }, { topicId: jsTopicId, jsHash }] =
      await Promise.all([
        inscribeWasmModule(wasmBuffer, logger, operatorId, operatorKey),
        inscribeJsWrapper(jsBuffer, logger, operatorId, operatorKey),
      ]);

    /**
     * Step 3: Extract INFO from WASM and register action
     */
    const { info, hash: infoHash } = await getModuleInfoFromWasm(
      WASM_FILE,
      JS_FILE,
      logger,
    );

    const actionRegistration: ActionRegistration = {
      p: 'hcs-12',
      op: 'register',
      t_id: wasmTopicId,
      hash: infoHash,
      wasm_hash: wasmHash,
      js_t_id: jsTopicId,
      js_hash: jsHash,
      interface_version: '0.2.0',
      m: 'Counter Module v1.0.0',
    };

    const actionResult = await client.registerAction(actionRegistration);
    logger.info('Action registered', {
      sequenceNumber: actionResult.sequenceNumber,
      transactionId: actionResult.transactionId,
      wasmTopicId,
      infoHash,
    });

    /**
     * Step 4: Store block template and definition via HCS-1
     */
    const templatePath = path.join(__dirname, 'counter-block-template.html');
    const templateContent = await fs.readFile(templatePath, 'utf-8');

    logger.info('Storing block via HCS-1...');

    const blockDefinition = {
      apiVersion: 3,
      name: 'hashlink/counter-display',
      title: 'Counter Display',
      category: 'hashlink/widgets',
      description: 'Displays counter with increment/decrement controls',
      icon: 'calculator',
      keywords: ['counter', 'increment', 'decrement'],
      attributes: {
        count: {
          type: 'number',
          default: 0,
        },
        step: {
          type: 'number',
          default: 1,
        },
      },
      supports: {
        align: true,
        anchor: true,
      },
    };

    const { definitionTopicId: blockDefinitionTopicId, templateTopicId } =
      await client.storeBlock(templateContent, blockDefinition);

    logger.info('Block stored successfully', {
      blockDefinitionTopicId,
      templateTopicId,
    });

    /**
     * Step 5: Create assembly using incremental approach
     */
    logger.info('Creating assembly using incremental approach...');

    // Create a new assembly topic
    const newAssemblyTopicId = await client.createAssembly();
    logger.info('Created assembly topic', { newAssemblyTopicId });

    // Register the assembly
    const assemblyRegistration: AssemblyRegistration = {
      p: 'hcs-12',
      op: 'register',
      name: 'counter-app',
      version: '1.0.0',
      description: 'Complete counter application',
      author: operatorId,
      tags: ['demo', 'counter', 'hashlinks'],
    };

    await client.registerAssemblyDirect(
      newAssemblyTopicId,
      assemblyRegistration,
    );
    logger.info('Assembly registered');

    // Add the action to the assembly
    const addAction: AssemblyAddAction = {
      p: 'hcs-12',
      op: 'add-action',
      t_id: wasmTopicId,
      alias: 'counter-module',
      config: {},
      data: {},
    };

    await client.addActionToAssembly(newAssemblyTopicId, addAction);
    logger.info('Added counter action to assembly');

    const addBlock: AssemblyAddBlock = {
      p: 'hcs-12',
      op: 'add-block',
      block_t_id: blockDefinitionTopicId,
      actions: {
        increment: wasmTopicId,
        decrement: wasmTopicId,
        reset: wasmTopicId,
      },
      attributes: {
        count: 0,
        step: 1,
      },
    };

    await client.addBlockToAssembly(newAssemblyTopicId, addBlock);
    logger.info('Added counter display block to assembly');

    // Note: The assembly registry topic created earlier is for a future global
    // HashLinks directory. For now, assemblies are self-contained on their own topics.
    logger.info('Assembly created successfully', {
      assemblyTopicId: newAssemblyTopicId,
      note: 'Assembly is self-contained on its own topic',
    });

    /**
     * Step 6: Load and validate the assembly
     */
    logger.info('Waiting 5 seconds for mirror node to sync...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const assembly = await client.loadAssembly(newAssemblyTopicId);

    logger.info('Assembly object:', {
      hasAssembly: !!assembly,
      hasState: !!(assembly && assembly.state),
      assemblyKeys: assembly ? Object.keys(assembly) : [],
    });

    if (!assembly || !assembly.state) {
      throw new Error('Failed to load assembly or assembly state is missing');
    }

    logger.info('Loaded assembly', {
      topicId: assembly.topicId,
      name: assembly.state.name,
      // actions: assembly.state.actions.length, // actions are no longer stored in assembly state
      blocks: assembly.state.blocks.length,
    });

    logger.info('Demo completed successfully!');

    // Log topic IDs clearly for HTML demo
    console.log('\n=== TOPIC IDS FOR HTML DEMO ===');
    console.log(`Action Registry: ${actionTopicId}`);
    console.log(`Block Definition: ${blockDefinitionTopicId}`);
    console.log(`Block Template: ${templateTopicId}`);
    console.log(`Assembly Registry: ${assemblyTopicId}`);
    console.log(`Counter App Assembly: ${newAssemblyTopicId}`);
    console.log('===============================\n');

    logger.info('Summary:', {
      wasmTopicId,
      wasmHash,
      infoHash,
      actionRegistryTopic: actionTopicId,
      blockDefinitionTopic: blockDefinitionTopicId,
      blockTemplateTopic: templateTopicId,
      assemblyTopic: newAssemblyTopicId,
      network: NETWORK,
    });

    logger.info('Next steps:');
    logger.info('1. Use the assembly topic ID to load in a browser');
    logger.info('2. Execute actions through the WASM interface');
    logger.info('3. Deploy to mainnet when ready');
  } catch (error) {
    logger.error('Demo failed:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      error: error,
    });
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);
