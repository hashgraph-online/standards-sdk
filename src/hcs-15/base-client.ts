import { HederaMirrorNode } from '../services/mirror-node';
import { Logger, ILogger } from '../utils/logger';
import { NetworkType } from '../utils/types';

/**
 * Base client for HCS‑15 shared functionality across Node and Browser clients.
 */
export class HCS15BaseClient {
  protected readonly network: NetworkType;
  protected readonly mirrorNode: HederaMirrorNode;
  protected readonly logger: ILogger;

  constructor(config: {
    network: NetworkType;
    mirrorNodeUrl?: string;
    logger?: Logger;
    logLevel?: Parameters<Logger['setLogLevel']>[0];
  }) {
    this.network = config.network;
    this.logger =
      config.logger ||
      new Logger({
        module: 'HCS-15',
        level: (config.logLevel as any) || 'info',
      });
    this.mirrorNode = new HederaMirrorNode(this.network, this.logger, {
      customUrl: config.mirrorNodeUrl,
    });
  }

  /**
   * Verify that a petal account shares the same public key as the base account.
   */
  public async verifyPetalAccount(
    petalAccountId: string,
    baseAccountId: string,
  ): Promise<boolean> {
    try {
      const petalInfo = await this.mirrorNode.requestAccount(petalAccountId);
      const baseInfo = await this.mirrorNode.requestAccount(baseAccountId);
      const petalKey = petalInfo?.key?.key || '';
      const baseKey = baseInfo?.key?.key || '';
      return petalKey !== '' && petalKey === baseKey;
    } catch (e) {
      this.logger.warn('verifyPetalAccount failed', { error: String(e) });
      return false;
    }
  }
}
