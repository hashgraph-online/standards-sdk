import { describe, expect, test } from '@jest/globals';

import { hcs26DiscoveryRegisterSchema } from '../../src/hcs-26/types';

describe('HCS-26 discovery metadata URI validation', () => {
  test('rejects ord:// metadata URIs', () => {
    const parsed = hcs26DiscoveryRegisterSchema.safeParse({
      p: 'hcs-26',
      op: 'register',
      t_id: '0.0.123',
      account_id: '0.0.456',
      metadata: 'ord://abc123',
    });

    expect(parsed.success).toBe(false);
  });

  test('accepts hcs://1 metadata HRLs', () => {
    const parsed = hcs26DiscoveryRegisterSchema.safeParse({
      p: 'hcs-26',
      op: 'register',
      t_id: '0.0.123',
      account_id: '0.0.456',
      metadata: 'hcs://1/0.0.999',
    });

    expect(parsed.success).toBe(true);
  });

  test('rejects ipfs:// metadata URIs', () => {
    const parsed = hcs26DiscoveryRegisterSchema.safeParse({
      p: 'hcs-26',
      op: 'register',
      t_id: '0.0.123',
      account_id: '0.0.456',
      metadata: 'ipfs://bafybeigdyrzt',
    });

    expect(parsed.success).toBe(false);
  });

  test('rejects ar:// metadata URIs', () => {
    const parsed = hcs26DiscoveryRegisterSchema.safeParse({
      p: 'hcs-26',
      op: 'register',
      t_id: '0.0.123',
      account_id: '0.0.456',
      metadata: 'ar://someArweaveId',
    });

    expect(parsed.success).toBe(false);
  });
});
