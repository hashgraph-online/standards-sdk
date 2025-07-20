import {
  Client,
  AccountCreateTransaction,
  AccountUpdateTransaction,
  AccountInfoQuery,
  PrivateKey,
  PublicKey,
  Hbar,
  AccountId,
  TransactionReceipt,
} from '@hashgraph/sdk';
import { Logger } from '../utils/logger';
import {
  PetalAccountConfig,
  PetalAccountResult,
  PetalProfileReference,
  PetalRelationship,
  PetalAccountError,
} from './types';

/**
 * HCS-21 Petal Account Manager
 * Manages creation and management of Petal accounts that share keys with base accounts
 */
export class PetalAccountManager {
  private readonly logger: Logger;

  constructor(
    private readonly client: Client,
    logger?: Logger
  ) {
    this.logger = logger || new Logger({ module: 'PetalAccountManager' });
  }

  /**
   * Create a base account with ECDSA key and EVM alias
   * This is the recommended approach for the initial account
   */
  async createBaseAccount(config: {
    initialBalance?: number;
    maxAutomaticTokenAssociations?: number;
  }): Promise<PetalAccountResult & { privateKey: PrivateKey }> {
    try {
      this.logger.info('Creating base account with ECDSA key and EVM alias');

      // Generate ECDSA key pair
      const privateKey = PrivateKey.generateECDSA();
      const publicKey = privateKey.publicKey;
      const evmAddress = publicKey.toEvmAddress();

      // Create account with EVM alias
      const transaction = new AccountCreateTransaction()
        .setKey(publicKey)
        .setAlias(evmAddress)
        .setInitialBalance(new Hbar(config.initialBalance || 10))
        .setMaxAutomaticTokenAssociations(
          config.maxAutomaticTokenAssociations || 10
        );

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (!receipt.accountId) {
        throw new PetalAccountError(
          'Failed to create base account - no account ID in receipt',
          'CREATE_FAILED'
        );
      }

      this.logger.info('Base account created', {
        accountId: receipt.accountId.toString(),
        evmAddress,
      });

      return {
        accountId: receipt.accountId,
        publicKey,
        evmAddress,
        transactionId: response.transactionId.toString(),
        privateKey,
      };
    } catch (error) {
      this.logger.error('Failed to create base account', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Create a petal account using the same key as the base account
   */
  async createPetalAccount(
    config: PetalAccountConfig
  ): Promise<PetalAccountResult> {
    try {
      this.logger.info('Creating petal account with shared key');

      const publicKey = config.sharedPrivateKey.publicKey;

      // Create petal account with same public key (no alias)
      const transaction = new AccountCreateTransaction()
        .setKey(publicKey)
        .setInitialBalance(new Hbar(config.initialBalance || 1))
        .setMaxAutomaticTokenAssociations(
          config.maxAutomaticTokenAssociations || -1
        );

      if (config.memo) {
        transaction.setAccountMemo(config.memo);
      }

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (!receipt.accountId) {
        throw new PetalAccountError(
          'Failed to create petal account - no account ID in receipt',
          'CREATE_FAILED'
        );
      }

      this.logger.info('Petal account created', {
        accountId: receipt.accountId.toString(),
        publicKey: publicKey.toString(),
      });

      return {
        accountId: receipt.accountId,
        publicKey,
        transactionId: response.transactionId.toString(),
      };
    } catch (error) {
      this.logger.error('Failed to create petal account', error);
      throw error;
    }
  }

  /**
   * Update account memo with HCS-11 profile reference
   * Format: hcs-11:<protocol_reference>
   */
  async updateAccountMemo(
    accountId: string | AccountId,
    profileReference: string
  ): Promise<void> {
    try {
      const memo = `hcs-11:${profileReference}`;

      this.logger.info('Updating account memo', {
        accountId: accountId.toString(),
        memo,
      });

      const transaction = new AccountUpdateTransaction()
        .setAccountId(accountId)
        .setAccountMemo(memo);

      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);

      this.logger.info('Account memo updated successfully');
    } catch (error) {
      this.logger.error('Failed to update account memo', error);
      throw error;
    }
  }

  /**
   * Parse HCS-11 profile reference from account memo
   */
  parseProfileReference(memo: string): PetalProfileReference | null {
    const match = memo.match(/^hcs-11:(.+)$/);
    if (!match) {
      return null;
    }

    const resourceLocator = match[1];

    // Parse base account from HRL if present
    const hrlMatch = resourceLocator.match(/hcs:\/\/\d+\/([0-9.]+)/);

    return {
      protocol: 'hcs-11',
      resourceLocator,
      baseAccount: hrlMatch ? hrlMatch[1] : undefined,
    };
  }

  /**
   * Create multiple petal accounts from a single base account
   */
  async createPetalBouquet(
    basePrivateKey: PrivateKey,
    count: number,
    config?: {
      initialBalance?: number;
      maxAutomaticTokenAssociations?: number;
      memoPrefix?: string;
    }
  ): Promise<PetalAccountResult[]> {
    const results: PetalAccountResult[] = [];

    for (let i = 0; i < count; i++) {
      const memo = config?.memoPrefix
        ? `${config.memoPrefix}-${i + 1}`
        : undefined;

      const petal = await this.createPetalAccount({
        sharedPrivateKey: basePrivateKey,
        initialBalance: config?.initialBalance,
        maxAutomaticTokenAssociations: config?.maxAutomaticTokenAssociations,
        memo,
      });

      results.push(petal);

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Verify that two accounts share the same public key
   */
  async verifySharedKey(
    accountId1: string | AccountId,
    accountId2: string | AccountId
  ): Promise<boolean> {
    try {
      const [info1, info2] = await Promise.all([
        new AccountInfoQuery()
          .setAccountId(accountId1)
          .execute(this.client),
        new AccountInfoQuery()
          .setAccountId(accountId2)
          .execute(this.client),
      ]);

      const key1 = info1.key;
      const key2 = info2.key;

      // Compare key strings (simplified - in production, properly compare key structures)
      return key1.toString() === key2.toString();
    } catch (error) {
      this.logger.error('Failed to verify shared keys', error);
      return false;
    }
  }

  /**
   * Get all petal relationships for a given public key
   */
  async findPetalsByPublicKey(
    publicKey: PublicKey,
    knownAccountIds: string[]
  ): Promise<PetalRelationship[]> {
    const relationships: PetalRelationship[] = [];
    let baseAccountId: string | undefined;

    for (const accountId of knownAccountIds) {
      try {
        const info = await new AccountInfoQuery()
          .setAccountId(accountId)
          .execute(this.client);

        if (info.key.toString() === publicKey.toString()) {
          // Check if this is likely a base account (has EVM alias)
          const hasEvmAlias = info.contractAccountId !== null;

          if (hasEvmAlias && !baseAccountId) {
            baseAccountId = accountId;
          }

          // Parse profile reference from memo if present
          const profileRef = info.accountMemo
            ? this.parseProfileReference(info.accountMemo)
            : null;

          relationships.push({
            petalAccountId: accountId,
            baseAccountId: baseAccountId || accountId,
            sharedPublicKey: publicKey,
            profileTopicId: profileRef?.resourceLocator,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to check account ${accountId}`, error);
      }
    }

    // Update base account references
    if (baseAccountId) {
      relationships.forEach((rel) => {
        if (!rel.baseAccountId || rel.baseAccountId === rel.petalAccountId) {
          rel.baseAccountId = baseAccountId!;
        }
      });
    }

    return relationships;
  }
}