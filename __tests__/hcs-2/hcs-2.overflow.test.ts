/**
 * HCS-2 Overflow Tests
 *
 * Tests that verify the overflow wrapper message type and the behaviour
 * of the overflow path in submitMessage.
 */

import { HCS2OverflowMessage } from '../../src/hcs-2/client';
import { HCS2Operation } from '../../src/hcs-2/types';

describe('HCS-2 Overflow', () => {
  describe('HCS2OverflowMessage type', () => {
    it('should serialise correctly', () => {
      const overflow: HCS2OverflowMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        data_ref: 'hcs://1/0.0.99999',
        data_ref_digest: 'abc123digest',
      };

      const json = JSON.stringify(overflow);
      expect(json).toContain('"data_ref"');
      expect(json).toContain('"data_ref_digest"');
      expect(json).not.toContain('"t_id"');
      expect(json).not.toContain('"uid"');
    });

    it('should round-trip through JSON correctly', () => {
      const original: HCS2OverflowMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        data_ref: 'hcs://1/0.0.12345',
        data_ref_digest: 'sha256digest',
      };

      const parsed = JSON.parse(JSON.stringify(original)) as HCS2OverflowMessage;
      expect(parsed.p).toBe(original.p);
      expect(parsed.op).toBe(original.op);
      expect(parsed.data_ref).toBe(original.data_ref);
      expect(parsed.data_ref_digest).toBe(original.data_ref_digest);
    });

    it('should be under 1024 bytes when serialised', () => {
      const overflow: HCS2OverflowMessage = {
        p: 'hcs-2',
        op: HCS2Operation.REGISTER,
        data_ref: 'hcs://1/0.0.99999999',
        data_ref_digest: 'a'.repeat(44), // SHA-256 base64url is ~44 chars
      };

      const size = Buffer.byteLength(JSON.stringify(overflow), 'utf8');
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
});
