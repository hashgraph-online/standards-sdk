import { HCS17BaseClient } from './base-client';
import { BrowserHCS17ClientConfig, StateHashMessage } from './types';
import { buildHcs17CreateTopicTx, buildHcs17MessageTx } from './tx';
import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import type { PublicKey } from '@hashgraph/sdk';

/**
 * Browser client for HCS‑17 operations using a DAppSigner.
 * Builds transactions and executes via signer without helper shims.
 */
export class HCS17BrowserClient extends HCS17BaseClient {
  private hwc?: HashinalsWalletConnectSDK;
  private signer?: DAppSigner;

  constructor(config: BrowserHCS17ClientConfig) {
    super(config);
    this.hwc = config.hwc;
    this.signer = config.signer;
  }

  private ensureConnected(): string {
    if (
      this.signer &&
      typeof (this.signer as DAppSigner).getAccountId === 'function'
    ) {
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

  /**
   * Create an HCS‑17 state topic, signing with the connected signer.
   */
  async createStateTopic(options?: {
    ttl?: number;
    adminKey?: boolean | string;
    submitKey?: boolean | string;
  }): Promise<string> {
    this.ensureConnected();
    const signer = this.getSigner();
    const ttl = options?.ttl ?? 86400;
    const tx = buildHcs17CreateTopicTx({ ttl });
    const frozen = await tx.freezeWithSigner(signer);
    const res = await frozen.executeWithSigner(signer);
    const receipt = await res.getReceiptWithSigner(signer);
    const topicId = receipt?.topicId?.toString?.() || '';
    this.logger.info(`Created HCS-17 state topic via wallet: ${topicId}`);
    return topicId;
  }

  /**
   * Submit an HCS‑17 message to a topic, signing with the connected signer.
   */
  async submitMessage(
    topicId: string,
    message: StateHashMessage,
  ): Promise<{ transactionId?: string }> {
    const { valid, errors } = this.validateMessage(message);
    if (!valid) {
      throw new Error(`Invalid HCS-17 message: ${errors.join(', ')}`);
    }
    const signer = this.getSigner();
    const tx = buildHcs17MessageTx({
      topicId,
      stateHash: message.state_hash,
      accountId: message.account_id,
      topics: message.topics,
      memo: message.m,
    });
    const frozen = await tx.freezeWithSigner(signer);
    const res = await frozen.executeWithSigner(signer);
    await res.getReceiptWithSigner(signer);
    return {};
  }

  /**
   * Compute current account state hash from topic running hashes and publish it.
   */
  async computeAndPublish(params: {
    accountId: string;
    accountPublicKey: string | PublicKey;
    topics: string[];
    publishTopicId: string;
    memo?: string;
  }): Promise<{ stateHash: string }> {
    this.ensureConnected();
    const signer = this.getSigner();

    const topicStates: { topicId: string; latestRunningHash: string }[] = [];
    for (const t of params.topics) {
      const msgs = await this.mirrorNode.getTopicMessages(t, {
        limit: 1,
        order: 'desc',
      });
      const latest = msgs[0];
      const running = (latest && (latest as any).running_hash) || '';
      topicStates.push({ topicId: t, latestRunningHash: running });
    }

    const input = {
      accountId: params.accountId,
      publicKey: params.accountPublicKey,
      topics: topicStates,
    };
    const result = this.calculateAccountStateHash(input);
    const tx = buildHcs17MessageTx({
      topicId: params.publishTopicId,
      stateHash: result.stateHash,
      accountId: params.accountId,
      topics: params.topics,
      memo: params.memo,
    });
    const frozen = await tx.freezeWithSigner(signer);
    await frozen.executeWithSigner(signer);
    return { stateHash: result.stateHash };
  }
}
