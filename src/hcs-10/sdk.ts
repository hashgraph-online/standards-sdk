import {
  Client,
  AccountCreateTransaction,
  PrivateKey,
  Hbar,
  KeyList,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  Transaction,
  TransactionResponse,
  TransactionReceipt,
  PublicKey,
  AccountId,
  CustomFixedFee,
} from '@hashgraph/sdk';
import {
  PayloadSizeError,
  AccountCreationError,
  TopicCreationError,
  ConnectionConfirmationError,
} from './errors';
import {
  InscriptionSDK,
  RetrievedInscriptionResult,
} from '@kiloscribe/inscription-sdk';
import { Logger, LogLevel } from '../utils/logger';
import { HCS10BaseClient } from './base-client';
import * as mime from 'mime-types';
import {
  HCSClientConfig,
  AgentConfig,
  CreateAccountResponse,
  CreateAgentResponse,
  InscribePfpResponse,
  StoreHCS11ProfileResponse,
  AgentRegistrationResult,
  HandleConnectionRequestResponse,
  WaitForConnectionConfirmationResponse,
  GetAccountAndSignerResponse,
  InboundTopicType,
  TopicFeeConfig,
  FeeConfigBuilderInterface,
  AgentCreationState,
} from './types.d';
import { HCS11Client } from '../hcs-11';
import { AgentBuilder } from './agent-builder';
import { accountIdsToExemptKeys } from '../utils/topic-fee-utils';

export { InboundTopicType } from './types.d';
export { FeeConfigBuilder } from './fee-config-builder';

export interface AgentMetadata {
  type: 'autonomous' | 'manual';
  model?: string;
  socials?: {
    twitter?: string;
    discord?: string;
    github?: string;
    website?: string;
    x?: string;
    linkedin?: string;
    youtube?: string;
    telegram?: string;
  };
  creator?: string;
  properties?: Record<string, any>;
}

/**
 * Progress report data for registration operations
 */
export interface RegistrationProgressData {
  stage: 'preparing' | 'submitting' | 'confirming' | 'verifying' | 'completed';
  message: string;
  progressPercent?: number;
  details?: Record<string, any>;
}

/**
 * Progress callback function type for registration operations
 */
export type RegistrationProgressCallback = (
  data: RegistrationProgressData
) => void;

export class HCS10Client extends HCS10BaseClient {
  private client: Client;
  private operatorPrivateKey: PrivateKey;
  protected declare network: string;
  protected declare logger: Logger;
  protected guardedRegistryBaseUrl: string;
  private hcs11Client: HCS11Client;
  private feeAmount: number;

  constructor(config: HCSClientConfig) {
    super({
      network: config.network,
      logLevel: config.logLevel,
      prettyPrint: config.prettyPrint
    });
    this.client =
      config.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.operatorPrivateKey = PrivateKey.fromString(config.operatorPrivateKey);
    this.network = config.network;
    this.client.setOperator(
      config.operatorId,
      this.operatorPrivateKey.toString()
    );
    this.logger = Logger.getInstance({
      level: config.logLevel || 'info',
      module: 'HCS-SDK',
    });
    this.guardedRegistryBaseUrl =
      config.guardedRegistryBaseUrl || 'https://moonscape.tech';
    this.feeAmount = config.feeAmount || 5;

    this.hcs11Client = new HCS11Client({
      network: config.network,
      auth: {
        operatorId: config.operatorId,
        privateKey: config.operatorPrivateKey,
      },
      logLevel: config.logLevel,
    });
  }

  public getClient() {
    return this.client;
  }

  /**
   * Creates a new Hedera account
   * @returns Object with account ID and private key
   */
  async createAccount(): Promise<CreateAccountResponse> {
    this.logger.info('Creating new account');
    const newKey = PrivateKey.generate();

    const accountTransaction = new AccountCreateTransaction()
      .setKey(newKey.publicKey)
      .setInitialBalance(new Hbar(10));

    this.logger.debug('Executing account creation transaction');
    const accountResponse = await accountTransaction.execute(this.client);
    const accountReceipt = await accountResponse.getReceipt(this.client);
    const newAccountId = accountReceipt.accountId;

    if (!newAccountId) {
      this.logger.error('Account creation failed: accountId is null');
      throw new AccountCreationError(
        'Failed to create account: accountId is null'
      );
    }

    this.logger.info(
      `Account created successfully: ${newAccountId.toString()}`
    );
    return {
      accountId: newAccountId.toString(),
      privateKey: newKey.toString(),
    };
  }

