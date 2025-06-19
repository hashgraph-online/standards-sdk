/**
 * Tests for AssemblyBuilder utility
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AssemblyBuilder } from '../../../src/hcs-12/builders/assembly-builder';
import { Logger } from '../../../src/utils/logger';
import {
  AssemblyAction,
  AssemblyBlock,
  AssemblyDependency,
  AssemblyWorkflowStep,
} from '../../../src/hcs-12/types';

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
        .setTitle('My Application')
        .setCategory('productivity')
        .build();

      expect(registration).toMatchObject({
        p: 'hcs-12',
        op: 'register',
        name: 'my-app',
        version: '1.0.0',
      });
      expect(registration.actions).toEqual([]);
      expect(registration.blocks).toEqual([]);
    });

    it('should add metadata fields', () => {
      const registration = builder
        .setName('defi-dashboard')
        .setVersion('2.1.0')
        .setTitle('DeFi Dashboard')
        .setCategory('finance')
        .setDescription('Complete DeFi portfolio management')
        .setAuthor('0.0.123456')
        .setLicense('MIT')
        .setIcon('dashicon:chart-area')
        .addKeyword('defi')
        .addKeyword('portfolio')
        .build();

      expect(registration.description).toBe(
        'Complete DeFi portfolio management',
      );
      expect(registration.author).toBe('0.0.123456');
      expect(registration.license).toBe('MIT');
      expect(registration.icon).toBe('dashicon:chart-area');
      expect(registration.keywords).toEqual(['defi', 'portfolio']);
    });

    it('should add actions', () => {
      const action1: AssemblyAction = {
        registryId: '0.0.12345',
        version: '1.0.0',
        id: 'transfer',
      };

      const action2: AssemblyAction = {
        id: 'approve',
        registryId: '0.0.12345',
        version: '1.2.0',
      };

      const registration = builder
        .setName('payment-app')
        .setVersion('1.0.0')
        .setTitle('Payment App')
        .setCategory('finance')
        .addAction(action1)
        .addAction(action2)
        .build();

      expect(registration.actions).toHaveLength(2);
      expect(registration.actions![0].id).toBe('transfer');
    });

    it('should add blocks', () => {
      const block1: AssemblyBlock = {
        id: 'payment-form',
        registryId: '0.0.22345',
        version: '1.0.0',
        config: {
          defaultAmount: 100,
        },
      };

      const block2: AssemblyBlock = {
        id: 'transaction-list',
        registryId: '0.0.22345',
        version: '2.0.0',
      };

      const registration = builder
        .setName('payment-ui')
        .setVersion('1.0.0')
        .setTitle('Payment UI')
        .setCategory('finance')
        .addBlock(block1)
        .addBlock(block2)
        .build();

      expect(registration.blocks).toHaveLength(2);
      expect(registration.blocks![0].config).toBeDefined();
    });
  });

  describe('Fluent API', () => {
    it('should support method chaining', () => {
      const result = builder
        .setName('test-app')
        .setVersion('1.0.0')
        .setTitle('Test App')
        .setCategory('test')
        .setDescription('Testing')
        .addKeyword('test')
        .addAction({ id: 'test-action', registryId: '0.0.12345' })
        .addBlock({
          id: 'test-block',
          registryId: '0.0.22345',
          version: '1.0.0',
        });
      expect(result).toBe(builder);
    });

    it('should allow building multiple assemblies', () => {
      builder
        .setName('app1')
        .setVersion('1.0.0')
        .setTitle('App 1')
        .setCategory('test');

      const reg1 = builder.build();

      const reg2 = builder
        .reset()
        .setName('app2')
        .setVersion('2.0.0')
        .setTitle('App 2')
        .setCategory('productivity')
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

    it('should validate action hashes', () => {
      builder
        .setName('test-app')
        .setVersion('1.0.0')
        .setTitle('Test App')
        .setCategory('test');

      expect(() =>
        builder.addAction({
          registryId: '0.0.12345',
        } as any),
      ).toThrow('Action ID is required');
    });
  });

  describe('Helper Methods', () => {
    it('should build valid assembly', () => {
      const complete = builder
        .setName('test')
        .setVersion('1.0.0')
        .setTitle('Test Assembly')
        .setCategory('test')
        .build();

      expect(complete.actions).toEqual([]);
      expect(complete.blocks).toEqual([]);
      expect(complete.name).toBe('test');
      expect(complete.version).toBe('1.0.0');
    });
  });

  describe('Advanced Features', () => {
    it('should calculate assembly hash', async () => {
      const assembly = builder
        .setName('hashed-app')
        .setVersion('1.0.0')
        .setTitle('Hashed App')
        .setCategory('test')
        .build();

      const hash = await builder.calculateAssemblyHash(assembly);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
