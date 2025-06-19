/**
 * Tests for Assembly Registry
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AssemblyRegistry } from '../../src/hcs-12/registries/assembly-registry';
import { Logger } from '../../src/utils/logger';
import type { HederaMirrorNode } from '../../src/services/mirror-node';
import type { NetworkType } from '../../src/utils/types';
import { AssemblyRegistration } from '../../src/hcs-12/types';

jest.mock('../../src/services/mirror-node');

global.fetch = jest.fn();

describe('AssemblyRegistry', () => {
  let assemblyRegistry: AssemblyRegistry;
  let logger: Logger;
  let mockMirrorNode: jest.Mocked<HederaMirrorNode>;
  const mockTopicId = '0.0.123456';
  const mockNetwork: NetworkType = 'testnet';

  beforeEach(() => {
    logger = new Logger({ module: 'AssemblyRegistryTest' });
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();

    mockMirrorNode = {
      getTopicMessages: jest.fn(),
      getAccountInfo: jest.fn(),
      getTopicInfo: jest.fn(),
    } as any;

    assemblyRegistry = new AssemblyRegistry(mockNetwork, logger);

    (global.fetch as jest.Mock).mockReset();
  });

  describe('Assembly Registration', () => {
    it('should register a valid assembly', async () => {
      const assemblyReg: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'test-action',
            registryId: '0.0.action1',
          },
        ],
        blocks: [
          {
            id: 'test-block',
            registryId: '0.0.block1',
          },
        ],
      };

      const registrationId = await assemblyRegistry.register(assemblyReg);
      expect(registrationId).toMatch(/^local_\d+_[a-z0-9]+$/);

      const entry = await assemblyRegistry.getEntry(registrationId);
      expect(entry).toBeDefined();
      expect(entry?.data.name).toBe('test-assembly');
      expect(entry?.data.actions).toHaveLength(1);
      expect(entry?.data.blocks).toHaveLength(1);
    });

    it('should register assembly with layout configuration', async () => {
      const assemblyWithLayout: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'layout-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'submit-action',
            registryId: '0.0.action1',
          },
        ],
        blocks: [
          {
            id: 'form-block',
            registryId: '0.0.block1',
          },
        ],
        layout: {
          type: 'vertical',
          responsive: true,
          containerClass: 'assembly-container',
        },
      };

      const registrationId =
        await assemblyRegistry.register(assemblyWithLayout);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry?.data.layout).toBeDefined();
      expect(entry?.data.layout?.type).toBe('vertical');
      expect(entry?.data.layout?.responsive).toBe(true);
    });

    it('should register assembly with metadata', async () => {
      const assemblyWithMetadata: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'metadata-assembly',
        version: '1.0.0',
        description: 'An assembly with rich metadata',
        actions: [],
        blocks: [],
        metadata: {
          author: 'Test Author',
          license: 'MIT',
          homepage: 'https://example.com',
          repository: 'https://github.com/example/repo',
        },
      };

      const registrationId =
        await assemblyRegistry.register(assemblyWithMetadata);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry?.data.description).toBe('An assembly with rich metadata');
      expect(entry?.data.metadata?.author).toBe('Test Author');
    });

    it('should require mandatory fields', async () => {
      const incompleteAssembly = {
        p: 'hcs-12',
        op: 'register',
      } as AssemblyRegistration;

      await expect(
        assemblyRegistry.register(incompleteAssembly),
      ).rejects.toThrow();
    });

    it('should validate action references', async () => {
      const assemblyReg: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'action1',
            registryId: '0.0.action1',
          },
          {
            id: 'action2',
            registryId: '0.0.action2',
            version: '2.0.0',
          },
        ],
        blocks: [],
      };

      const registrationId = await assemblyRegistry.register(assemblyReg);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry?.data.actions).toHaveLength(2);
      expect(entry?.data.actions[1].version).toBe('2.0.0');
    });

    it('should validate block references', async () => {
      const assemblyReg: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [],
        blocks: [
          {
            id: 'block1',
            registryId: '0.0.block1',
          },
          {
            id: 'block2',
            registryId: '0.0.block2',
            props: {
              title: 'Custom Title',
            },
          },
        ],
      };

      const registrationId = await assemblyRegistry.register(assemblyReg);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry?.data.blocks).toHaveLength(2);
      expect(entry?.data.blocks[1].props?.title).toBe('Custom Title');
    });
  });

  describe('Sync from Mirror Node', () => {
    it('should sync assemblies from topic messages', async () => {
      const syncedAssemblyData = {
        p: 'hcs-12',
        op: 'register',
        name: 'synced-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'synced-action',
            registryId: '0.0.action1',
          },
        ],
        blocks: [
          {
            id: 'synced-block',
            registryId: '0.0.block1',
          },
        ],
      };

      (assemblyRegistry as any).entries.set('sync_1', {
        id: 'sync_1',
        data: syncedAssemblyData,
        submitter: '0.0.123456',
        timestamp: '2023-01-01T00:00:00.000Z',
      });

      const entries = await assemblyRegistry.listEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].data.name).toBe('synced-assembly');
    });

    it('should handle large assemblies stored in HCS-1', async () => {
      const largeAssemblyData = {
        p: 'hcs-12',
        op: 'register',
        name: 'large-assembly',
        t_id: '0.0.storage789',
      };

      (assemblyRegistry as any).entries.set('large_1', {
        id: 'large_1',
        data: largeAssemblyData,
        submitter: '0.0.123456',
        timestamp: '2023-01-01T00:00:00.000Z',
      });

      const entries = await assemblyRegistry.listEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].data.t_id).toBe('0.0.storage789');
    });

    it('should filter non-assembly messages', async () => {
      const mockMessages = [
        {
          consensus_timestamp: '2023-01-01T00:00:00.000Z',
          sequence_number: 1,
          payer_account_id: '0.0.123456',
          message: btoa(
            JSON.stringify({
              p: 'hcs-12',
              op: 'register',

              name: 'test-action',
              hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            }),
          ),
        },
        {
          consensus_timestamp: '2023-01-01T00:01:00.000Z',
          sequence_number: 2,
          payer_account_id: '0.0.123456',
          message: btoa(
            JSON.stringify({
              p: 'hcs-12',
              op: 'register',
              name: 'valid-assembly',
              version: '1.0.0',
              actions: [],
              blocks: [],
            }),
          ),
        },
      ];

      mockMirrorNode.getTopicMessages.mockResolvedValue({
        messages: mockMessages,
        _status: { messages: [] },
      } as any);

      const validAssemblyData = {
        p: 'hcs-12',
        op: 'register',
        name: 'valid-assembly',
        version: '1.0.0',
        actions: [],
        blocks: [],
      };

      (assemblyRegistry as any).entries.set('valid_assembly_1', {
        id: 'valid_assembly_1',
        data: validAssemblyData,
        submitter: '0.0.123456',
        timestamp: '2023-01-01T00:01:00.000Z',
      });

      const entries = await assemblyRegistry.listEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].data.name).toBe('valid-assembly');
    });

    it('should handle sync errors gracefully', async () => {
      mockMirrorNode.getTopicMessages.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(assemblyRegistry.sync()).resolves.not.toThrow();

      const assemblyReg: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'error-assembly',
        version: '1.0.0',
        actions: [],
        blocks: [],
      };

      const registrationId = await assemblyRegistry.register(assemblyReg);
      expect(registrationId).toBeDefined();
    });
  });

  describe('Registry Operations', () => {
    it('should list all entries', async () => {
      const assemblies = [
        {
          name: 'assembly-1',
          version: '1.0.0',
        },
        {
          name: 'assembly-2',
          version: '2.0.0',
        },
        {
          name: 'assembly-3',
          version: '3.0.0',
        },
      ];

      for (const assembly of assemblies) {
        await assemblyRegistry.register({
          p: 'hcs-12',
          op: 'register',
          name: assembly.name,
          version: assembly.version,
          actions: [],
          blocks: [],
        });
      }

      const entries = await assemblyRegistry.listEntries();
      expect(entries).toHaveLength(3);
      expect(entries.map(e => e.data.name)).toEqual([
        'assembly-1',
        'assembly-2',
        'assembly-3',
      ]);
    });

    it('should get entry by ID', async () => {
      const assemblyReg: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'get-assembly',
        version: '1.0.0',
        actions: [],
        blocks: [],
      };

      const registrationId = await assemblyRegistry.register(assemblyReg);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry).toBeDefined();
      expect(entry?.id).toBe(registrationId);
      expect(entry?.data.name).toBe('get-assembly');
    });

    it('should return null for non-existent entry', async () => {
      const entry = await assemblyRegistry.getEntry('non-existent-id');
      expect(entry).toBeNull();
    });
  });

  describe('Complex Assembly Structures', () => {
    it('should handle nested action-block relationships', async () => {
      const complexAssembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'complex-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'validate',
            registryId: '0.0.validate',
          },
          {
            id: 'submit',
            registryId: '0.0.submit',
          },
          {
            id: 'reset',
            registryId: '0.0.reset',
          },
        ],
        blocks: [
          {
            id: 'header',
            registryId: '0.0.header',
          },
          {
            id: 'form',
            registryId: '0.0.form',
          },
          {
            id: 'footer',
            registryId: '0.0.footer',
          },
        ],
        layout: {
          type: 'vertical',
          responsive: true,
        },
      };

      const registrationId = await assemblyRegistry.register(complexAssembly);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry?.data.layout).toBeDefined();
      expect(entry?.data.layout?.type).toBe('vertical');
      expect(entry?.data.actions).toHaveLength(3);
      expect(entry?.data.blocks).toHaveLength(3);
    });

    it('should handle assemblies with conditional rendering', async () => {
      const conditionalAssembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'conditional-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'check-auth',
            registryId: '0.0.checkauth',
          },
        ],
        blocks: [
          {
            id: 'login-form',
            registryId: '0.0.loginform',
          },
          {
            id: 'dashboard',
            registryId: '0.0.dashboard',
          },
        ],
        layout: {
          type: 'vertical',
          responsive: true,
        },
      };

      const registrationId =
        await assemblyRegistry.register(conditionalAssembly);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry?.data.layout).toBeDefined();
      expect(entry?.data.layout?.type).toBe('vertical');
    });
  });

  describe('Version Compatibility', () => {
    it('should handle version constraints on references', async () => {
      const versionedAssembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'versioned-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'action-v1',
            registryId: '0.0.action1',
            version: '1.0.0',
          },
          {
            id: 'action-v2',
            registryId: '0.0.action2',
            version: '2.1.0',
          },
        ],
        blocks: [
          {
            id: 'block-latest',
            registryId: '0.0.block1',
          },
          {
            id: 'block-specific',
            registryId: '0.0.block2',
            version: '3.2.1',
          },
        ],
      };

      const registrationId = await assemblyRegistry.register(versionedAssembly);
      const entry = await assemblyRegistry.getEntry(registrationId);

      expect(entry?.data.actions[0].version).toBe('1.0.0');
      expect(entry?.data.actions[1].version).toBe('2.1.0');
      expect(entry?.data.blocks[0].version).toBeUndefined();
      expect(entry?.data.blocks[1].version).toBe('3.2.1');
    });
  });
});
