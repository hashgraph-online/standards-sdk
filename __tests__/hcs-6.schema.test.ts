/**
 * HCS-6 Schema Validation Tests
 *
 * Tests the Zod schema validation for HCS-6 messages
 */

import {
  hcs6MessageSchema,
  hcs6RegisterMessageSchema,
  hcs6BaseMessageSchema,
  hcs6TopicIdSchema,
  HCS6Operation,
  validateHCS6TTL,
  validateHCS6RegistryMemo,
  generateHCS6RegistryMemo,
} from '../src/hcs-6/types';

describe('HCS-6 Zod Schema Validation', () => {
  describe('Topic ID Schema', () => {
    it('should validate a valid topic ID', () => {
      const validTopicId = '0.0.12345';
      const result = hcs6TopicIdSchema.safeParse(validTopicId);
      expect(result.success).toBe(true);
    });

    it('should reject an invalid topic ID format', () => {
      const invalidTopicIds = [
        'invalid-format',
        '0.0',
        '0.0.abc',
        '123.456.789.012',
        '',
        '0.0.12345.67890',
      ];

      invalidTopicIds.forEach(topicId => {
        const result = hcs6TopicIdSchema.safeParse(topicId);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Base Message Schema', () => {
    it('should validate a valid base message', () => {
      const validMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        m: 'Test memo',
      };

      const result = hcs6BaseMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject a message with invalid protocol', () => {
      const invalidMessage = {
        p: 'wrong-protocol',
        op: HCS6Operation.REGISTER,
      };

      const result = hcs6BaseMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('p');
      }
    });

    it('should reject a message with invalid operation type', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: 'invalid-op' as HCS6Operation,
      };

      const result = hcs6BaseMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('op');
      }
    });

    it('should reject a message with memo exceeding 500 characters', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        m: 'a'.repeat(501),
      };

      const result = hcs6BaseMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('m');
      }
    });

    it('should accept a message without optional memo', () => {
      const validMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
      };

      const result = hcs6BaseMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });
  });

  describe('Register Message Schema', () => {
    it('should validate a valid register message', () => {
      const validMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      };

      const result = hcs6RegisterMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject a register message without t_id', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        m: 'Test memo',
      };

      const result = hcs6RegisterMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('t_id');
      }
    });

    it('should reject a register message with invalid topic ID format', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: 'invalid-format',
        m: 'Test memo',
      };

      const result = hcs6RegisterMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('t_id');
      }
    });

    it('should accept a register message without optional memo', () => {
      const validMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };

      const result = hcs6RegisterMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });
  });

  describe('Combined Schema', () => {
    it('should validate register messages correctly', () => {
      const registerMessage = {
        p: 'hcs-6',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'Test memo',
      };

      const result = hcs6MessageSchema.safeParse(registerMessage);
      expect(result.success).toBe(true);
    });

    it('should reject messages with invalid protocol', () => {
      const invalidMessage = {
        p: 'wrong-protocol',
        op: HCS6Operation.REGISTER,
        t_id: '0.0.12345',
      };

      const result = hcs6MessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('p');
      }
    });

    it('should reject messages with invalid operation type', () => {
      const invalidMessage = {
        p: 'hcs-6',
        op: 'invalid-op' as HCS6Operation,
        t_id: '0.0.12345',
      };

      const result = hcs6MessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('op');
      }
    });
  });

  describe('TTL Validation', () => {
    it('should validate a valid TTL', () => {
      expect(validateHCS6TTL(3600)).toBe(true);
      expect(validateHCS6TTL(86400)).toBe(true);
      expect(validateHCS6TTL(604800)).toBe(true);
    });

    it('should reject invalid TTL values', () => {
      expect(validateHCS6TTL(3599)).toBe(false);
      expect(validateHCS6TTL(0)).toBe(false);
      expect(validateHCS6TTL(-1)).toBe(false);
      expect(validateHCS6TTL(1000)).toBe(false);
    });
  });

  describe('Registry Memo Validation', () => {
    it('should validate a valid registry memo', () => {
      expect(validateHCS6RegistryMemo('hcs-6:1:3600')).toBe(true);
      expect(validateHCS6RegistryMemo('hcs-6:1:86400')).toBe(true);
      expect(validateHCS6RegistryMemo('hcs-6:1:604800')).toBe(true);
    });

    it('should reject invalid registry memo formats', () => {
      const invalidMemos = [
        'hcs-6:0:3600',
        'hcs-6:2:3600',
        'hcs-6:1:3599',
        'hcs-6:1:0',
        'hcs-6:1:-1',
        'hcs-6:1:',
        'hcs-6::3600',
        'hcs-6:1',
        'hcs-2:1:3600',
        'invalid-format',
        '',
      ];

      invalidMemos.forEach(memo => {
        expect(validateHCS6RegistryMemo(memo)).toBe(false);
      });
    });
  });

  describe('Registry Memo Generation', () => {
    it('should generate correct memo format', () => {
      expect(generateHCS6RegistryMemo(3600)).toBe('hcs-6:1:3600');
      expect(generateHCS6RegistryMemo(86400)).toBe('hcs-6:1:86400');
      expect(generateHCS6RegistryMemo(604800)).toBe('hcs-6:1:604800');
    });

    it('should throw error for invalid TTL', () => {
      expect(() => generateHCS6RegistryMemo(3599)).toThrow(
        'TTL must be at least 3600 seconds',
      );
      expect(() => generateHCS6RegistryMemo(0)).toThrow(
        'TTL must be at least 3600 seconds',
      );
      expect(() => generateHCS6RegistryMemo(-1)).toThrow(
        'TTL must be at least 3600 seconds',
      );
    });
  });
});