  /**
   * Creates an inbound topic with the specified configuration
   * @param accountId Account ID associated with the topic
   * @param topicType Type of inbound topic (public, controlled, or fee-based)
   * @param feeConfig Optional fee configuration for fee-based topics
   * @returns The topic ID of the created inbound topic
   */
  async createInboundTopic(
    accountId: string,
    topicType: InboundTopicType,
    feeConfig?: FeeConfigBuilderInterface
  ): Promise<string> {
    this.logger.info(`Creating ${topicType} inbound topic`);
    const memo = `hcs-10:0:60:0:${accountId}`;

    switch (topicType) {
      case InboundTopicType.PUBLIC:
        return this.createTopic(memo, true, false);

      case InboundTopicType.CONTROLLED:
        return this.createTopic(memo, true, true);

      case InboundTopicType.FEE_BASED:
        if (!feeConfig) {
          throw new Error('Fee configuration is required for fee-based topics');
        }
        return this.createTopic(memo, true, true, feeConfig.build());

      default:
        throw new Error(`Unsupported inbound topic type: ${topicType}`);
    }
  }

  /**
   * Creates a new agent with inbound and outbound topics
   * @param builder The agent builder object
   * @returns Object with topic IDs
   */
  async createAgent(builder: AgentBuilder): Promise<CreateAgentResponse> {
    const config = builder.build();
    const outboundTopicId = await this.createTopic('hcs-10:0:60:1', true, true);
    this.logger.info(`Created new outbound topic ID: ${outboundTopicId}`);

    const accountId = this.client.operatorAccountId?.toString();
    if (!accountId) {
      throw new Error('Failed to retrieve operator account ID');
    }

    const inboundTopicId = await this.createInboundTopic(
      accountId,
      config.inboundTopicType,
      config.inboundTopicType === InboundTopicType.FEE_BASED
        ? config.feeConfig
        : undefined
    );
    this.logger.info(`Created new inbound topic ID: ${inboundTopicId}`);

    let pfpTopicId = config.existingPfpTopicId || '';
    
    if (!pfpTopicId && config.pfpBuffer && config.pfpBuffer.length > 0) {
      this.logger.info('Inscribing new profile picture');
      const pfpResult = await this.inscribePfp(
        config.pfpBuffer,
        config.pfpFileName
      );
      pfpTopicId = pfpResult.pfpTopicId;
      this.logger.info(`Profile picture inscribed with topic ID: ${pfpTopicId}`);
    } else if (config.existingPfpTopicId) {
      this.logger.info(`Using existing profile picture with topic ID: ${config.existingPfpTopicId}`);
    }

    const profileResult = await this.storeHCS11Profile(
      config.name,
      config.description,
      inboundTopicId,
      outboundTopicId,
      config.capabilities,
      config.metadata,
      config.pfpBuffer && config.pfpBuffer.length > 0 ? config.pfpBuffer : undefined,
      config.pfpFileName,
      config.existingPfpTopicId
    );
    const profileTopicId = profileResult.profileTopicId;
    this.logger.info(`Profile stored with topic ID: ${profileTopicId}`);

    return {
      outboundTopicId,
      inboundTopicId,
      pfpTopicId,
      profileTopicId,
    };
  }

