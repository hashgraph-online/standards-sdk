import {
  Client,
  AccountCreateTransaction,
  AccountUpdateTransaction,
  AccountInfoQuery,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  KeyList,
  PublicKey,
  PrivateKey,
  Hbar,
  AccountId,
  TopicId,
  CustomFixedFee,
  TokenId,
} from '@hashgraph/sdk';
import { Logger } from '../utils/logger';
import {
  FloraConfig,
  FloraCreationResult,
  FloraTopics,
  FloraTopicType,
  FloraMessage,
  FloraOperation,
  FloraProfile,
  FloraError,
  FloraMember,
  TransactionTopicConfig,
  TransactionTopicFee,
  CreditPurchaseMessage,
} from './types';
import { HCS11Client, FloraBuilder } from '../hcs-11';
import type { NetworkType } from '../utils/types';

/**
 * HCS-16 Flora Account Manager
 * Manages creation and operation of Flora multi-party accounts
 */
export class FloraAccountManager {
  private readonly logger: Logger;
  private readonly network: NetworkType;

  constructor(
    private readonly client: Client,
    network?: NetworkType,
    logger?: Logger,
  ) {
    this.logger = logger || new Logger({ module: 'FloraAccountManager' });
    this.network = network || 'testnet';
  }

  /**
   * Create a Flora account with threshold key and required topics
   */
  async createFlora(config: FloraConfig): Promise<FloraCreationResult> {
    try {
      this.logger.info('Creating Flora account');

      const keyList = new KeyList(
        config.members.map(m => {
          if (typeof m.publicKey === 'string') {
            return PublicKey.fromString(m.publicKey);
          }
          return m.publicKey;
        }).filter(key => key !== undefined),
        config.threshold,
      );
      
      this.logger.debug('Creating Flora with KeyList:', {
        threshold: config.threshold,
        members: config.members.length,
        publicKeys: config.members.map(m => m.publicKey.toString()),
      });

      const transaction = new AccountCreateTransaction()
        .setKey(keyList)
        .setInitialBalance(new Hbar(config.initialBalance || 1))
        .setMaxAutomaticTokenAssociations(
          config.maxAutomaticTokenAssociations || -1,
        );

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (!receipt.accountId) {
        throw new Error('Failed to create Flora account');
      }

      const floraAccountId = receipt.accountId;
      this.logger.info('Flora account created successfully:', floraAccountId.toString());

      this.logger.info('Creating Flora topics...');
      let topics;
      try {
        topics = await this.createFloraTopics(
          floraAccountId,
          keyList,
          config,
        );
        this.logger.info('Flora topics created successfully');
      } catch (topicError: any) {
        this.logger.error('Failed to create Flora topics:', {
          error: topicError.message || 'Unknown topic error',
          status: topicError.status,
          code: topicError.code,
          name: topicError.name,
          stack: topicError.stack,
        });
        throw topicError;
      }

      this.logger.info('Creating Flora profile...');
      await this.createFloraProfile(floraAccountId, topics, config);
      this.logger.info('Flora profile created successfully');

      this.logger.info('Flora created successfully', {
        floraAccountId: floraAccountId.toString(),
        topics: {
          communication: topics.communication.toString(),
          transaction: topics.transaction.toString(),
          state: topics.state.toString(),
        },
      });

      return {
        floraAccountId,
        topics,
        keyList,
        transactionId: '',
      };
    } catch (error) {
      this.logger.error('Failed to create Flora', error);
      throw error;
    }
  }

  /**
   * Build KeyList from member public keys
   */
  private async buildKeyList(
    members: FloraMember[],
    threshold: number,
  ): Promise<KeyList> {
    const keyList = new KeyList();
    keyList.setThreshold(threshold);

    for (const member of members) {
      if (member.publicKey) {
        if (typeof member.publicKey === 'string') {
          keyList.push(PublicKey.fromString(member.publicKey));
        } else {
          keyList.push(member.publicKey);
        }
      } else {
        const accountInfo = await new AccountInfoQuery()
          .setAccountId(member.accountId)
          .execute(this.client);
        keyList.push(accountInfo.key);
      }
    }

    return keyList;
  }

  /**
   * Create the Flora account with threshold key
   */
  private async createFloraAccount(
    keyList: KeyList,
    config: FloraConfig,
  ): Promise<AccountId> {
    const transaction = new AccountCreateTransaction()
      .setKey(keyList)
      .setInitialBalance(new Hbar(config.initialBalance || 20))
      .setMaxAutomaticTokenAssociations(
        config.maxAutomaticTokenAssociations || -1,
      );

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (!receipt.accountId) {
      throw new FloraError(
        'Failed to create Flora account',
        'ACCOUNT_CREATION_FAILED',
      );
    }

    return receipt.accountId;
  }

