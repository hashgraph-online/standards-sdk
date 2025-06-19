/**
 * Assembly Lifecycle Integration Tests for HCS-12
 *
 * Tests complete assembly lifecycle operations on real Hedera Testnet
 * NO MOCKS - REAL INTEGRATION TESTS
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { HCS12Client } from '../../../src/hcs-12/sdk';
import { AssemblyComposer } from '../../../src/hcs-12/assembly/composer';
import { Logger } from '../../../src/utils/logger';
import { NetworkType } from '../../../src/utils/types';
import {
  ActionRegistration,
  BlockRegistration,
  AssemblyRegistration,
  RegistryType,
} from '../../../src/hcs-12/types';
import * as dotenv from 'dotenv';

dotenv.config();

describe('Assembly Lifecycle Integration Tests', () => {
  let client: HCS12Client;
  let composer: AssemblyComposer;
  let logger: Logger;

  let actionTopicId: string;
  let blockTopicId: string;
  let assemblyTopicId: string;

  let actionId: string;
  let blockId: string;

  const hasCredentials =
    process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY;
  const describeOrSkip = hasCredentials ? describe : describe.skip;

  beforeAll(async () => {
    logger = new Logger({ module: 'AssemblyLifecycleTest' });

    if (hasCredentials) {
      client = new HCS12Client({
        network: 'testnet' as NetworkType,
        operatorId: process.env.HEDERA_ACCOUNT_ID!,
        operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY!,
        logger,
      });

      composer = new AssemblyComposer(logger);
    }
  }, 30000);

  describeOrSkip('Complete Assembly Lifecycle on Real Testnet', () => {
    it('should create registry topics', async () => {
      actionTopicId = await client.createRegistryTopic(RegistryType.ACTION);
      blockTopicId = await client.createRegistryTopic(RegistryType.BLOCK);
      assemblyTopicId = await client.createRegistryTopic(RegistryType.ASSEMBLY);

      expect(actionTopicId).toMatch(/^\d+\.\d+\.\d+$/);
      expect(blockTopicId).toMatch(/^\d+\.\d+\.\d+$/);
      expect(assemblyTopicId).toMatch(/^\d+\.\d+\.\d+$/);

      client.initializeRegistries({
        action: actionTopicId,
        block: blockTopicId,
        assembly: assemblyTopicId,
      });

      logger.info('Created real registry topics', {
        actionTopicId,
        blockTopicId,
        assemblyTopicId,
      });
    }, 60000);

    it('should register real action on testnet', async () => {
      const wasmModule = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ]);

      const moduleInfo = {
        name: 'lifecycle-test-action',
        version: '1.0.0',
        hashlinks_version: '0.1.0',
        creator: client.getOperatorAccountId(),
        purpose: 'Test assembly lifecycle',
        actions: [
          {
            name: 'execute',
            description: 'Execute lifecycle test',
            inputs: [],
            outputs: [
              {
                name: 'result',
                param_type: 'string' as const,
                description: 'Test result',
                required: false,
              },
            ],
            required_capabilities: [],
          },
        ],
        capabilities: [],
        plugins: [],
      };

      const actionReg = await client.actionRegistry!.registerWithWasm(
        Buffer.from(wasmModule),
        moduleInfo,
      );

      actionId = await client.actionRegistry!.register(actionReg);

      expect(actionId).toBeDefined();
      logger.info('Registered real action', {
        actionId,
        wasmTopic: actionReg.t_id,
      });
    }, 60000);

    it('should register real block on testnet', async () => {
      const blockReg: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'lifecycle/test-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'lifecycle/test-block',
          title: 'Lifecycle Test Block',
          category: 'common',
          description: 'Block for testing assembly lifecycle',
          icon: 'block-default',
          keywords: ['test', 'lifecycle'],
          attributes: {
            message: {
              type: 'string',
              default: 'Hello from lifecycle test',
            },
          },
          supports: {},
        },
      };

      blockId = await client.blockRegistry!.register(blockReg);

      expect(blockId).toBeDefined();
      logger.info('Registered real block', { blockId });
    }, 60000);

    it('should create and compose real assembly', async () => {
      const assemblyReg: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'lifecycle-test-assembly',
        version: '1.0.0',
        description: 'Assembly for testing lifecycle',
        actions: [
          {
            id: 'test-action',
            registryId: actionId,
            version: '1.0.0',
          },
        ],
        blocks: [
          {
            id: 'test-block',
            registryId: blockId,
            version: '1.0.0',
            actions: ['test-action'],
          },
        ],
      };

      const assemblyId = await client.assemblyRegistry!.register(assemblyReg);
      expect(assemblyId).toBeDefined();

      const actionRegs = new Map([
        [
          actionId,
          (await client.actionRegistry!.getEntry(actionId))!
            .data as ActionRegistration,
        ],
      ]);
      const blockRegs = new Map([
        [
          blockId,
          (await client.blockRegistry!.getEntry(blockId))!
            .data as BlockRegistration,
        ],
      ]);

      const composed = await composer.compose(
        assemblyReg,
        actionRegs,
        blockRegs,
        {
          validateActions: true,
          validateBlocks: true,
          strictDependencies: true,
        },
      );

      expect(composed.validated).toBe(true);
      expect(composed.errors).toHaveLength(0);
      expect(composed.actions.size).toBe(1);
      expect(composed.blocks.size).toBe(1);

      logger.info('Created and composed real assembly', { assemblyId });
    }, 60000);

    it('should verify assembly components are retrievable', async () => {
      await client.actionRegistry!.sync();
      await client.blockRegistry!.sync();
      await client.assemblyRegistry!.sync();

      const actionEntries = await client.actionRegistry!.listEntries();
      const hasAction = actionEntries.some(e => e.id === actionId);
      expect(hasAction).toBe(true);

      const blockEntries = await client.blockRegistry!.listEntries();
      const hasBlock = blockEntries.some(e => e.id === blockId);
      expect(hasBlock).toBe(true);

      const assemblyEntries = await client.assemblyRegistry!.listEntries();
      expect(assemblyEntries.length).toBeGreaterThan(0);

      logger.info('Verified all components are retrievable', {
        actionCount: actionEntries.length,
        blockCount: blockEntries.length,
        assemblyCount: assemblyEntries.length,
      });
    }, 60000);
  });

  afterAll(async () => {
    logger.info('Assembly lifecycle integration tests completed', {
      actionTopicId,
      blockTopicId,
      assemblyTopicId,
    });
  });
});
