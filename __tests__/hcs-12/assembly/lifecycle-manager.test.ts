/**
 * Tests for Assembly Lifecycle Manager
 *
 * Tests assembly initialization, updates, and cleanup for HashLinks
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LifecycleManager } from '../../../src/hcs-12/assembly/lifecycle-manager';
import { Logger } from '../../../src/utils/logger';

describe('LifecycleManager', () => {
  let lifecycleManager: LifecycleManager;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'LifecycleManagerTest' });
    lifecycleManager = new LifecycleManager(logger);
  });

  describe('Assembly Initialization', () => {
    it('should initialize assembly with dependencies', async () => {
      const assembly = {
        id: 'test-assembly',
        definition: {
          name: 'Test Assembly',
          version: '1.0.0',
          actions: [
            {
              id: 'action1',
              registryId: 'action-registry-1',
            },
          ],
          blocks: [
            {
              id: 'block1',
              registryId: 'block-registry-1',
              actions: ['action1'],
            },
          ],
        },
        actions: [
          {
            id: 'action1',
            registryId: 'action-registry-1',
            definition: {
              name: 'Test Action',
              parameters: [{ name: 'param1', type: 'string', required: true }],
            },
          },
        ],
        blocks: [
          {
            id: 'block1',
            registryId: 'block-registry-1',
            definition: {
              name: 'Test Block',
              attributes: [{ name: 'attr1', type: 'string' }],
            },
          },
        ],
        dependencies: [],
      };

      const result = await lifecycleManager.initializeAssembly(assembly);

      expect(result.success).toBe(true);
      expect(result.assemblyId).toBe('test-assembly');
      expect(result.state).toBe('initialized');
      expect(result.components).toHaveLength(2);
      const blockComponent = result.components.find(c => c.id === 'block1');
      const actionComponent = result.components.find(c => c.id === 'action1');
      expect(blockComponent?.id).toBe('block1');
      expect(blockComponent?.state).toBe('ready');
      expect(actionComponent?.id).toBe('action1');
      expect(actionComponent?.state).toBe('ready');
    });

    it('should handle initialization dependencies in correct order', async () => {
      const assembly = {
        id: 'dependent-assembly',
        definition: {
          name: 'Dependent Assembly',
          version: '1.0.0',
          dependencies: [
            { registryId: 'dep-assembly-1' },
            { registryId: 'dep-assembly-2' },
          ],
        },
        actions: [],
        blocks: [],
        dependencies: [
          {
            id: 'dep-assembly-1',
            registryId: 'dep-assembly-1',
            definition: {
              name: 'Dependency 1',
              version: '1.0.0',
            },
          },
          {
            id: 'dep-assembly-2',
            registryId: 'dep-assembly-2',
            definition: {
              name: 'Dependency 2',
              version: '1.0.0',
            },
          },
        ],
      };

      const mockInitializeDependency = jest
        .fn()
        .mockResolvedValue({ success: true });
      lifecycleManager.setDependencyInitializer(mockInitializeDependency);

      const result = await lifecycleManager.initializeAssembly(assembly);

      expect(result.success).toBe(true);
      expect(mockInitializeDependency).toHaveBeenCalledTimes(2);
      expect(mockInitializeDependency).toHaveBeenNthCalledWith(
        1,
        'dep-assembly-1',
      );
      expect(mockInitializeDependency).toHaveBeenNthCalledWith(
        2,
        'dep-assembly-2',
      );
    });

    it('should handle initialization failures gracefully', async () => {
      const assembly = {
        id: 'failing-assembly',
        definition: {
          name: 'Failing Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [
          {
            id: 'invalid-block',
            registryId: 'invalid-registry',
            definition: null,
            error: 'Block not found',
          },
        ],
        dependencies: [],
      };

      const result = await lifecycleManager.initializeAssembly(assembly);

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Failed to initialize block "invalid-block": Block not found',
      );
    });
  });

  describe('Assembly Updates', () => {
    it('should update assembly with version changes', async () => {
      const originalAssembly = {
        id: 'updateable-assembly',
        definition: {
          name: 'Updateable Assembly',
          version: '1.0.0',
          blocks: [
            {
              id: 'block1',
              registryId: 'block-registry-1',
            },
          ],
        },
        actions: [],
        blocks: [
          {
            id: 'block1',
            registryId: 'block-registry-1',
            definition: {
              name: 'Original Block',
              version: '1.0.0',
            },
          },
        ],
        dependencies: [],
      };

      await lifecycleManager.initializeAssembly(originalAssembly);

      const updatedAssembly = {
        ...originalAssembly,
        definition: {
          ...originalAssembly.definition,
          version: '1.1.0',
        },
        blocks: [
          {
            id: 'block1',
            registryId: 'block-registry-1',
            definition: {
              name: 'Updated Block',
              version: '1.1.0',
            },
          },
        ],
      };

      const result = await lifecycleManager.updateAssembly(
        'updateable-assembly',
        updatedAssembly,
      );

      expect(result.success).toBe(true);
      expect(result.changes).toContain(
        'Updated block "block1" from version 1.0.0 to 1.1.0',
      );
      expect(result.state).toBe('updated');
    });

    it('should detect and handle component additions/removals', async () => {
      const originalAssembly = {
        id: 'changeable-assembly',
        definition: {
          name: 'Changeable Assembly',
          version: '1.0.0',
          blocks: [
            { id: 'block1', registryId: 'block-1' },
            { id: 'block2', registryId: 'block-2' },
          ],
        },
        actions: [],
        blocks: [
          {
            id: 'block1',
            registryId: 'block-1',
            definition: { name: 'Block 1' },
          },
          {
            id: 'block2',
            registryId: 'block-2',
            definition: { name: 'Block 2' },
          },
        ],
        dependencies: [],
      };

      await lifecycleManager.initializeAssembly(originalAssembly);

      const updatedAssembly = {
        ...originalAssembly,
        definition: {
          ...originalAssembly.definition,
          blocks: [
            { id: 'block1', registryId: 'block-1' },
            { id: 'block3', registryId: 'block-3' },
          ],
        },
        blocks: [
          {
            id: 'block1',
            registryId: 'block-1',
            definition: { name: 'Block 1' },
          },
          {
            id: 'block3',
            registryId: 'block-3',
            definition: { name: 'Block 3' },
          },
        ],
      };

      const result = await lifecycleManager.updateAssembly(
        'changeable-assembly',
        updatedAssembly,
      );

      expect(result.success).toBe(true);
      expect(result.changes).toContain('Removed block "block2"');
      expect(result.changes).toContain('Added block "block3"');
    });

    it('should handle hot-reload updates', async () => {
      const assembly = {
        id: 'hot-reload-assembly',
        definition: {
          name: 'Hot Reload Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [],
        dependencies: [],
      };

      await lifecycleManager.initializeAssembly(assembly);

      const mockEventListener = jest.fn();
      lifecycleManager.on('componentUpdated', mockEventListener);

      const updateResult = await lifecycleManager.hotReload(
        'hot-reload-assembly',
        {
          type: 'component',
          componentId: 'dynamic-component',
          data: { name: 'Dynamic Component' },
        },
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.hotReloaded).toBe(true);
      expect(mockEventListener).toHaveBeenCalledWith({
        assemblyId: 'hot-reload-assembly',
        componentId: 'dynamic-component',
        type: 'updated',
      });
    });
  });

  describe('Assembly Cleanup', () => {
    it('should cleanup assembly resources', async () => {
      const assembly = {
        id: 'cleanup-assembly',
        definition: {
          name: 'Cleanup Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [
          {
            id: 'block1',
            registryId: 'block-1',
            definition: { name: 'Block 1' },
          },
        ],
        dependencies: [],
      };

      await lifecycleManager.initializeAssembly(assembly);

      const result = await lifecycleManager.cleanupAssembly('cleanup-assembly');

      expect(result.success).toBe(true);
      expect(result.cleanedResources).toContain('block1');
      expect(result.finalState).toBe('destroyed');
    });

    it('should cleanup dependencies when no longer needed', async () => {
      const assembly = {
        id: 'dependency-cleanup-assembly',
        definition: {
          name: 'Dependency Cleanup Assembly',
          version: '1.0.0',
          dependencies: [{ registryId: 'shared-dependency' }],
        },
        actions: [],
        blocks: [],
        dependencies: [
          {
            id: 'shared-dependency',
            registryId: 'shared-dependency',
            definition: { name: 'Shared Dependency' },
          },
        ],
      };

      const mockCleanupDependency = jest
        .fn()
        .mockResolvedValue({ success: true });
      lifecycleManager.setDependencyCleanup(mockCleanupDependency);

      await lifecycleManager.initializeAssembly(assembly);
      const result = await lifecycleManager.cleanupAssembly(
        'dependency-cleanup-assembly',
      );

      expect(result.success).toBe(true);
      expect(mockCleanupDependency).toHaveBeenCalledWith('shared-dependency');
    });

    it('should handle cleanup errors gracefully', async () => {
      const assembly = {
        id: 'error-cleanup-assembly',
        definition: {
          name: 'Error Cleanup Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [
          {
            id: 'test-block',
            registryId: 'test-block-registry',
            definition: { name: 'Test Block' },
          },
        ],
        dependencies: [],
      };

      const mockCleanupComponent = jest
        .fn()
        .mockRejectedValue(new Error('Cleanup failed'));
      lifecycleManager.setComponentCleanup(mockCleanupComponent);

      await lifecycleManager.initializeAssembly(assembly);

      const result = await lifecycleManager.cleanupAssembly(
        'error-cleanup-assembly',
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Failed to cleanup component "test-block": Cleanup failed',
      );
    });
  });

  describe('State Management', () => {
    it('should track assembly state transitions', async () => {
      const assembly = {
        id: 'state-tracking-assembly',
        definition: {
          name: 'State Tracking Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [],
        dependencies: [],
      };

      let states: string[] = [];
      lifecycleManager.on('stateChanged', event => {
        states.push(event.newState);
      });

      await lifecycleManager.initializeAssembly(assembly);
      await lifecycleManager.updateAssembly(
        'state-tracking-assembly',
        assembly,
      );
      await lifecycleManager.cleanupAssembly('state-tracking-assembly');

      expect(states).toEqual([
        'initializing',
        'initialized',
        'updating',
        'updated',
        'destroying',
        'destroyed',
      ]);
    });

    it('should provide assembly status information', async () => {
      const assembly = {
        id: 'status-assembly',
        definition: {
          name: 'Status Assembly',
          version: '1.0.0',
          blocks: [{ id: 'block1', registryId: 'block-1' }],
        },
        actions: [],
        blocks: [
          {
            id: 'block1',
            registryId: 'block-1',
            definition: { name: 'Block 1' },
          },
        ],
        dependencies: [],
      };

      await lifecycleManager.initializeAssembly(assembly);

      const status = lifecycleManager.getAssemblyStatus('status-assembly');

      expect(status).toBeDefined();
      expect(status?.id).toBe('status-assembly');
      expect(status?.state).toBe('initialized');
      expect(status?.components).toHaveLength(1);
      expect(status?.components[0].id).toBe('block1');
      expect(status?.uptime).toBeGreaterThan(0);
    });

    it('should handle concurrent operations safely', async () => {
      const assembly = {
        id: 'concurrent-assembly',
        definition: {
          name: 'Concurrent Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [],
        dependencies: [],
      };

      const operations = [
        lifecycleManager.initializeAssembly(assembly),
        lifecycleManager.initializeAssembly(assembly),
        lifecycleManager.initializeAssembly(assembly),
      ];

      const results = await Promise.allSettled(operations);

      const successful = results.filter(
        r => r.status === 'fulfilled' && (r.value as any).success,
      );
      expect(successful).toHaveLength(1);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from partial initialization failures', async () => {
      const assembly = {
        id: 'recovery-assembly',
        definition: {
          name: 'Recovery Assembly',
          version: '1.0.0',
          blocks: [
            { id: 'good-block', registryId: 'good-block' },
            { id: 'bad-block', registryId: 'bad-block' },
          ],
        },
        actions: [],
        blocks: [
          {
            id: 'good-block',
            registryId: 'good-block',
            definition: { name: 'Good Block' },
          },
          {
            id: 'bad-block',
            registryId: 'bad-block',
            definition: null,
            error: 'Block failed to load',
          },
        ],
        dependencies: [],
      };

      const result = await lifecycleManager.initializeAssembly(assembly, {
        partialFailureMode: 'continue',
      });

      expect(result.success).toBe(true);
      expect(result.partialFailure).toBe(true);
      expect(result.components).toHaveLength(1);
      expect(result.components[0].id).toBe('good-block');
      expect(result.errors).toContain(
        'Failed to initialize block "bad-block": Block failed to load',
      );
    });

    it('should retry failed operations with backoff', async () => {
      const assembly = {
        id: 'retry-assembly',
        definition: {
          name: 'Retry Assembly',
          version: '1.0.0',
        },
        actions: [],
        blocks: [],
        dependencies: [],
      };

      let attemptCount = 0;
      const mockFailingOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve({ success: true });
      });

      lifecycleManager.setRetryableOperation(mockFailingOperation);

      const result = await lifecycleManager.initializeAssembly(assembly, {
        retryOptions: {
          maxRetries: 3,
          initialDelay: 10,
          backoffFactor: 2,
        },
      });

      expect(result.success).toBe(true);
      expect(mockFailingOperation).toHaveBeenCalledTimes(3);
    });
  });
});