  /**
   * Create the three required Flora topics with HCS-16 memo format
   */
  private async createFloraTopics(
    floraAccountId: AccountId,
    adminKey: KeyList,
    config: FloraConfig,
  ): Promise<FloraTopics> {
    // Use operator's public key for submitKey (simplified approach)
    const operatorSubmitKey = this.client.operatorPublicKey;
    if (!operatorSubmitKey) {
      throw new FloraError(
        'Operator public key required for topic submission',
        'MISSING_OPERATOR_KEY',
      );
    }

    // Create topics sequentially to better handle errors
    this.logger.debug('About to create COMMUNICATION topic...');
    const communication = await this.createTopic(
      floraAccountId,
      FloraTopicType.COMMUNICATION,
      adminKey,
      operatorSubmitKey,
      config.customFees,
    );
    this.logger.debug('COMMUNICATION topic created, creating TRANSACTION topic...');
    
    const transaction = await this.createTopic(
      floraAccountId,
      FloraTopicType.TRANSACTION,
      adminKey,
      operatorSubmitKey,
      config.customFees,
    );
    this.logger.debug('TRANSACTION topic created, creating STATE topic...');
    
    const state = await this.createTopic(
      floraAccountId,
      FloraTopicType.STATE,
      adminKey,
      operatorSubmitKey,
      config.customFees,
    );
    this.logger.debug('All Flora topics created successfully');

    return { communication, transaction, state };
  }

  /**
   * Create a single topic with HCS-16 memo format
   */
  private async createTopic(
    floraAccountId: AccountId,
    topicType: FloraTopicType,
    adminKey: KeyList,
    submitKey: PublicKey,
    customFees?: Array<{ amount: number; feeCollectorAccountId: string }>,
  ): Promise<TopicId> {
    const memo = `hcs-16:${floraAccountId}:${topicType}`;
    
    this.logger.debug(`Creating ${FloraTopicType[topicType]} topic with memo: ${memo}`);
    this.logger.debug('Topic creation details:', {
      operatorId: this.client.operatorAccountId?.toString(),
      operatorIdType: typeof this.client.operatorAccountId,
      hasOperatorPublicKey: !!this.client.operatorPublicKey,
    });

    // Ensure operatorAccountId is properly handled
    const operatorAccountId = this.client.operatorAccountId;
    if (!operatorAccountId) {
      throw new FloraError('No operator account ID configured', 'MISSING_OPERATOR_ACCOUNT');
    }

    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(submitKey);
    
    // Convert AccountId to string for setAutoRenewAccountId
    transaction.setAutoRenewAccountId(operatorAccountId.toString());
      
    // Note: adminKey temporarily removed to allow operator to create topics
    // In practice, adminKey would be set to the threshold key, but this requires
    // threshold signatures for topic creation which is complex to implement
    // .setAdminKey(adminKey)

    if (customFees && customFees.length > 0) {
      const fees = customFees.map(fee =>
        new CustomFixedFee()
          .setAmount(fee.amount)
          .setFeeCollectorAccountId(
            AccountId.fromString(fee.feeCollectorAccountId),
          ),
      );
      transaction.setCustomFees(fees);
    }

    this.logger.debug(`About to execute topic creation for ${FloraTopicType[topicType]}`);
    
    let response;
    try {
      this.logger.debug(`Executing topic creation transaction for ${FloraTopicType[topicType]}`);
      response = await transaction.execute(this.client);
      this.logger.debug(`Transaction executed successfully for ${FloraTopicType[topicType]}, response:`, typeof response);
    } catch (executeError: any) {
      this.logger.error(`Transaction execution failed for ${FloraTopicType[topicType]}:`, {
        error: executeError.message || 'Unknown execute error',
        status: executeError.status,
        code: executeError.code,
        name: executeError.name,
        stack: executeError.stack,
      });
      throw executeError;
    }

    let receipt;
    try {
      this.logger.debug(`Getting receipt for ${FloraTopicType[topicType]}`);
      receipt = await response.getReceipt(this.client);
      this.logger.debug(`Receipt obtained for ${FloraTopicType[topicType]}`);
    } catch (receiptError: any) {
      this.logger.error(`Receipt retrieval failed for ${FloraTopicType[topicType]}:`, {
        error: receiptError.message || 'Unknown receipt error',
        status: receiptError.status,
        code: receiptError.code,
        name: receiptError.name,
        stack: receiptError.stack,
      });
      throw receiptError;
    }

    if (!receipt.topicId) {
      throw new FloraError(
        `Failed to create ${FloraTopicType[topicType]} topic - no topicId in receipt`,
        'TOPIC_CREATION_FAILED',
      );
    }

    this.logger.debug(`${FloraTopicType[topicType]} topic created: ${receipt.topicId}`);
    return receipt.topicId;
  }

