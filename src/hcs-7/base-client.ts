import { ILogger, Logger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { HederaMirrorNode } from '../services/mirror-node';
import {
  HCS7ClientConfig,
  HCS7ConfigType,
  HCS7Message,
  HCS7RegisterConfigInput,
  HCS7RegisterMetadataOptions,
  HCS7RegistryEntry,
  HCS7RegistryTopic,
  HCS7QueryRegistryOptions,
  HCS7Operation,
  hcs7MessageSchema,
  HCS7EvmConfigMessage,
  HCS7WasmConfigMessage,
  HCS7MetadataRegistrationMessage,
} from './types';

export class HCS7BaseClient {
  protected readonly network: NetworkType;
  protected readonly logger: ILogger;
  protected readonly mirrorNode: HederaMirrorNode;

  constructor(config: HCS7ClientConfig) {
    this.network = config.network;
    this.logger =
      config.logger ||
      Logger.getInstance({
        level: config.logLevel || 'info',
        module: 'HCS7Client',
        silent: config.silent,
      });
    this.mirrorNode = new HederaMirrorNode(
      this.network,
      this.logger,
      config.mirrorNodeUrl ? { customUrl: config.mirrorNodeUrl } : undefined,
    );
  }

  protected generateRegistryMemo(ttl: number): string {
    return `hcs-7:indexed:${ttl}`;
  }

  protected createConfigMessage(params: {
    config: HCS7RegisterConfigInput;
    memo?: string;
  }): HCS7EvmConfigMessage | HCS7WasmConfigMessage {
    if (params.config.type === HCS7ConfigType.EVM) {
      return {
        p: 'hcs-7',
        op: HCS7Operation.REGISTER_CONFIG,
        t: HCS7ConfigType.EVM,
        c: {
          contractAddress: params.config.contractAddress,
          abi: params.config.abi,
        },
        m: params.memo,
      };
    }
    return {
      p: 'hcs-7',
      op: HCS7Operation.REGISTER_CONFIG,
      t: HCS7ConfigType.WASM,
      c: {
        wasmTopicId: params.config.wasmTopicId,
        inputType: params.config.inputType,
        outputType: params.config.outputType,
      },
      m: params.memo,
    };
  }

  protected createMetadataMessage(
    options: HCS7RegisterMetadataOptions,
  ): HCS7MetadataRegistrationMessage {
    return {
      p: 'hcs-7',
      op: HCS7Operation.REGISTER,
      t_id: options.metadataTopicId,
      m: options.memo,
      d: {
        weight: options.weight,
        tags: options.tags,
        ...(options.data || {}),
      },
    };
  }

  protected validateMessage(message: HCS7Message): {
    valid: boolean;
    errors: string[];
  } {
    const parsed = hcs7MessageSchema.safeParse(message);
    if (parsed.success) {
      return { valid: true, errors: [] };
    }
    const errors = parsed.error.errors.map(err => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    });
    this.logger.debug(`HCS-7 message validation failed: ${errors.join(', ')}`);
    return { valid: false, errors };
  }

  public async getRegistry(
    topicId: string,
    options?: HCS7QueryRegistryOptions,
  ): Promise<HCS7RegistryTopic> {
    const entries: HCS7RegistryEntry[] = [];
    try {
      const messages = await this.mirrorNode.getTopicMessages(topicId, {
        limit: options?.limit,
        order: options?.order,
        sequenceNumber: options?.next,
      });
      for (const message of messages) {
        if (message.p !== 'hcs-7') {
          continue;
        }
        const parsed = hcs7MessageSchema.safeParse(message);
        if (!parsed.success) {
          continue;
        }
        const typedMessage = parsed.data as HCS7Message;
        entries.push({
          sequenceNumber: Number(message.sequence_number),
          timestamp: message.consensus_timestamp || '',
          payer: message.payer || '',
          message: typedMessage,
        });
      }
    } catch (error) {
      this.logger.error('Failed to query HCS-7 registry', error);
    }
    return {
      topicId,
      entries,
    };
  }
}
