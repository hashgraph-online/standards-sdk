import { HCS5BaseClient } from './base-client';
import {
  HCS5ClientConfig,
  HCS5InscribeAndMintOptions,
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

export class HCS5Client extends HCS5BaseClient {
  private client: Client;
  private operatorId: AccountId;
  private operatorKey!: PrivateKey;
  private keyType: 'ed25519' | 'ecdsa' = 'ecdsa';
  private initPromise: Promise<void>;

  constructor(config: HCS5ClientConfig) {
    super(config);

    this.operatorId = AccountId.fromString(config.operatorId);
    this.client = this.createClient(config.network);
    this.initPromise = this.initializeOperator(config.operatorKey);
  }

  private async initializeOperator(
    operatorKeyInput: string | PrivateKey,
  ): Promise<void> {
    try {
      const account = await this.mirrorNode.requestAccount(
        this.operatorId.toString(),
      );
      const typeField = account?.key?._type || '';
      if (typeField.includes('ECDSA')) {
        this.keyType = 'ecdsa';
      } else if (typeField.includes('ED25519')) {
        this.keyType = 'ed25519';
      } else {
        this.keyType = 'ecdsa';
      }

      this.operatorKey =
        typeof operatorKeyInput === 'string'
          ? this.keyType === 'ecdsa'
            ? PrivateKey.fromStringECDSA(operatorKeyInput)
            : PrivateKey.fromStringED25519(operatorKeyInput)
          : operatorKeyInput;

      this.client.setOperator(this.operatorId, this.operatorKey);
    } catch {
      this.logger.warn(
        'Failed to determine operator key type from mirror node; defaulting to ECDSA',
      );
      this.operatorKey =
        typeof operatorKeyInput === 'string'
          ? PrivateKey.fromStringECDSA(operatorKeyInput)
          : operatorKeyInput;
      this.client.setOperator(this.operatorId, this.operatorKey);
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
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
        const privKey =
          typeof options.supplyKey === 'string'
            ? await this.parseSupplyKeyForToken(
                options.supplyKey,
                options.tokenId,
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

  async inscribeAndMint(
    options: HCS5InscribeAndMintOptions,
  ): Promise<HCS5MintResponse> {
    try {
      await this.ensureInitialized();
      const inscription = await inscribe(
        options.inscriptionInput,
        {
          accountId: this.operatorId.toString(),
          privateKey: this.operatorKey.toString(),
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

  private createClient(network: NetworkType): Client {
    return network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  }

  private async parseSupplyKeyForToken(
    key: string,
    tokenId: string,
  ): Promise<PrivateKey> {
    try {
      const info = await this.mirrorNode.getTokenInfo(tokenId);
      const typeField = info?.supply_key?._type || '';
      if (typeField.includes('ECDSA')) {
        return PrivateKey.fromStringECDSA(key);
      }
      if (typeField.includes('ED25519')) {
        return PrivateKey.fromStringED25519(key);
      }
      return this.keyType === 'ecdsa'
        ? PrivateKey.fromStringECDSA(key)
        : PrivateKey.fromStringED25519(key);
    } catch {
      return this.keyType === 'ecdsa'
        ? PrivateKey.fromStringECDSA(key)
        : PrivateKey.fromStringED25519(key);
    }
  }
}
