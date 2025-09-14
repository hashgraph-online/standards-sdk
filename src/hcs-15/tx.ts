import { AccountCreateTransaction, Hbar, PublicKey } from '@hashgraph/sdk';

/**
 * Build AccountCreateTransaction for an HCS-15 base account.
 * Uses an ECDSA public key and sets the EVM alias from it.
 */
export function buildHcs15BaseAccountCreateTx(params: {
  publicKey: PublicKey;
  initialBalance?: Hbar | number;
  maxAutomaticTokenAssociations?: number;
  accountMemo?: string;
}): AccountCreateTransaction {
  const tx = new AccountCreateTransaction()
    .setECDSAKeyWithAlias(params.publicKey)
    .setInitialBalance(
      params.initialBalance instanceof Hbar
        ? params.initialBalance
        : new Hbar(params.initialBalance ?? 1),
    );

  if (typeof params.maxAutomaticTokenAssociations === 'number') {
    tx.setMaxAutomaticTokenAssociations(params.maxAutomaticTokenAssociations);
  }
  if (params.accountMemo) {
    tx.setAccountMemo(params.accountMemo);
  }
  return tx;
}

/**
 * Build AccountCreateTransaction for an HCS-15 Petal account.
 * Reuses the same public key as the base account, without alias.
 */
export function buildHcs15PetalAccountCreateTx(params: {
  publicKey: PublicKey;
  initialBalance?: Hbar | number;
  maxAutomaticTokenAssociations?: number;
  accountMemo?: string;
}): AccountCreateTransaction {
  const tx = new AccountCreateTransaction()
    .setKeyWithoutAlias(params.publicKey)
    .setInitialBalance(
      params.initialBalance instanceof Hbar
        ? params.initialBalance
        : new Hbar(params.initialBalance ?? 1),
    );

  if (typeof params.maxAutomaticTokenAssociations === 'number') {
    tx.setMaxAutomaticTokenAssociations(params.maxAutomaticTokenAssociations);
  }
  if (params.accountMemo) {
    tx.setAccountMemo(params.accountMemo);
  }
  return tx;
}
