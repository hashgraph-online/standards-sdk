import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import type { ILogger } from '../utils/logger';
import { NetworkType } from '../utils/types';
import { HCS21BaseClient, BuildDeclarationParams } from './base-client';
import { PackageDeclaration, PackageDeclarationEnvelope } from './types';

export interface BrowserHCS21ClientConfig {
  network: NetworkType;
  hwc: HashinalsWalletConnectSDK;
  logger?: ILogger;
}

export class HCS21BrowserClient extends HCS21BaseClient {
  private readonly hwc: HashinalsWalletConnectSDK;

  constructor(config: BrowserHCS21ClientConfig) {
    super({ network: config.network, logger: config.logger });
    this.hwc = config.hwc;
  }

  async publishDeclaration(params: {
    topicId: string;
    declaration: PackageDeclaration | BuildDeclarationParams;
  }): Promise<void> {
    const declaration =
      'p' in params.declaration
        ? this.validateDeclaration(params.declaration)
        : this.buildDeclaration(params.declaration);

    await this.hwc.submitMessageToTopic(
      params.topicId,
      JSON.stringify(declaration),
    );
  }

  async fetchDeclarations(
    topicId: string,
  ): Promise<PackageDeclarationEnvelope[]> {
    const { messages = [] } = await this.hwc.getMessages(topicId);
    const envelopes: PackageDeclarationEnvelope[] = [];

    for (const message of messages) {
      try {
        const declaration = this.validateDeclaration(message.message);
        envelopes.push({
          declaration,
          consensusTimestamp: message.consensus_timestamp,
          sequenceNumber: Number(message.sequence_number || 0),
          payer: message.payer_account_id,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Skipping invalid HCS-21 browser message: ${detail}`);
      }
    }

    return envelopes;
  }
}
