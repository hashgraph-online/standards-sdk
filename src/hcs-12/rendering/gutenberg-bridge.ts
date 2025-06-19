/**
 * Gutenberg Bridge for HCS-12 HashLinks
 *
 * Provides conversion between HashLinks block definitions and WordPress
 * Gutenberg block format, enabling seamless integration with Gutenberg editors.
 */

import { Logger } from '../../utils/logger';
import {
  BlockRegistration,
  GutenbergBlockType,
  BlockAttribute,
  BlockSupports,
} from '../types';

export interface GutenbergValidationResult {
  isValid: boolean;
  errors: GutenbergValidationError[];
  warnings: ValidationWarning[];
}

export interface GutenbergValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  impact: 'functionality' | 'usability' | 'performance';
}

/**
 * Bridge between HashLinks and Gutenberg block formats
 */
export class GutenbergBridge {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Convert HashLinks BlockRegistration to Gutenberg block format
   */
  convertToGutenberg(blockRegistration: BlockRegistration): GutenbergBlockType {
    this.logger.debug('Converting BlockRegistration to Gutenberg format', {
      name: blockRegistration.name,
      version: blockRegistration.version,
    });

    if (!blockRegistration || !blockRegistration.data) {
      throw new Error('Invalid block registration: missing data');
    }

    if (typeof blockRegistration.data === 'string') {
      throw new Error(
        'Cannot convert HCS-1 reference to Gutenberg format without fetching data',
      );
    }

    if (!blockRegistration.name || !blockRegistration.data.name) {
      throw new Error('Invalid block registration: missing block name');
    }

    const gutenbergBlock: GutenbergBlockType = {
      ...blockRegistration.data,
    };

    if (!gutenbergBlock.attributes) {
      gutenbergBlock.attributes = {};
    }

    if (!gutenbergBlock.supports) {
      gutenbergBlock.supports = {};
    }

    this.logger.debug('Converted to Gutenberg format', {
      name: gutenbergBlock.name,
      attributeCount: Object.keys(gutenbergBlock.attributes).length,
    });

    return gutenbergBlock;
  }

  /**
   * Parse Gutenberg block to HashLinks BlockRegistration format
   */
  parseFromGutenberg(gutenbergBlock: GutenbergBlockType): BlockRegistration {
    this.logger.debug('Parsing Gutenberg block to BlockRegistration', {
      name: gutenbergBlock.name,
    });

    if (!gutenbergBlock || !gutenbergBlock.name) {
      throw new Error('Invalid Gutenberg block: missing name');
    }

    if (!gutenbergBlock.title) {
      throw new Error('Invalid Gutenberg block: missing title');
    }

    const blockRegistration: BlockRegistration = {
      p: 'hcs-12',
      op: 'register',
      name: gutenbergBlock.name,
      version: '1.0.0',
      data: gutenbergBlock,
    };

    this.logger.debug('Parsed from Gutenberg format', {
      name: blockRegistration.name,
    });

    return blockRegistration;
  }

  /**
   * Validate block structure for Gutenberg compatibility
   */
  validateBlockStructure(
    blockRegistration: BlockRegistration,
  ): GutenbergValidationResult {
    this.logger.debug('Validating block structure', {
      name: blockRegistration.name,
    });

    const result: GutenbergValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    this.validateBasicStructure(blockRegistration, result);

    this.validateBlockName(blockRegistration, result);

    this.validateAttributes(blockRegistration, result);

    this.validateSupports(blockRegistration, result);

    this.validateParentChild(blockRegistration, result);

    result.isValid =
      result.errors.filter(
        e => e.severity === 'critical' || e.severity === 'high',
      ).length === 0;

    this.logger.debug('Block structure validation completed', {
      name: blockRegistration.name,
      isValid: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
    });

    return result;
  }

  /**
   * Validate basic block structure
   */
  private validateBasicStructure(
    blockRegistration: BlockRegistration,
    result: GutenbergValidationResult,
  ): void {
    if (!blockRegistration.name || blockRegistration.name.trim() === '') {
      result.errors.push({
        code: 'MISSING_NAME',
        message: 'Block name cannot be empty',
        field: 'name',
        severity: 'critical',
      });
    }

    if (blockRegistration.data && typeof blockRegistration.data === 'object') {
      if (!blockRegistration.data.title) {
        result.errors.push({
          code: 'MISSING_TITLE',
          message: 'Block title is required',
          field: 'data.title',
          severity: 'high',
        });
      }

      if (!blockRegistration.data.description) {
        result.warnings.push({
          code: 'MISSING_DESCRIPTION',
          message: 'Block description improves usability',
          field: 'data.description',
          impact: 'usability',
        });
      }
    }

    if (!blockRegistration.data) {
      result.errors.push({
        code: 'MISSING_BLOCK_JSON',
        message: 'data is required for Gutenberg compatibility',
        field: 'data',
        severity: 'critical',
      });
    }
  }

