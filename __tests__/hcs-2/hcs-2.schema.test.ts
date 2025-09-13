/**
 * HCS-2 Schema Validation Tests
 *
 * Tests the Zod schema validation for HCS-2 messages
 */

import {
  hcs2MessageSchema,
  registerMessageSchema,
  updateMessageSchema,
  deleteMessageSchema,
  migrateMessageSchema,
  HCS2Operation,
} from '../../src/hcs-2/types';

describe('HCS-2 Zod Schema Validation', () => {
  describe('Register Message Schema', () => {
    it('should validate a valid register message', () => {
      const validMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        t_id: '0.0.12345',
        metadata: 'hcs://1/0.0.12345',
        m: 'Test memo',
      };

      const result = registerMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject a register message without t_id', () => {
      const invalidMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        metadata: 'hcs://1/0.0.12345',
      };

      const result = registerMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('t_id');
      }
    });

    it('should reject a register message with invalid topic ID format', () => {
      const invalidMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        t_id: 'invalid-format',
        metadata: 'hcs://1/0.0.12345',
      };

      const result = registerMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('t_id');
      }
    });

    it('should reject a register message with memo exceeding 500 characters', () => {
      const invalidMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        t_id: '0.0.12345',
        m: 'a'.repeat(501),
      };

      const result = registerMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('m');
      }
    });
  });

  describe('Update Message Schema', () => {
    it('should validate a valid update message', () => {
      const validMessage = {
        p: 'hcs-2',
        op: HCS2Operation.UPDATE,
        uid: '123',
        t_id: '0.0.12345',
        metadata: 'hcs://1/0.0.12345',
      };

      const result = updateMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject an update message without uid', () => {
      const invalidMessage = {
        p: 'hcs-2',
        op: HCS2Operation.UPDATE,
        t_id: '0.0.12345',
      };

      const result = updateMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('uid');
      }
    });
  });

  describe('Delete Message Schema', () => {
    it('should validate a valid delete message', () => {
      const validMessage = {
        p: 'hcs-2',
        op: HCS2Operation.DELETE,
        uid: '123',
      };

      const result = deleteMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject a delete message without uid', () => {
      const invalidMessage = {
        p: 'hcs-2',
        op: HCS2Operation.DELETE,
      };

      const result = deleteMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('uid');
      }
    });
  });

  describe('Migrate Message Schema', () => {
    it('should validate a valid migrate message', () => {
      const validMessage = {
        p: 'hcs-2',
        op: HCS2Operation.MIGRATE,
        t_id: '0.0.12345',
        metadata: 'hcs://1/0.0.12345',
      };

      const result = migrateMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('should reject a migrate message without t_id', () => {
      const invalidMessage = {
        p: 'hcs-2',
        op: HCS2Operation.MIGRATE,
      };

      const result = migrateMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('t_id');
      }
    });
  });

  describe('Combined Schema', () => {
    it('should validate messages based on operation type', () => {
      const registerMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        t_id: '0.0.12345',
      };

      const updateMessage = {
        p: 'hcs-2',
        op: HCS2Operation.UPDATE,
        uid: '123',
        t_id: '0.0.12345',
      };

      const deleteMessage = {
        p: 'hcs-2',
        op: HCS2Operation.DELETE,
        uid: '123',
      };

      const migrateMessage = {
        p: 'hcs-2',
        op: HCS2Operation.MIGRATE,
        t_id: '0.0.12345',
      };

      expect(hcs2MessageSchema.safeParse(registerMessage).success).toBe(true);
      expect(hcs2MessageSchema.safeParse(updateMessage).success).toBe(true);
      expect(hcs2MessageSchema.safeParse(deleteMessage).success).toBe(true);
      expect(hcs2MessageSchema.safeParse(migrateMessage).success).toBe(true);
    });

    it('should reject messages with invalid protocol', () => {
      const invalidMessage = {
        p: 'wrong-protocol',
        op: HCS2Operation.REGISTER,
        t_id: '0.0.12345',
      };

      const result = hcs2MessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('p');
      }
    });

    it('should reject messages with invalid operation type', () => {
      const invalidMessage = {
        p: 'hcs-2',
        op: 'invalid-op' as HCS2Operation,
        t_id: '0.0.12345',
      };

      const result = hcs2MessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('op');
      }
    });
  });
});
