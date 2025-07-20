import {
  Client,
  AccountCreateTransaction,
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

/**
 * HCS-22 Flora Account Manager
 * Manages creation and operation of Flora multi-party accounts
 */
export class FloraAccountManager {
  private readonly logger: Logger;

  constructor(
    private readonly client: Client,
    logger?: Logger
  ) {
    this.logger = logger || new Logger({ module: 'FloraAccountManager' });
  }

  /**
   * Create a Flora account with threshold key and required topics
   */
  async createFlora(config: FloraConfig): Promise<FloraCreationResult> {
    try {
      this.logger.info('Creating Flora account');

      // @ts-ignore
      const keyList = KeyList.of(config.members.map(m => m.publicKey))
        .setThreshold(config.threshold);

      const transaction = new AccountCreateTransaction()
        .setKeyWithoutAlias(keyList)
        .setInitialBalance(new Hbar(config.initialBalance || 1))
        .setMaxAutomaticTokenAssociations(
          config.maxAutomaticTokenAssociations || -1
        );

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      if (!receipt.accountId) {
        throw new Error('Failed to create Flora account');
      }

      const floraAccountId = receipt.accountId;

      const floraAccount = await this.createFloraAccount(keyList, config);

      const topics = await this.createFloraTopics(floraAccount, keyList, config);
      await this.createFloraProfile(floraAccount, topics, config);

      this.logger.info('Flora created successfully', {
        floraAccountId: floraAccount.toString(),
        topics: {
          communication: topics.communication.toString(),
          transaction: topics.transaction.toString(),
          state: topics.state.toString(),
        },
      });

      return {
        floraAccountId: floraAccount,
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
    threshold: number
  ): Promise<KeyList> {
    const keyList = new KeyList();
    keyList.setThreshold(threshold);

    for (const member of members) {
      if (member.publicKey) {
        keyList.push(member.publicKey);
      } else {
        // Fetch public key from account if not provided
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
    config: FloraConfig
  ): Promise<AccountId> {
    const transaction = new AccountCreateTransaction()
      .setKey(keyList)
      .setInitialBalance(new Hbar(config.initialBalance || 20))
      .setMaxAutomaticTokenAssociations(
        config.maxAutomaticTokenAssociations || -1
      );

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (!receipt.accountId) {
      throw new FloraError('Failed to create Flora account', 'ACCOUNT_CREATION_FAILED');
    }

    return receipt.accountId;
  }

  /**
   * Create the three required Flora topics with HCS-22 memo format
   */
  private async createFloraTopics(
    floraAccountId: AccountId,
    adminKey: KeyList,
    config: FloraConfig
  ): Promise<FloraTopics> {
    // Create submit key (1/M threshold for all members to submit)
    const submitKeyList = new KeyList();
    submitKeyList.setThreshold(1);

    for (const member of config.members) {
      if (member.publicKey) {
        submitKeyList.push(member.publicKey);
      } else {
        const accountInfo = await new AccountInfoQuery()
          .setAccountId(member.accountId)
          .execute(this.client);
        submitKeyList.push(accountInfo.key);
      }
    }

    // Create topics in parallel
    const [communication, transaction, state] = await Promise.all([
      this.createTopic(
        floraAccountId,
        FloraTopicType.COMMUNICATION,
        adminKey,
        submitKeyList,
        config.customFees
      ),
      this.createTopic(
        floraAccountId,
        FloraTopicType.TRANSACTION,
        adminKey,
        submitKeyList,
        config.customFees
      ),
      this.createTopic(
        floraAccountId,
        FloraTopicType.STATE,
        adminKey,
        submitKeyList,
        config.customFees
      ),
    ]);

    return { communication, transaction, state };
  }

  /**
   * Create a single topic with HCS-22 memo format
   */
  private async createTopic(
    floraAccountId: AccountId,
    topicType: FloraTopicType,
    adminKey: KeyList,
    submitKey: KeyList,
    customFees?: Array<{ amount: number; feeCollectorAccountId: string }>
  ): Promise<TopicId> {
    const memo = `hcs-22:${floraAccountId}:${topicType}`;

    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(adminKey)
      .setSubmitKey(submitKey);

    // Add HIP-991 custom fees if specified
    if (customFees && customFees.length > 0) {
      const fees = customFees.map(fee =>
        new CustomFixedFee()
          .setAmount(fee.amount)
          .setFeeCollectorAccountId(AccountId.fromString(fee.feeCollectorAccountId))
      );
      transaction.setCustomFees(fees);
    }

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (!receipt.topicId) {
      throw new FloraError(
        `Failed to create ${FloraTopicType[topicType]} topic`,
        'TOPIC_CREATION_FAILED'
      );
    }

    return receipt.topicId;
  }

  /**
   * Create and store Flora profile (HCS-11 extended)
   */
  private async createFloraProfile(
    floraAccountId: AccountId,
    topics: FloraTopics,
    config: FloraConfig
  ): Promise<void> {
    const profile: FloraProfile = {
      version: '1.0',
      type: 3,
      display_name: config.displayName,
      members: config.members,
      threshold: config.threshold,
      topics: {
        communication: topics.communication.toString(),
        transaction: topics.transaction.toString(),
        state: topics.state.toString(),
      },
      inboundTopicId: topics.communication.toString(),
      outboundTopicId: topics.transaction.toString(),
      policies: config.policies,
    };

    // TODO: Store profile using HCS-1 or other storage
    // For now, just log it
    this.logger.info('Flora profile created', { profile });
  }

  /**
   * Send a message to a Flora topic
   */
  async sendFloraMessage(
    topicId: string | TopicId,
    message: FloraMessage
  ): Promise<void> {
    try {
      // Ensure protocol identifier
      message.p = 'hcs-22';

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
    memberTopics: string[]
  ): Promise<void> {
    const message: FloraMessage = {
      p: 'hcs-22',
      op: FloraOperation.FLORA_CREATED,
      operator_id: `${this.client.operatorAccountId}@${result.floraAccountId}`,
      flora_account_id: result.floraAccountId.toString(),
      topics: {
        communication: result.topics.communication.toString(),
        transaction: result.topics.transaction.toString(),
        state: result.topics.state.toString(),
      },
    };

    // Send to each member's inbound topic
    await Promise.all(
      memberTopics.map(topicId => this.sendFloraMessage(topicId, message))
    );
  }

  /**
   * Parse HCS-22 topic memo
   */
  parseTopicMemo(memo: string): {
    protocol: string;
    floraAccountId: string;
    topicType: FloraTopicType;
  } | null {
    const match = memo.match(/^hcs-22:([0-9.]+):(\d)$/);
    if (!match) {
      return null;
    }

    return {
      protocol: 'hcs-22',
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
    floraAccountId: string
  ): Promise<void> {
    const message: FloraMessage = {
      p: 'hcs-22',
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
    epoch?: number
  ): Promise<void> {
    const message: FloraMessage = {
      p: 'hcs-22',
      op: FloraOperation.STATE_UPDATE,
      operator_id: `${operatorAccountId}@${floraAccountId}`,
      hash: stateHash,
      epoch,
      timestamp: new Date().toISOString(),
    };

    await this.sendFloraMessage(stateTopicId, message);
  }

  /**
   * Create a generic HCS-22 transaction topic with HIP-991 support
   * This can be used for any HCS-22 compliant topic, not just Flora accounts
   */
  async createTransactionTopic(config: TransactionTopicConfig): Promise<TopicId> {
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(config.memo);

    if (config.adminKey) {
      transaction.setAdminKey(config.adminKey);
    }
    if (config.submitKey) {
      transaction.setSubmitKey(config.submitKey);
    }
    if (config.feeScheduleKey) {
      transaction.setFeeScheduleKey(config.feeScheduleKey);
    }

    // Add HIP-991 custom fees if specified
    if (config.customFees && config.customFees.length > 0) {
      const fees = config.customFees.map(fee => {
        const customFee = new CustomFixedFee()
          .setAmount(fee.amount)
          .setFeeCollectorAccountId(AccountId.fromString(fee.feeCollectorAccountId));

        if (fee.denominatingTokenId) {
          customFee.setDenominatingTokenId(TokenId.fromString(fee.denominatingTokenId));
        }

        return customFee;
      });
      transaction.setCustomFees(fees);
    }

    // Add fee exempt keys if specified (HIP-991)
    if (config.feeExemptKeys && config.feeExemptKeys.length > 0) {
      (transaction as any).setFeeExemptKeyList(config.feeExemptKeys);
    }

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    if (!receipt.topicId) {
      throw new FloraError('Failed to create transaction topic', 'TOPIC_CREATION_FAILED');
    }

    this.logger.info('Created HCS-22 transaction topic', {
      topicId: receipt.topicId.toString(),
      memo: config.memo,
      hasFees: !!config.customFees
    });

    return receipt.topicId;
  }

  /**
   * Submit HCS-22 compliant credit purchase message
   */
  async submitCreditPurchase(
    topicId: string | TopicId,
    purchaser: string,
    amount: number,
    floraAccountId?: string
  ): Promise<void> {
    const message: CreditPurchaseMessage = {
      p: 'hcs-22',
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