  /**
   * Create and store Flora profile using HCS-11
   */
  private async createFloraProfile(
    floraAccountId: AccountId,
    topics: FloraTopics,
    config: FloraConfig,
  ): Promise<string> {
    this.logger.info('Creating Flora profile using HCS-11');

    const operatorMember = config.members[0];
    if (!operatorMember.privateKey) {
      throw new FloraError(
        'First member must have private key to create profile',
        'MISSING_PRIVATE_KEY',
      );
    }

    // Use the first member's account as operator (they have the signing key)
    // The Flora profile will still be associated with the Flora account via the profile content
    const hcs11Client = new HCS11Client({
      network: this.network,
      auth: {
        operatorId: operatorMember.accountId,
        privateKey: operatorMember.privateKey,
      },
      keyType: 'ecdsa',
    });

    // Convert members to profile-safe format (no private keys, serialized public keys)
    const profileMembers = config.members.map(member => ({
      accountId: member.accountId,
      publicKey: member.publicKey?.toString(), // Serialize PublicKey to string
      weight: member.weight,
      // Note: privateKey is intentionally excluded from the profile
    }));

    const floraBuilder = new FloraBuilder()
      .setDisplayName(config.displayName)
      .setMembers(profileMembers)
      .setThreshold(config.threshold)
      .setTopics({
        communication: topics.communication.toString(),
        transaction: topics.transaction.toString(),
        state: topics.state.toString(),
      })
      .setPolicies(config.policies);

    if (config.bio) {
      floraBuilder.setBio(config.bio);
    }

    if (config.metadata) {
      floraBuilder.setMetadata(config.metadata);
    }

    const profile = floraBuilder.build();

    this.logger.debug('Attempting Flora profile inscription with config:', {
      operatorId: operatorMember.accountId,
      hasPrivateKey: !!operatorMember.privateKey,
      floraAccountId: floraAccountId.toString(),
      network: this.network,
    });

    this.logger.debug('Built Flora profile for validation:', {
      profile: JSON.stringify(profile, null, 2),
    });

    let inscriptionResult;
    try {
      inscriptionResult = await hcs11Client.createAndInscribeProfile(
        profile,
        true,
      );
    } catch (inscriptionError: any) {
      this.logger.error('HCS-11 inscription error:', {
        error: inscriptionError.message || 'Unknown inscription error',
        status: inscriptionError.status,
        code: inscriptionError.code,
        name: inscriptionError.name,
        stack: inscriptionError.stack,
      });
      throw new FloraError(
        `HCS-11 inscription failed: ${inscriptionError.message}`,
        'PROFILE_INSCRIPTION_FAILED',
      );
    }

    if (!inscriptionResult.success) {
      this.logger.error('Flora profile inscription failed:', {
        error: inscriptionResult.error,
        result: inscriptionResult,
      });
      throw new FloraError(
        `Failed to inscribe Flora profile: ${inscriptionResult.error}`,
        'PROFILE_INSCRIPTION_FAILED',
      );
    }

    this.logger.info('Flora profile inscribed successfully', {
      profileTopicId: inscriptionResult.profileTopicId,
      transactionId: inscriptionResult.transactionId,
    });

    return inscriptionResult.profileTopicId;
  }

