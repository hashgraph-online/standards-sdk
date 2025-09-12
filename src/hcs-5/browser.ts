import { HCS5BaseClient } from './base-client';
import {
  HCS5InscribeAndMintOptions,
  HCS5MintOptions,
  HCS5MintResponse,
  buildHcs1Hrl,
} from './types';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import {
  TokenMintTransaction,
  TokenId,
  PrivateKey,
  TransactionReceipt,
} from '@hashgraph/sdk';
import {
  inscribeWithSigner,
  type InscriptionInput,
  type InscriptionOptions,
} from '../inscribe/inscriber';

export interface BrowserHCS5ClientConfig {
  network: 'testnet' | 'mainnet';
  hwc: HashinalsWalletConnectSDK;
  signer?: DAppSigner;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  silent?: boolean;
}

export class HCS5BrowserClient extends HCS5BaseClient {
  private hwc: HashinalsWalletConnectSDK;
  private signer?: DAppSigner;

  constructor(config: BrowserHCS5ClientConfig) {
    super({
      network: config.network,
      logLevel: config.logLevel,
      silent: config.silent,
      logger: undefined as never,
      operatorId: '0.0.0',
      operatorKey: '' as unknown as PrivateKey,
    });

    this.hwc = config.hwc;
    this.signer = config.signer;
  }

  private getSigner(): DAppSigner {
    if (this.signer) {
      return this.signer;
    }
    const accountId = this.hwc.getAccountInfo()?.accountId;
    const signer = this.hwc.dAppConnector?.signers?.find(s => {
      return s.getAccountId().toString() === accountId;
    });
    if (!signer) {
      throw new Error('No active wallet signer');
    }
    return signer;
  }

  async mint(options: HCS5MintOptions): Promise<HCS5MintResponse> {
    try {
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

      let result: { result?: TransactionReceipt; error?: string };

      if (options.supplyKey && options.supplyKey instanceof PrivateKey) {
        const signer = this.getSigner();
        tx.freezeWithSigner(signer as any);
        const signed = await tx.sign(options.supplyKey);
        result = await this.hwc.executeTransactionWithErrorHandling(
          signed,
          true,
        );
      } else {
        result = await this.hwc.executeTransactionWithErrorHandling(
          tx as any,
          false,
        );
      }

      if (result.error) {
        return { success: false, error: result.error };
      }

      const receipt = result.result as TransactionReceipt;
      const serial = (receipt as any).serials?.[0]
        ? Number((receipt as any).serials[0].toString())
        : undefined;

      return {
        success: true,
        serialNumber: serial,
        transactionId: (receipt as any)?.transactionId?.toString?.(),
        metadata,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  async inscribeAndMint(
    options: HCS5InscribeAndMintOptions,
  ): Promise<HCS5MintResponse> {
    try {
      const signer = this.getSigner();

      const inscriptionOptions: InscriptionOptions = {
        ...(options.inscriptionOptions as InscriptionOptions),
        mode: 'hashinal',
        waitForConfirmation: true,
        network: this.network,
      };

      const res = await inscribeWithSigner(
        options.inscriptionInput as InscriptionInput,
        signer,
        inscriptionOptions,
      );

      const topicId = res.inscription?.jsonTopicId || res.inscription?.topic_id;
      if (!res.confirmed || !topicId) {
        return { success: false, error: 'Failed to inscribe content' };
      }

      return await this.mint({
        tokenId: options.tokenId,
        metadataTopicId: topicId,
        supplyKey: options.supplyKey,
        memo: options.memo,
      });
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
