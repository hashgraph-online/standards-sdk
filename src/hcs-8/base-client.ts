import { Logger, type ILogger } from '../utils/logger';
import { HederaMirrorNode } from '../services/mirror-node';
import { NetworkType } from '../utils/types';
import type { MirrorNodeConfig } from '../services';
import { RegisterSequenceAssembler } from './assembler';
import {
  decodeMessage,
  parseManagePayload,
  parseUpdatePayload,
  parseVotePayload,
} from './parser';
import {
  AnyHcs8Message,
  Hcs8BaseMessage,
  Hcs8ClientConfig,
  PollProcessingOptions,
  ParsedTopicMessage,
} from './types';
import { PollStateMachine } from './state';
import type { TopicMessage } from '../services/types';

export class Hcs8BaseClient {
  protected readonly logger: ILogger;
  protected readonly mirrorNode: HederaMirrorNode;
  protected readonly network: NetworkType;
  private readonly assembler = new RegisterSequenceAssembler();

  constructor(config: Hcs8ClientConfig) {
    this.network = config.network;
    this.logger =
      config.logger ||
      Logger.getInstance({
        level: config.logLevel || 'info',
        module: 'HCS8BaseClient',
        silent: config.silent,
      });

    this.mirrorNode = new HederaMirrorNode(
      this.network,
      this.logger,
      config.mirrorNode,
    );
  }

  public async getPollState(
    topicId: string,
    options: PollProcessingOptions = {},
  ) {
    const rawMessages = await this.mirrorNode.getTopicMessages(topicId, {
      limit: 200,
      order: 'asc',
    });

    const stateMachine = new PollStateMachine();
    for (const message of rawMessages) {
      const payload = this.extractMessagePayload(message);
      if (!payload) {
        this.logger.warn('Skipping HCS-8 message without payload content');
        continue;
      }
      const normalized = { ...message, message: payload } as TopicMessage;
      if (
        options.stopAtTimestamp &&
        normalized.consensus_timestamp > options.stopAtTimestamp
      ) {
        break;
      }
      const parsed = this.parseTopicMessage(normalized);
      if (!parsed) {
        continue;
      }
      stateMachine.apply(parsed.message, parsed.timestamp);
    }

    return stateMachine.getState();
  }

  public configureMirrorNode(config: MirrorNodeConfig): void {
    this.mirrorNode.configureMirrorNode(config);
  }

  protected parseTopicMessage(message: TopicMessage): ParsedTopicMessage | null {
    try {
      const decoded = decodeMessage(message.message);
      if (decoded.op === 'register') {
        const result = this.assembler.ingest(decoded, message.consensus_timestamp);
        if (!result) {
          return null;
        }
        return {
          raw: message.message,
          timestamp: message.consensus_timestamp,
          payerAccountId: message.payer_account_id,
          message: result.message,
        };
      }

      const payload = this.parseOperationPayload(decoded, message);
      if (!payload) {
        return null;
      }
      return {
        raw: message.message,
        timestamp: message.consensus_timestamp,
        payerAccountId: message.payer_account_id,
        message: payload,
      };
    } catch (error) {
      this.logger.error(`Failed to parse hcs-8 message: ${error}`);
      return null;
    }
  }

  private parseOperationPayload(
    decoded: Hcs8BaseMessage,
    message: TopicMessage,
  ): AnyHcs8Message | null {
    switch (decoded.op) {
      case 'manage':
        return {
          ...decoded,
          d: parseManagePayload(decoded.d),
        } as AnyHcs8Message;
      case 'update':
        return {
          ...decoded,
          d: parseUpdatePayload(decoded.d),
        } as AnyHcs8Message;
      case 'vote': {
        const accountId = message.payer_account_id;
        if (!accountId) {
          this.logger.warn('Skipping vote message without payer account id');
          return null;
        }
        return {
          ...decoded,
          d: parseVotePayload(decoded.d, accountId),
        } as AnyHcs8Message;
      }
      default:
        this.logger.warn(`Unsupported hcs-8 operation ${decoded.op}`);
        return null;
    }
  }

  private extractMessagePayload(message: TopicMessage & { decoded_message?: string }): string | null {
    if (message.decoded_message) {
      return message.decoded_message;
    }
    const raw = message.message;
    if (typeof raw !== 'string') {
      return null;
    }
    try {
      if (typeof Buffer !== 'undefined') {
        return Buffer.from(raw, 'base64').toString('utf-8');
      }
      if (typeof atob === 'function') {
        const bytes = Uint8Array.from(atob(raw), char => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      }
      return raw;
    } catch (error) {
      this.logger.error(`Failed to decode HCS-8 message payload: ${error}`);
      return null;
    }
  }
}
