import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import type { PublicKey, KeyList } from '@hashgraph/sdk';
import {
  buildHcs16CreateFloraTopicTx,
  buildHcs16FloraCreatedTx,
  buildHcs16TxProposalTx,
  buildHcs16StateUpdateTx,
} from './tx';
import { FloraTopicType } from './types';
import { HCS17BaseClient } from '../hcs-17/base-client';

export interface HCS16BrowserClientConfig {
  network: 'testnet' | 'mainnet';
  hwc?: HashinalsWalletConnectSDK;
  signer?: DAppSigner;
}

/**
 * Browser client for HCS‑16 operations using a DAppSigner.
 */
export class HCS16BrowserClient extends HCS17BaseClient {
  private readonly hwc?: HashinalsWalletConnectSDK;
  private readonly signer?: DAppSigner;

  constructor(config: HCS16BrowserClientConfig) {
    super({ network: config.network });
    this.hwc = config.hwc;
    this.signer = config.signer;
  }

  private ensureConnected(): string {
    if (this.signer && typeof (this.signer as DAppSigner).getAccountId === 'function') {
      return (this.signer as DAppSigner).getAccountId().toString();
    }
    const info = this.hwc?.getAccountInfo?.();
    const accountId = info?.accountId;
    if (!accountId) {
      throw new Error('No active wallet connection');
    }
    return accountId;
  }

  private getSigner(): DAppSigner {
    if (this.signer) {
      return this.signer;
    }
    this.ensureConnected();
    const s = this.hwc?.dAppConnector?.signers?.[0];
    if (!s) {
      throw new Error('No active wallet signer');
    }
    return s as unknown as DAppSigner;
  }

  async createFloraTopic(params: {
    floraAccountId: string;
    topicType: FloraTopicType;
    adminKey?: PublicKey | KeyList;
    submitKey?: PublicKey | KeyList;
    autoRenewAccountId?: string;
  }): Promise<string> {
    this.ensureConnected();
    const signer = this.getSigner();
    const tx = buildHcs16CreateFloraTopicTx({
      floraAccountId: params.floraAccountId,
      topicType: params.topicType,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      autoRenewAccountId: params.autoRenewAccountId,
    });
    const frozen = await tx.freezeWithSigner(signer);
    const res = await frozen.executeWithSigner(signer);
    const receipt = await res.getReceiptWithSigner(signer);
    const topicId = receipt?.topicId?.toString?.() || '';
    return topicId;
  }

  async sendFloraCreated(params: {
    topicId: string;
    operatorId: string;
    floraAccountId: string;
    topics: { communication: string; transaction: string; state: string };
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16FloraCreatedTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  async sendTxProposal(params: {
    topicId: string;
    operatorId: string;
    scheduledTxId: string;
    description?: string;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16TxProposalTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  async sendStateUpdate(params: {
    topicId: string;
    operatorId: string;
    hash: string;
    epoch?: number;
  }): Promise<void> {
    const signer = this.getSigner();
    const tx = buildHcs16StateUpdateTx(params);
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
  }

  /** credit_purchase is not part of HCS-16 specification */
}