  /**
   * Validate block name format
   */
  private validateBlockName(
    blockRegistration: BlockRegistration,
    result: GutenbergValidationResult,
  ): void {
    if (!blockRegistration.name) return;

    const namePattern = /^[a-z0-9-]+\/[a-z0-9-]+$/;
    if (!namePattern.test(blockRegistration.name)) {
      result.errors.push({
        code: 'INVALID_BLOCK_NAME',
        message:
          'Block name must follow namespace/block-name format (lowercase, hyphens only)',
        field: 'name',
        severity: 'high',
      });
    }

    if (
      blockRegistration.data &&
      typeof blockRegistration.data === 'object' &&
      blockRegistration.data.name !== blockRegistration.name
    ) {
      result.warnings.push({
        code: 'NAME_MISMATCH',
        message: 'Block name should match data.name',
        field: 'name',
        impact: 'functionality',
      });
    }
  }

  /**
   * Validate block attributes
   */
  private validateAttributes(
    blockRegistration: BlockRegistration,
    result: GutenbergValidationResult,
  ): void {
    if (!blockRegistration.data || typeof blockRegistration.data === 'string')
      return;
    if (!blockRegistration.data.attributes) return;

    const attributes = blockRegistration.data.attributes;
    const validTypes = ['string', 'number', 'boolean', 'array', 'object'];

    for (const [attrName, attrDef] of Object.entries(attributes)) {
      if (!attrDef.type) {
        result.errors.push({
          code: 'MISSING_ATTRIBUTE_TYPE',
          message: `Attribute '${attrName}' must specify a type`,
          field: `attributes.${attrName}.type`,
          severity: 'medium',
        });
        continue;
      }

      if (!validTypes.includes(attrDef.type)) {
        result.errors.push({
          code: 'INVALID_ATTRIBUTE_TYPE',
          message: `Attribute '${attrName}' has invalid type '${attrDef.type}'`,
          field: `attributes.${attrName}.type`,
          severity: 'high',
        });
      }

      if (
        attrDef.enum &&
        attrDef.default &&
        !attrDef.enum.includes(attrDef.default)
      ) {
        result.warnings.push({
          code: 'DEFAULT_NOT_IN_ENUM',
          message: `Attribute '${attrName}' default value not in enum`,
          field: `attributes.${attrName}.default`,
          impact: 'functionality',
        });
      }
    }
  }

  /**
   * Validate block supports
   */
  private validateSupports(
    blockRegistration: BlockRegistration,
    result: GutenbergValidationResult,
  ): void {
    if (!blockRegistration.data || typeof blockRegistration.data === 'string')
      return;
    if (!blockRegistration.data.supports) return;

    const supports = blockRegistration.data.supports;

    if (supports.align !== undefined) {
      if (typeof supports.align === 'boolean') {
      } else if (Array.isArray(supports.align)) {
        const validAlignments = ['left', 'center', 'right', 'wide', 'full'];
        const invalidAlignments = supports.align.filter(
          align => !validAlignments.includes(align),
        );
        if (invalidAlignments.length > 0) {
          result.warnings.push({
            code: 'INVALID_ALIGNMENT',
            message: `Invalid alignment values: ${invalidAlignments.join(', ')}`,
            field: 'supports.align',
            impact: 'functionality',
          });
        }
      }
    }
  }

  /**
   * Validate parent/child relationships
   */
  private validateParentChild(
    blockRegistration: BlockRegistration,
    result: GutenbergValidationResult,
  ): void {
    if (!blockRegistration.data || typeof blockRegistration.data === 'string')
      return;

    if (blockRegistration.data.parent) {
      result.warnings.push({
        code: 'REQUIRES_PARENT',
        message: 'Block requires a specific parent block',
        field: 'parent',
        impact: 'usability',
      });
    }

    if (
      blockRegistration.data.provides &&
      Object.keys(blockRegistration.data.provides).length > 0
    ) {
      result.warnings.push({
        code: 'PROVIDES_CONTEXT',
        message: 'Block provides context to child blocks',
        field: 'provides',
        impact: 'functionality',
      });
    }

    if (
      blockRegistration.data.usesContext &&
      blockRegistration.data.usesContext.length > 0
    ) {
      result.warnings.push({
        code: 'USES_CONTEXT',
        message: 'Block depends on context from parent blocks',
        field: 'usesContext',
        impact: 'functionality',
      });
    }
  }
}
