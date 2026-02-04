import type {
  PublicKey,
  PrivateKey,
  TransactionResponse,
} from '@hashgraph/sdk';
import { PrivateKey as SDKPrivateKey, Hbar } from '@hashgraph/sdk';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import type { BrowserHCS15ClientConfig } from './types';

import { HCS15BaseClient } from './base-client';
import {
  buildHcs15BaseAccountCreateTx,
  buildHcs15PetalAccountCreateTx,
} from './tx';

export class HCS15BrowserClient extends HCS15BaseClient {
  private readonly signer?: DAppSigner;

  constructor(config: BrowserHCS15ClientConfig) {
    super(config);
    this.signer = config.signer || config.hwc?.dAppConnector?.signers?.[0];
  }

  private requireSigner(): DAppSigner {
    if (!this.signer) {
      throw new Error('HCS-15 Browser client requires an active signer');
    }
    return this.signer;
  }

  /**
   * Create a new base account with a new ECDSA key and EVM alias using a connected wallet signer.
   */
  async createBaseAccount(options?: {
    initialBalance?: number;
    maxAutomaticTokenAssociations?: number;
    accountMemo?: string;
    transactionMemo?: string;
  }): Promise<{
    accountId?: string;
    privateKey: PrivateKey;
    privateKeyHex: string;
    publicKey: PublicKey;
    evmAddress: string;
  }> {
    const signer = this.requireSigner();
    const priv = SDKPrivateKey.generateECDSA();
    const pub = priv.publicKey;
    const tx = buildHcs15BaseAccountCreateTx({
      publicKey: pub,
      initialBalance: new Hbar(options?.initialBalance ?? 10),
      maxAutomaticTokenAssociations: options?.maxAutomaticTokenAssociations,
      accountMemo: options?.accountMemo,
      transactionMemo: options?.transactionMemo,
    });
    const frozen = await tx.freezeWithSigner(signer);
    const res: TransactionResponse = await frozen.executeWithSigner(signer);
    const receipt = await res.getReceiptWithSigner(signer);
    const accountId = receipt?.accountId?.toString?.();
    const evmAddress = `0x${pub.toEvmAddress()}`;
    this.logger.info('Created HCS-15 base account (browser)', {
      accountId,
      evmAddress,
    });
    return {
      accountId,
      privateKey: priv,
      privateKeyHex: priv.toStringRaw(),
      publicKey: pub,
      evmAddress,
    };
  }

  /**
   * Create a petal account reusing a base ECDSA key, via wallet signer.
   */
  async createPetalAccount(params: {
    basePrivateKey: string | PrivateKey;
    initialBalance?: number;
    maxAutomaticTokenAssociations?: number;
    accountMemo?: string;
    transactionMemo?: string;
  }): Promise<{ accountId?: string }> {
    const signer = this.requireSigner();
    const baseKey =
      typeof params.basePrivateKey === 'string'
        ? SDKPrivateKey.fromStringECDSA(params.basePrivateKey)
        : params.basePrivateKey;
    const tx = buildHcs15PetalAccountCreateTx({
      publicKey: baseKey.publicKey,
      initialBalance: new Hbar(params.initialBalance ?? 1),
      maxAutomaticTokenAssociations: params.maxAutomaticTokenAssociations,
      accountMemo: params.accountMemo,
      transactionMemo: params.transactionMemo,
    });
    const frozen = await tx.freezeWithSigner(signer);
    const res: TransactionResponse = await frozen.executeWithSigner(signer);
    const receipt = await res.getReceiptWithSigner(signer);
    const accountId = receipt?.accountId?.toString?.();
    this.logger.info('Created HCS-15 petal account (browser)', { accountId });
    return { accountId };
  }
}
