import { describe, it, expect, jest } from '@jest/globals';
import { HCS15BaseClient } from '../../src/hcs-15';

interface MirrorNodeMock {
  requestAccount: jest.Mock<Promise<{ key?: { key?: string } }>, [string]>;
}

interface MirrorHolder {
  mirrorNode: MirrorNodeMock;
}

describe('HCS-15 base client', () => {
  it('verifyPetalAccount returns true for matching keys', async () => {
    const client = new HCS15BaseClient({ network: 'testnet' });
    const holder = client as unknown as MirrorHolder;
    holder.mirrorNode = {
      requestAccount: jest
        .fn()
        .mockResolvedValueOnce({ key: { key: 'K' } })
        .mockResolvedValueOnce({ key: { key: 'K' } }),
    };
    const ok = await client.verifyPetalAccount('0.0.1', '0.0.2');
    expect(ok).toBe(true);
  });

  it('verifyPetalAccount returns false for non-matching keys', async () => {
    const client = new HCS15BaseClient({ network: 'testnet' });
    const holder = client as unknown as MirrorHolder;
    holder.mirrorNode = {
      requestAccount: jest
        .fn()
        .mockResolvedValueOnce({ key: { key: 'A' } })
        .mockResolvedValueOnce({ key: { key: 'B' } }),
    };
    const ok = await client.verifyPetalAccount('0.0.1', '0.0.2');
    expect(ok).toBe(false);
  });

  it('verifyPetalAccount returns false on error', async () => {
    const client = new HCS15BaseClient({ network: 'testnet' });
    const holder = client as unknown as MirrorHolder;
    holder.mirrorNode = {
      requestAccount: jest.fn().mockRejectedValueOnce(new Error('boom')),
    };
    const ok = await client.verifyPetalAccount('0.0.1', '0.0.2');
    expect(ok).toBe(false);
  });
});