  /**
   * Send a message to a Flora topic
   */
  async sendFloraMessage(
    topicId: string | TopicId,
    message: FloraMessage,
  ): Promise<void> {
    try {
      message.p = 'hcs-16';

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(JSON.stringify(message));

      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);

      this.logger.debug('Flora message sent', {
        topicId: topicId.toString(),
        operation: message.op,
      });
    } catch (error) {
      this.logger.error('Failed to send Flora message', error);
      throw error;
    }
  }

  /**
   * Send flora_created notification to all members
   */
  async notifyFloraCreated(
    result: FloraCreationResult,
    memberTopics: string[],
  ): Promise<void> {
    const message: FloraMessage = {
      p: 'hcs-16',
      op: FloraOperation.FLORA_CREATED,
      operator_id: `${this.client.operatorAccountId}@${result.floraAccountId}`,
      flora_account_id: result.floraAccountId.toString(),
      topics: {
        communication: result.topics.communication.toString(),
        transaction: result.topics.transaction.toString(),
        state: result.topics.state.toString(),
      },
    };

    await Promise.all(
      memberTopics.map(topicId => this.sendFloraMessage(topicId, message)),
    );
  }

  /**
   * Parse HCS-16 topic memo
   */
  parseTopicMemo(memo: string): {
    protocol: string;
    floraAccountId: string;
    topicType: FloraTopicType;
  } | null {
    const match = memo.match(/^hcs-16:([0-9.]+):(\d)$/);
    if (!match) {
      return null;
    }

    return {
      protocol: 'hcs-16',
      floraAccountId: match[1],
      topicType: parseInt(match[2]) as FloraTopicType,
    };
  }

  /**
   * Create a proposal for a scheduled transaction
   */
  async createTransactionProposal(
    transactionTopicId: string | TopicId,
    scheduledTxId: string,
    description: string,
    operatorAccountId: string,
    floraAccountId: string,
  ): Promise<void> {
    const message: FloraMessage = {
      p: 'hcs-16',
      op: FloraOperation.TX_PROPOSAL,
      operator_id: `${operatorAccountId}@${floraAccountId}`,
      scheduled_tx_id: scheduledTxId,
      description,
      m: description,
    };

    await this.sendFloraMessage(transactionTopicId, message);
  }

  /**
   * Submit a state update to the state topic
   */
  async submitStateUpdate(
    stateTopicId: string | TopicId,
    stateHash: string,
    operatorAccountId: string,
    floraAccountId: string,
    epoch?: number,
  ): Promise<void> {
    const message: FloraMessage = {
      p: 'hcs-16',
      op: FloraOperation.STATE_UPDATE,
      operator_id: `${operatorAccountId}@${floraAccountId}`,
      hash: stateHash,
      epoch,
      timestamp: new Date().toISOString(),
    };

    await this.sendFloraMessage(stateTopicId, message);
  }

  /**
   * Create a generic HCS-16 transaction topic with HIP-991 support
   * This can be used for any HCS-16 compliant topic, not just Flora accounts
   */
  async createTransactionTopic(
    config: TransactionTopicConfig,
  ): Promise<TopicId> {
    const transaction = new TopicCreateTransaction().setTopicMemo(config.memo);

    if (config.adminKey) {
      transaction.setAdminKey(config.adminKey);
    }
    if (config.submitKey) {
      transaction.setSubmitKey(config.submitKey);
    }
    if (config.feeScheduleKey) {
      transaction.setFeeScheduleKey(config.feeScheduleKey);
    }

    if (config.customFees && config.customFees.length > 0) {
      const fees = config.customFees.map(fee => {
        const customFee = new CustomFixedFee()
          .setAmount(fee.amount)
          .setFeeCollectorAccountId(
            AccountId.fromString(fee.feeCollectorAccountId),
          );

        if (fee.denominatingTokenId) {
          customFee.setDenominatingTokenId(
            TokenId.fromString(fee.denominatingTokenId),
          );
        }

        return customFee;
      });
      transaction.setCustomFees(fees);
    }

    if (config.feeExemptKeys && config.feeExemptKeys.length > 0) {
      (transaction as any).setFeeExemptKeyList(config.feeExemptKeys);
    }

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (!receipt.topicId) {
      throw new FloraError(
        'Failed to create transaction topic',
        'TOPIC_CREATION_FAILED',
      );
    }

    this.logger.info('Created HCS-16 transaction topic', {
      topicId: receipt.topicId.toString(),
      memo: config.memo,
      hasFees: !!config.customFees,
    });

    return receipt.topicId;
  }

  /**
   * Submit HCS-16 compliant credit purchase message
   */
  async submitCreditPurchase(
    topicId: string | TopicId,
    purchaser: string,
    amount: number,
    floraAccountId?: string,
  ): Promise<void> {
    const message: CreditPurchaseMessage = {
      p: 'hcs-16',
      op: FloraOperation.CREDIT_PURCHASE,
      operator_id: floraAccountId
        ? `${purchaser}@${floraAccountId}`
        : purchaser,
      amount,
      purchaser,
      timestamp: new Date().toISOString(),
      m: `Purchase ${amount} credits`,
    };

    await this.sendFloraMessage(topicId, message);
  }
}
