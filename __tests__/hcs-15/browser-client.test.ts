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
    setTransactionMemo() {
      return this;
    }
    async freezeWithSigner() {
      const id = this._isBase ? '0.0.7100001' : '0.0.7100002';
      return {
        executeWithSigner: async () => ({
          getReceiptWithSigner: async () => ({
            accountId: { toString: () => id },
          }),
        }),
      } as any;
    }
  }
  return {
    AccountCreateTransaction,
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
const { HCS15BrowserClient } = require('../../src/hcs-15');

class FakeSigner {}

describe('HCS-15 Browser client', () => {
  it('creates base account via signer', async () => {
    const client = new HCS15BrowserClient({
      network: 'testnet',
      signer: new FakeSigner() as never,
    });
    const res = await client.createBaseAccount({ initialBalance: 1 });
    expect(res.accountId).toBe('0.0.7100001');
    expect(res.privateKey.toString().length).toBeGreaterThan(10);
    expect(res.publicKey.toString().length).toBeGreaterThan(10);
    expect(res.evmAddress.startsWith('0x')).toBe(true);
  });

  it('creates petal account via signer', async () => {
    const baseKey = PrivateKey.generateECDSA().toString();
    const client = new HCS15BrowserClient({
      network: 'testnet',
      signer: new FakeSigner() as never,
    });
    const res = await client.createPetalAccount({
      basePrivateKey: baseKey,
      initialBalance: 0.5,
    });
    expect(res.accountId).toBe('0.0.7100002');
  });
});
