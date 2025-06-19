/**
 * Registry Integration Tests for HCS-12
 *
 * Tests real registry operations on Hedera Testnet without mocks
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { HCS12Client } from '../../../src/hcs-12/sdk';
import { ActionRegistry } from '../../../src/hcs-12/registries/action-registry';
import { BlockRegistry } from '../../../src/hcs-12/registries/block-registry';
import { AssemblyRegistry } from '../../../src/hcs-12/registries/assembly-registry';
import { Logger } from '../../../src/utils/logger';
import { NetworkType } from '../../../src/utils/types';
import {
  ActionRegistration,
  BlockRegistration,
  AssemblyRegistration,
  RegistryType,
  StorageCapability,
} from '../../../src/hcs-12/types';
import * as dotenv from 'dotenv';

dotenv.config();

describe('Registry Integration Tests', () => {
  let client: HCS12Client;
  let actionRegistry: ActionRegistry;
  let blockRegistry: BlockRegistry;
  let assemblyRegistry: AssemblyRegistry;
  let logger: Logger;

  let actionTopicId: string;
  let blockTopicId: string;
  let assemblyTopicId: string;

  let testActionId: string;
  let testBlockId: string;

  const hasCredentials =
    process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY;
  const describeOrSkip = hasCredentials ? describe : describe.skip;

  beforeAll(async () => {
    logger = new Logger({ module: 'RegistryIntegrationTest' });

    if (hasCredentials) {
      client = new HCS12Client({
        network: 'testnet' as NetworkType,
        operatorId: process.env.HEDERA_ACCOUNT_ID!,
        operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY!,
        logger,
      });
    }
  }, 30000);

  describeOrSkip('Action Registry Integration', () => {
    it('should create action registry topic on testnet', async () => {
      actionTopicId = await client.createRegistryTopic(RegistryType.ACTION);

      expect(actionTopicId).toBeDefined();
      expect(actionTopicId).toMatch(/^\d+\.\d+\.\d+$/);

      logger.info('Created action registry topic', { actionTopicId });
    }, 60000);

    it('should register a new action with WASM', async () => {
      client.initializeRegistries({
        action: actionTopicId,
        block: blockTopicId || '0.0.0',
        assembly: assemblyTopicId || '0.0.0',
      });

      const wasmModule = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      ]);

      const moduleInfo = {
        name: 'test-action',
        version: '1.0.0',
        hashlinks_version: '0.1.0',
        creator: client.getOperatorAccountId(),
        purpose: 'Integration test action',
        actions: [
          {
            name: 'execute',
            description: 'Execute test action',
            inputs: [
              {
                name: 'input',
                param_type: 'string' as const,
                description: 'Test input',
                required: true,
              },
            ],
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
        capabilities: [
          {
            type: 'storage',
            value: {
              storage_types: ['hcs'],
              max_size_bytes: 1048576,
            } as StorageCapability,
          },
        ],
        plugins: [],
      };

      const actionReg = await client.actionRegistry!.registerWithWasm(
        Buffer.from(wasmModule),
        moduleInfo,
      );

      testActionId = await client.actionRegistry!.register(actionReg);

      expect(testActionId).toBeDefined();
      logger.info('Registered real action', {
        testActionId,
        wasmTopic: actionReg.t_id,
      });
    }, 60000);

    it('should query registered actions', async () => {
      await client.actionRegistry!.sync();

      const actions = await client.actionRegistry!.listEntries();

      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);

      const testAction = actions.find(a => a.id === testActionId);
      expect(testAction).toBeDefined();
      expect(testAction?.data.name).toBe('test-action');
      expect(testAction?.data.version).toBe('1.0.0');
      expect(testAction?.data.capabilities).toContain('READ_STATE');
    }, 60000);
  });

  describeOrSkip('Block Registry Integration', () => {
    it('should create block registry topic on testnet', async () => {
      blockTopicId = await client.createRegistryTopic(RegistryType.BLOCK);

      expect(blockTopicId).toBeDefined();
      expect(blockTopicId).toMatch(/^\d+\.\d+\.\d+$/);

      client.initializeRegistries({
        action: actionTopicId,
        block: blockTopicId,
        assembly: assemblyTopicId || '0.0.0',
      });

      logger.info('Created block registry topic', { blockTopicId });
    }, 60000);

    it('should register a Gutenberg block', async () => {
      const blockReg: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/test-block',
        version: '1.0.0',
        data: {
          apiVersion: 3,
          name: 'hashlinks/test-block',
          title: 'Test Block',
          category: 'widgets',
          description: 'Integration test block',
          icon: 'block-default',
          keywords: ['test', 'integration'],
          attributes: {
            message: {
              type: 'string',
              default: 'Hello HashLink!',
            },
          },
          supports: {
            align: true,
            className: true,
            customClassName: true,
          },
          actions: testActionId ? [testActionId] : [],
        },
      };

      testBlockId = await client.blockRegistry!.register(blockReg);

      expect(testBlockId).toBeDefined();
      logger.info('Registered real block', { testBlockId });
    }, 60000);

    it('should query blocks by category', async () => {
      await client.blockRegistry!.sync();

      const blocks = await client.blockRegistry!.listEntries();

      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);

      const testBlock = blocks.find(b => b.id === testBlockId);
      expect(testBlock).toBeDefined();
      expect(testBlock?.data.name).toBe('hashlinks/test-block');
      expect(testBlock?.data.data.category).toBe('widgets');
      expect(testBlock?.data.data.keywords).toContain('test');
    }, 60000);
  });

  describeOrSkip('Assembly Registry Integration', () => {
    it('should create assembly registry topic on testnet', async () => {
      assemblyTopicId = await client.createRegistryTopic(RegistryType.ASSEMBLY);

      expect(assemblyTopicId).toBeDefined();
      expect(assemblyTopicId).toMatch(/^\d+\.\d+\.\d+$/);

      client.initializeRegistries({
        action: actionTopicId,
        block: blockTopicId,
        assembly: assemblyTopicId,
      });

      logger.info('Created assembly registry topic', { assemblyTopicId });
    }, 60000);

    it('should register a complete assembly', async () => {
      const assemblyReg: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        description: 'Integration test assembly',
        actions: testActionId
          ? [
              {
                id: 'test-action',
                registryId: testActionId,
                version: '1.0.0',
              },
            ]
          : [],
        blocks: testBlockId
          ? [
              {
                id: 'test-block',
                registryId: testBlockId,
                version: '1.0.0',
                actions: testActionId ? ['test-action'] : [],
              },
            ]
          : [],
        permissions: {
          execute: ['PUBLIC'],
          update: [client.getOperatorAccountId()],
          delete: [client.getOperatorAccountId()],
        },
      };

      const assemblyId = await client.assemblyRegistry!.register(assemblyReg);

      expect(assemblyId).toBeDefined();
      logger.info('Registered real assembly', { assemblyId });
    }, 60000);

    it('should query assemblies with filters', async () => {
      await client.assemblyRegistry!.sync();

      const assemblies = await client.assemblyRegistry!.listEntries();

      expect(assemblies).toBeDefined();
      expect(assemblies.length).toBeGreaterThan(0);

      const testAssembly = assemblies.find(
        a => a.data.name === 'test-assembly',
      );
      expect(testAssembly).toBeDefined();
      expect(testAssembly?.data.version).toBe('1.0.0');

      if (testActionId) {
        expect(testAssembly?.data.actions).toBeDefined();
        expect(testAssembly?.data.actions[0].registryId).toBe(testActionId);
      }

      if (testBlockId) {
        expect(testAssembly?.data.blocks).toBeDefined();
        expect(testAssembly?.data.blocks[0].registryId).toBe(testBlockId);
      }
    }, 60000);
  });

  describeOrSkip('Cross-Registry Integration', () => {
    it('should resolve assembly with all dependencies', async () => {
      await client.actionRegistry!.sync();
      await client.blockRegistry!.sync();
      await client.assemblyRegistry!.sync();

      const assemblies = await client.assemblyRegistry!.listEntries();
      const assembly = assemblies.find(a => a.data.name === 'test-assembly');

      expect(assembly).toBeDefined();

      const assemblyData = assembly!.data;

      if (assemblyData.actions.length > 0) {
        const referencedAction = await client.actionRegistry!.getEntry(
          assemblyData.actions[0].registryId,
        );
        expect(referencedAction).toBeDefined();
        expect(referencedAction!.data.name).toBe('test-action');
      }

      if (assemblyData.blocks.length > 0) {
        const referencedBlock = await client.blockRegistry!.getEntry(
          assemblyData.blocks[0].registryId,
        );
        expect(referencedBlock).toBeDefined();
        expect(referencedBlock!.data.name).toBe('hashlinks/test-block');
      }
    }, 60000);

    it('should handle registry queries with pagination', async () => {
      const actionPromises = [];
      for (let i = 0; i < 5; i++) {
        const wasmModule = new Uint8Array([
          0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        ]);

        const moduleInfo = {
          name: `pagination-test-${i}`,
          version: '1.0.0',
          hashlinks_version: '0.1.0',
          creator: client.getOperatorAccountId(),
          purpose: 'Pagination test',
          actions: [
            {
              name: 'execute',
              description: 'Execute pagination test',
              inputs: [],
              outputs: [],
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

        actionPromises.push(client.actionRegistry!.register(actionReg));
      }

      await Promise.all(actionPromises);

      await client.actionRegistry!.sync();
      const allActions = await client.actionRegistry!.listEntries();

      const paginationActions = allActions.filter(a =>
        a.data.name.startsWith('pagination-test-'),
      );
      expect(paginationActions.length).toBe(5);
    }, 120000);
  });

  describeOrSkip('Performance Tests', () => {
    it('should handle concurrent registry operations', async () => {
      const start = Date.now();
      const operations = [];

      for (let i = 0; i < 10; i++) {
        operations.push(client.actionRegistry!.listEntries());
        operations.push(client.blockRegistry!.listEntries());
        operations.push(client.assemblyRegistry!.listEntries());
      }

      const results = await Promise.all(operations);
      const duration = Date.now() - start;

      expect(results).toHaveLength(30);
      expect(duration).toBeLessThan(30000);

      logger.info('Concurrent operations performance', {
        operations: 30,
        duration,
        avgTime: duration / 30,
      });
    }, 60000);

    it('should measure registry query performance', async () => {
      const iterations = 5;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await client.actionRegistry!.listEntries();
        times.push(Date.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      expect(avgTime).toBeLessThan(5000);

      logger.info('Query performance', {
        iterations,
        times,
        avgTime,
        min: Math.min(...times),
        max: Math.max(...times),
      });
    }, 60000);
  });

  afterAll(async () => {
    logger.info('Registry integration tests completed', {
      actionTopicId,
      blockTopicId,
      assemblyTopicId,
    });
  });
});
