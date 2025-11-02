import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
  TransactionReceipt,
} from '@hashgraph/sdk';
import { NetworkType } from '../utils/types';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import {
  buildHcs15BaseAccountCreateTx,
  buildHcs15PetalAccountCreateTx,
} from './tx';
import type { SDKHCS15ClientConfig } from './types';
import { HCS15BaseClient } from './base-client';

export class HCS15Client extends HCS15BaseClient {
  private readonly operatorCtx: NodeOperatorContext;
  private readonly client: Client;
  private readonly operatorId: AccountId;

  constructor(config: SDKHCS15ClientConfig) {
    super(config);
    this.operatorId = AccountId.fromString(config.operatorId);
    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client:
        this.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet(),
    });
    this.client = this.operatorCtx.client;
  }

  public getKeyType(): 'ed25519' | 'ecdsa' {
    return this.operatorCtx.keyType;
  }

  public async close(): Promise<void> {
    try {
      this.client.close();
    } catch {}
  }

  /**
   * Create a new base account with a newly generated ECDSA key and EVM alias.
   */
  async createBaseAccount(options?: {
    initialBalance?: number;
    maxAutomaticTokenAssociations?: number;
    accountMemo?: string;
  }): Promise<{
    accountId: string;
    privateKey: PrivateKey;
    privateKeyHex: string;
    publicKey: PublicKey;
    evmAddress: string;
    receipt: TransactionReceipt;
  }> {
    const priv = PrivateKey.generateECDSA();
    const pub = priv.publicKey;
    const tx = buildHcs15BaseAccountCreateTx({
      publicKey: pub,
      initialBalance: new Hbar(options?.initialBalance ?? 10),
      maxAutomaticTokenAssociations: options?.maxAutomaticTokenAssociations,
      accountMemo: options?.accountMemo,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    if (!receipt.accountId) {
      throw new Error('HCS-15 BASE_ACCOUNT_CREATE_FAILED');
    }
    const accountId = receipt.accountId.toString();
    const evmAddress = `0x${pub.toEvmAddress()}`;
    this.logger.info('Created HCS-15 base account', { accountId, evmAddress });
    return {
      accountId,
      privateKey: priv,
      privateKeyHex: priv.toStringRaw(),
      publicKey: pub,
      evmAddress,
      receipt,
    };
  }

  /**
   * Create a Petal account that reuses the base account ECDSA key (no alias).
   */
  async createPetalAccount(params: {
    basePrivateKey: string | PrivateKey;
    initialBalance?: number;
    maxAutomaticTokenAssociations?: number;
    accountMemo?: string;
  }): Promise<{ accountId: string; receipt: TransactionReceipt }> {
    const baseKey =
      typeof params.basePrivateKey === 'string'
        ? PrivateKey.fromStringECDSA(params.basePrivateKey)
        : params.basePrivateKey;
    const pub = baseKey.publicKey;
    const tx = buildHcs15PetalAccountCreateTx({
      publicKey: pub,
      initialBalance: new Hbar(params.initialBalance ?? 1),
      maxAutomaticTokenAssociations: params.maxAutomaticTokenAssociations,
      accountMemo: params.accountMemo,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    if (!receipt.accountId) {
      throw new Error('HCS-15 PETAL_ACCOUNT_CREATE_FAILED');
    }
    const accountId = receipt.accountId.toString();
    this.logger.info('Created HCS-15 petal account', { accountId });
    return { accountId, receipt };
  }
}
