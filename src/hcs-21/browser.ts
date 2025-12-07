import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import {
  AccountId,
  PublicKey,
  Status,
  Transaction,
  TransactionId,
  TransactionReceipt,
} from '@hashgraph/sdk';
import Long from 'long';
import type { ILogger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import {
  HCS21BaseClient,
  BuildDeclarationParams,
  FetchDeclarationsOptions,
} from './base-client';
import type {
  CreateRegistryTopicParams,
  CreateAdapterVersionPointerTopicParams,
  CreateRegistryDiscoveryTopicParams,
  CreateAdapterCategoryTopicParams,
  PublishVersionPointerParams,
  RegisterCategoryTopicParams,
  PublishCategoryEntryParams,
  PublishDeclarationParams,
  PublishDeclarationResult,
  VersionPointerResolution,
} from './sdk';
import {
  AdapterDeclaration,
  AdapterDeclarationEnvelope,
  HCS21TopicType,
} from './types';
import { HCS21ValidationError } from './errors';
import {
  buildHcs21CreateRegistryTx,
  buildHcs21MessageTx,
} from './tx';
import {
  buildHcs2CreateRegistryTx,
  buildHcs2RegisterTx,
} from '../hcs-2/tx';
import { HCS2RegistryType } from '../hcs-2/types';

export interface BrowserHCS21ClientConfig {
  network: NetworkType;
  hwc: HashinalsWalletConnectSDK;
  logger?: ILogger;
}

export class HCS21BrowserClient extends HCS21BaseClient {
  private readonly hwc: HashinalsWalletConnectSDK;
  private signerCache?: { accountId: string; publicKey: PublicKey };

  constructor(config: BrowserHCS21ClientConfig) {
    super({ network: config.network, logger: config.logger });
    this.hwc = config.hwc;
  }

  async createRegistryTopic(
    params: CreateRegistryTopicParams,
  ): Promise<string> {
    const { publicKey } = await this.getSignerContext();
    const tx = buildHcs21CreateRegistryTx({
      ttl: params.ttl,
      indexed: params.indexed,
      type: params.type,
      metaTopicId: params.metaTopicId,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      operatorPublicKey: publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const { receipt } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success || !receipt.topicId) {
      throw new HCS21ValidationError(
        'Failed to create HCS-21 registry topic',
        'invalid_payload',
      );
    }

    return receipt.topicId.toString();
  }

  async createAdapterVersionPointerTopic(
    params: CreateAdapterVersionPointerTopicParams,
  ): Promise<string> {
    const { publicKey } = await this.getSignerContext();
    const tx = buildHcs2CreateRegistryTx({
      registryType: HCS2RegistryType.NON_INDEXED,
      ttl: params.ttl,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      memoOverride: params.memoOverride,
      operatorPublicKey: publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const { receipt } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success || !receipt.topicId) {
      throw new HCS21ValidationError(
        'Failed to create HCS-2 registry version topic',
        'invalid_payload',
      );
    }

    return receipt.topicId.toString();
  }

  async createRegistryDiscoveryTopic(
    params: CreateRegistryDiscoveryTopicParams,
  ): Promise<string> {
    const { publicKey } = await this.getSignerContext();
    const tx = buildHcs2CreateRegistryTx({
      registryType: HCS2RegistryType.INDEXED,
      ttl: params.ttl,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      memoOverride: params.memoOverride,
      operatorPublicKey: publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const { receipt } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success || !receipt.topicId) {
      throw new HCS21ValidationError(
        'Failed to create registry-of-registries topic',
        'invalid_payload',
      );
    }

    return receipt.topicId.toString();
  }

  async createAdapterCategoryTopic(
    params: CreateAdapterCategoryTopicParams,
  ): Promise<string> {
    const { publicKey } = await this.getSignerContext();
    const tx = buildHcs21CreateRegistryTx({
      ttl: params.ttl,
      indexed: params.indexed ?? 0,
      type: HCS21TopicType.ADAPTER_CATEGORY,
      metaTopicId: params.metaTopicId,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      operatorPublicKey: publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const { receipt } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success || !receipt.topicId) {
      throw new HCS21ValidationError(
        'Failed to create adapter category topic',
        'invalid_payload',
      );
    }

    return receipt.topicId.toString();
  }

  async publishVersionPointer(
    params: PublishVersionPointerParams,
  ): Promise<PublishDeclarationResult> {
    const tx = buildHcs2RegisterTx({
      registryTopicId: params.versionTopicId,
      targetTopicId: params.declarationTopicId,
      memo: params.memo,
      analyticsMemo: params.transactionMemo,
    });

    const { receipt, transactionId } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to publish registry version pointer',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: this.toNumber(receipt.topicSequenceNumber),
      transactionId,
    };
  }

  async resolveVersionPointer(
    versionTopicId: string,
  ): Promise<VersionPointerResolution> {
    const [latest] = await this.mirrorNode.getTopicMessages(versionTopicId, {
      limit: 1,
      order: 'desc',
    });

    if (!latest) {
      throw new HCS21ValidationError(
        'Version pointer topic has no messages',
        'invalid_payload',
      );
    }

    const declarationTopicId = (latest as { t_id?: unknown }).t_id;

    if (
      typeof declarationTopicId !== 'string' ||
      declarationTopicId.length === 0
    ) {
      throw new HCS21ValidationError(
        'Version pointer topic does not include a declaration topic ID (`t_id`)',
        'invalid_payload',
      );
    }

    const rawSequence =
      typeof latest.sequence_number === 'number'
        ? latest.sequence_number
        : Number(latest.sequence_number);
    const sequenceNumber = Number.isFinite(rawSequence) ? rawSequence : 0;

    return {
      versionTopicId,
      declarationTopicId,
      sequenceNumber,
      payer: (latest as { payer?: string }).payer,
      memo: (latest as { m?: string }).m,
      op: (latest as { op?: string }).op,
    };
  }

  async registerCategoryTopic(
    params: RegisterCategoryTopicParams,
  ): Promise<PublishDeclarationResult> {
    const tx = buildHcs2RegisterTx({
      registryTopicId: params.discoveryTopicId,
      targetTopicId: params.categoryTopicId,
      metadata: params.metadata,
      memo: params.memo,
      analyticsMemo: params.transactionMemo,
    });

    const { receipt, transactionId } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to register adapter category topic',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: this.toNumber(receipt.topicSequenceNumber),
      transactionId,
    };
  }

  async publishCategoryEntry(
    params: PublishCategoryEntryParams,
  ): Promise<PublishDeclarationResult> {
    const memo = params.memo ?? `adapter:${params.adapterId}`;
    const tx = buildHcs2RegisterTx({
      registryTopicId: params.categoryTopicId,
      targetTopicId: params.versionTopicId,
      metadata: params.metadata,
      memo,
      analyticsMemo: params.transactionMemo,
    });

    const { receipt, transactionId } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to publish adapter category entry',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: this.toNumber(receipt.topicSequenceNumber),
      transactionId,
    };
  }

  async publishDeclaration(
    params: PublishDeclarationParams,
  ): Promise<PublishDeclarationResult> {
    const declaration =
      'p' in params.declaration
        ? this.validateDeclaration(params.declaration)
        : this.buildDeclaration(params.declaration);

    const tx = buildHcs21MessageTx({
      topicId: params.topicId,
      declaration,
      transactionMemo: params.transactionMemo,
    });

    const { receipt, transactionId } = await this.executeWithWallet(tx);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to submit HCS-21 declaration',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: this.toNumber(receipt.topicSequenceNumber),
      transactionId,
    };
  }

  async fetchDeclarations(
    topicId: string,
    options?: FetchDeclarationsOptions,
  ): Promise<AdapterDeclarationEnvelope[]> {
    const { messages = [] } = await this.hwc.getMessages(topicId);
    const envelopes: AdapterDeclarationEnvelope[] = [];

    for (const message of messages) {
      if (!message || message.p !== 'hcs-21') {
        continue;
      }

      try {
        const declaration = this.validateDeclaration(message);
        envelopes.push({
          declaration,
          consensusTimestamp: message.consensus_timestamp,
          sequenceNumber: Number(message.sequence_number ?? 0),
          payer: message.payer,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Skipping invalid HCS-21 browser message: ${detail}`);
      }
    }

    const ordered =
      options?.order === 'desc'
        ? [...envelopes].sort(
            (a, b) => b.sequenceNumber - a.sequenceNumber,
          )
        : envelopes;

    if (options?.limit && options.limit > 0) {
      return ordered.slice(0, options.limit);
    }

    return ordered;
  }

  private async getSignerContext(): Promise<{
    accountId: string;
    publicKey: PublicKey;
  }> {
    if (this.signerCache) {
      return this.signerCache;
    }

    const accountInfo = this.hwc.getAccountInfo?.();
    const accountId =
      typeof accountInfo === 'string' ? accountInfo : accountInfo?.accountId;

    if (!accountId) {
      throw new HCS21ValidationError(
        'Wallet is not connected',
        'invalid_payload',
      );
    }

    const accountResponse = await this.hwc.requestAccount(accountId);
    const key = accountResponse?.key?.key;

    if (!key) {
      throw new HCS21ValidationError(
        'Unable to resolve wallet public key',
        'invalid_payload',
      );
    }

    const publicKey = PublicKey.fromString(key);
    this.signerCache = { accountId, publicKey };
    return this.signerCache;
  }

  private async executeWithWallet<T extends Transaction>(
    tx: T,
  ): Promise<{ receipt: TransactionReceipt; transactionId: string }> {
    const { accountId } = await this.getSignerContext();
    const txId = TransactionId.generate(AccountId.fromString(accountId));
    tx.setTransactionId(txId);
    const receipt = await this.hwc.executeTransaction(tx, false);
    return {
      receipt,
      transactionId: txId.toString(),
    };
  }

  private toNumber(value?: number | Long | null): number | undefined {
    if (typeof value === 'number') {
      return value;
    }
    if (value && typeof (value as Long).toNumber === 'function') {
      return (value as Long).toNumber();
    }
    return undefined;
  }
}