  /**
   * Inscribes a profile picture to Hedera
   * @param buffer Profile picture buffer
   * @param fileName Filename
   * @returns Response with topic ID and transaction ID
   */
  async inscribePfp(
    buffer: Buffer,
    fileName: string
  ): Promise<InscribePfpResponse> {
    try {
      this.logger.info('Inscribing profile picture using HCS-11 client');

      const imageResult = await this.hcs11Client.inscribeImage(
        buffer,
        fileName
      );

      if (!imageResult.success) {
        this.logger.error(
          `Failed to inscribe profile picture: ${imageResult.error}`
        );
        throw new Error(
          imageResult?.error || 'Failed to inscribe profile picture'
        );
      }

      this.logger.info(
        `Successfully inscribed profile picture with topic ID: ${imageResult.imageTopicId}`
      );
      return {
        pfpTopicId: imageResult.imageTopicId,
        transactionId: imageResult.transactionId,
        success: true,
      };
    } catch (error: any) {
      this.logger.error(`Error inscribing profile picture: ${error.message}`);
      return {
        pfpTopicId: '',
        transactionId: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Stores an HCS-11 profile for an agent
   * @param agentName Agent name
   * @param agentDescription Agent description
   * @param inboundTopicId Inbound topic ID
   * @param outboundTopicId Outbound topic ID
   * @param capabilities Agent capability tags
   * @param metadata Additional metadata
   * @param pfpBuffer Optional profile picture buffer
   * @param pfpFileName Optional profile picture filename
   * @returns Response with topic IDs and transaction ID
   */
  async storeHCS11Profile(
    agentName: string,
    agentDescription: string,
    inboundTopicId: string,
    outboundTopicId: string,
    capabilities: number[] = [],
    metadata: AgentMetadata,
    pfpBuffer?: Buffer,
    pfpFileName?: string,
    existingPfpTopicId?: string
  ): Promise<StoreHCS11ProfileResponse> {
    try {
      let pfpTopicId = existingPfpTopicId || '';
      
      if (!pfpTopicId && pfpBuffer && pfpFileName) {
        this.logger.info('Inscribing profile picture for HCS-11 profile');
        const pfpResult = await this.inscribePfp(pfpBuffer, pfpFileName);
        if (!pfpResult.success) {
          this.logger.error('Failed to inscribe profile picture, continuing without PFP');
        } else {
          pfpTopicId = pfpResult.pfpTopicId;
        }
      } else if (existingPfpTopicId) {
        this.logger.info(`Using existing profile picture with topic ID: ${existingPfpTopicId} for HCS-11 profile`);
      }

      const agentType = this.hcs11Client.getAgentTypeFromMetadata({
        type: metadata.type || 'autonomous',
      } as AgentMetadata);

      const formattedSocials = metadata.socials
        ? Object.entries(metadata.socials)
            .filter(([_, handle]) => handle)
            .map(([platform, handle]) => ({
              platform: platform === 'x' ? 'twitter' : platform,
              handle,
            }))
        : undefined;

      const profile = this.hcs11Client.createAIAgentProfile(
        agentName,
        agentType,
        capabilities,
        metadata.model || 'unknown',
        {
          alias: agentName.toLowerCase().replace(/\s+/g, '_'),
          bio: agentDescription,
          profileImage: pfpTopicId ? `hcs://1/${pfpTopicId}` : undefined,
          socials: formattedSocials,
          properties: metadata.properties,
          inboundTopicId,
          outboundTopicId,
          creator: metadata.creator,
        }
      );

      const profileResult = await this.hcs11Client.createAndInscribeProfile(
        profile,
        true
      );

      if (!profileResult.success) {
        this.logger.error(`Failed to inscribe profile: ${profileResult.error}`);
        throw new Error(profileResult.error || 'Failed to inscribe profile');
      }

      this.logger.info(
        `Profile inscribed with topic ID: ${profileResult.profileTopicId}, transaction ID: ${profileResult.transactionId}`
      );

      return {
        profileTopicId: profileResult.profileTopicId,
        pfpTopicId,
        transactionId: profileResult.transactionId,
        success: true,
      };
    } catch (error: any) {
      this.logger.error(`Error storing HCS-11 profile: ${error.message}`);
      return {
        profileTopicId: '',
        pfpTopicId: '',
        transactionId: '',
        success: false,
        error: error.message,
      };
    }
  }

  private async setupFees(
    transaction: TopicCreateTransaction,
    feeConfig: TopicFeeConfig,
    additionalExemptAccounts: string[] = []
  ): Promise<void> {
    if (!this.client.operatorPublicKey) {
      return;
    }

    this.logger.info('Setting up topic with custom fees');

    const customFee = new CustomFixedFee()
      .setAmount(Number(feeConfig.feeAmount.amount))
      .setFeeCollectorAccountId(
        AccountId.fromString(feeConfig.feeCollectorAccountId)
      );

    let exemptAccountIds = [
      ...(feeConfig.exemptAccounts || []),
      ...additionalExemptAccounts,
    ];

    console.log('exemptAccountIds', exemptAccountIds);

    if (exemptAccountIds.length > 0) {
      const uniqueExemptAccountIds = Array.from(new Set(exemptAccountIds));
      const filteredExemptAccounts = uniqueExemptAccountIds.filter(
        (account) => account !== this.client.operatorAccountId?.toString()
      );

      let exemptKeys: PublicKey[] = [];
      if (filteredExemptAccounts.length > 0) {
        try {
          exemptKeys = await accountIdsToExemptKeys(
            filteredExemptAccounts,
            this.network,
            this.logger
          );
        } catch (error) {
          this.logger.warn(
            `Error getting exempt keys: ${error}, continuing without exempt keys`
          );
        }
      }

      if (exemptKeys.length > 0) {
        transaction.setFeeExemptKeys(exemptKeys);
      }
    }

    transaction
      .setFeeScheduleKey(this.client.operatorPublicKey)
      .setCustomFees([customFee]);
  }

  /**
   * Handles a connection request from another account
   * @param inboundTopicId Inbound topic ID
   * @param requestingAccountId Requesting account ID
   * @param connectionRequestId Connection request ID
   * @param connectionFeeConfig Optional fee configuration for the connection topic
   * @returns Response with connection details
   */
  async handleConnectionRequest(
    inboundTopicId: string,
    requestingAccountId: string,
    connectionRequestId: number,
    connectionFeeConfig?: FeeConfigBuilderInterface
  ): Promise<HandleConnectionRequestResponse> {
    const memo = `hcs-10:${inboundTopicId}:${connectionRequestId}`;
    this.logger.info(
      `Handling connection request ${connectionRequestId} from ${requestingAccountId}`
    );

    const accountId = this.getClient().operatorAccountId?.toString();
    if (!accountId) {
      throw new Error('Failed to retrieve operator account ID');
    }

    let requesterKey = await this.mirrorNode.getPublicKey(requestingAccountId);
    const accountKey = await this.mirrorNode.getPublicKey(accountId);

    if (!accountKey) {
      throw new Error('Failed to retrieve public key');
    }

    const thresholdKey = new KeyList([accountKey, requesterKey], 1);

    let connectionTopicId: string;

    try {
      if (connectionFeeConfig) {
        const feeConfig = connectionFeeConfig.build();
        const modifiedFeeConfig = {
          ...feeConfig,
          exemptAccounts: [...(feeConfig.exemptAccounts || [])],
        };

        connectionTopicId = await this.createTopic(
          memo,
          thresholdKey,
          thresholdKey,
          modifiedFeeConfig
        );
      } else {
        connectionTopicId = await this.createTopic(
          memo,
          thresholdKey,
          thresholdKey
        );
      }

      this.logger.info(`Created new connection topic ID: ${connectionTopicId}`);
    } catch (error) {
      this.logger.error(`Failed to create connection topic: ${error}`);
      throw new TopicCreationError(
        `Failed to create connection topic: ${error}`
      );
    }

    const operatorId = `${inboundTopicId}@${accountId}`;

    const confirmedConnectionSequenceNumber = await this.confirmConnection(
      inboundTopicId,
      connectionTopicId,
      requestingAccountId,
      connectionRequestId,
      operatorId,
      'Connection accepted. Looking forward to collaborating!'
    );

    return {
      connectionTopicId,
      confirmedConnectionSequenceNumber,
      operatorId,
    };
  }

  async confirmConnection(
    inboundTopicId: string,
    connectionTopicId: string,
    connectedAccountId: string,
    connectionId: number,
    operatorId: string,
    memo: string,
    submitKey?: PrivateKey
  ): Promise<number> {
    this.logger.info(`Confirming connection with ID ${connectionId}`);
    const payload = {
      p: 'hcs-10',
      op: 'connection_created',
      connection_topic_id: connectionTopicId,
      connected_account_id: connectedAccountId,
      operator_id: operatorId,
      connection_id: connectionId,
      m: memo,
    };

    const result = await this.submitPayload(inboundTopicId, payload, submitKey);
    const sequenceNumber = result.topicSequenceNumber?.toNumber();

    if (!sequenceNumber) {
      throw new ConnectionConfirmationError(
        'Failed to confirm connection: sequence number is null'
      );
    }

    return sequenceNumber;
  }

  async sendMessage(
    connectionTopicId: string,
    operatorId: string,
    data: string,
    memo?: string,
    submitKey?: PrivateKey
  ): Promise<void> {
    const submissionCheck = await this.canSubmitToInboundTopic(
      connectionTopicId,
      this.client.operatorAccountId?.toString() || ''
    );

    const payload = {
      p: 'hcs-10',
      op: 'message',
      operator_id: operatorId,
      data,
      m: memo,
    };

    const payloadString = JSON.stringify(payload);
    const isLargePayload = Buffer.from(payloadString).length > 1000;

    if (isLargePayload) {
      this.logger.info(
        'Message payload exceeds 1000 bytes, storing via inscription'
      );
      try {
        const contentBuffer = Buffer.from(data);
        const fileName = `message-${Date.now()}.json`;
        const inscriptionResult = await this.inscribeFile(
          contentBuffer,
          fileName
        );

        if (inscriptionResult?.topic_id) {
          payload.data = `hcs://1/${inscriptionResult.topic_id}`;
          this.logger.info(
            `Large message inscribed with topic ID: ${inscriptionResult.topic_id}`
          );
        } else {
          throw new Error('Failed to inscribe large message content');
        }
      } catch (error) {
        this.logger.error('Error inscribing large message:', error);
        throw new Error(
          `Failed to handle large message: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    this.logger.info('Submitting message to connection topic', payload);
    await this.submitPayload(
      connectionTopicId,
      payload,
      submitKey,
      submissionCheck.requiresFee
    );
  }

  async createTopic(
    memo: string,
    adminKey?: boolean | PublicKey | KeyList,
    submitKey?: boolean | PublicKey | KeyList,
    feeConfig?: TopicFeeConfig
  ): Promise<string> {
    this.logger.info('Creating topic');
    const transaction = new TopicCreateTransaction().setTopicMemo(memo);

    if (adminKey) {
      if (
        typeof adminKey === 'boolean' &&
        adminKey &&
        this.client.operatorPublicKey
      ) {
        transaction.setAdminKey(this.client.operatorPublicKey);
        transaction.setAutoRenewAccountId(this.client.operatorAccountId!);
      } else if (adminKey instanceof PublicKey || adminKey instanceof KeyList) {
        transaction.setAdminKey(adminKey);
        if (this.client.operatorAccountId) {
          transaction.setAutoRenewAccountId(this.client.operatorAccountId);
        }
      }
    }

    if (submitKey) {
      if (
        typeof submitKey === 'boolean' &&
        submitKey &&
        this.client.operatorPublicKey
      ) {
        transaction.setSubmitKey(this.client.operatorPublicKey);
      } else if (
        submitKey instanceof PublicKey ||
        submitKey instanceof KeyList
      ) {
        transaction.setSubmitKey(submitKey);
      }
    }

    if (feeConfig) {
      await this.setupFees(transaction, feeConfig);
    }

    this.logger.debug('Executing topic creation transaction');
    const txResponse = await transaction.execute(this.client);
    const receipt = await txResponse.getReceipt(this.client);

    if (!receipt.topicId) {
      this.logger.error('Failed to create topic: topicId is null');
      throw new Error('Failed to create topic: topicId is null');
    }

    const topicId = receipt.topicId.toString();
    return topicId;
  }

  async submitMessage(
    topicId: string,
    message: string,
    submitKey?: PrivateKey
  ): Promise<TransactionReceipt> {
    const submissionCheck = await this.canSubmitToInboundTopic(
      topicId,
      this.client.operatorAccountId?.toString() || ''
    );

    return this.submitPayload(
      topicId,
      message,
      submitKey,
      submissionCheck.requiresFee
    );
  }

  private async submitPayload(
    topicId: string,
    payload: object | string,
    submitKey?: PrivateKey,
    requiresFee: boolean = false
  ): Promise<TransactionReceipt> {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    const payloadSizeInBytes = Buffer.byteLength(message, 'utf8');
    if (payloadSizeInBytes > 1000) {
      throw new PayloadSizeError(
        'Payload size exceeds 1000 bytes limit',
        payloadSizeInBytes
      );
    }

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message);

    if (requiresFee) {
      this.logger.info(
        'Topic requires fee payment, setting max transaction fee'
      );
      transaction.setMaxTransactionFee(new Hbar(this.feeAmount));
      transaction.setTransactionMemo('HIP-991 Fee Payment');
    }

    let transactionResponse: TransactionResponse;
    if (submitKey) {
      transaction.freezeWith(this.client);
      const signedTransaction = await transaction.sign(submitKey);
      transactionResponse = await signedTransaction.execute(this.client);
    } else {
      transactionResponse = await transaction.execute(this.client);
    }

    const receipt = await transactionResponse.getReceipt(this.client);
    if (!receipt) {
      this.logger.error('Failed to submit message: receipt is null');
      throw new Error('Failed to submit message: receipt is null');
    }
    this.logger.info('Message submitted successfully');
    return receipt;
  }

  async submitConnectionRequest(
    inboundTopicId: string,
    requestingAccountId: string,
    operatorId: string,
    memo: string
  ): Promise<TransactionReceipt> {
    const submissionCheck = await this.canSubmitToInboundTopic(
      inboundTopicId,
      requestingAccountId
    );

    if (!submissionCheck.canSubmit) {
      throw new Error(`Cannot submit to topic: ${submissionCheck.reason}`);
    }

    const connectionRequestMessage = {
      p: 'hcs-10',
      op: 'connection_request',
      operator_id: operatorId,
      memo: memo,
    };

    const requiresFee = submissionCheck.requiresFee;
    const response = await this.submitPayload(
      inboundTopicId,
      connectionRequestMessage,
      undefined,
      requiresFee
    );

    this.logger.info(
      `Submitted connection request to topic ID: ${inboundTopicId}`
    );

    const outboundTopic = await this.retrieveOutboundConnectTopic(
      requestingAccountId
    );

    const responseSequenceNumber = response.topicSequenceNumber?.toNumber();

    if (!responseSequenceNumber) {
      throw new Error('Failed to get response sequence number');
    }

    await this.submitPayload(
      outboundTopic.outboundTopic,
      {
        ...connectionRequestMessage,
        outbound_topic_id: outboundTopic.outboundTopic,
        connection_request_id: responseSequenceNumber,
      },
      this.operatorPrivateKey
    );

    return response;
  }

  async recordOutboundConnectionConfirmation({
    outboundTopicId,
    connectionRequestId,
    confirmedRequestId,
    connectionTopicId,
    operatorId,
    memo,
  }: {
    outboundTopicId: string;
    connectionRequestId: number;
    confirmedRequestId: number;
    connectionTopicId: string;
    operatorId: string;
    memo: string;
  }) {
    const payload = {
      p: 'hcs-10',
      op: 'connection_created',
      connection_topic_id: connectionTopicId,
      outbound_topic_id: outboundTopicId,
      confirmed_request_id: confirmedRequestId,
      connection_request_id: connectionRequestId,
      operator_id: operatorId,
      m: memo,
    };

    return await this.submitPayload(outboundTopicId, payload);
  }

  async inscribeFile(
    buffer: Buffer,
    fileName: string
  ): Promise<RetrievedInscriptionResult> {
    this.logger.info('Inscribing file');
    if (!this.client.operatorAccountId) {
      this.logger.error('Operator account ID is not set');
      throw new Error('Operator account ID is not set');
    }

    if (!this.operatorPrivateKey) {
      this.logger.error('Operator private key is not set');
      throw new Error('Operator private key is not set');
    }

    const mimeType = mime.lookup(fileName) || 'application/octet-stream';

    const sdk = await InscriptionSDK.createWithAuth({
      type: 'server',
      accountId: this.client.operatorAccountId.toString(),
      privateKey: this.operatorPrivateKey.toString(),
      network: this.network as 'testnet' | 'mainnet',
    });

    const result = await sdk.inscribeAndExecute(
      {
        file: {
          type: 'base64',
          base64: buffer.toString('base64'),
          fileName,
          mimeType,
        },
        holderId: this.client.operatorAccountId.toString(),
        mode: 'file',
        network: this.network as 'testnet' | 'mainnet',
      },
      {
        accountId: this.client.operatorAccountId.toString(),
        privateKey: this.operatorPrivateKey.toString(),
        network: this.network as 'testnet' | 'mainnet',
      }
    );

    if (!result.transactionId || !result.jobId) {
      this.logger.error('Failed to inscribe, no transaction ID or job ID.');
      throw new Error('Failed to inscribe, no transaction ID or job ID.');
    }

    if (result.transactionId && result.jobId) {
      this.logger.info(
        `Transaction ID: ${result.transactionId}, Job ID: ${result.jobId}`
      );
    }

    const status = await sdk.waitForInscription(result.jobId, 30, 4000, true);
    return status;
  }

  /**
   * Waits for confirmation of a connection request
   * @param inboundTopicId Inbound topic ID
   * @param connectionRequestId Connection request ID
   * @param maxAttempts Maximum number of attempts
   * @param delayMs Delay between attempts in milliseconds
   * @returns Connection confirmation details
   */
  async waitForConnectionConfirmation(
    inboundTopicId: string,
    connectionRequestId: number,
    maxAttempts = 60,
    delayMs = 2000
  ): Promise<WaitForConnectionConfirmationResponse> {
    this.logger.info(
      `Waiting for connection confirmation on inbound topic ${inboundTopicId} for request ID ${connectionRequestId}`
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.logger.info(
        `Attempt ${attempt + 1}/${maxAttempts} to find connection confirmation`
      );
      const messages = await this.mirrorNode.getTopicMessages(inboundTopicId);

      const connectionCreatedMessages = messages.filter(
        (m) => m.op === 'connection_created'
      );

      this.logger.info(
        `Found ${connectionCreatedMessages.length} connection_created messages`
      );

      if (connectionCreatedMessages.length > 0) {
        for (const message of connectionCreatedMessages) {
          if (Number(message.connection_id) === Number(connectionRequestId)) {
            this.logger.info('Connection confirmation found');
            return {
              connectionTopicId: message.connection_topic_id,
              sequence_number: Number(message.sequence_number),
              confirmedBy: message.operator_id,
              memo: message.m,
            };
          }
        }
      }

      if (attempt < maxAttempts - 1) {
        this.logger.info(
          `No matching confirmation found, waiting ${delayMs}ms before retrying...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(
      `Connection confirmation not found after ${maxAttempts} attempts for request ID ${connectionRequestId}`
    );
  }

  getAccountAndSigner(): GetAccountAndSignerResponse {
    return {
      accountId: this.client.operatorAccountId!.toString()!,
      signer: this.operatorPrivateKey,
    };
  }

  /**
   * Checks if a user can submit to a topic and determines if a fee is required
   * @param topicId The topic ID to check
   * @param userAccountId The account ID of the user attempting to submit
   * @returns Object with canSubmit, requiresFee, and optional reason
   */
  async canSubmitToInboundTopic(
    topicId: string,
    userAccountId: string
  ): Promise<{ canSubmit: boolean; requiresFee: boolean; reason?: string }> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);

      if (!topicInfo) {
        return {
          canSubmit: false,
          requiresFee: false,
          reason: 'Topic does not exist',
        };
      }

      if (!topicInfo.submit_key?.key) {
        return { canSubmit: true, requiresFee: false };
      }

      try {
        const userPublicKey = await this.mirrorNode.getPublicKey(userAccountId);

        if (topicInfo.submit_key._type === 'ProtobufEncoded') {
          const keyBytes = Buffer.from(topicInfo.submit_key.key, 'hex');
          const hasAccess = await this.mirrorNode.checkKeyListAccess(
            keyBytes,
            userPublicKey
          );

          if (hasAccess) {
            return { canSubmit: true, requiresFee: false };
          }
        } else {
          const topicSubmitKey = PublicKey.fromString(topicInfo.submit_key.key);
          if (userPublicKey.toString() === topicSubmitKey.toString()) {
            return { canSubmit: true, requiresFee: false };
          }
        }
      } catch (error) {
        this.logger.error(
          `Key validation error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (
        topicInfo.fee_schedule_key?.key &&
        topicInfo.custom_fees?.fixed_fees?.length > 0
      ) {
        return {
          canSubmit: true,
          requiresFee: true,
          reason: 'Requires fee payment via HIP-991',
        };
      }

      return {
        canSubmit: false,
        requiresFee: false,
        reason: 'User does not have submit permission for this topic',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Topic submission validation error: ${errorMessage}`);
      return {
        canSubmit: false,
        requiresFee: false,
        reason: `Error: ${errorMessage}`,
      };
    }
  }

  /**
   * Creates and registers an agent with a Guarded registry.
   *
   * This function performs the following steps:
   * 1. Creates a new account if no existing account is provided.
   * 2. Initializes an HCS10 client with the new account.
   * 3. Creates an agent on the client.
   * 4. Registers the agent with the Hashgraph Online Guarded Registry.
   *
   * @param builder The agent builder object
   * @param options Optional configuration including progress callback and state management
   * @returns Agent registration result
   */
  async createAndRegisterAgent(
    builder: AgentBuilder,
    options?: {
      baseUrl?: string;
      progressCallback?: RegistrationProgressCallback;
      existingState?: AgentCreationState;
    }
  ): Promise<AgentRegistrationResult> {
    try {
      const config = builder.build();
      const progressCallback = options?.progressCallback;
      const baseUrl = options?.baseUrl || this.guardedRegistryBaseUrl;
      let state = options?.existingState || undefined;

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Preparing agent registration',
          progressPercent: 10,
          details: { state },
        });
      }

      const account = config.existingAccount || (await this.createAccount());

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Created account or using existing account',
          progressPercent: 20,
          details: { state, account },
        });
      }

