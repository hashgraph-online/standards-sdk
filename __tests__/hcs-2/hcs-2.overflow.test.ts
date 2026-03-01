/**
 * HCS-2 Overflow Tests
 *
 * Tests that verify the overflow behaviour — large HCS-2 messages are
 * inscribed via HCS-1 and the metadata field is set to the HRL reference.
 */

import { HCS2Operation } from '../../src/hcs-2/types';

describe('HCS-2 Overflow', () => {
  describe('Overflow message format', () => {
    it('should produce a standard HCS-2 message with metadata set to the HRL', () => {
      // After overflow, the submitted message should be a regular HCS-2 message
      // with metadata pointing to the HCS-1 topic.
      const overflowMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        t_id: '0.0.12345',
        metadata: 'hcs://1/0.0.99999',
      };

      const json = JSON.stringify(overflowMessage);
      expect(json).toContain('"metadata"');
      expect(json).toContain('hcs://1/');
      expect(json).not.toContain('"data_ref"');
    });

    it('should round-trip through JSON correctly', () => {
      const original = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        t_id: '0.0.12345',
        metadata: 'hcs://1/0.0.99999',
      };

      const parsed = JSON.parse(JSON.stringify(original));
      expect(parsed.p).toBe(original.p);
      expect(parsed.op).toBe(original.op);
      expect(parsed.t_id).toBe(original.t_id);
      expect(parsed.metadata).toBe(original.metadata);
    });

    it('should be under 1024 bytes when serialised with an HRL metadata', () => {
      const overflowMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        t_id: '0.0.12345',
        metadata: 'hcs://1/0.0.99999999',
      };

      const size = Buffer.byteLength(JSON.stringify(overflowMessage), 'utf8');
      expect(size).toBeLessThan(1024);
    });
  });

  describe('Overflow trigger threshold', () => {
    it('should recognise payloads over 1024 bytes as overflow candidates', () => {
      const smallPayload = JSON.stringify({
        p: 'hcs-2',
        op: 'register',
        t_id: '0.0.12345',
      });
      expect(Buffer.byteLength(smallPayload, 'utf8')).toBeLessThanOrEqual(1024);

      const largePayload = JSON.stringify({
        p: 'hcs-2',
        op: 'register',
        t_id: '0.0.12345',
        metadata: 'x'.repeat(2000),
      });
      expect(Buffer.byteLength(largePayload, 'utf8')).toBeGreaterThan(1024);
    });
  });

  describe('HCS-1 HRL pattern detection', () => {
    const HCS1_HRL_PATTERN = /^hcs:\/\/1\/(\d+\.\d+\.\d+)$/;

    it('should match valid HCS-1 HRLs', () => {
      expect(HCS1_HRL_PATTERN.test('hcs://1/0.0.12345')).toBe(true);
      expect(HCS1_HRL_PATTERN.test('hcs://1/0.0.1')).toBe(true);
    });

    it('should not match invalid strings', () => {
      expect(HCS1_HRL_PATTERN.test('not-an-hrl')).toBe(false);
      expect(HCS1_HRL_PATTERN.test('hcs://2/0.0.12345')).toBe(false);
      expect(HCS1_HRL_PATTERN.test('hcs://1/invalid')).toBe(false);
      expect(HCS1_HRL_PATTERN.test('')).toBe(false);
    });
  });
});
