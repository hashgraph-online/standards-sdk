import {
  Client,
  PrivateKey,
  Status,
  TopicCreateTransaction,
} from '@hashgraph/sdk';
import {
  createNodeOperatorContext,
  NodeOperatorContext,
} from '../common/node-operator-resolver';
import { Logger, ILogger, LogLevel } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { HCS21BaseClient, BuildDeclarationParams } from './base-client';
import {
  AdapterDeclaration,
  HCS21ManifestPointerPattern,
  HCS21MetadataDocument,
  HCS21TopicType,
  ManifestPointer,
  metadataDocumentSchema,
} from './types';
import { buildHcs21CreateRegistryTx, buildHcs21MessageTx } from './tx';
import { buildHcs2CreateRegistryTx, buildHcs2RegisterTx } from '../hcs-2/tx';
import { HCS2RegistryType } from '../hcs-2/types';
import { HCS21ValidationError } from './errors';
import { MaybeKey } from '../common/tx/tx-utils';
import { inscribe } from '../inscribe/inscriber';
import type { InscriptionOptions } from '../inscribe/types';
import { getTopicId } from '../utils/topic-id-utils';

export interface HCS21ClientConfig {
  network: NetworkType;
  operatorId: string;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
  logLevel?: LogLevel;
  logger?: ILogger;
  mirrorNodeUrl?: string;
}

export interface CreateRegistryTopicParams {
  ttl: number;
  indexed?: 0 | 1;
  type?: HCS21TopicType;
  metaTopicId?: string;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  transactionMemo?: string;
}

export interface PublishDeclarationResult {
  sequenceNumber?: number;
  transactionId: string;
}

export interface PublishDeclarationParams {
  topicId: string;
  declaration: AdapterDeclaration | BuildDeclarationParams;
  transactionMemo?: string;
}

export interface InscribeMetadataParams {
  document: HCS21MetadataDocument;
  fileName?: string;
  inscriptionOptions?: InscriptionOptions;
}

export interface CreateAdapterVersionPointerTopicParams {
  ttl: number;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  transactionMemo?: string;
  memoOverride?: string;
}

export interface CreateRegistryDiscoveryTopicParams {
  ttl: number;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  transactionMemo?: string;
  memoOverride?: string;
}

export interface CreateAdapterCategoryTopicParams {
  ttl: number;
  indexed?: 0 | 1;
  metaTopicId?: string;
  adminKey?: MaybeKey;
  submitKey?: MaybeKey;
  transactionMemo?: string;
}

export interface PublishVersionPointerParams {
  versionTopicId: string;
  declarationTopicId: string;
  memo?: string;
  transactionMemo?: string;
}

export interface RegisterCategoryTopicParams {
  discoveryTopicId: string;
  categoryTopicId: string;
  metadata?: string;
  memo?: string;
  transactionMemo?: string;
}

export interface PublishCategoryEntryParams {
  categoryTopicId: string;
  adapterId: string;
  versionTopicId: string;
  metadata?: string;
  memo?: string;
  transactionMemo?: string;
}

export interface VersionPointerResolution {
  versionTopicId: string;
  declarationTopicId: string;
  sequenceNumber: number;
  payer?: string;
  memo?: string;
  op?: string;
}

export class HCS21Client extends HCS21BaseClient {
  private readonly client: Client;
  private readonly operatorCtx: NodeOperatorContext;

  constructor(config: HCS21ClientConfig) {
    const logger =
      config.logger ||
      new Logger({ level: config.logLevel || 'info', module: 'HCS-21' });
    super({
      network: config.network,
      logger,
      mirrorNodeUrl: config.mirrorNodeUrl,
    });

    const baseClient =
      config.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    this.operatorCtx = createNodeOperatorContext({
      network: config.network,
      operatorId: config.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client: baseClient,
    });

    void this.operatorCtx.ensureInitialized();
    this.client = this.operatorCtx.client;
  }