      const agentClient = new HCS10Client({
        network: config.network,
        operatorId: account.accountId,
        operatorPrivateKey: account.privateKey,
        operatorPublicKey: PrivateKey.fromString(
          account.privateKey
        ).publicKey.toString(),
        logLevel: 'info' as LogLevel,
        guardedRegistryBaseUrl: baseUrl,
      });

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Initialized agent client',
          progressPercent: 30,
          details: { state },
        });
      }

      const { outboundTopicId, inboundTopicId, pfpTopicId, profileTopicId } =
        await agentClient.createAgent(builder);

      if (progressCallback) {
        progressCallback({
          stage: 'submitting',
          message: 'Created agent with topics and profile',
          progressPercent: 60,
          details: {
            state,
            outboundTopicId,
            inboundTopicId,
            pfpTopicId,
            profileTopicId,
          },
        });
      }

      const operatorId = `${inboundTopicId}@${account.accountId}`;

      const registrationResult =
        await agentClient.registerAgentWithGuardedRegistry(
          account.accountId,
          config.network,
          {
            progressCallback: (data) => {
              // Adjust progress to fit into the 60-100% range
              const adjustedPercent = 60 + (data.progressPercent || 0) * 0.4;
              if (progressCallback) {
                progressCallback({
                  stage: data.stage,
                  message: data.message,
                  progressPercent: adjustedPercent,
                  details: {
                    ...data.details,
                    outboundTopicId,
                    inboundTopicId,
                    pfpTopicId,
                    profileTopicId,
                    operatorId,
                    state: data.details?.state || state,
                  },
                });
              }
            },
            existingState: state,
          }
        );

      if (!registrationResult.success) {
        return registrationResult;
      }

      if (progressCallback) {
        progressCallback({
          stage: 'completed',
          message: 'Agent creation and registration complete',
          progressPercent: 100,
          details: {
            outboundTopicId,
            inboundTopicId,
            pfpTopicId,
            profileTopicId,
            operatorId,
            state: registrationResult.state,
          },
        });
      }

      return {
        ...registrationResult,
        metadata: {
          accountId: account.accountId,
          privateKey: account.privateKey,
          operatorId,
          inboundTopicId,
          outboundTopicId,
          profileTopicId,
          pfpTopicId,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create and register agent: ${error.message}`
      );
      return {
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Registers an agent with the guarded registry
   * @param accountId Account ID to register
   * @param inboundTopicId Inbound topic ID for the agent
   * @param network Network type ('mainnet' or 'testnet')
   * @param options Optional configuration including progress callback and confirmation settings
   * @returns Registration result
   */
  async registerAgentWithGuardedRegistry(
    accountId: string,
    network: string = this.network,
    options?: {
      progressCallback?: RegistrationProgressCallback;
      maxAttempts?: number;
      delayMs?: number;
      existingState?: AgentCreationState;
    }
  ): Promise<AgentRegistrationResult> {
    try {
      this.logger.info('Registering agent with guarded registry');

      const maxAttempts = options?.maxAttempts ?? 60;
      const delayMs = options?.delayMs ?? 2000;
      const progressCallback = options?.progressCallback;
      let state =
        options?.existingState ||
        ({
          currentStage: 'registration',
          completedPercentage: 0,
          createdResources: [],
        } as AgentCreationState);

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Preparing agent registration',
          progressPercent: 10,
          details: {
            state,
          },
        });
      }

      const registrationResult = await this.executeRegistration(
        accountId,
        network,
        this.guardedRegistryBaseUrl,
        this.logger
      );

      if (!registrationResult.success) {
        return {
          ...registrationResult,
          state,
        };
      }

      if (progressCallback) {
        progressCallback({
          stage: 'submitting',
          message: 'Submitting registration to registry',
          progressPercent: 30,
          details: {
            transactionId: registrationResult.transactionId,
            state,
          },
        });
      }

      if (registrationResult.transaction) {
        const transaction = Transaction.fromBytes(
          Buffer.from(registrationResult.transaction, 'base64')
        );

        this.logger.info(`Processing registration transaction`);
        await transaction.execute(this.client);
        this.logger.info(`Successfully processed registration transaction`);
      }

      if (progressCallback) {
        progressCallback({
          stage: 'confirming',
          message: 'Confirming registration transaction',
          progressPercent: 60,
          details: {
            accountId,
            transactionId: registrationResult.transactionId,
            state,
          },
        });
      }

      const confirmed = await this.waitForRegistrationConfirmation(
        registrationResult.transactionId!,
        network,
        this.guardedRegistryBaseUrl,
        maxAttempts,
        delayMs,
        this.logger
      );

      state.currentStage = 'complete';
      state.completedPercentage = 100;
      if (!state.createdResources) {
        state.createdResources = [];
      }
      if (registrationResult.transactionId) {
        state.createdResources.push(
          `registration:${registrationResult.transactionId}`
        );
      }

      if (progressCallback) {
        progressCallback({
          stage: 'completed',
          message: 'Agent registration complete',
          progressPercent: 100,
          details: {
            confirmed,
            transactionId: registrationResult.transactionId,
            state,
          },
        });
      }

      return {
        ...registrationResult,
        confirmed,
        state,
      };
    } catch (error: any) {
      this.logger.error(`Failed to register agent: ${error.message}`);
      return {
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Registers an agent with the guarded registry. Should be called by a registry.
   * @param registryTopicId - The topic ID of the guarded registry.
   * @param accountId - The account ID of the agent
   * @param inboundTopicId - The topic ID of the inbound topic
   * @param memo - The memo of the agent
   * @param submitKey - The submit key of the agent
   */
  async registerAgent(
    registryTopicId: string,
    accountId: string,
    inboundTopicId: string,
    memo: string,
    submitKey?: PrivateKey
  ): Promise<void> {
    this.logger.info('Registering agent');
    const payload = {
      p: 'hcs-10',
      op: 'register',
      account_id: accountId,
      inbound_topic_id: inboundTopicId,
      m: memo,
    };

    await this.submitPayload(registryTopicId, payload, submitKey);
  }

  async getInboundTopicType(topicId: string): Promise<InboundTopicType> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);

      if (!topicInfo) {
        throw new Error('Topic does not exist');
      }

      const hasSubmitKey = topicInfo.submit_key && topicInfo.submit_key.key;

      if (!hasSubmitKey) {
        return InboundTopicType.PUBLIC;
      }

      const hasFeeScheduleKey =
        topicInfo.fee_schedule_key && topicInfo.fee_schedule_key.key;

      if (hasFeeScheduleKey && topicInfo.custom_fees) {
        const customFees = topicInfo.custom_fees;

        if (
          customFees &&
          customFees.fixed_fees &&
          customFees.fixed_fees.length > 0
        ) {
          this.logger.info(
            `Topic ${topicId} is fee-based with ${customFees.fixed_fees.length} custom fees`
          );
          return InboundTopicType.FEE_BASED;
        }
      }

      return InboundTopicType.CONTROLLED;
    } catch (error: any) {
      this.logger.error(`Error determining topic type: ${error.message}`);
      throw new Error(`Failed to determine topic type: ${error.message}`);
    }
  }

  getNetwork(): string {
    return this.network;
  }

  getLogger(): Logger {
    return this.logger;
  }
}
