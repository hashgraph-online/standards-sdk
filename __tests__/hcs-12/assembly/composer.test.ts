/**
 * Tests for Assembly Composer
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AssemblyComposer } from '../../../src/hcs-12/assembly/composer';
import { Logger } from '../../../src/utils/logger';
import {
  AssemblyRegistration,
  ActionRegistration,
  BlockRegistration,
} from '../../../src/hcs-12/types';

describe('AssemblyComposer', () => {
  let composer: AssemblyComposer;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'AssemblyComposerTest' });
    composer = new AssemblyComposer(logger);
  });

  describe('Basic Composition', () => {
    it('should compose a simple assembly', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'test-action',
            registryId: '0.0.11111',
          },
        ],
        blocks: [
          {
            id: 'test-block',
            registryId: '0.0.22345',
            version: '1.0.0',
          },
        ],
      };

      const actionRegistrations = new Map<string, ActionRegistration>();
      actionRegistrations.set('0.0.11111', {
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.12345',
        hash: 'action-hash-123',
        registryId: '0.0.11111',
        wasm_hash: '0.0.12345',
      });

      const blockRegistrations = new Map<string, BlockRegistration>();
      blockRegistrations.set('0.0.22345', {
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.22345',
        name: 'test-block',
        title: 'Test Block',
        version: '1.0.0',
      });

      const result = await composer.compose(
        assembly,
        actionRegistrations,
        blockRegistrations,
      );

      expect(result.validated).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.actions.size).toBe(1);
      expect(result.blocks.size).toBe(1);
    });

    it('should handle missing action dependencies', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'missing-action',
            registryId: '0.0.99999',
          },
        ],
      };

      const result = await composer.compose(assembly, new Map(), new Map());

      expect(result.validated).toBe(false);
      expect(result.errors).toContain(
        'Action not found: 0.0.99999 (id: missing-action)',
      );
    });

    it('should handle missing block dependencies', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        blocks: [
          {
            id: 'missing-block',
            registryId: '0.0.22345',
            version: '1.0.0',
          },
        ],
      };

      const result = await composer.compose(assembly, new Map(), new Map());

      expect(result.validated).toBe(false);
      expect(result.errors.some(e => e.includes('Block not found'))).toBe(true);
    });
  });

  describe('Dependency Validation', () => {
    it('should validate action-block dependencies', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          {
            registryId: '0.0.11111',
            id: 'test-action',
          },
        ],
        blocks: [
          {
            id: 'test-block',
            registryId: '0.0.22345',
            version: '1.0.0',
          },
        ],
      };

      const actionRegistrations = new Map<string, ActionRegistration>();
      actionRegistrations.set('0.0.11111', {
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.12345',
        hash: 'action-hash-123',
        registryId: '0.0.11111',
        wasm_hash: '0.0.12345',
      });

      const blockRegistrations = new Map<string, BlockRegistration>();
      blockRegistrations.set('0.0.22345', {
        p: 'hcs-12',
        op: 'register',
        name: 'test-block',
        version: '1.0.0',
        data: {
          apiVersion: 2,
          name: 'test-block',
          title: 'Test Block',
          category: 'common',
          attributes: {},
          supports: {},
          actions: ['missing-action'],
        },
        t_id: '0.0.22345',
      });

      const result = await composer.compose(
        assembly,
        actionRegistrations,
        blockRegistrations,
      );

      expect(result.validated).toBe(false);
      expect(
        result.errors.some(e => e.includes('requires action missing-action')),
      ).toBe(true);
    });

    it('should validate assembly metadata', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: '',
        version: '',
        actions: [],
        blocks: [],
      };

      const result = await composer.compose(assembly, new Map(), new Map());

      expect(result.validated).toBe(false);
      expect(result.errors).toContain('Assembly name is required');
      expect(result.errors).toContain('Assembly version is required');
      expect(result.warnings).toContain('Assembly has no actions defined');
      expect(result.warnings).toContain('Assembly has no blocks defined');
    });
  });

  describe('Composition Options', () => {
    it('should load WASM modules when requested', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          {
            registryId: '0.0.11111',
            id: 'test-action',
          },
        ],
      };

      const actionRegistrations = new Map<string, ActionRegistration>();
      actionRegistrations.set('0.0.11111', {
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.12345',
        hash: 'action-hash-123',
        registryId: '0.0.11111',
        wasm_hash: '0.0.12345',
      });

      const result = await composer.compose(
        assembly,
        actionRegistrations,
        new Map(),
        { loadWasm: true },
      );

      expect(result.validated).toBe(true);

      const actionInfo = result.actions.get('test-action');
      expect(actionInfo?.wasmInterface).toBeDefined();
      expect(typeof actionInfo?.wasmInterface?.INFO).toBe('function');
    });

    it('should resolve templates when requested', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        blocks: [
          {
            id: 'test-block',
            registryId: '0.0.22345',
            version: '1.0.0',
          },
        ],
      };

      const blockRegistrations = new Map<string, BlockRegistration>();
      blockRegistrations.set('0.0.22345', {
        p: 'hcs-12',
        op: 'register',
        name: 'test-block',
        version: '1.0.0',
        data: {
          apiVersion: 2,
          name: 'test-block',
          title: 'Test Block',
          category: 'common',
          attributes: {},
          supports: {},
        },
        t_id: '0.0.22345',
      });

      const result = await composer.compose(
        assembly,
        new Map(),
        blockRegistrations,
        { resolveTemplates: true },
      );

      expect(result.validated).toBe(true);

      const blockInfo = result.blocks.get('test-block');
      expect(blockInfo?.template).toBeDefined();
      expect(blockInfo?.template).toBeDefined();
      expect(typeof blockInfo?.template).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle composition errors gracefully', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
      };

      const result = await composer.compose(assembly, new Map(), new Map());

      expect(result.validated).toBe(true);
      expect(result.warnings).toContain('Assembly has no actions defined');
      expect(result.warnings).toContain('Assembly has no blocks defined');
    });
  });

  describe('Dependency Resolution', () => {
    it('should resolve dependencies correctly', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'complex-assembly',
        version: '1.0.0',
        actions: [
          {
            id: 'action-1',
            registryId: '0.0.11111',
            version: '1.0.0',
          },
          {
            id: 'action-2',
            registryId: '0.0.22222',
            version: '1.1.0',
          },
        ],
        blocks: [
          {
            id: 'block-1',
            registryId: '0.0.33333',
            version: '1.0.0',
          },
          {
            id: 'block-2',
            registryId: '0.0.44444',
            version: '2.0.0',
          },
        ],
      };

      const actionRegistrations = new Map<string, ActionRegistration>();
      actionRegistrations.set('0.0.11111', {
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.11111',
        hash: 'action-hash-123',
        registryId: '0.0.11111',
        wasm_hash: '0.0.11111',
      });
      actionRegistrations.set('0.0.22222', {
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.22222',
        hash: 'action-hash-123',
        registryId: '0.0.22222',
        wasm_hash: '0.0.22222',
      });

      const blockRegistrations = new Map<string, BlockRegistration>();
      blockRegistrations.set('0.0.33333', {
        p: 'hcs-12',
        op: 'register',
        name: 'block-1',
        version: '1.0.0',
        t_id: '0.0.33333',
      });
      blockRegistrations.set('0.0.44444', {
        p: 'hcs-12',
        op: 'register',
        name: 'block-2',
        version: '2.0.0',
        t_id: '0.0.44444',
      });

      const result = await composer.compose(
        assembly,
        actionRegistrations,
        blockRegistrations,
      );

      expect(result.validated).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.actions.size).toBe(2);
      expect(result.blocks.size).toBe(2);
    });
  });
});
