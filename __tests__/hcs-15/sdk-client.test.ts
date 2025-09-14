import { describe, it, expect, jest } from '@jest/globals';
import { AccountId, PrivateKey } from '@hashgraph/sdk';

jest.mock('../../src/hcs-15/tx', () => {
  const { AccountId } = require('@hashgraph/sdk');
  return {
    buildHcs15BaseAccountCreateTx: jest.fn(() => ({
      execute: async () => ({
        getReceipt: async () => ({ accountId: AccountId.fromString('0.0.7000001') }),
      }),
    })),
    buildHcs15PetalAccountCreateTx: jest.fn(() => ({
      execute: async () => ({
        getReceipt: async () => ({ accountId: AccountId.fromString('0.0.7000002') }),
      }),
    })),
  };
});

jest.mock('@hashgraph/sdk', () => ({
  AccountId: { fromString: (s: string) => ({ toString: () => s }) },
  PrivateKey: {
    generateECDSA: jest.fn(() => ({
      toString: () => 'priv-hex',
      toStringRaw: () => 'priv-raw',
      publicKey: { toEvmAddress: () => 'deadbeef', toString: () => 'pub' },
    })),
    fromStringECDSA: jest.fn((s: string) => ({
      toString: () => s,
      publicKey: { toEvmAddress: () => 'deadbeef', toString: () => 'pub' },
    })),
  },
  Hbar: jest.fn((v: any) => v),
}));

import { HCS15Client } from '../../src/hcs-15';

describe('HCS-15 Node SDK client', () => {
  it('createBaseAccount returns account + keys', async () => {
    const client = new HCS15Client({
      network: 'testnet',
      operatorId: '0.0.1234',
      operatorKey: PrivateKey.generateECDSA(),
    });
    const res = await client.createBaseAccount({ initialBalance: 1, accountMemo: 'demo' });
    expect(res.accountId).toBe('0.0.7000001');
    expect(res.privateKey.toString().length).toBeGreaterThan(10);
    expect(res.publicKey.toString().length).toBeGreaterThan(10);
    expect(res.evmAddress.startsWith('0x')).toBe(true);
  });

  it('createPetalAccount reuses base key and returns account', async () => {
    const client = new HCS15Client({
      network: 'testnet',
      operatorId: '0.0.1234',
      operatorKey: PrivateKey.generateECDSA(),
    });
    const base = PrivateKey.generateECDSA().toString();
    const res = await client.createPetalAccount({ basePrivateKey: base, initialBalance: 0.5 });
    expect(res.accountId).toBe('0.0.7000002');
  });
});
