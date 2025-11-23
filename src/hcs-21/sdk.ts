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
  AdapterMetadataPointer,
  AdapterMetadataRecord,
  HCS21MetadataPointerPattern,
} from './types';
import { buildHcs21CreateRegistryTx, buildHcs21MessageTx } from './tx';
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

export interface InscribeAdapterMetadataParams {
  metadata: AdapterMetadataRecord;
  fileName?: string;
  inscriptionOptions?: InscriptionOptions;
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
    params: InscribeAdapterMetadataParams,
  ): Promise<AdapterMetadataPointer> {
    await this.operatorCtx.ensureInitialized();

    const metadataJson = JSON.stringify(params.metadata, null, 2);
    const buffer = Buffer.from(metadataJson, 'utf8');
    const inscriptionOptions: InscriptionOptions = {
      waitForConfirmation: true,
      ...(params.inscriptionOptions || {}),
      metadata: {
        ...(params.inscriptionOptions?.metadata || {}),
        ...params.metadata,
      },
    };

    const inscription = await inscribe(
      {
        type: 'buffer',
        buffer,
        fileName:
          params.fileName || `hcs21-adapter-metadata-${Date.now()}.json`,
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
        'Failed to inscribe adapter metadata',
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

    const pointerResult = await this.resolveMetadataPointer(
      topicId,
      rawSequence,
    );

    const resultDetails =
      inscription.result && 'jobId' in inscription.result
        ? {
            jobId: inscription.result.jobId,
            transactionId: inscription.result.transactionId,
          }
        : {};

    return {
      pointer: pointerResult.pointer,
      topicId,
      sequenceNumber: pointerResult.sequenceNumber,
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

  private async resolveMetadataPointer(
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
          'Unable to resolve metadata sequence number',
          'invalid_payload',
        );
      }

      resolvedSequence = Number(latest.sequence_number);
    }

    if (!Number.isFinite(resolvedSequence)) {
      throw new HCS21ValidationError(
        'Invalid metadata sequence number',
        'invalid_payload',
      );
    }

    const pointer = `hcs://1/${topicId}/${resolvedSequence}`;

    if (!HCS21MetadataPointerPattern.test(pointer)) {
      throw new HCS21ValidationError(
        'Metadata pointer format is invalid',
        'invalid_payload',
      );
    }

    return { pointer, sequenceNumber: resolvedSequence };
  }
}
