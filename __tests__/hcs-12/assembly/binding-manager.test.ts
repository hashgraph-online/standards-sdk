/**
 * Tests for Binding Manager
 *
 * Tests action-block binding, parameter mapping, and validation for HashLinks
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BindingManager } from '../../../src/hcs-12/assembly/binding-manager';
import { Logger } from '../../../src/utils/logger';

describe('BindingManager', () => {
  let bindingManager: BindingManager;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ module: 'BindingManagerTest' });
    bindingManager = new BindingManager(logger);
  });

  describe('Parameter Mapping', () => {
    it('should map block attributes to action parameters', () => {
      const blockDefinition = {
        name: 'Transfer Form',
        attributes: [
          { name: 'recipient', type: 'string', required: true },
          { name: 'amount', type: 'number', required: true },
          { name: 'memo', type: 'string', required: false },
        ],
      };

      const actionDefinition = {
        name: 'Transfer Action',
        parameters: [
          { name: 'to', param_type: 'string', required: true },
          { name: 'value', param_type: 'number', required: true },
          { name: 'memo', param_type: 'string', required: false },
        ],
      };

      const binding = {
        action: 'transfer-action',
        parameters: {
          to: '{{attributes.recipient}}',
          value: '{{attributes.amount}}',
          memo: '{{attributes.memo}}',
        },
      };

      const result = bindingManager.createParameterMapping(
        blockDefinition,
        actionDefinition,
        binding,
      );

      expect(result.isValid).toBe(true);
      expect(result.mapping).toEqual({
        to: { source: 'attributes', field: 'recipient', type: 'string' },
        value: { source: 'attributes', field: 'amount', type: 'number' },
        memo: { source: 'attributes', field: 'memo', type: 'string' },
      });
    });

    it('should detect type mismatches in parameter mapping', () => {
      const blockDefinition = {
        name: 'Form',
        attributes: [{ name: 'amount', type: 'string' }],
      };

      const actionDefinition = {
        name: 'Action',
        parameters: [{ name: 'value', param_type: 'number', required: true }],
      };

      const binding = {
        action: 'test-action',
        parameters: {
          value: '{{attributes.amount}}',
        },
      };

      const result = bindingManager.createParameterMapping(
        blockDefinition,
        actionDefinition,
        binding,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Parameter "value" expects number but receives string from "attributes.amount"',
      );
    });

    it('should validate required parameter mappings', () => {
      const blockDefinition = {
        name: 'Form',
        attributes: [{ name: 'optional', type: 'string' }],
      };

      const actionDefinition = {
        name: 'Action',
        parameters: [
          { name: 'required', param_type: 'string', required: true },
        ],
      };

      const binding = {
        action: 'test-action',
        parameters: {},
      };

      const result = bindingManager.createParameterMapping(
        blockDefinition,
        actionDefinition,
        binding,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Required parameter "required" is not mapped',
      );
    });

    it('should support default values for missing parameters', () => {
      const blockDefinition = {
        name: 'Form',
        attributes: [{ name: 'recipient', type: 'string' }],
      };

      const actionDefinition = {
        name: 'Action',
        parameters: [
          { name: 'to', param_type: 'string', required: true },
          {
            name: 'memo',
            param_type: 'string',
            required: false,
            default: 'Default memo',
          },
        ],
      };

      const binding = {
        action: 'test-action',
        parameters: {
          to: '{{attributes.recipient}}',
        },
      };

      const result = bindingManager.createParameterMapping(
        blockDefinition,
        actionDefinition,
        binding,
      );

      expect(result.isValid).toBe(true);
      expect(result.mapping.memo).toEqual({
        source: 'default',
        value: 'Default memo',
        type: 'string',
      });
    });

    it('should support literal values in bindings', () => {
      const blockDefinition = {
        name: 'Form',
        attributes: [{ name: 'recipient', type: 'string' }],
      };

      const actionDefinition = {
        name: 'Action',
        parameters: [
          { name: 'to', param_type: 'string', required: true },
          { name: 'networkId', param_type: 'string', required: true },
        ],
      };

      const binding = {
        action: 'test-action',
        parameters: {
          to: '{{attributes.recipient}}',
          networkId: 'testnet',
        },
      };

      const result = bindingManager.createParameterMapping(
        blockDefinition,
        actionDefinition,
        binding,
      );

      expect(result.isValid).toBe(true);
      expect(result.mapping.networkId).toEqual({
        source: 'literal',
        value: 'testnet',
        type: 'string',
      });
    });
  });

  describe('Binding Validation', () => {
    it('should validate binding configuration', () => {
      const actionDefinition = {
        name: 'Valid Action',
        parameters: [
          { name: 'param1', param_type: 'string', required: true },
          { name: 'param2', param_type: 'number', required: false },
        ],
      };

      const binding = {
        action: 'valid-action',
        parameters: {
          param1: '{{attributes.value1}}',
          param2: '{{attributes.value2}}',
        },
        trigger: 'onClick',
        validation: {
          enabled: true,
          showErrors: true,
        },
      };

      const result = bindingManager.validateBinding(actionDefinition, binding);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid parameter names in binding', () => {
      const actionDefinition = {
        name: 'Action',
        parameters: [
          { name: 'validParam', param_type: 'string', required: true },
        ],
      };

      const binding = {
        action: 'test-action',
        parameters: {
          invalidParam: '{{attributes.value}}',
        },
      };

      const result = bindingManager.validateBinding(actionDefinition, binding);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Parameter "invalidParam" does not exist in action definition',
      );
    });

    it('should validate binding trigger types', () => {
      const actionDefinition = {
        name: 'Action',
        parameters: [],
      };

      const invalidBinding = {
        action: 'test-action',
        parameters: {},
        trigger: 'invalidTrigger',
      };

      const result = bindingManager.validateBinding(
        actionDefinition,
        invalidBinding,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Invalid trigger type "invalidTrigger". Must be one of: onClick, onSubmit, onChange, onLoad',
      );
    });

    it('should support conditional bindings', () => {
      const actionDefinition = {
        name: 'Conditional Action',
        parameters: [{ name: 'amount', param_type: 'number', required: true }],
      };

      const binding = {
        action: 'conditional-action',
        parameters: {
          amount: '{{attributes.amount}}',
        },
        condition: '{{attributes.amount}} > 0',
        trigger: 'onSubmit',
      };

      const result = bindingManager.validateBinding(actionDefinition, binding);

      expect(result.isValid).toBe(true);
      expect(result.conditionalExecution).toBe(true);
    });
  });

  describe('Parameter Resolution', () => {
    it('should resolve parameters from block attributes', () => {
      const blockState = {
        attributes: {
          recipient: '0.0.123456',
          amount: 100,
          memo: 'Test transfer',
        },
      };

      const parameterMapping = {
        to: { source: 'attributes', field: 'recipient', type: 'string' },
        value: { source: 'attributes', field: 'amount', type: 'number' },
        memo: { source: 'attributes', field: 'memo', type: 'string' },
      };

      const result = bindingManager.resolveParameters(
        blockState,
        parameterMapping,
      );

      expect(result).toEqual({
        to: '0.0.123456',
        value: 100,
        memo: 'Test transfer',
      });
    });

    it('should resolve parameters from action results', () => {
      const blockState = {
        attributes: {
          recipient: '0.0.123456',
        },
        actionResults: {
          'previous-action': {
            success: true,
            data: {
              transactionId: '0.0.789@1234567890',
              fee: 0.001,
            },
          },
        },
      };

      const parameterMapping = {
        to: { source: 'attributes', field: 'recipient', type: 'string' },
        previousTx: {
          source: 'actionResults',
          field: 'previous-action.data.transactionId',
          type: 'string',
        },
      };

      const result = bindingManager.resolveParameters(
        blockState,
        parameterMapping,
      );

      expect(result).toEqual({
        to: '0.0.123456',
        previousTx: '0.0.789@1234567890',
      });
    });

    it('should handle missing optional parameters gracefully', () => {
      const blockState = {
        attributes: {
          recipient: '0.0.123456',
        },
      };

      const parameterMapping = {
        to: { source: 'attributes', field: 'recipient', type: 'string' },
        memo: { source: 'attributes', field: 'memo', type: 'string' },
      };

      const result = bindingManager.resolveParameters(
        blockState,
        parameterMapping,
      );

      expect(result).toEqual({
        to: '0.0.123456',
        memo: undefined,
      });
    });

    it('should apply type conversions', () => {
      const blockState = {
        attributes: {
          amount: '100',
          enabled: 'true',
        },
      };

      const parameterMapping = {
        value: { source: 'attributes', field: 'amount', type: 'number' },
        isEnabled: { source: 'attributes', field: 'enabled', type: 'boolean' },
      };

      const result = bindingManager.resolveParameters(
        blockState,
        parameterMapping,
      );

      expect(result).toEqual({
        value: 100,
        isEnabled: true,
      });
    });
  });

  describe('Binding Execution', () => {
    it('should execute binding with resolved parameters', async () => {
      const mockActionExecutor = jest.fn().mockResolvedValue({
        success: true,
        data: { result: 'executed' },
        transactionId: '0.0.test@123',
      });

      const binding = {
        action: 'test-action',
        parameters: {
          param1: '{{attributes.value1}}',
        },
      };

      const blockState = {
        attributes: {
          value1: 'test-value',
        },
      };

      const parameterMapping = {
        param1: { source: 'attributes', field: 'value1', type: 'string' },
      };

      const result = await bindingManager.executeBinding(
        binding,
        blockState,
        parameterMapping,
        mockActionExecutor,
      );

      expect(result.success).toBe(true);
      expect(result.data.result).toBe('executed');
      expect(mockActionExecutor).toHaveBeenCalledWith('test-action', {
        param1: 'test-value',
      });
    });

    it('should handle conditional execution', async () => {
      const mockActionExecutor = jest.fn();

      const binding = {
        action: 'conditional-action',
        parameters: {
          amount: '{{attributes.amount}}',
        },
        condition: '{{attributes.amount}} > 50',
      };

      const blockState1 = {
        attributes: { amount: 100 },
      };

      const blockState2 = {
        attributes: { amount: 10 },
      };

      const parameterMapping = {
        amount: { source: 'attributes', field: 'amount', type: 'number' },
      };

      await bindingManager.executeBinding(
        binding,
        blockState1,
        parameterMapping,
        mockActionExecutor,
      );

      expect(mockActionExecutor).toHaveBeenCalledTimes(1);

      const result2 = await bindingManager.executeBinding(
        binding,
        blockState2,
        parameterMapping,
        mockActionExecutor,
      );

      expect(mockActionExecutor).toHaveBeenCalledTimes(1);
      expect(result2.success).toBe(true);
      expect(result2.skipped).toBe(true);
      expect(result2.reason).toBe('Condition not met');
    });

    it('should handle execution errors gracefully', async () => {
      const mockActionExecutor = jest
        .fn()
        .mockRejectedValue(new Error('Execution failed'));

      const binding = {
        action: 'failing-action',
        parameters: {},
      };

      const result = await bindingManager.executeBinding(
        binding,
        {},
        {},
        mockActionExecutor,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });
  });

  describe('Complex Binding Scenarios', () => {
    it('should handle multiple action bindings in sequence', async () => {
      const mockActionExecutor = jest
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: { intermediateResult: 'step1' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { finalResult: 'step2' },
        });

      const bindings = [
        {
          action: 'action1',
          parameters: {
            input: '{{attributes.initialValue}}',
          },
          outputAs: 'step1Result',
        },
        {
          action: 'action2',
          parameters: {
            input: '{{actionResults.step1Result.data.intermediateResult}}',
          },
          outputAs: 'step2Result',
        },
      ];

      let blockState = {
        attributes: {
          initialValue: 'start',
        },
        actionResults: {},
      };

      const result1 = await bindingManager.executeBinding(
        bindings[0],
        blockState,
        {
          input: {
            source: 'attributes',
            field: 'initialValue',
            type: 'string',
          },
        },
        mockActionExecutor,
      );

      blockState.actionResults['step1Result'] = result1;

      const result2 = await bindingManager.executeBinding(
        bindings[1],
        blockState,
        {
          input: {
            source: 'actionResults',
            field: 'step1Result.data.intermediateResult',
            type: 'string',
          },
        },
        mockActionExecutor,
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockActionExecutor).toHaveBeenCalledTimes(2);
      expect(mockActionExecutor).toHaveBeenNthCalledWith(1, 'action1', {
        input: 'start',
      });
      expect(mockActionExecutor).toHaveBeenNthCalledWith(2, 'action2', {
        input: 'step1',
      });
    });

    it('should validate complex nested parameter mappings', () => {
      const blockDefinition = {
        name: 'Complex Form',
        attributes: [
          {
            name: 'user',
            type: 'object',
            properties: {
              name: { type: 'string' },
              profile: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                },
              },
            },
          },
        ],
      };

      const actionDefinition = {
        name: 'Complex Action',
        parameters: [
          { name: 'userName', param_type: 'string', required: true },
          { name: 'userEmail', param_type: 'string', required: true },
        ],
      };

      const binding = {
        action: 'complex-action',
        parameters: {
          userName: '{{attributes.user.name}}',
          userEmail: '{{attributes.user.profile.email}}',
        },
      };

      const result = bindingManager.createParameterMapping(
        blockDefinition,
        actionDefinition,
        binding,
      );

      expect(result.isValid).toBe(true);
      expect(result.mapping.userName).toEqual({
        source: 'attributes',
        field: 'user.name',
        type: 'string',
      });
      expect(result.mapping.userEmail).toEqual({
        source: 'attributes',
        field: 'user.profile.email',
        type: 'string',
      });
    });
  });
});
