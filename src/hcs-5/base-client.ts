import { Logger, ILogger } from '../utils/logger';
import { HederaMirrorNode } from '../services/mirror-node';
import { HCS5ClientConfig } from './types';
import { NetworkType } from '../utils/types';

/**
 * Base client for HCS-5 operations
 */
export abstract class HCS5BaseClient {
  protected logger: ILogger;
  protected mirrorNode: HederaMirrorNode;
  protected network: NetworkType;

  /**
   * Create a new HCS-5 base client
   */
  constructor(config: HCS5ClientConfig) {
    this.network = config.network;
    this.logger =
      config.logger ||
      Logger.getInstance({
        level: config.logLevel || 'info',
        module: 'HCS5Client',
        silent: config.silent,
      });

    this.mirrorNode = new HederaMirrorNode(this.network, this.logger);
  }
}
