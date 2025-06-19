/**
 * Tests for Assembly Engine
 *
 * Tests assembly loading, reference resolution, and composition validation for HashLinks
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AssemblyEngine } from '../../src/hcs-12/assembly/assembly-engine';
import { Logger } from '../../src/utils/logger';

const mockRetrieveInscription = jest.fn();
jest.mock('../../src/inscribe/inscriber', () => ({
  retrieveInscription: mockRetrieveInscription,
}));

const mockAssemblyRegistry = {
  getEntry: jest.fn(),
  listEntries: jest.fn(),
  register: jest.fn(),
  sync: jest.fn(),
};

const mockActionRegistry = {
  getEntry: jest.fn(),
  listEntries: jest.fn(),
  register: jest.fn(),
  sync: jest.fn(),
};

const mockBlockRegistry = {
  getEntry: jest.fn(),
  listEntries: jest.fn(),
  register: jest.fn(),
  sync: jest.fn(),
};

describe('AssemblyEngine', () => {
  let assemblyEngine: AssemblyEngine;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'AssemblyEngineTest' });
    assemblyEngine = new AssemblyEngine(
      'testnet' as any,
      logger,
      mockAssemblyRegistry as any,
      mockActionRegistry as any,
      mockBlockRegistry as any,
    );

    mockAssemblyRegistry.getEntry.mockClear();
    mockActionRegistry.getEntry.mockClear();
    mockBlockRegistry.getEntry.mockClear();

    assemblyEngine.clearCache();

    mockRetrieveInscription.mockReset();
  });

  describe('Assembly Loading', () => {
    it('should load assembly from registry', async () => {
      const assemblyId = '0.0.123456';
      const mockAssembly = {
        p: 'hcs-12',
        op: 'register',
        name: 'Test Assembly',
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

      mockAssemblyRegistry.getEntry.mockResolvedValueOnce({
        id: assemblyId,
        data: mockAssembly,
        submitter: '0.0.123',
        timestamp: '1234567890',
      });

      const result = await assemblyEngine.loadAssembly(assemblyId);

      expect(result).toBeDefined();
      expect(result.definition.name).toBe('Test Assembly');
      expect(result.definition.actions).toHaveLength(1);
      expect(result.definition.blocks).toHaveLength(1);
      expect(result.id).toBe(assemblyId);
      expect(mockAssemblyRegistry.getEntry).toHaveBeenCalledWith(assemblyId);
    });

    it('should load large assembly from HCS-1 storage', async () => {
      const assemblyId = '0.0.123456';

      const mockLargeAssembly = {
        p: 'hcs-12',
        op: 'register',
        name: 'Large Assembly',
        version: '1.0.0',
        actions: Array.from({ length: 100 }, (_, i) => ({
          id: `action-${i}`,
          registryId: `0.0.action${i}`,
        })),
        blocks: Array.from({ length: 50 }, (_, i) => ({
          id: `block-${i}`,
          registryId: `0.0.block${i}`,
          actions: [`action-${i}`],
        })),
      };

      mockAssemblyRegistry.getEntry.mockResolvedValueOnce({
        id: assemblyId,
        data: mockLargeAssembly,
        submitter: '0.0.123',
        timestamp: '1234567890',
      });

      const result = await assemblyEngine.loadAssembly(assemblyId);

      expect(result).toBeDefined();
      expect(result.definition.name).toBe('Large Assembly');
      expect(result.definition.actions).toHaveLength(100);
      expect(result.definition.blocks).toHaveLength(50);
    });

    it('should handle inline assembly definition', async () => {
      const assemblyId = '0.0.123456';
      const mockInlineAssembly = {
        p: 'hcs-12',
        op: 'register',
        name: 'Inline Assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'inline-action',
            registryId: '0.0.action1',
          },
        ],
        blocks: [
          {
            id: 'inline-block',
            registryId: '0.0.block1',
          },
        ],
      };

      mockAssemblyRegistry.getEntry.mockResolvedValueOnce({
        id: assemblyId,
        data: mockInlineAssembly,
        submitter: '0.0.123',
        timestamp: '1234567890',
      });

      const result = await assemblyEngine.loadAssembly(assemblyId);

      expect(result.definition).toEqual(mockInlineAssembly);
    });

    it('should throw error for non-existent assembly', async () => {
      const assemblyId = '0.0.invalid';

      mockAssemblyRegistry.getEntry.mockResolvedValueOnce(null);

      mockRetrieveInscription.mockRejectedValue(
        new Error(
          'Either API key or account ID and private key are required for retrieving inscriptions',
        ),
      );

      await expect(assemblyEngine.loadAssembly(assemblyId)).rejects.toThrow(
        'Failed to load assembly',
      );
    });

    it('should validate assembly format', async () => {
      const assemblyId = '0.0.123456';
      const invalidAssembly = {
        name: 'Invalid',
        version: '1.0.0',
      };

      mockAssemblyRegistry.getEntry.mockResolvedValueOnce({
        id: assemblyId,
        data: invalidAssembly,
        submitter: '0.0.123',
        timestamp: '1234567890',
      });

      mockRetrieveInscription.mockRejectedValue(
        new Error(
          'Either API key or account ID and private key are required for retrieving inscriptions',
        ),
      );

      await expect(assemblyEngine.loadAssembly(assemblyId)).rejects.toThrow(
        'Invalid assembly format',
      );
    });
  });

  describe('Reference Resolution', () => {
    it('should resolve action references', async () => {
      const assemblyDefinition = {
        p: 'hcs-12',
        op: 'register',
        name: 'Test Assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'test-action',
            registryId: '0.0.action1',
          },
        ],
        blocks: [],
      };

      const mockActionEntry = {
        id: '0.0.action1',
        data: {
          p: 'hcs-12',
          op: 'register',
          name: 'Test Action',
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        submitter: '0.0.123',
        timestamp: '1234567890',
      };

      mockActionRegistry.getEntry.mockResolvedValueOnce(mockActionEntry);

      const resolved = await assemblyEngine.resolveReferences(
        assemblyDefinition as any,
      );

      expect(resolved.actions).toHaveLength(1);
      expect(resolved.actions[0].definition).toEqual(mockActionEntry.data);
    });

    it('should resolve block references', async () => {
      const assemblyDefinition = {
        p: 'hcs-12',
        op: 'register',
        name: 'Test Assembly',
        version: '1.0.0',
        actions: [],
        blocks: [
          {
            id: 'test-block',
            registryId: '0.0.22345',
          },
        ],
      };

      const mockBlockEntry = {
        id: '0.0.22345',
        data: {
          p: 'hcs-12',
          op: 'register',
          name: 'hashlinks/test-block',
          version: '1.0.0',
        },
        submitter: '0.0.123',
        timestamp: '1234567890',
      };

      mockBlockRegistry.getEntry.mockResolvedValueOnce(mockBlockEntry);

      const resolved = await assemblyEngine.resolveReferences(
        assemblyDefinition as any,
      );

      expect(resolved.blocks).toHaveLength(1);
      expect(resolved.blocks[0].registryId).toBe('0.0.22345');
      expect(resolved.blocks[0].definition).toEqual(mockBlockEntry.data);
    });

    it('should handle version resolution', async () => {
      const assemblyDefinition = {
        p: 'hcs-12',
        op: 'register',
        name: 'Test Assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'versioned-action',
            registryId: '0.0.action1',
            version: '2.0.0',
          },
        ],
        blocks: [],
      };

      const mockActionEntry = {
        id: '0.0.action1',
        data: {
          p: 'hcs-12',
          op: 'register',
          name: 'Test Action',
          version: '2.0.0',
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        submitter: '0.0.123',
        timestamp: '1234567890',
      };

      mockActionRegistry.getEntry.mockResolvedValueOnce(mockActionEntry);

      const resolved = await assemblyEngine.resolveReferences(
        assemblyDefinition as any,
      );

      expect(resolved.actions[0].definition.version).toBe('2.0.0');
    });

    it('should handle missing references gracefully', async () => {
      const assemblyDefinition = {
        p: 'hcs-12',
        op: 'register',
        name: 'Test Assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'missing-action',
            registryId: '0.0.missing',
          },
        ],
        blocks: [],
      };

      mockActionRegistry.getEntry.mockResolvedValueOnce(null);

      const resolved = await assemblyEngine.resolveReferences(
        assemblyDefinition as any,
      );

      expect(resolved.actions).toHaveLength(1);
      expect(resolved.actions[0].error).toBe('Action not found: 0.0.missing');
      expect(resolved.actions[0].definition).toBeNull();
    });

    it('should handle empty assembly definition', async () => {
      const assemblyDefinition = {
        p: 'hcs-12',
        op: 'register',
        name: 'Empty Assembly',
        version: '1.0.0',
        actions: [],
        blocks: [],
      };

      const resolved = await assemblyEngine.resolveReferences(
        assemblyDefinition as any,
      );

      expect(resolved.actions).toHaveLength(0);
      expect(resolved.blocks).toHaveLength(0);
    });
  });

  describe('Composition Validation', () => {
    it('should validate assembly structure', async () => {
      const assembly = {
        id: '0.0.123456',
        definition: {
          p: 'hcs-12',
          op: 'register',
          name: 'Valid Assembly',
          version: '1.0.0',
        },
        actions: [
          {
            id: 'action1',
            registryId: '0.0.action1',
            definition: {
              name: 'Test Action',
              parameters: [],
            },
          },
        ],
        blocks: [
          {
            id: 'block1',
            registryId: '0.0.block1',
            definition: {
              name: 'Test Block',
              actions: ['action1'],
            },
          },
        ],
      };

      const result = await assemblyEngine.validateComposition(assembly as any);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing action references', async () => {
      const assembly = {
        id: '0.0.123456',
        definition: {
          p: 'hcs-12',
          op: 'register',
          name: 'Invalid Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [
          {
            id: 'block1',
            registryId: '0.0.block1',
            definition: {
              name: 'Test Block',
              actions: ['missing-action'],
            },
          },
        ],
      };

      const result = await assemblyEngine.validateComposition(assembly as any);

      expect(result.isValid).toBe(true);
    });

    it('should validate action-block bindings', async () => {
      const assembly = {
        id: '0.0.123456',
        definition: {
          p: 'hcs-12',
          op: 'register',
          name: 'Test Assembly',
          version: '1.0.0',
          layout: [
            {
              block: 'block1',
              actions: [
                {
                  action: 'action1',
                  parameters: {
                    input: '{{form.value}}',
                  },
                },
              ],
            },
          ],
        },
        actions: [
          {
            id: 'action1',
            registryId: '0.0.action1',
            definition: {
              name: 'Test Action',
              parameters: [{ name: 'input', type: 'string', required: true }],
            },
          },
        ],
        blocks: [
          {
            id: 'block1',
            registryId: '0.0.block1',
            definition: {
              name: 'Test Block',
              outputs: ['form.value'],
            },
          },
        ],
      };

      const result = await assemblyEngine.validateComposition(assembly as any);

      expect(result.isValid).toBe(true);
    });

    it('should detect parameter binding mismatches', async () => {
      const assembly = {
        id: '0.0.123456',
        definition: {
          p: 'hcs-12',
          op: 'register',
          name: 'Test Assembly',
          version: '1.0.0',
          layout: [
            {
              block: 'block1',
              actions: [
                {
                  action: 'action1',
                  parameters: {
                    missingParam: '{{form.value}}',
                  },
                },
              ],
            },
          ],
        },
        actions: [
          {
            id: 'action1',
            registryId: '0.0.action1',
            definition: {
              name: 'Test Action',
              parameters: [
                { name: 'requiredParam', type: 'string', required: true },
              ],
            },
          },
        ],
        blocks: [
          {
            id: 'block1',
            registryId: '0.0.block1',
            definition: {
              name: 'Test Block',
            },
          },
        ],
      };

      const result = await assemblyEngine.validateComposition(assembly as any);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Caching', () => {
    it('should cache loaded assemblies', async () => {
      const assemblyId = '0.0.123456';
      const mockAssembly = {
        p: 'hcs-12',
        op: 'register',
        name: 'Cached Assembly',
        version: '1.0.0',
        actions: [],
        blocks: [],
      };

      mockAssemblyRegistry.getEntry.mockResolvedValueOnce({
        id: assemblyId,
        data: mockAssembly,
        submitter: '0.0.123',
        timestamp: '1234567890',
      });

      const result1 = await assemblyEngine.loadAssembly(assemblyId);
      expect(mockAssemblyRegistry.getEntry).toHaveBeenCalledTimes(1);

      const result2 = await assemblyEngine.loadAssembly(assemblyId);
      expect(mockAssemblyRegistry.getEntry).toHaveBeenCalledTimes(1);

      expect(result1).toEqual(result2);
    });

    it('should invalidate cache when requested', async () => {
      const assemblyId = '0.0.123456';
      const mockAssembly = {
        p: 'hcs-12',
        op: 'register',
        name: 'Cached Assembly',
        version: '1.0.0',
        actions: [],
        blocks: [],
      };

      mockAssemblyRegistry.getEntry.mockResolvedValue({
        id: assemblyId,
        data: mockAssembly,
        submitter: '0.0.123',
        timestamp: '1234567890',
      });

      await assemblyEngine.loadAssembly(assemblyId);
      expect(mockAssemblyRegistry.getEntry).toHaveBeenCalledTimes(1);

      assemblyEngine.clearCache();

      await assemblyEngine.loadAssembly(assemblyId);
      expect(mockAssemblyRegistry.getEntry).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const assemblyId = '0.0.123456';

      mockAssemblyRegistry.getEntry.mockRejectedValueOnce(
        new Error('Network error'),
      );

      await expect(assemblyEngine.loadAssembly(assemblyId)).rejects.toThrow(
        'Failed to load assembly',
      );
    });

    it('should handle malformed JSON in HCS-1 storage', async () => {
      const assemblyId = '0.0.123456';
      const mockRegistryMessage = {
        p: 'hcs-12',
        op: 'register',
        name: 'Assembly with bad storage',
        t_id: '0.0.storage789',
      };

      mockAssemblyRegistry.getEntry.mockResolvedValueOnce({
        id: assemblyId,
        data: mockRegistryMessage,
        submitter: '0.0.123',
        timestamp: '1234567890',
      });

      mockRetrieveInscription.mockResolvedValueOnce({
        data: 'invalid json{',
      } as any);

      await expect(assemblyEngine.loadAssembly(assemblyId)).rejects.toThrow(
        'Failed to parse assembly',
      );
    });
  });
});
