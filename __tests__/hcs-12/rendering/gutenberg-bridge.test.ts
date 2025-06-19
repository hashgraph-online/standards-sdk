/**
 * Tests for Gutenberg Bridge
 *
 * Tests the conversion between HashLinks blocks and Gutenberg blocks
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GutenbergBridge } from '../../../src/hcs-12/rendering/gutenberg-bridge';
import { Logger } from '../../../src/utils/logger';
import {
  BlockRegistration,
  GutenbergBlockType,
  BlockAttribute,
  BlockSupports,
} from '../../../src/hcs-12/types';

describe('GutenbergBridge', () => {
  let bridge: GutenbergBridge;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'GutenbergBridgeTest' });
    bridge = new GutenbergBridge(logger);
  });

  describe('Block Conversion', () => {
    it('should convert BlockRegistration to Gutenberg format', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/test-button',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/test-button',
          title: 'Test Button',
          category: 'common',
          icon: 'button',
          description: 'A test button block',
          keywords: ['button', 'test'],
          textdomain: 'hashlinks',
          attributes: {
            text: {
              type: 'string',
              default: 'Click me',
            },
            variant: {
              type: 'string',
              default: 'primary',
              enum: ['primary', 'secondary', 'ghost'],
            },
          },
          supports: {
            align: ['left', 'center', 'right'],
            anchor: true,
            customClassName: true,
          },
        },
      };

      const gutenbergBlock = bridge.convertToGutenberg(blockRegistration);

      expect(gutenbergBlock.name).toBe('hashlinks/test-button');
      expect(gutenbergBlock.title).toBe('Test Button');
      expect(gutenbergBlock.category).toBe('common');
      expect(gutenbergBlock.icon).toBe('button');
      expect(gutenbergBlock.description).toBe('A test button block');
      expect(gutenbergBlock.keywords).toEqual(['button', 'test']);
      expect(gutenbergBlock.attributes.text.type).toBe('string');
      expect(gutenbergBlock.attributes.text.default).toBe('Click me');
      expect(gutenbergBlock.supports.align).toEqual([
        'left',
        'center',
        'right',
      ]);
      expect(gutenbergBlock.supports.anchor).toBe(true);
    });

    it('should parse Gutenberg blocks to BlockRegistration', () => {
      const gutenbergBlock: GutenbergBlockType = {
        $schema: 'https://schemas.wp.org/trunk/block.json',
        apiVersion: 3,
        name: 'hashlinks/parsed-block',
        title: 'Parsed Block',
        category: 'widgets',
        icon: 'widget',
        description: 'A parsed block from Gutenberg',
        keywords: ['parsed', 'widget'],
        textdomain: 'hashlinks',
        attributes: {
          content: {
            type: 'string',
            source: 'html',
            selector: 'p',
          },
          color: {
            type: 'string',
            default: '#000000',
          },
        },
        supports: {
          html: false,
          customClassName: true,
          spacing: {
            margin: true,
            padding: true,
          },
        },
      };

      const blockRegistration = bridge.parseFromGutenberg(gutenbergBlock);

      expect(blockRegistration.name).toBe('hashlinks/parsed-block');
      expect(blockRegistration.data).toEqual(gutenbergBlock);
    });

    it('should handle blocks with no attributes', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/simple-block',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/simple-block',
          title: 'Simple Block',
          category: 'common',
          description: 'A simple block with no attributes',
          attributes: {},
          supports: {},
        },
      };

      const gutenbergBlock = bridge.convertToGutenberg(blockRegistration);

      expect(gutenbergBlock.name).toBe('hashlinks/simple-block');
      expect(gutenbergBlock.attributes).toEqual({});
      expect(gutenbergBlock.supports).toEqual({});
    });

    it('should handle blocks with complex attributes', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/complex-block',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/complex-block',
          title: 'Complex Block',
          category: 'common',
          description: 'A block with complex attributes',
          attributes: {
            items: {
              type: 'array',
              default: [],
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  value: { type: 'number' },
                },
              },
            },
            config: {
              type: 'object',
              default: {},
              properties: {
                enabled: { type: 'boolean' },
                settings: {
                  type: 'object',
                  properties: {
                    timeout: { type: 'number' },
                  },
                },
              },
            },
          },
          supports: {
            multiple: false,
            reusable: true,
          },
        },
      };

      const gutenbergBlock = bridge.convertToGutenberg(blockRegistration);

      expect(gutenbergBlock.attributes.items.type).toBe('array');
      expect(gutenbergBlock.attributes.config.type).toBe('object');
      expect(gutenbergBlock.supports.multiple).toBe(false);
      expect(gutenbergBlock.supports.reusable).toBe(true);
    });
  });

  describe('Block Structure Validation', () => {
    it('should validate correct block structure', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/valid-block',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/valid-block',
          title: 'Valid Block',
          category: 'common',
          description: 'A valid block',
          attributes: {
            text: {
              type: 'string',
              default: 'Hello',
            },
          },
          supports: {
            align: true,
          },
        },
      };

      const result = bridge.validateBlockStructure(blockRegistration);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid block name format', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'InvalidBlockName',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'InvalidBlockName',
          title: 'Invalid Block Name',
          category: 'common',
          description: 'Block with invalid name',
          attributes: {},
          supports: {},
        },
      };

      const result = bridge.validateBlockStructure(blockRegistration);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_BLOCK_NAME')).toBe(
        true,
      );
    });

    it('should detect missing required fields', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/incomplete-block',
        version: '1.0.0',

        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/incomplete-block',

          attributes: {},
          supports: {},
        },
      };

      const result = bridge.validateBlockStructure(blockRegistration);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_TITLE')).toBe(true);
    });

    it('should detect invalid attribute types', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/invalid-attrs',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/invalid-attrs',
          title: 'Invalid Attrs',
          category: 'common',
          description: 'Block with invalid attributes',
          attributes: {
            badType: {
              type: 'invalid-type' as any,
              default: 'test',
            },
          },
          supports: {},
        },
      };

      const result = bridge.validateBlockStructure(blockRegistration);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ATTRIBUTE_TYPE')).toBe(
        true,
      );
    });
  });

  describe('Nested Block Handling', () => {
    it('should handle nested blocks correctly', () => {
      const parentBlock: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/parent-block',
        title: 'Parent Block',
        version: '1.0.0',
        category: 'layout',
        description: 'A block that can contain other blocks',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/parent-block',
          title: 'Parent Block',
          category: 'layout',
          description: 'A block that can contain other blocks',
          attributes: {
            allowedBlocks: {
              type: 'array',
              default: ['hashlinks/child-block'],
            },
          },
          supports: {
            html: false,
          },
          providesContext: {
            'hashlinks/parentId': 'parentId',
          },
          usesContext: [],
        },
      };

      const gutenbergBlock = bridge.convertToGutenberg(parentBlock);

      expect(gutenbergBlock.providesContext).toBeDefined();
      expect(gutenbergBlock.providesContext!['hashlinks/parentId']).toBe(
        'parentId',
      );
      expect(gutenbergBlock.usesContext).toEqual([]);
    });

    it('should validate nested block relationships', () => {
      const blockWithParent: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: 'hashlinks/child-block',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: 'hashlinks/child-block',
          title: 'Child Block',
          category: 'layout',
          description: 'A block that must be inside a parent',
          parent: ['hashlinks/parent-block'],
          attributes: {},
          supports: {},
          usesContext: ['hashlinks/parentId'],
        },
      };

      const result = bridge.validateBlockStructure(blockWithParent);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.code === 'REQUIRES_PARENT')).toBe(
        true,
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed block registrations gracefully', () => {
      const malformedBlock = {
        p: 'hcs-12',
        name: 'incomplete',
      } as any;

      expect(() => {
        bridge.convertToGutenberg(malformedBlock);
      }).toThrow('Invalid block registration');
    });

    it('should handle malformed Gutenberg blocks gracefully', () => {
      const malformedGutenberg = {
        name: 'incomplete',
      } as any;

      expect(() => {
        bridge.parseFromGutenberg(malformedGutenberg);
      }).toThrow('Invalid Gutenberg block');
    });

    it('should provide detailed error messages', () => {
      const blockRegistration: BlockRegistration = {
        p: 'hcs-12',
        op: 'register',
        name: '',
        version: '1.0.0',
        data: {
          $schema: 'https://schemas.wp.org/trunk/block.json',
          apiVersion: 3,
          name: '',
          title: '',
          category: '',
          description: 'Block for testing error messages',
          attributes: {},
          supports: {},
        },
      };

      const result = bridge.validateBlockStructure(blockRegistration);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Block name cannot be empty');
      expect(result.errors[0].field).toBe('name');
    });
  });
});