  async inscribeMetadata(
    params: InscribeMetadataParams,
  ): Promise<ManifestPointer> {
    await this.operatorCtx.ensureInitialized();

    const metadataPayload = metadataDocumentSchema.parse(params.document);
    const metadataJson = JSON.stringify(metadataPayload, null, 2);
    const buffer = Buffer.from(metadataJson, 'utf8');
    const connectionMode =
      params.inscriptionOptions?.connectionMode ??
      (params.inscriptionOptions?.websocket === false ? 'http' : 'auto');
    const inscriptionOptions: InscriptionOptions = {
      waitForConfirmation: true,
      connectionMode,
      websocket: params.inscriptionOptions?.websocket ?? false,
      ...(params.inscriptionOptions || {}),
      metadata: {
        ...(params.inscriptionOptions?.metadata || {}),
        ...metadataPayload,
      },
    };

    const inscription = await inscribe(
      {
        type: 'buffer',
        buffer,
        fileName:
          params.fileName || `hcs21-adapter-manifest-${Date.now()}.json`,
        mimeType: 'application/json',
      },
      {
        accountId: this.operatorCtx.operatorId.toString(),
        privateKey: this.operatorCtx.operatorKey,
        network: this.network,
      },
      inscriptionOptions,
    );

    if (!inscription.confirmed || !inscription.inscription) {
      throw new HCS21ValidationError(
        'Failed to inscribe HCS-21 metadata',
        'invalid_payload',
      );
    }

    const topicId =
      (inscription.inscription as { jsonTopicId?: string }).jsonTopicId ||
      (inscription.inscription as { topic_id?: string }).topic_id ||
      getTopicId(inscription.inscription);

    if (!topicId) {
      throw new HCS21ValidationError(
        'Metadata inscription did not return a topic ID',
        'invalid_payload',
      );
    }

    const rawSequence =
      (inscription.inscription as { sequence_number?: number })
        .sequence_number ??
      (inscription.inscription as { sequenceNumber?: number }).sequenceNumber;

    const pointerResult = await this.resolveManifestPointer(
      topicId,
      rawSequence,
    );

    const declarationManifestSequence = (
      inscription.result as { manifest_sequence?: number }
    )?.manifest_sequence;

    const resultDetails =
      inscription.result && 'jobId' in inscription.result
        ? {
            jobId: inscription.result.jobId,
            transactionId: inscription.result.transactionId,
            totalCostHbar: inscription.costSummary?.totalCostHbar,
            costBreakdown: inscription.costSummary?.breakdown,
          }
        : {};

    return {
      pointer: pointerResult.pointer,
      topicId,
      sequenceNumber: pointerResult.sequenceNumber,
      manifestSequence:
        declarationManifestSequence || pointerResult.sequenceNumber,
      ...resultDetails,
    };
  }

