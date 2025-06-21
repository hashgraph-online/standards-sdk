/**
 * Tests for AssemblyBuilder utility
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AssemblyBuilder } from '../../../src/hcs-12/builders/assembly-builder';
import { Logger } from '../../../src/utils/logger';

describe('AssemblyBuilder', () => {
  let builder: AssemblyBuilder;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'AssemblyBuilderTest' });
    jest.spyOn(logger, 'info').mockImplementation();

    builder = new AssemblyBuilder(logger);
  });

  describe('Basic Assembly Building', () => {
    it('should create a minimal assembly registration', () => {
      const registration = builder
        .setName('my-app')
        .setVersion('1.0.0')
        .build();

      expect(registration).toMatchObject({
        p: 'hcs-12',
        op: 'register',
        name: 'my-app',
        version: '1.0.0',
      });
      expect(registration.description).toBeUndefined();
      expect(registration.tags).toBeUndefined();
    });

    it('should add metadata fields', () => {
      const registration = builder
        .setName('defi-dashboard')
        .setVersion('2.1.0')
        .setDescription('Complete DeFi portfolio management')
        .setAuthor('0.0.123456')
        .addTag('defi')
        .addTag('portfolio')
        .build();

      expect(registration.description).toBe(
        'Complete DeFi portfolio management',
      );
      expect(registration.author).toBe('0.0.123456');
      expect(registration.tags).toEqual(['defi', 'portfolio']);
    });

    it('should create add-action operations', () => {
      const operations = builder
        .addAction('0.0.12345', 'transfer', { maxAmount: 1000 })
        .addAction('0.0.12346', 'approve')
        .buildOperations();

      expect(operations).toHaveLength(2);
      expect(operations[0]).toMatchObject({
        p: 'hcs-12',
        op: 'add-action',
        t_id: '0.0.12345',
        alias: 'transfer',
        config: { maxAmount: 1000 },
      });
      expect(operations[1]).toMatchObject({
        p: 'hcs-12',
        op: 'add-action',
        t_id: '0.0.12346',
        alias: 'approve',
      });
    });

    it('should create add-block operations', () => {
      const operations = builder
        .addBlock('0.0.22345', { transfer: '0.0.12345' }, {
          defaultAmount: 100,
        })
        .addBlock('0.0.22346', undefined, {
          pageSize: 10,
        })
        .buildOperations();

      expect(operations).toHaveLength(2);
      expect(operations[0]).toMatchObject({
        p: 'hcs-12',
        op: 'add-block',
        block_t_id: '0.0.22345',
        actions: { transfer: '0.0.12345' },
        attributes: { defaultAmount: 100 },
      });
      expect(operations[1]).toMatchObject({
        p: 'hcs-12',
        op: 'add-block',
        block_t_id: '0.0.22346',
        attributes: { pageSize: 10 },
      });
    });
  });

  describe('Fluent API', () => {
    it('should support method chaining', () => {
      const result = builder
        .setName('test-app')
        .setVersion('1.0.0')
        .setDescription('Testing')
        .addTag('test')
        .addAction('0.0.12345', 'test-action')
        .addBlock('0.0.22345');
      expect(result).toBe(builder);
    });

    it('should allow building multiple assemblies', () => {
      builder.setName('app1').setVersion('1.0.0').setDescription('First app');

      const reg1 = builder.build();

      const reg2 = builder
        .reset()
        .setName('app2')
        .setVersion('2.0.0')
        .setDescription('Second app')
        .build();

      expect(reg1.name).toBe('app1');
      expect(reg2.name).toBe('app2');
      expect(reg1.version).not.toBe(reg2.version);
    });
  });

  describe('Validation', () => {
    it('should validate required fields', () => {
      expect(() => builder.build()).toThrow('Assembly name is required');

      builder.setName('test-app');
      expect(() => builder.build()).toThrow('Assembly version is required');

      builder.setVersion('1.0.0');

      expect(() => builder.build()).not.toThrow();
    });

    it('should validate name format', () => {
      expect(() => builder.setName('Invalid Name')).toThrow(
        'Invalid assembly name format',
      );

      expect(() => builder.setName('test-app-123')).not.toThrow();
    });

    it('should validate semantic version', () => {
      builder.setName('test-app');

      expect(() => builder.setVersion('invalid')).toThrow(
        'Invalid semantic version',
      );

      expect(() => builder.setVersion('1.0.0')).not.toThrow();

      expect(() => builder.setVersion('2.1.0-beta.1')).not.toThrow();
    });

    it('should validate action topic IDs', () => {
      expect(() => builder.addAction('invalid-topic', 'test')).toThrow(
        'Invalid topic ID format',
      );

      expect(() => builder.addAction('0.0.12345', 'test')).not.toThrow();
    });

    it('should validate block topic IDs', () => {
      expect(() => builder.addBlock('invalid-topic')).toThrow(
        'Invalid block topic ID format',
      );

      expect(() => builder.addBlock('0.0.12345')).not.toThrow();
    });
  });

  describe('Helper Methods', () => {
    it('should build valid assembly registration', () => {
      const complete = builder
        .setName('test')
        .setVersion('1.0.0')
        .setDescription('Test Assembly')
        .build();

      expect(complete).toMatchObject({
        p: 'hcs-12',
        op: 'register',
        name: 'test',
        version: '1.0.0',
        description: 'Test Assembly',
      });
    });

    it('should support update operations', () => {
      const update = builder
        .setDescription('Updated description')
        .addTag('new-tag')
        .buildUpdate();

      expect(update).toMatchObject({
        p: 'hcs-12',
        op: 'update',
        description: 'Updated description',
        tags: ['new-tag'],
      });
    });
  });

  describe('Advanced Features', () => {
    it('should build complete operation sequence', () => {
      const operations = builder
        .setName('complete-app')
        .setVersion('1.0.0')
        .setDescription('Complete application')
        .addAction('0.0.12345', 'transfer')
        .addAction('0.0.12346', 'approve')
        .addBlock('0.0.22345', { transfer: '0.0.12345', approve: '0.0.12346' })
        .buildOperations();

      expect(operations[0].op).toBe('add-action');
      expect(operations[1].op).toBe('add-action');
      expect(operations[2].op).toBe('add-block');
    });

    it('should handle data field for large configs', () => {
      const operation = builder
        .addAction(
          '0.0.12345',
          'complex-action',
          {
            /* large config */
          },
          '0.0.99999',
        )
        .buildOperations()[0];

      expect(operation).toMatchObject({
        p: 'hcs-12',
        op: 'add-action',
        t_id: '0.0.12345',
        alias: 'complex-action',
        data: '0.0.99999',
      });
    });
  });
});
