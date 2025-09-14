import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../src/hcs-15/tx', () => {
  return {
    buildHcs15BaseAccountCreateTx: jest.fn(() => ({
      freezeWithSigner: async () => ({
        executeWithSigner: async () => ({
          getReceiptWithSigner: async () => ({ accountId: { toString: () => '0.0.7100001' } }),
        }),
      }),
    })),
    buildHcs15PetalAccountCreateTx: jest.fn(() => ({
      freezeWithSigner: async () => ({
        executeWithSigner: async () => ({
          getReceiptWithSigner: async () => ({ accountId: { toString: () => '0.0.7100002' } }),
        }),
      }),
    })),
  };
});

import { PrivateKey } from '@hashgraph/sdk';
import { HCS15BrowserClient } from '../../src/hcs-15';

class FakeSigner {}

jest.mock('@hashgraph/sdk', () => ({
  PrivateKey: {
    generateECDSA: jest.fn(() => ({
      toString: () => 'priv-hex',
      toStringRaw: () => 'priv-raw',
      publicKey: { toEvmAddress: () => 'deadbeef', toString: () => 'pub' },
    })),
  },
  Hbar: jest.fn((v: any) => v),
}));

describe('HCS-15 Browser client', () => {
  it('creates base account via signer', async () => {
    const client = new HCS15BrowserClient({ network: 'testnet', signer: new FakeSigner() as never });
    const res = await client.createBaseAccount({ initialBalance: 1 });
    expect(res.accountId).toBe('0.0.7100001');
    expect(res.privateKey.toString().length).toBeGreaterThan(10);
    expect(res.publicKey.toString().length).toBeGreaterThan(10);
    expect(res.evmAddress.startsWith('0x')).toBe(true);
  });

  it('creates petal account via signer', async () => {
    const baseKey = PrivateKey.generateECDSA().toString();
    const client = new HCS15BrowserClient({ network: 'testnet', signer: new FakeSigner() as never });
    const res = await client.createPetalAccount({ basePrivateKey: baseKey, initialBalance: 0.5 });
    expect(res.accountId).toBe('0.0.7100002');
  });
});