  async createRegistryTopic(
    params: CreateRegistryTopicParams,
  ): Promise<string> {
    await this.operatorCtx.ensureInitialized();

    const tx: TopicCreateTransaction = buildHcs21CreateRegistryTx({
      ttl: params.ttl,
      indexed: params.indexed,
      type: params.type,
      metaTopicId: params.metaTopicId,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      operatorPublicKey: this.operatorCtx.operatorKey.publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

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
    await this.operatorCtx.ensureInitialized();

    const tx = buildHcs2CreateRegistryTx({
      registryType: HCS2RegistryType.NON_INDEXED,
      ttl: params.ttl,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      memoOverride: params.memoOverride,
      operatorPublicKey: this.operatorCtx.operatorKey.publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

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
    await this.operatorCtx.ensureInitialized();

    const tx = buildHcs2CreateRegistryTx({
      registryType: HCS2RegistryType.INDEXED,
      ttl: params.ttl,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      memoOverride: params.memoOverride,
      operatorPublicKey: this.operatorCtx.operatorKey.publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

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
    await this.operatorCtx.ensureInitialized();

    const tx: TopicCreateTransaction = buildHcs21CreateRegistryTx({
      ttl: params.ttl,
      indexed: params.indexed ?? 0,
      type: HCS21TopicType.ADAPTER_CATEGORY,
      metaTopicId: params.metaTopicId,
      adminKey: params.adminKey,
      submitKey: params.submitKey,
      operatorPublicKey: this.operatorCtx.operatorKey.publicKey,
    });

    if (params.transactionMemo) {
      tx.setTransactionMemo(params.transactionMemo);
    }

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (receipt.status !== Status.Success || !receipt.topicId) {
      throw new HCS21ValidationError(
        'Failed to create adapter category topic',
        'invalid_payload',
      );
    }

    return receipt.topicId.toString();
  }

  /**
   * Publish a pointer from a version topic to the active declaration topic.
   * Version pointer messages carry no metadata.
   */
  async publishVersionPointer(
    params: PublishVersionPointerParams,
  ): Promise<PublishDeclarationResult> {
    await this.operatorCtx.ensureInitialized();

    const tx = buildHcs2RegisterTx({
      registryTopicId: params.versionTopicId,
      targetTopicId: params.declarationTopicId,
      memo: params.memo,
      analyticsMemo: params.transactionMemo,
    });

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to publish registry version pointer',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
      transactionId: response.transactionId.toString(),
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
    await this.operatorCtx.ensureInitialized();

    const tx = buildHcs2RegisterTx({
      registryTopicId: params.discoveryTopicId,
      targetTopicId: params.categoryTopicId,
      metadata: params.metadata,
      memo: params.memo,
      analyticsMemo: params.transactionMemo,
    });

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to register adapter category topic',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
      transactionId: response.transactionId.toString(),
    };
  }

  async publishCategoryEntry(
    params: PublishCategoryEntryParams,
  ): Promise<PublishDeclarationResult> {
    await this.operatorCtx.ensureInitialized();

    const memo = params.memo ?? `adapter:${params.adapterId}`;
    const tx = buildHcs2RegisterTx({
      registryTopicId: params.categoryTopicId,
      targetTopicId: params.versionTopicId,
      metadata: params.metadata,
      memo,
      analyticsMemo: params.transactionMemo,
    });

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to publish adapter category entry',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
      transactionId: response.transactionId.toString(),
    };
  }

  async publishDeclaration(
    params: PublishDeclarationParams,
  ): Promise<PublishDeclarationResult> {
    await this.operatorCtx.ensureInitialized();

    const declaration = this.normalizeDeclarationInput(params.declaration);
    const tx = buildHcs21MessageTx({
      topicId: params.topicId,
      declaration,
      transactionMemo: params.transactionMemo,
    });

    const response = await tx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (receipt.status !== Status.Success) {
      throw new HCS21ValidationError(
        'Failed to submit HCS-21 declaration',
        'invalid_payload',
      );
    }

    return {
      sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
      transactionId: response.transactionId.toString(),
    };
  }

  private normalizeDeclarationInput(
    declaration: AdapterDeclaration | BuildDeclarationParams,
  ): AdapterDeclaration {
    if ('p' in declaration) {
      return this.validateDeclaration(declaration);
    }
    return this.buildDeclaration(declaration);
  }

  private async resolveManifestPointer(
    topicId: string,
    sequence?: number,
  ): Promise<{ pointer: string; sequenceNumber: number }> {
    const numericSequence =
      typeof sequence === 'string' ? Number(sequence) : sequence;
    let resolvedSequence =
      typeof numericSequence === 'number' && Number.isFinite(numericSequence)
        ? numericSequence
        : undefined;

    if (!resolvedSequence) {
      const [latest] = await this.mirrorNode.getTopicMessages(topicId, {
        limit: 1,
        order: 'desc',
      });

      if (!latest || !latest.sequence_number) {
        throw new HCS21ValidationError(
          'Unable to resolve manifest sequence number',
          'invalid_payload',
        );
      }

      resolvedSequence = Number(latest.sequence_number);
    }

    if (!Number.isFinite(resolvedSequence)) {
      throw new HCS21ValidationError(
        'Invalid manifest sequence number',
        'invalid_payload',
      );
    }

    const pointer = `hcs://1/${topicId}`;

    if (!HCS21ManifestPointerPattern.test(pointer)) {
      throw new HCS21ValidationError(
        'Manifest pointer format is invalid',
        'invalid_payload',
      );
    }

    return { pointer, sequenceNumber: resolvedSequence };
  }
}
