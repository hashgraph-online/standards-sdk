import { HCS5BaseClient } from './base-client';
import {
  HCS5ClientConfig,
  HCS5CreateHashinalOptions,
  HCS5MintOptions,
  HCS5MintResponse,
  buildHcs1Hrl,
} from './types';
import {
  Client,
  TokenId,
  PrivateKey,
  TokenMintTransaction,
  AccountId,
} from '@hashgraph/sdk';
import { NetworkType } from '../utils/types';
import { inscribe } from '../inscribe/inscriber';
import { NodeOperatorResolver, createNodeOperatorContext, type NodeOperatorContext } from '../common/node-operator-resolver';

export class HCS5Client extends HCS5BaseClient {
  private client: Client;
  private operatorId: AccountId;
  private operatorCtx: NodeOperatorContext;

  constructor(config: HCS5ClientConfig) {
    super(config);

    this.operatorId = AccountId.fromString(config.operatorId);
    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
    });
    this.client = this.operatorCtx.client;
  }

  private async ensureInitialized(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  async mint(options: HCS5MintOptions): Promise<HCS5MintResponse> {
    try {
      await this.ensureInitialized();
      if (!options.metadataTopicId) {
        return {
          success: false,
          error: 'metadataTopicId is required for mint()',
        };
      }

      const metadata = buildHcs1Hrl(options.metadataTopicId);
      const tx = new TokenMintTransaction()
        .setTokenId(TokenId.fromString(options.tokenId))
        .setMetadata([Buffer.from(metadata)]);
      const frozen = await tx.freezeWith(this.client);

      if (options.supplyKey) {
        const resolver = new NodeOperatorResolver({
          mirrorNode: this.mirrorNode,
          logger: this.logger,
        });
        const privKey =
          typeof options.supplyKey === 'string'
            ? await resolver.resolveSupplyKey(
                options.tokenId,
                options.supplyKey,
                this.operatorCtx.keyType,
              )
            : options.supplyKey;
        await frozen.sign(privKey);
      }

      const resp = await frozen.execute(this.client);
      const receipt = await resp.getReceipt(this.client);
      const serial =
        receipt.serials && receipt.serials[0]
          ? Number(receipt.serials[0].toString())
          : undefined;

      return {
        success: true,
        serialNumber: serial,
        transactionId: resp.transactionId?.toString?.(),
        metadata,
      };
    } catch (e) {
      const error = e as Error;
      this.logger.error(`Failed to mint HCS-5 Hashinal: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async createHashinal(
    options: HCS5CreateHashinalOptions,
  ): Promise<HCS5MintResponse> {
    try {
      await this.ensureInitialized();
      const inscription = await inscribe(
        options.inscriptionInput,
        {
          accountId: this.operatorId.toString(),
          privateKey: this.operatorCtx.operatorKey,
          network: this.network,
        },
        {
          ...(options.inscriptionOptions || {}),
          mode: 'hashinal',
          waitForConfirmation: true,
        },
      );

      if (!inscription.confirmed || !inscription.inscription) {
        return { success: false, error: 'Failed to inscribe content' };
      }

      const topicId =
        inscription.inscription.jsonTopicId || inscription.inscription.topic_id;
      if (!topicId) {
        return { success: false, error: 'No topic ID from inscription' };
      }

      return await this.mint({
        tokenId: options.tokenId,
        metadataTopicId: topicId,
        supplyKey: options.supplyKey,
        memo: options.memo,
      });
    } catch (e) {
      const error = e as Error;
      this.logger.error(
        `Failed to inscribe and mint HCS-5 Hashinal: ${error.message}`,
      );
      return { success: false, error: error.message };
    }
  }
}
