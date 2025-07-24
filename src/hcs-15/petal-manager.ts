/**
 * HCS-15 Petal Account Manager
 *
 * Manages creation and management of Petal (shadow) accounts that share
 * the same private key as the base account.
 */

import {
  Client,
  AccountCreateTransaction,
  PrivateKey,
  PublicKey,
  AccountId,
  Hbar,
} from '@hashgraph/sdk';
import { Logger } from '../utils/logger';
import { HCS11Client } from '../hcs-11/client';
import { HCS10Client } from '../hcs-10/sdk';
import { AgentBuilder } from '../hcs-11/agent-builder';
import { PersonBuilder } from '../hcs-11/person-builder';
import { MCPServerBuilder } from '../hcs-11/mcp-server-builder';
import { FloraBuilder } from '../hcs-11/flora-builder';
import type { NetworkType } from '../utils/types';
import {
  PetalConfig,
  PetalAccount,
  PetalCreationResult,
  PetalProfile,
  ProfileBuilder,
  PetalCreationOptions,
} from './types';
import {
  AIAgentProfile,
  PersonalProfile,
  MCPServerProfile,
  InboundTopicType,
  ProfileType,
} from '../hcs-11/types';
import { FloraProfile } from '../hcs-16/types';
import { HederaMirrorNode } from '../services';
import { detectKeyTypeFromString } from '../utils/key-type-detector';

export class HCS15PetalManager {
  private client: Client;
  private logger: Logger;

  constructor(client: Client, logger?: Logger) {
    this.client = client;
    this.logger =
      logger || new Logger({ module: 'HCS15PetalManager', level: 'debug' });
  }

  /**
   * Creates a new Petal account using a builder for ultimate flexibility
   */
  async createPetal(
    builder: ProfileBuilder,
    options: PetalCreationOptions,
  ): Promise<PetalCreationResult> {
    this.logger.info('Creating Petal account with builder', {
      baseAccount: options.baseAccountId,
    });

    // Create the Petal account
    const basePrivateKey = PrivateKey.fromStringECDSA(options.basePrivateKey);
    const sharedPublicKey = basePrivateKey.publicKey;

    const accountTx = new AccountCreateTransaction()
      .setKeyWithoutAlias(sharedPublicKey)
      .setInitialBalance(new Hbar(options.initialBalance || 1));

    if (options.maxAutomaticTokenAssociations !== undefined) {
      accountTx.setMaxAutomaticTokenAssociations(
        options.maxAutomaticTokenAssociations,
      );
    }

    const txResponse = await accountTx.execute(this.client);
    const receipt = await txResponse.getReceipt(this.client);
    const petalAccountId = receipt.accountId!;

    this.logger.info(`Petal account created: ${petalAccountId}`);

    const network: NetworkType = this.client.ledgerId
      ?.toString()
      .includes('testnet')
      ? 'testnet'
      : 'mainnet';

    const petalHcs10Client = new HCS10Client({
      network,
      operatorId: options.baseAccountId,
      operatorPrivateKey: options.basePrivateKey,
      keyType: 'ecdsa',
    });

    if (builder instanceof AgentBuilder) {
      builder.setBaseAccount(options.baseAccountId).setNetwork(network);

      const result = await petalHcs10Client.createAgent(
        builder,
        options.ttl || 60,
      );

      return {
        petalAccount: {
          accountId: petalAccountId,
          baseAccountId: options.baseAccountId,
          privateKey: basePrivateKey,
          publicKey: sharedPublicKey,
          profileTopicId: result.profileTopicId,
          inboundTopicId: result.inboundTopicId,
          outboundTopicId: result.outboundTopicId,
        },
        transactionId: txResponse.transactionId.toString(),
        profileTopicId: result.profileTopicId,
      };
    } else if (builder instanceof MCPServerBuilder) {
      builder.setNetworkType(network);

      const result = await petalHcs10Client.createMCPServer(
        builder,
        options.ttl || 60,
      );

      return {
        petalAccount: {
          accountId: petalAccountId,
          baseAccountId: options.baseAccountId,
          privateKey: basePrivateKey,
          publicKey: sharedPublicKey,
          profileTopicId: result.profileTopicId,
          inboundTopicId: result.inboundTopicId,
          outboundTopicId: result.outboundTopicId,
        },
        transactionId: txResponse.transactionId.toString(),
        profileTopicId: result.profileTopicId,
      };
    } else if (builder instanceof PersonBuilder) {
      // PersonBuilder doesn't have setExistingAccount, use HCS11Client directly
      const hcs11Client = new HCS11Client({
        network,
        auth: {
          operatorId: petalAccountId.toString(),
          privateKey: options.basePrivateKey,
        },
        keyType: 'ecdsa',
      });

      const profile = builder.build() as PersonalProfile & {
        base_account?: string;
      };
      profile.base_account = options.baseAccountId;

      const inscriptionResult = await hcs11Client.createAndInscribeProfile(
        profile as PersonalProfile,
        true,
      );

      return {
        petalAccount: {
          accountId: petalAccountId,
          baseAccountId: options.baseAccountId,
          privateKey: basePrivateKey,
          publicKey: sharedPublicKey,
          profileTopicId: inscriptionResult.profileTopicId,
          inboundTopicId: inscriptionResult.inboundTopicId,
          outboundTopicId: inscriptionResult.outboundTopicId,
        },
        transactionId: txResponse.transactionId.toString(),
        profileTopicId: inscriptionResult.profileTopicId,
      };
    } else {
      throw new Error('Unsupported builder type');
    }
  }


  /**
   * Creates a base account with ECDSA key and EVM alias
   */
  async createBaseAccount(initialBalance: number = 10): Promise<{
    accountId: AccountId;
    privateKey: PrivateKey;
    privateKeyHex: string;
    publicKey: PublicKey;
    evmAddress: string;
  }> {
    this.logger.info('Creating base account with ECDSA key and EVM alias');

    const privateKey = PrivateKey.generateECDSA();
    const privateKeyHex = privateKey.toStringRaw();
    const publicKey = privateKey.publicKey;
    const evmAddress = publicKey.toEvmAddress();

    const accountTx = await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(publicKey)
      .setInitialBalance(new Hbar(initialBalance))
      .execute(this.client);

    const receipt = await accountTx.getReceipt(this.client);
    const accountId = receipt.accountId!;

    this.logger.info(`Base account created: ${accountId}`);
    this.logger.info(`EVM address: 0x${evmAddress}`);

    return {
      accountId,
      privateKey,
      privateKeyHex,
      publicKey,
      evmAddress: `0x${evmAddress}`,
    };
  }

  /**
   * Verifies that a Petal account is valid
   */
  async verifyPetalAccount(
    petalAccountId: string,
    baseAccountId: string,
  ): Promise<boolean> {
    try {
      const mirrorNode = new HederaMirrorNode(
        this.client.network?.toString() as NetworkType,
      );

      const accountInfo = await mirrorNode.requestAccount(petalAccountId);

      const petalKey = accountInfo.key?.key;

      const baseAccountInfo = await mirrorNode.requestAccount(baseAccountId);

      if (!baseAccountInfo) {
        return false;
      }

      const baseKey = baseAccountInfo?.key?.key;

      return petalKey === baseKey;
    } catch (error) {
      this.logger.error('Error verifying petal account:', error);
      return false;
    }
  }
}
