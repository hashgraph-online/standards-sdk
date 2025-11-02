import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@hashgraph/sdk', () => {
  class AccountCreateTransaction {
    private _isBase = false;
    setECDSAKeyWithAlias() {
      this._isBase = true;
      return this;
    }
    setKeyWithoutAlias() {
      this._isBase = false;
      return this;
    }
    setInitialBalance() {
      return this;
    }
    setMaxAutomaticTokenAssociations() {
      return this;
    }
    setAccountMemo() {
      return this;
    }
    async execute() {
      const id = this._isBase ? '0.0.7000001' : '0.0.7000002';
      return {
        getReceipt: async () => ({ accountId: { toString: () => id } }),
      } as any;
    }
  }
  return {
    AccountCreateTransaction,
    Client: {
      forTestnet: jest.fn(() => ({
        setOperator: jest.fn(),
        close: jest.fn(),
        operatorPublicKey: {},
      })),
      forMainnet: jest.fn(() => ({
        setOperator: jest.fn(),
        close: jest.fn(),
        operatorPublicKey: {},
      })),
    },
    AccountId: { fromString: (s: string) => ({ toString: () => s }) },
    PrivateKey: {
      generateECDSA: jest.fn(() => ({
        toString: () => 'priv-hex-abcdef1234',
        toStringRaw: () => 'priv-raw',
        publicKey: {
          toEvmAddress: () => 'deadbeef',
          toString: () => 'pub-abcdef1234',
        },
      })),
      fromStringECDSA: jest.fn((s: string) => ({
        toString: () => s,
        publicKey: {
          toEvmAddress: () => 'deadbeef',
          toString: () => 'pub-abcdef1234',
        },
      })),
    },
    Hbar: jest.fn((v: any) => v),
  };
});

const { PrivateKey } = require('@hashgraph/sdk');
const { HCS15Client } = require('../../src/hcs-15');

describe('HCS-15 Node SDK client', () => {
  it('createBaseAccount returns account + keys', async () => {
    const client = new HCS15Client({
      network: 'testnet',
      operatorId: '0.0.1234',
      operatorKey: PrivateKey.generateECDSA(),
    });
    const res = await client.createBaseAccount({
      initialBalance: 1,
      accountMemo: 'demo',
    });
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
    const res = await client.createPetalAccount({
      basePrivateKey: base,
      initialBalance: 0.5,
    });
    expect(res.accountId).toBe('0.0.7000002');
  });
});
