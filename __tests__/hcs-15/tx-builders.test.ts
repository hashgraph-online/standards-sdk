import { describe, it, expect } from '@jest/globals';
import { PrivateKey, Hbar, AccountCreateTransaction } from '@hashgraph/sdk';
import {
  buildHcs15BaseAccountCreateTx,
  buildHcs15PetalAccountCreateTx,
} from '../../src/hcs-15/tx';

describe('HCS-15 tx builders', () => {
  it('builds base account create tx with ECDSA key + alias', () => {
    const priv = PrivateKey.generateECDSA();
    const pub = priv.publicKey;
    const tx = buildHcs15BaseAccountCreateTx({
      publicKey: pub,
      initialBalance: new Hbar(1),
      maxAutomaticTokenAssociations: 10,
      accountMemo: 'HCS-15 base',
    });

    expect(tx).toBeInstanceOf(AccountCreateTransaction);
    expect(!!(tx as AccountCreateTransaction).key).toBe(true);
    expect(!!(tx as AccountCreateTransaction).alias).toBe(true);
    expect(!!(tx as AccountCreateTransaction).initialBalance).toBe(true);
    expect(!!(tx as AccountCreateTransaction).maxAutomaticTokenAssociations).toBe(
      true,
    );
  });

  it('builds petal account create tx with shared key and no alias', () => {
    const priv = PrivateKey.generateECDSA();
    const pub = priv.publicKey;
    const tx = buildHcs15PetalAccountCreateTx({
      publicKey: pub,
      initialBalance: new Hbar(1),
      maxAutomaticTokenAssociations: 100,
      accountMemo: 'HCS-15 petal',
    });

    expect(tx).toBeInstanceOf(AccountCreateTransaction);
    expect(!!(tx as AccountCreateTransaction).key).toBe(true);
    expect(!!(tx as AccountCreateTransaction).alias).toBe(false);
    expect(!!(tx as AccountCreateTransaction).initialBalance).toBe(true);
    expect(!!(tx as AccountCreateTransaction).maxAutomaticTokenAssociations).toBe(
      true,
    );
  });

  it('base account tx omits optional fields when undefined', () => {
    const priv = PrivateKey.generateECDSA();
    const pub = priv.publicKey;
    const tx = buildHcs15BaseAccountCreateTx({ publicKey: pub });
    expect(tx).toBeInstanceOf(AccountCreateTransaction);
    expect(!!(tx as AccountCreateTransaction).alias).toBe(true);
    expect(!!(tx as AccountCreateTransaction).initialBalance).toBe(true);
  });

  it('petal account tx omits optional fields when undefined', () => {
    const priv = PrivateKey.generateECDSA();
    const pub = priv.publicKey;
    const tx = buildHcs15PetalAccountCreateTx({ publicKey: pub });
    expect(tx).toBeInstanceOf(AccountCreateTransaction);
    expect(!!(tx as AccountCreateTransaction).alias).toBe(false);
    expect(!!(tx as AccountCreateTransaction).initialBalance).toBe(true);
  });
});
