import type { ILogger } from '../utils/logger';
import type { NetworkType } from '../utils/types';
import { HCS26BaseClient, type HCS26ClientConfig } from './base-client';

export interface BrowserHCS26ClientConfig
  extends Omit<HCS26ClientConfig, 'network' | 'logger'> {
  network: NetworkType;
  logger?: ILogger;
}

export class HCS26BrowserClient extends HCS26BaseClient {
  constructor(config: BrowserHCS26ClientConfig) {
    super({
      network: config.network,
      logger: config.logger,
      mirrorNode: config.mirrorNode,
      verificationProvider: config.verificationProvider,
    });
  }
}
