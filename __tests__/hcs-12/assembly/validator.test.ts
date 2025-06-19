/**
 * Tests for Assembly Validator
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AssemblyValidator } from '../../../src/hcs-12/assembly/validator';
import { Logger } from '../../../src/utils/logger';
import { AssemblyRegistration } from '../../../src/hcs-12/types';

describe('AssemblyValidator', () => {
  let validator: AssemblyValidator;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'AssemblyValidatorTest' });
    validator = new AssemblyValidator(logger);
  });

  describe('Structure Validation', () => {
    it('should validate a well-formed assembly', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'valid-assembly',
        version: '1.0.0',

        description: 'A well-formed assembly for testing',
        tags: ['test'],
        actions: [
          {
            id: 'test-action',
            registryId: '0.0.12345',
            version: '1.0.0',
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

      const result = await validator.validate(assembly);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.score).toBeGreaterThan(80);
    });

    it('should catch missing required fields', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: '',
        version: '',
      };

      const result = await validator.validate(assembly);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_NAME')).toBe(true);
      expect(result.errors.some(e => e.code === 'MISSING_VERSION')).toBe(true);
    });

    it('should validate protocol and operation', async () => {
      const assembly: AssemblyRegistration = {
        p: 'invalid' as any,
        op: 'invalid' as any,
        name: 'test',
        version: '1.0.0',
      };

      const result = await validator.validate(assembly);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_PROTOCOL')).toBe(true);
      expect(result.errors.some(e => e.code === 'INVALID_OPERATION')).toBe(
        true,
      );
    });

    it('should validate name format', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'Invalid_Name!',
        version: '1.0.0',
      };

      const result = await validator.validate(assembly);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NAME_FORMAT')).toBe(
        true,
      );
    });

    it('should validate version format', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: 'invalid-version',
      };

      const result = await validator.validate(assembly);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_VERSION_FORMAT')).toBe(
        true,
      );
    });
  });

  describe('Metadata Validation', () => {
    it('should warn about missing metadata', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
      };

      const result = await validator.validate(assembly);

      expect(result.warnings.some(w => w.code === 'MISSING_DESCRIPTION')).toBe(
        true,
      );
      expect(result.warnings.some(w => w.code === 'MISSING_TITLE')).toBe(false);
      expect(result.warnings.some(w => w.code === 'MISSING_CATEGORY')).toBe(
        false,
      );
      expect(result.warnings.some(w => w.code === 'MISSING_AUTHOR')).toBe(
        false,
      );
    });

    it('should recommend longer descriptions', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        description: 'Short',
      };

      const result = await validator.validate(assembly);

      expect(
        result.recommendations.some(r => r.code === 'SHORT_DESCRIPTION'),
      ).toBe(true);
    });

    it('should validate with required documentation', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
      };

      const result = await validator.validate(assembly, {
        requireDocumentation: true,
      });

      expect(result.warnings.some(w => w.code === 'MISSING_TAGS')).toBe(true);
    });
  });

  describe('Action Validation', () => {
    it('should validate action structure', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          {
            version: 'invalid-version',
          } as any,
        ],
      };

      const result = await validator.validate(assembly);

      expect(
        result.errors.some(e => e.code === 'MISSING_ACTION_REGISTRY_ID'),
      ).toBe(true);
      expect(result.errors.some(e => e.code === 'MISSING_ACTION_ID')).toBe(
        true,
      );
      expect(result.errors.some(e => e.code === 'INVALID_ACTION_VERSION')).toBe(
        true,
      );
    });

    it('should detect duplicate action registry IDs', async () => {
      const registryId = '0.0.12345';
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          { id: 'action1', registryId },
          { id: 'action2', registryId },
        ],
      };

      const result = await validator.validate(assembly);

      expect(
        result.errors.some(e => e.code === 'DUPLICATE_ACTION_REGISTRY_ID'),
      ).toBe(true);
    });

    it('should detect duplicate action IDs', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: [
          { id: 'same-id', registryId: '0.0.12345' },
          { id: 'same-id', registryId: '0.0.12346' },
        ],
      };

      const result = await validator.validate(assembly);

      expect(result.errors.some(e => e.code === 'DUPLICATE_ACTION_ID')).toBe(
        true,
      );
    });

    it('should warn about too many actions', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: Array.from({ length: 15 }, (_, i) => ({
          registryId: `0.0.${12345 + i}`,
          id: `action-${i}`,
        })),
      };

      const result = await validator.validate(assembly);

      expect(result.warnings.some(w => w.code === 'MANY_ACTIONS')).toBe(true);
    });
  });

  describe('Block Validation', () => {
    it('should validate block structure', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        blocks: [
          {
            version: 'invalid-version',
            attributes: 'invalid-attributes' as any,
          } as any,
        ],
      };

      const result = await validator.validate(assembly);

      expect(result.errors.some(e => e.code === 'MISSING_BLOCK_ID')).toBe(true);
      expect(result.errors.some(e => e.code === 'INVALID_BLOCK_VERSION')).toBe(
        true,
      );
      expect(
        result.errors.some(e => e.code === 'INVALID_BLOCK_ATTRIBUTES'),
      ).toBe(true);
    });

    it('should detect duplicate block names', async () => {
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
          {
            id: 'test-block',
            registryId: '0.0.22346',
            version: '2.0.0',
          },
        ],
      };

      const result = await validator.validate(assembly);

      expect(result.errors.some(e => e.code === 'DUPLICATE_BLOCK_ID')).toBe(
        true,
      );
    });

    it('should warn about too many blocks', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        blocks: Array.from({ length: 25 }, (_, i) => ({
          id: `block-${i}`,
          registryId: `0.0.${22345 + i}`,
          version: '1.0.0',
        })),
      };

      const result = await validator.validate(assembly);

      expect(result.warnings.some(w => w.code === 'MANY_BLOCKS')).toBe(true);
    });
  });

  describe('Performance Validation', () => {
    it('should estimate load time', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: Array.from({ length: 10 }, (_, i) => ({
          registryId: `0.0.${12345 + i}`,
        })),
        blocks: Array.from({ length: 20 }, (_, i) => ({
          id: `block-${i}`,
          registryId: `0.0.${22345 + i}`,
          version: '1.0.0',
        })),
      };

      const result = await validator.validate(assembly, {
        checkPerformance: true,
      });

      expect(result.metadata.estimatedLoadTime).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.code === 'SLOW_LOAD_TIME')).toBe(true);
    });

    it('should recommend component optimization', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: Array.from({ length: 6 }, (_, i) => ({
          registryId: `0.0.${12345 + i}`,
        })),
        blocks: Array.from({ length: 11 }, (_, i) => ({
          id: `block-${i}`,
          registryId: `0.0.${22345 + i}`,
          version: '1.0.0',
        })),
      };

      const result = await validator.validate(assembly, {
        checkPerformance: true,
      });

      expect(
        result.recommendations.some(r => r.code === 'OPTIMIZE_COMPONENTS'),
      ).toBe(true);
    });
  });

  describe('Security Validation', () => {
    it('should assess security risk', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'test-assembly',
        version: '1.0.0',
        actions: Array.from({ length: 10 }, (_, i) => ({
          id: `action-${i}`,
          registryId: `0.0.${12345 + i}`,
        })),
      };

      const result = await validator.validate(assembly, {
        validateSecurity: true,
      });

      expect(result.metadata.securityRisk).toBe('medium');
      expect(
        result.recommendations.some(
          r => r.code === 'REVIEW_ACTION_PERMISSIONS',
        ),
      ).toBe(true);
    });
  });

  describe('Metadata Calculation', () => {
    it('should calculate complexity correctly', async () => {
      const simpleAssembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'simple-assembly',
        version: '1.0.0',
        actions: [{ id: 'action-default', registryId: '0.0.12345' }],
        blocks: [
          {
            id: 'test-block',
            registryId: '0.0.22345',
            version: '1.0.0',
          },
        ],
      };

      const result = await validator.validate(simpleAssembly);

      expect(result.metadata.complexity).toBe('simple');
      expect(result.metadata.actionCount).toBe(1);
      expect(result.metadata.blockCount).toBe(1);
    });

    it('should determine moderate complexity', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'moderate-assembly',
        version: '1.0.0',
        actions: Array.from({ length: 5 }, (_, i) => ({
          registryId: `0.0.${12345 + i}`,
        })),
        blocks: Array.from({ length: 5 }, (_, i) => ({
          id: `block-${i}`,
          registryId: `0.0.${22345 + i}`,
          version: '1.0.0',
        })),
      };

      const result = await validator.validate(assembly);

      expect(result.metadata.complexity).toBe('moderate');
    });

    it('should determine complex assembly', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'complex-assembly',
        version: '1.0.0',
        actions: Array.from({ length: 10 }, (_, i) => ({
          registryId: `0.0.${12345 + i}`,
        })),
        blocks: Array.from({ length: 10 }, (_, i) => ({
          id: `block-${i}`,
          registryId: `0.0.${22345 + i}`,
          version: '1.0.0',
        })),
      };

      const result = await validator.validate(assembly);

      expect(result.metadata.complexity).toBe('complex');
    });
  });

  describe('Score Calculation', () => {
    it('should penalize errors and warnings', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: '',
        version: 'invalid',
        actions: [{ id: 'action1', registryId: 'invalid-registry-id' }],
      };

      const result = await validator.validate(assembly);

      expect(result.score).toBeLessThan(70);
    });

    it('should give bonus for good practices', async () => {
      const assembly: AssemblyRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'well-documented-assembly',
        version: '1.0.0',

        description:
          'This assembly is well documented and follows best practices',
        tags: ['example', 'documentation'],
        actions: [{ id: 'action-default', registryId: '0.0.12345' }],
        blocks: [
          {
            id: 'test-block',
            registryId: '0.0.22345',
            version: '1.0.0',
          },
        ],
      };

      const result = await validator.validate(assembly);

      expect(result.score).toBeGreaterThan(90);
      expect(result.metadata.complexity).toBe('simple');
    });
  });
});
