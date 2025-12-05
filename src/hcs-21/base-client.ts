import { HederaMirrorNode } from '../services/mirror-node';
import { ILogger, Logger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { HCS21ValidationError } from './errors';
import {
  AdapterDeclaration,
  AdapterDeclarationEnvelope,
  AdapterPackage,
  HCS21_MAX_MESSAGE_BYTES,
  HCS21_SAFE_MESSAGE_BYTES,
  HCS21Operation,
  HCS21_PROTOCOL,
  AdapterConfigContext,
  adapterDeclarationSchema,
} from './types';

export interface BuildDeclarationParams {
  op: HCS21Operation;
  adapterId: string;
  entity: string;
  adapterPackage: AdapterPackage;
  manifest: string;
  manifestSequence?: number;
  config: AdapterConfigContext;
  stateModel?: string;
  signature?: string;
}

export interface FetchDeclarationsOptions {
  limit?: number;
  order?: 'asc' | 'desc';
}

export class HCS21BaseClient {
  protected readonly network: NetworkType;
  protected readonly logger: ILogger;
  protected readonly mirrorNode: HederaMirrorNode;

  constructor(params: {
    network: NetworkType;
    logger?: ILogger;
    mirrorNodeUrl?: string;
  }) {
    this.network = params.network;
    this.logger =
      params.logger || new Logger({ level: 'info', module: 'HCS-21' });
    this.mirrorNode = new HederaMirrorNode(this.network, this.logger, {
      customUrl: params.mirrorNodeUrl,
    });
  }

  buildDeclaration(params: BuildDeclarationParams): AdapterDeclaration {
    const declaration: AdapterDeclaration = {
      p: HCS21_PROTOCOL,
      op: params.op,
      adapter_id: params.adapterId,
      entity: params.entity,
      package: params.adapterPackage,
      manifest: params.manifest,
      ...(params.manifestSequence
        ? { manifest_sequence: params.manifestSequence }
        : {}),
      config: params.config,
      state_model: params.stateModel,
      signature: params.signature,
    };

    return this.validateDeclaration(declaration);
  }

  validateDeclaration(input: unknown): AdapterDeclaration {
    try {
      const payload = typeof input === 'string' ? JSON.parse(input) : input;
      const parsed = adapterDeclarationSchema.parse(
        payload,
      ) as AdapterDeclaration;
      this.assertSizeLimit(parsed);
      return parsed;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid adapter declaration';
      throw new HCS21ValidationError(message, 'invalid_payload');
    }
  }

  async fetchDeclarations(
    topicId: string,
    options?: FetchDeclarationsOptions,
  ): Promise<AdapterDeclarationEnvelope[]> {
    const rawMessages = await this.mirrorNode.getTopicMessages(topicId, {
      limit: options?.limit,
      order: options?.order,
    });

    const envelopes: AdapterDeclarationEnvelope[] = [];

    for (const message of rawMessages) {
      if (message.p !== HCS21_PROTOCOL) {
        continue;
      }

      try {
        const declaration = this.validateDeclaration(message);
        envelopes.push({
          declaration,
          consensusTimestamp: message.consensus_timestamp,
          sequenceNumber: message.sequence_number,
          payer: message.payer,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Skipping invalid HCS-21 message: ${detail}`);
      }
    }

    return envelopes;
  }

  protected assertSizeLimit(payload: AdapterDeclaration): void {
    const json = JSON.stringify(payload);
    const bytes = Buffer.byteLength(json, 'utf8');
    if (bytes > HCS21_SAFE_MESSAGE_BYTES) {
      throw new HCS21ValidationError(
        `HCS-21 payload exceeds safe limit of ${HCS21_SAFE_MESSAGE_BYTES} bytes (${bytes}); Hedera cap is ${HCS21_MAX_MESSAGE_BYTES}`,
        'size_exceeded',
      );
    }
  }
}
