/**
 * Tests for BlockBuilder utility
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BlockBuilder } from '../../../src/hcs-12/builders/block-builder';
import { Logger } from '../../../src/utils/logger';
import {
  BlockStyle,
  BlockAttribute,
  BlockSupport,
} from '../../../src/hcs-12/types';

describe('BlockBuilder', () => {
  let builder: BlockBuilder;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'BlockBuilderTest' });
    jest.spyOn(logger, 'info').mockImplementation();

    builder = new BlockBuilder(logger);
  });

  describe('Basic Block Building', () => {
    it('should create a minimal block registration', () => {
      const registration = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/button')
        .setTitle('HashLink Button')
        .setCategory('widgets')
        .build();

      expect(registration).toEqual({
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.123456',
        name: 'hashlinks/button',
        title: 'HashLink Button',
        category: 'widgets',
      });
    });

    it('should add optional fields', () => {
      const registration = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/card')
        .setTitle('HashLink Card')
        .setCategory('layout')
        .setDescription('A flexible card component')
        .setIcon('dashicon:index-card')
        .addKeyword('container')
        .addKeyword('layout')
        .setParent('hashlinks/base-card')
        .build();

      expect(registration.description).toBe('A flexible card component');
      expect(registration.icon).toBe('dashicon:index-card');
      expect(registration.keywords).toEqual(['container', 'layout']);
      expect(registration.parent).toBe('hashlinks/base-card');
    });

    it('should add styles', () => {
      const style1: BlockStyle = {
        name: 'rounded',
        label: 'Rounded Corners',
        isDefault: true,
      };

      const style2: BlockStyle = {
        name: 'shadow',
        label: 'With Shadow',
      };

      const registration = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/styled-block')
        .setTitle('Styled Block')
        .setCategory('layout')
        .addStyle(style1)
        .addStyle(style2)
        .build();

      expect(registration.styles).toHaveLength(2);
      expect(registration.styles![0]).toEqual(style1);
      expect(registration.styles![1]).toEqual(style2);
    });

    it('should add attributes', () => {
      const registration = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/form')
        .setTitle('Form Block')
        .setCategory('widgets')
        .addAttribute('action', {
          type: 'string',
          required: true,
        })
        .addAttribute('method', {
          type: 'string',
          default: 'POST',
          enum: ['GET', 'POST'],
        })
        .build();

      expect(registration.attributes).toBeDefined();
      expect(registration.attributes!.action).toEqual({
        type: 'string',
        required: true,
      });
      expect(registration.attributes!.method.default).toBe('POST');
    });

    it('should set supports configuration', () => {
      const supports: BlockSupport = {
        align: true,
        anchor: true,
        customClassName: true,
        html: false,
        inserter: true,
        multiple: false,
      };

      const registration = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/alignable')
        .setTitle('Alignable Block')
        .setCategory('layout')
        .setSupports(supports)
        .build();

      expect(registration.supports).toEqual(supports);
    });
  });

  describe('Fluent API', () => {
    it('should support method chaining', () => {
      const result = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/chain-test')
        .setTitle('Chain Test')
        .setCategory('widgets')
        .setDescription('Testing method chaining')
        .addKeyword('test')
        .addStyle({ name: 'default', label: 'Default' })
        .addAttribute('test', { type: 'string' });

      expect(result).toBe(builder);
    });

    it('should allow building multiple registrations', () => {
      builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/block1')
        .setTitle('Block 1')
        .setCategory('widgets');

      const reg1 = builder.build();

      const reg2 = builder
        .reset()
        .setTopicId('0.0.999999')
        .setName('hashlinks/block2')
        .setTitle('Block 2')
        .setCategory('layout')
        .build();

      expect(reg1.name).toBe('hashlinks/block1');
      expect(reg2.name).toBe('hashlinks/block2');
      expect(reg1.t_id).not.toBe(reg2.t_id);
    });
  });

  describe('Validation', () => {
    it('should validate required fields', () => {
      expect(() => builder.build()).toThrow('Topic ID is required');

      builder.setTopicId('0.0.123456');
      expect(() => builder.build()).toThrow('Block name is required');

      builder.setName('hashlinks/test');
      expect(() => builder.build()).toThrow('Block title is required');

      builder.setTitle('Test Block');
      expect(() => builder.build()).toThrow('Block category is required');
    });

    it('should validate block name format', () => {
      builder.setTopicId('0.0.123456');

      expect(() => builder.setName('invalid name')).toThrow(
        'Invalid block name format',
      );

      expect(() => builder.setName('InvalidCase/block')).toThrow(
        'Invalid block name format',
      );

      expect(() => builder.setName('hashlinks/valid-block')).not.toThrow();
    });

    it('should validate category', () => {
      builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/test')
        .setTitle('Test');

      expect(() => builder.setCategory('invalid' as any)).toThrow(
        'Invalid block category',
      );

      expect(() => builder.setCategory('widgets')).not.toThrow();
    });

    it('should validate icon format', () => {
      builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/test')
        .setTitle('Test')
        .setCategory('widgets');

      expect(() => builder.setIcon('invalid-icon')).toThrow(
        'Invalid icon format',
      );

      expect(() => builder.setIcon('dashicon:admin-site')).not.toThrow();

      expect(() => builder.setIcon('svg:M10 20v-6h4v6h5v')).not.toThrow();
    });

    it('should validate attribute types', () => {
      builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/test')
        .setTitle('Test')
        .setCategory('widgets');

      expect(() =>
        builder.addAttribute('test', {
          type: 'invalid' as any,
        }),
      ).toThrow('Invalid attribute type');
    });
  });

  describe('Helper Methods', () => {
    it('should create example configurations', () => {
      const button = builder.createButtonBlock(
        'hashlinks/my-button',
        'My Button',
        '0.0.123456',
      );

      expect(button.name).toBe('hashlinks/my-button');
      expect(button.category).toBe('widgets');
      expect(button.attributes).toBeDefined();
      expect(button.attributes!.label).toBeDefined();
      expect(button.attributes!.action).toBeDefined();
    });

    it('should create container block', () => {
      const container = builder.createContainerBlock(
        'hashlinks/my-container',
        'My Container',
        '0.0.123456',
      );

      expect(container.category).toBe('layout');
      expect(container.supports?.align).toBe(true);
      expect(container.supports?.anchor).toBe(true);
    });

    it('should validate block registration completeness', () => {
      const incomplete = {
        p: 'hcs-12',
        op: 'register',
        t_id: '0.0.123456',
        name: 'hashlinks/test',
      };

      expect(builder.isComplete(incomplete as any)).toBe(false);

      const complete = {
        ...incomplete,
        name: 'hashlinks/test',
        title: 'Test Block',
        category: 'widgets' as any,
      };

      expect(builder.isComplete(complete as any)).toBe(true);
    });
  });

  describe('Advanced Features', () => {
    it('should support inheritance with parent blocks', () => {
      const childBlock = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/button-primary')
        .setTitle('Primary Button')
        .setCategory('widgets')
        .setParent('hashlinks/button-base')
        .addStyle({
          name: 'primary',
          label: 'Primary Style',
          isDefault: true,
        })
        .build();

      expect(childBlock.parent).toBe('hashlinks/button-base');
    });

    it('should configure block for HashLink actions', () => {
      const actionBlock = builder
        .setTopicId('0.0.123456')
        .setName('hashlinks/action-executor')
        .setTitle('Action Executor')
        .setCategory('interactive')
        .addAttribute('actionHash', {
          type: 'string',
          required: true,
          source: 'hashlink-action',
        })
        .addAttribute('params', {
          type: 'object',
          default: {},
        })
        .build();

      expect(actionBlock.attributes!.actionHash.source).toBe('hashlink-action');
    });
  });
});
