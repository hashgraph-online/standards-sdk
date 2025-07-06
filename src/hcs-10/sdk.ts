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
  TokenId,
  ScheduleCreateTransaction,
  Timestamp,
  TransferTransaction,
} from '@hashgraph/sdk';
import {
  PayloadSizeError,
  AccountCreationError,
  TopicCreationError,
  ConnectionConfirmationError,
} from './errors';
import {
  InscriptionSDK,
  StartInscriptionRequest,
  InscriptionResult,
  RetrievedInscriptionResult,
  HederaClientConfig,
} from '@kiloscribe/inscription-sdk';
import { Logger, LogLevel, detectKeyTypeFromString } from '../utils';
import { HCS10BaseClient } from './base-client';
import * as mime from 'mime-types';
import {
  HCSClientConfig,
  CreateAccountResponse,
  CreateAgentResponse,
  CreateMCPServerResponse,
  StoreHCS11ProfileResponse,
  AgentRegistrationResult,
  HandleConnectionRequestResponse,
  WaitForConnectionConfirmationResponse,
  GetAccountAndSignerResponse,
  AgentCreationState,
  RegistrationProgressCallback,
  InscribePfpResponse,
  MCPServerCreationState,
} from './types';
import { MirrorNodeConfig } from '../services';
import {
  HCS11Client,
  AgentMetadata as HCS11AgentMetadata,
  SocialLink,
  SocialPlatform,
  InboundTopicType,
  AgentMetadata,
  MCPServerBuilder,
} from '../hcs-11';
import { FeeConfigBuilderInterface, TopicFeeConfig } from '../fees';
import { accountIdsToExemptKeys } from '../utils/topic-fee-utils';
import { Hcs10MemoType } from './base-client';
import { AgentBuilder } from '../hcs-11/agent-builder';
import { inscribe } from '../inscribe/inscriber';
import { TokenFeeConfig } from '../fees/types';
import { addSeconds } from 'date-fns';

export class HCS10Client extends HCS10BaseClient {
  private client: Client;
  private operatorPrivateKey: string;
  private operatorAccountId: string;
  declare protected network: string;
  declare protected logger: Logger;
  protected guardedRegistryBaseUrl: string;
  private hcs11Client: HCS11Client;
  private keyType: 'ed25519' | 'ecdsa';

  constructor(config: HCSClientConfig) {
    super({
      network: config.network,
      logLevel: config.logLevel,
      prettyPrint: config.prettyPrint,
      feeAmount: config.feeAmount,
      mirrorNode: config.mirrorNode,
      silent: config.silent,
      keyType: config.keyType,
    });
    this.client =
      config.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.operatorPrivateKey = config.operatorPrivateKey;

    this.operatorAccountId = config.operatorId;
    
    // Handle key type detection explicitly
    if (config.keyType) {
      this.keyType = config.keyType;
    }

    // Always use the detector for explicit, robust key parsing
    const keyDetection = detectKeyTypeFromString(this.operatorPrivateKey, config.keyType);
    this.client.setOperator(config.operatorId, keyDetection.privateKey);
    this.keyType = keyDetection.detectedType;

    this.network = config.network;
    this.logger = Logger.getInstance({
      level: config.logLevel || 'info',
      module: 'HCS-SDK',
      silent: config.silent,
    });
    this.guardedRegistryBaseUrl =
      config.guardedRegistryBaseUrl || 'https://moonscape.tech';

    this.hcs11Client = new HCS11Client({
      network: config.network,
      auth: {
        operatorId: config.operatorId,
        privateKey: config.operatorPrivateKey,
      },
      logLevel: config.logLevel,
      silent: config.silent,
      keyType: config.keyType,
    });
  }

  public async initializeOperator(): Promise<{
    accountId: string;
    privateKey: string;
    keyType: 'ed25519' | 'ecdsa';
    client: Client;
  }> {
    // Use the detector for explicit, robust key parsing
    const keyDetection = detectKeyTypeFromString(this.operatorPrivateKey, this.keyType);
    const PK = keyDetection.privateKey;
    this.keyType = keyDetection.detectedType;
    
    this.logger.debug(`Detected key type from private key: ${this.keyType}`);

    this.logger.debug(
      `Setting operator: ${this.operatorAccountId} with key type: ${this.keyType}`,
    );

    this.client.setOperator(this.operatorAccountId, PK);

    return {
      accountId: this.operatorAccountId,
      privateKey: this.operatorPrivateKey,
      keyType: this.keyType,
      client: this.client,
    };
  }

  public getClient() {
    return this.client;
  }

  /**
   * Creates a new Hedera account
   * @param initialBalance Optional initial balance in HBAR (default: 50)
   * @returns Object with account ID and private key
   */
  async createAccount(
    initialBalance: number = 50,
  ): Promise<CreateAccountResponse> {
    if (!this.keyType) {
      await this.initializeOperator();
    }

    this.logger.info(
      `Creating new account with ${initialBalance} HBAR initial balance`,
    );
    const newKey = PrivateKey.generateED25519();

    const accountTransaction = new AccountCreateTransaction()
      .setKeyWithoutAlias(newKey.publicKey)
      .setInitialBalance(new Hbar(initialBalance));

    this.logger.debug('Executing account creation transaction');
    const accountResponse = await accountTransaction.execute(this.client);
    const accountReceipt = await accountResponse.getReceipt(this.client);
    const newAccountId = accountReceipt.accountId;

    if (!newAccountId) {
      this.logger.error('Account creation failed: accountId is null');
      throw new AccountCreationError(
        'Failed to create account: accountId is null',
      );
    }

    this.logger.info(
      `Account created successfully: ${newAccountId.toString()}`,
    );
    return {
      accountId: newAccountId.toString(),
      privateKey: newKey.toString(),
    };
  }

  /**
   * Creates an inbound topic for an agent
   * @param accountId The account ID associated with the inbound topic
   * @param topicType Type of inbound topic (public, controlled, or fee-based)
   * @param ttl Optional Time-To-Live for the topic memo, defaults to 60
   * @param feeConfigBuilder Optional fee configuration builder for fee-based topics
   * @returns The topic ID of the created inbound topic
   */
  async createInboundTopic(
    accountId: string,
    topicType: InboundTopicType,
    ttl: number = 60,
    feeConfigBuilder?: FeeConfigBuilderInterface,
  ): Promise<string> {
    if (!this.keyType) {
      await this.initializeOperator();
    }

    const memo = this._generateHcs10Memo(Hcs10MemoType.INBOUND, {
      accountId,
      ttl,
    });

    let submitKey: boolean | PublicKey | KeyList | undefined;
    let finalFeeConfig: TopicFeeConfig | undefined;

    switch (topicType) {
      case InboundTopicType.PUBLIC:
        submitKey = false;
        break;
      case InboundTopicType.CONTROLLED:
        submitKey = true;
        break;
      case InboundTopicType.FEE_BASED:
        submitKey = false;
        if (!feeConfigBuilder) {
          throw new Error(
            'Fee configuration builder is required for fee-based topics',
          );
        }

        const internalFees = (feeConfigBuilder as any)
          .customFees as TokenFeeConfig[];
        internalFees.forEach(fee => {
          if (!fee.feeCollectorAccountId) {
            this.logger.debug(
              `Defaulting fee collector for token ${
                fee.feeTokenId || 'HBAR'
              } to agent ${accountId}`,
            );
            fee.feeCollectorAccountId = accountId;
          }
        });

        finalFeeConfig = feeConfigBuilder.build();
        break;
      default:
        throw new Error(`Unsupported inbound topic type: ${topicType}`);
    }

    return this.createTopic(memo, true, submitKey, finalFeeConfig);
  }

  /**
   * Creates a new agent with inbound and outbound topics
   * @param builder The agent builder object
   * @param ttl Optional Time-To-Live for the topic memos, defaults to 60
   * @param existingState Optional existing state to resume from
   * @returns Object with topic IDs
   */
  async createAgent(
    builder: AgentBuilder,
    ttl: number = 60,
    existingState?: Partial<AgentCreationState>,
    progressCallback?: RegistrationProgressCallback,
  ): Promise<CreateAgentResponse> {
    if (!this.keyType) {
      await this.initializeOperator();
    }

    const config = builder.build();
    const accountId = this.client.operatorAccountId?.toString();
    if (!accountId) {
      throw new Error('Failed to retrieve operator account ID');
    }

    const result = await this._createEntityTopics(
      ttl,
      {
        outboundTopicId: existingState?.outboundTopicId || '',
        inboundTopicId: existingState?.inboundTopicId || '',
        pfpTopicId:
          existingState?.pfpTopicId || config.existingPfpTopicId || '',
        profileTopicId: existingState?.profileTopicId || '',
      },
      accountId,
      config.inboundTopicType,
      config.feeConfig,
      config.pfpBuffer,
      config.pfpFileName,
      progressCallback,
    );

    if (!result.profileTopicId) {
      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Creating agent profile',
          progressPercent: 60,
          details: {
            outboundTopicId: result.outboundTopicId,
            inboundTopicId: result.inboundTopicId,
            pfpTopicId: result.pfpTopicId,
            state: {
              currentStage: 'profile',
              completedPercentage: 60,
            },
          },
        });
      }

      const profileResult = await this.storeHCS11Profile(
        config.name,
        config.bio,
        result.inboundTopicId,
        result.outboundTopicId,
        config.capabilities,
        config.metadata,
        config.pfpBuffer && config.pfpBuffer.length > 0 && !result.pfpTopicId
          ? config.pfpBuffer
          : undefined,
        config.pfpFileName,
        result.pfpTopicId,
      );
      result.profileTopicId = profileResult.profileTopicId;
      this.logger.info(
        `Profile stored with topic ID: ${result.profileTopicId}`,
      );

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Agent profile created',
          progressPercent: 70,
          details: {
            outboundTopicId: result.outboundTopicId,
            inboundTopicId: result.inboundTopicId,
            pfpTopicId: result.pfpTopicId,
            profileTopicId: result.profileTopicId,
            state: {
              currentStage: 'profile',
              completedPercentage: 70,
            },
          },
        });
      }
    } else {
      this.logger.info(
        `Using existing profile topic ID: ${result.profileTopicId}`,
      );
    }

    return result;
  }

  /**
   * Inscribes a profile picture to Hedera
   * @param buffer Profile picture buffer
   * @param fileName Filename
   * @returns Response with topic ID and transaction ID
   */
  async inscribePfp(
    buffer: Buffer,
    fileName: string,
  ): Promise<InscribePfpResponse> {
    try {
      this.logger.info('Inscribing profile picture using HCS-11 client');

      const imageResult = await this.hcs11Client.inscribeImage(
        buffer,
        fileName,
      );

      if (!imageResult.success) {
        this.logger.error(
          `Failed to inscribe profile picture: ${imageResult.error}`,
        );
        throw new Error(
          imageResult?.error || 'Failed to inscribe profile picture',
        );
      }

      this.logger.info(
        `Successfully inscribed profile picture with topic ID: ${imageResult.imageTopicId}`,
      );
      return {
        pfpTopicId: imageResult.imageTopicId,
        transactionId: imageResult.transactionId,
        success: true,
      };
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error inscribing profile picture: ${error.message}`;
      this.logger.error(logMessage);
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
   * @param agentBio Agent description
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
    agentBio: string,
    inboundTopicId: string,
    outboundTopicId: string,
    capabilities: number[] = [],
    metadata: AgentMetadata,
    pfpBuffer?: Buffer,
    pfpFileName?: string,
    existingPfpTopicId?: string,
  ): Promise<StoreHCS11ProfileResponse> {
    try {
      let pfpTopicId = existingPfpTopicId || '';

      if (!pfpTopicId && pfpBuffer && pfpFileName) {
        this.logger.info('Inscribing profile picture for HCS-11 profile');
        const pfpResult = await this.inscribePfp(pfpBuffer, pfpFileName);
        if (!pfpResult.success) {
          this.logger.warn(
            `Failed to inscribe profile picture: ${pfpResult.error}, proceeding without pfp`,
          );
        } else {
          pfpTopicId = pfpResult.pfpTopicId;
        }
      } else if (existingPfpTopicId) {
        this.logger.info(
          `Using existing profile picture with topic ID: ${existingPfpTopicId} for HCS-11 profile`,
        );
        pfpTopicId = existingPfpTopicId;
      }

      // Get the current client's operator account ID and private key
      const currentOperatorAccountId = this.client.operatorAccountId?.toString();
      if (!currentOperatorAccountId) {
        throw new Error('No operator account ID found on current client');
      }

      this.logger.info(`Using operator account: ${currentOperatorAccountId} for profile inscription`);
      this.logger.debug(`Private key length: ${this.operatorPrivateKey?.length || 0} characters`);

      const parsedPrivateKey = detectKeyTypeFromString(this.operatorPrivateKey, this.keyType).privateKey;

      // Create a temporary HCS11Client with the current client's credentials
      // instead of using the base client's HCS11Client which may have different credentials
      const tempHcs11Client = new HCS11Client({
        network: this.network as 'mainnet' | 'testnet',
        auth: {
          operatorId: currentOperatorAccountId,
          privateKey: parsedPrivateKey.toString(),
        },
        logLevel: this.logger.getLevel(),
        silent: false,
        keyType: this.keyType,
      });

      const agentType = tempHcs11Client.getAgentTypeFromMetadata({
        type: metadata.type || 'autonomous',
      } as HCS11AgentMetadata);

      const formattedSocials: SocialLink[] | undefined = metadata.socials
        ? (Object.entries(metadata.socials)
            .filter(([_, handle]) => handle)
            .map(([platform, handle]) => ({
              platform: platform as SocialPlatform,
              handle: handle as string,
            })) as SocialLink[])
        : undefined;

      const profile = tempHcs11Client.createAIAgentProfile(
        agentName,
        agentType,
        capabilities,
        metadata.model || 'unknown',
        {
          alias: agentName.toLowerCase().replace(/\s+/g, '_'),
          bio: agentBio,
          profileImage: pfpTopicId ? `hcs://1/${pfpTopicId}` : undefined,
          socials: formattedSocials,
          properties: metadata.properties,
          inboundTopicId,
          outboundTopicId,
          creator: metadata.creator,
        },
      );

      const profileResult = await tempHcs11Client.createAndInscribeProfile(
        profile,
        true,
      );

      if (!profileResult.success) {
        this.logger.error(`Failed to inscribe profile: ${profileResult.error}`);
        throw new Error(profileResult.error || 'Failed to inscribe profile');
      }

      this.logger.info(
        `Profile inscribed with topic ID: ${profileResult.profileTopicId}, transaction ID: ${profileResult.transactionId}`,
      );

      return {
        profileTopicId: profileResult.profileTopicId,
        pfpTopicId,
        transactionId: profileResult.transactionId,
        success: true,
      };
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error storing HCS-11 profile: ${error.message}`;
      this.logger.error(logMessage);
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
    additionalExemptAccounts: string[] = [],
  ): Promise<TopicCreateTransaction> {
    let modifiedTransaction = transaction;
    if (!this.client.operatorPublicKey) {
      return modifiedTransaction;
    }

    if (!feeConfig.customFees || feeConfig.customFees.length === 0) {
      this.logger.warn('No custom fees provided in fee config for setupFees');
      return modifiedTransaction;
    }

    if (feeConfig.customFees.length > 10) {
      this.logger.warn(
        'More than 10 custom fees provided, only the first 10 will be used',
      );
      feeConfig.customFees = feeConfig.customFees.slice(0, 10);
    }

    const customFees = feeConfig.customFees
      .map(fee => {
        if (!fee.feeCollectorAccountId) {
          this.logger.error(
            'Internal Error: Fee collector ID missing in setupFees',
          );
          return null;
        }
        if (fee.type === 'FIXED_FEE') {
          const customFee = new CustomFixedFee()
            .setAmount(Number(fee.feeAmount.amount))
            .setFeeCollectorAccountId(
              AccountId.fromString(fee.feeCollectorAccountId),
            );

          if (fee.feeTokenId) {
            customFee.setDenominatingTokenId(
              TokenId.fromString(fee.feeTokenId),
            );
          }

          return customFee;
        }
        return null;
      })
      .filter(Boolean) as CustomFixedFee[];

    if (customFees.length === 0) {
      this.logger.warn('No valid custom fees to apply in setupFees');
      return modifiedTransaction;
    }

    const exemptAccountIds = [
      ...(feeConfig.exemptAccounts || []),
      ...additionalExemptAccounts,
    ];

    if (exemptAccountIds.length > 0) {
      modifiedTransaction = await this.setupExemptKeys(
        transaction,
        exemptAccountIds,
      );
    }

    return modifiedTransaction
      .setFeeScheduleKey(this.client.operatorPublicKey)
      .setCustomFees(customFees);
  }

  private async setupExemptKeys(
    transaction: TopicCreateTransaction,
    exemptAccountIds: string[],
  ): Promise<TopicCreateTransaction> {
    let modifiedTransaction = transaction;
    const uniqueExemptAccountIds = Array.from(new Set(exemptAccountIds));
    const filteredExemptAccounts = uniqueExemptAccountIds.filter(
      account => account !== this.client.operatorAccountId?.toString(),
    );

    let exemptKeys: PublicKey[] = [];
    if (filteredExemptAccounts.length > 0) {
      try {
        exemptKeys = await accountIdsToExemptKeys(
          filteredExemptAccounts,
          this.network,
          this.logger,
        );
      } catch (e: any) {
        const error = e as Error;
        const logMessage = `Error getting exempt keys: ${error.message}, continuing without exempt keys`;
        this.logger.warn(logMessage);
      }
    }

    if (exemptKeys.length > 0) {
      modifiedTransaction = modifiedTransaction.setFeeExemptKeys(exemptKeys);
    }

    return modifiedTransaction;
  }

  /**
   * Handles a connection request from another account
   * @param inboundTopicId Inbound topic ID of your agent
   * @param requestingAccountId Requesting account ID
   * @param connectionRequestId Connection request ID
   * @param connectionFeeConfig Optional fee configuration for the connection topic
   * @param ttl Optional ttl parameter with default
   * @returns Response with connection details
   */
  async handleConnectionRequest(
    inboundTopicId: string,
    requestingAccountId: string,
    connectionRequestId: number,
    connectionFeeConfig?: FeeConfigBuilderInterface,
    ttl: number = 60,
  ): Promise<HandleConnectionRequestResponse> {
    const memo = this._generateHcs10Memo(Hcs10MemoType.CONNECTION, {
      ttl,
      inboundTopicId,
      connectionId: connectionRequestId,
    });
    this.logger.info(
      `Handling connection request ${connectionRequestId} from ${requestingAccountId}`,
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
          modifiedFeeConfig,
        );
      } else {
        connectionTopicId = await this.createTopic(
          memo,
          thresholdKey,
          thresholdKey,
        );
      }

      this.logger.info(`Created new connection topic ID: ${connectionTopicId}`);
    } catch (error) {
      const logMessage = `Failed to create connection topic: ${error}`;
      this.logger.error(logMessage);
      throw new TopicCreationError(logMessage);
    }

    const operatorId = `${inboundTopicId}@${accountId}`;

    const confirmedConnectionSequenceNumber = await this.confirmConnection(
      inboundTopicId,
      connectionTopicId,
      requestingAccountId,
      connectionRequestId,
      'Connection accepted. Looking forward to collaborating!',
    );

    const accountTopics = await this.retrieveCommunicationTopics(accountId);

    const requestingAccountTopics =
      await this.retrieveCommunicationTopics(requestingAccountId);

    const requestingAccountOperatorId = `${requestingAccountTopics.inboundTopic}@${requestingAccountId}`;

    await this.recordOutboundConnectionConfirmation({
      outboundTopicId: accountTopics.outboundTopic,
      requestorOutboundTopicId: requestingAccountTopics.outboundTopic,
      connectionRequestId: connectionRequestId,
      confirmedRequestId: confirmedConnectionSequenceNumber,
      connectionTopicId,
      operatorId: requestingAccountOperatorId,
      memo: `Connection established with ${requestingAccountId}`,
    });

    return {
      connectionTopicId,
      confirmedConnectionSequenceNumber,
      operatorId,
    };
  }

  /**
   * Confirms a connection request from another account
   * @param inboundTopicId Inbound topic ID
   * @param connectionTopicId Connection topic ID
   * @param connectedAccountId Connected account ID
   * @param connectionId Connection ID
   * @param memo Memo for the connection request
   * @param submitKey Optional submit key
   * @returns Sequence number of the confirmed connection
   */
  async confirmConnection(
    inboundTopicId: string,
    connectionTopicId: string,
    connectedAccountId: string,
    connectionId: number,
    memo: string,
    submitKey?: string,
  ): Promise<number> {
    const operatorId = await this.getOperatorId();
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

    const submissionCheck = await this.canSubmitToTopic(
      inboundTopicId,
      this.client.operatorAccountId?.toString() || '',
    );

    const result = await this.submitPayload(
      inboundTopicId,
      payload,
      submitKey,
      submissionCheck.requiresFee,
    );

    const sequenceNumber = result.topicSequenceNumber?.toNumber();

    if (!sequenceNumber) {
      throw new ConnectionConfirmationError(
        'Failed to confirm connection: sequence number is null',
      );
    }

    return sequenceNumber;
  }

  async sendMessage(
    connectionTopicId: string,
    data: string,
    memo?: string,
    submitKey?: string,
    options?: {
      progressCallback?: RegistrationProgressCallback;
      waitMaxAttempts?: number;
      waitIntervalMs?: number;
    },
  ): Promise<TransactionReceipt> {
    const submissionCheck = await this.canSubmitToTopic(
      connectionTopicId,
      this.client.operatorAccountId?.toString() || '',
    );

    const operatorId = await this.getOperatorId();

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
        'Message payload exceeds 1000 bytes, storing via inscription',
      );
      try {
        const contentBuffer = Buffer.from(data);
        const fileName = `message-${Date.now()}.json`;
        const inscriptionResult = await this.inscribeFile(
          contentBuffer,
          fileName,
          {
            progressCallback: options?.progressCallback,
            waitMaxAttempts: options?.waitMaxAttempts,
            waitIntervalMs: options?.waitIntervalMs,
          },
        );

        if (inscriptionResult?.topic_id) {
          payload.data = `hcs://1/${inscriptionResult.topic_id}`;
          this.logger.info(
            `Large message inscribed with topic ID: ${inscriptionResult.topic_id}`,
          );
        } else {
          throw new Error('Failed to inscribe large message content');
        }
      } catch (error: any) {
        const logMessage = `Error inscribing large message: ${error.message}`;
        this.logger.error(logMessage);
        throw new Error(logMessage);
      }
    }

    this.logger.info('Submitting message to connection topic', payload);
    return await this.submitPayload(
      connectionTopicId,
      payload,
      submitKey,
      submissionCheck.requiresFee,
    );
  }

  async createTopic(
    memo: string,
    adminKey?: boolean | PublicKey | KeyList,
    submitKey?: boolean | PublicKey | KeyList,
    feeConfig?: TopicFeeConfig,
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

  public async submitPayload(
    topicId: string,
    payload: object | string,
    submitKey?: string,
    requiresFee: boolean = false,
  ): Promise<TransactionReceipt> {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    const payloadSizeInBytes = Buffer.byteLength(message, 'utf8');
    if (payloadSizeInBytes > 1000) {
      throw new PayloadSizeError(
        'Payload size exceeds 1000 bytes limit',
        payloadSizeInBytes,
      );
    }

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message);

    const transactionMemo = this.getHcs10TransactionMemo(payload);
    if (transactionMemo) {
      transaction.setTransactionMemo(transactionMemo);
    }

    if (requiresFee) {
      this.logger.info(
        'Topic requires fee payment, setting max transaction fee',
      );
      transaction.setMaxTransactionFee(new Hbar(this.feeAmount));
    }

    let transactionResponse: TransactionResponse;
    if (submitKey) {
      const { privateKey } = detectKeyTypeFromString(submitKey);
      const frozenTransaction = transaction.freezeWith(this.client);
      const signedTransaction = await frozenTransaction.sign(privateKey);
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

  async inscribeFile(
    buffer: Buffer,
    fileName: string,
    options?: {
      progressCallback?: RegistrationProgressCallback;
      waitMaxAttempts?: number;
      waitIntervalMs?: number;
    },
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

    const accountId = this.client.operatorAccountId.toString();
    const mimeType = mime.lookup(fileName) || 'application/octet-stream';

    this.logger.info('Creating inscription with account details', {
      accountId,
      fileName,
      mimeType,
      bufferSize: buffer.length,
      network: this.network,
    });

    const privateKey = detectKeyTypeFromString(this.operatorPrivateKey).privateKey;

    const sdk = await InscriptionSDK.createWithAuth({
      type: 'server',
      accountId: accountId,
      privateKey,
      network: this.network as 'testnet' | 'mainnet',
    });

    this.logger.debug('InscriptionSDK created successfully', {
      accountId,
      network: this.network,
      authType: 'server',
    });

    const inscriptionOptions = {
      mode: 'file' as const,
      waitForConfirmation: true,
      waitMaxAttempts: options?.waitMaxAttempts || 60,
      waitIntervalMs: options?.waitIntervalMs || 6000,
      progressCallback: options?.progressCallback,
      logging: {
        level: this.logger.getLevel ? this.logger.getLevel() : 'info',
      },
    };

    this.logger.info('Starting inscription process', {
      accountId,
      fileName,
      mimeType,
      options: inscriptionOptions,
    });

    const response = await inscribe(
      {
        type: 'buffer',
        buffer,
        fileName,
        mimeType,
      },
      {
        accountId: accountId,
        privateKey: this.operatorPrivateKey,
        network: this.network as 'testnet' | 'mainnet',
      },
      inscriptionOptions,
      sdk,
    );

    if (!response.confirmed || !response.inscription) {
      this.logger.error('Inscription was not confirmed', {
        confirmed: response.confirmed,
        hasInscription: response.confirmed ? !!response.inscription : false,
        accountId,
      });
      throw new Error('Inscription was not confirmed');
    }

    this.logger.info('Inscription completed successfully', {
      accountId,
      fileName,
      topicId: response.inscription.topic_id,
      transactionId: response.inscription.transactionId,
    });

    return response.inscription;
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
    delayMs = 2000,
    recordConfirmation = true,
  ): Promise<WaitForConnectionConfirmationResponse> {
    this.logger.info(
      `Waiting for connection confirmation on inbound topic ${inboundTopicId} for request ID ${connectionRequestId}`,
    );

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.logger.info(
        `Attempt ${attempt + 1}/${maxAttempts} to find connection confirmation`,
      );
      const messages = await this.mirrorNode.getTopicMessages(inboundTopicId);

      const connectionCreatedMessages = messages.filter(
        m => m.op === 'connection_created',
      );

      this.logger.info(
        `Found ${connectionCreatedMessages.length} connection_created messages`,
      );

      if (connectionCreatedMessages.length > 0) {
        for (const message of connectionCreatedMessages) {
          if (Number(message.connection_id) === Number(connectionRequestId)) {
            const confirmationResult = {
              connectionTopicId: message.connection_topic_id,
              sequence_number: Number(message.sequence_number),
              confirmedBy: message.operator_id,
              memo: message.m,
            };

            const confirmedByAccountId = this.extractAccountFromOperatorId(
              confirmationResult.confirmedBy,
            );

            const account = this.getAccountAndSigner();
            const confirmedByConnectionTopics =
              await this.retrieveCommunicationTopics(confirmedByAccountId);

            const agentConnectionTopics =
              await this.retrieveCommunicationTopics(account.accountId);

            this.logger.info(
              'Connection confirmation found',
              confirmationResult,
            );

            if (recordConfirmation) {
              /**
               * Record's the confirmation of the connection request from the
               * confirmedBy account to the agent account.
               */
              await this.recordOutboundConnectionConfirmation({
                requestorOutboundTopicId:
                  confirmedByConnectionTopics.outboundTopic,
                outboundTopicId: agentConnectionTopics.outboundTopic,
                connectionRequestId,
                confirmedRequestId: confirmationResult.sequence_number,
                connectionTopicId: confirmationResult.connectionTopicId,
                operatorId: confirmationResult.confirmedBy,
                memo: confirmationResult.memo || 'Connection confirmed',
              });
            }

            return confirmationResult;
          }
        }
      }

      if (attempt < maxAttempts - 1) {
        this.logger.info(
          `No matching confirmation found, waiting ${delayMs}ms before retrying...`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(
      `Connection confirmation not found after ${maxAttempts} attempts for request ID ${connectionRequestId}`,
    );
  }

  getAccountAndSigner(): GetAccountAndSignerResponse {
    return {
      accountId: this.client.operatorAccountId!.toString()!,
      signer: this.operatorPrivateKey,
    };
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
      initialBalance?: number;
    },
  ): Promise<AgentRegistrationResult> {
    try {
      const config = builder.build();
      const progressCallback = options?.progressCallback;
      const baseUrl = options?.baseUrl || this.guardedRegistryBaseUrl;

      let state =
        options?.existingState ||
        ({
          currentStage: 'init',
          completedPercentage: 0,
          createdResources: [],
        } as AgentCreationState);

      state.agentMetadata = config.metadata;

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Starting agent creation process',
          progressPercent: 0,
          details: { state },
        });
      }

      let account = config.existingAccount;
      let agentClient: HCS10Client;

      if (
        !state.inboundTopicId ||
        !state.outboundTopicId ||
        !state.profileTopicId
      ) {
        if (!account) {
          if (
            state.createdResources &&
            state.createdResources.some(r => r.startsWith('account:'))
          ) {
            const accountResource = state.createdResources.find(r =>
              r.startsWith('account:'),
            );
            const existingAccountId = accountResource?.split(':')[1];

            if (existingAccountId && config.existingAccount) {
              account = config.existingAccount;
              this.logger.info(
                `Resuming with existing account: ${existingAccountId}`,
              );
            } else {
              account = await this.createAccount(options?.initialBalance);
              state.createdResources = state.createdResources || [];
              state.createdResources.push(`account:${account.accountId}`);
            }
          } else {
            account = await this.createAccount(options?.initialBalance);
            state.createdResources = state.createdResources || [];
            state.createdResources.push(`account:${account.accountId}`);
          }
        }

        if (progressCallback) {
          progressCallback({
            stage: 'preparing',
            message: 'Created account or using existing account',
            progressPercent: 20,
            details: { state, account },
          });
        }

        const keyType = detectKeyTypeFromString(account.privateKey);
        let operatorPrivateKey: PrivateKey;
        
        if (keyType.detectedType === 'ed25519') {
          operatorPrivateKey = PrivateKey.fromStringED25519(account.privateKey);
        } else {
          operatorPrivateKey = PrivateKey.fromStringECDSA(account.privateKey);
        }

        agentClient = new HCS10Client({
          network: config.network,
          operatorId: account.accountId,
          operatorPrivateKey: account.privateKey,
          operatorPublicKey: operatorPrivateKey.publicKey.toString(),
          logLevel: 'info' as LogLevel,
          guardedRegistryBaseUrl: baseUrl,
        });

        if (progressCallback) {
          progressCallback({
            stage: 'preparing',
            message: 'Initialized agent client',
            progressPercent: 25,
            details: { state },
          });
        }

        let outboundTopicId = state.outboundTopicId;
        let inboundTopicId = state.inboundTopicId;
        let pfpTopicId = state.pfpTopicId;
        let profileTopicId = state.profileTopicId;

        if (!outboundTopicId || !inboundTopicId || !profileTopicId) {
          if (pfpTopicId) {
            builder.setExistingProfilePicture(pfpTopicId);
          }

          const createResult = await agentClient.createAgent(
            builder,
            60,
            state,
            data => {
              if (progressCallback) {
                progressCallback({
                  stage: data.stage,
                  message: data.message,
                  progressPercent: data.progressPercent || 0,
                  details: {
                    ...data.details,
                    state: {
                      ...state,
                      ...data.details?.state,
                    },
                  },
                });
              }
            },
          );

          outboundTopicId = createResult.outboundTopicId;
          inboundTopicId = createResult.inboundTopicId;
          pfpTopicId = createResult.pfpTopicId;
          profileTopicId = createResult.profileTopicId;

          state.outboundTopicId = outboundTopicId;
          state.inboundTopicId = inboundTopicId;
          state.pfpTopicId = pfpTopicId;
          state.profileTopicId = profileTopicId;

          if (!state.createdResources) {
            state.createdResources = [];
          }

          if (
            pfpTopicId &&
            !state.createdResources.includes(`pfp:${pfpTopicId}`)
          ) {
            state.createdResources.push(`pfp:${pfpTopicId}`);
          }
          if (!state.createdResources.includes(`inbound:${inboundTopicId}`)) {
            state.createdResources.push(`inbound:${inboundTopicId}`);
          }
          if (!state.createdResources.includes(`outbound:${outboundTopicId}`)) {
            state.createdResources.push(`outbound:${outboundTopicId}`);
          }
          if (!state.createdResources.includes(`profile:${profileTopicId}`)) {
            state.createdResources.push(`profile:${profileTopicId}`);
          }
        }

        state.currentStage = 'profile';
        state.completedPercentage = 60;

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
      } else {
        account = account || config.existingAccount;
        if (!account) {
          throw new Error(
            'Cannot resume registration without account information',
          );
        }

        const keyType = detectKeyTypeFromString(account.privateKey);
        let operatorPrivateKey: PrivateKey;
        
        if (keyType.detectedType === 'ed25519') {
          operatorPrivateKey = PrivateKey.fromStringED25519(account.privateKey);
        } else {
          operatorPrivateKey = PrivateKey.fromStringECDSA(account.privateKey);
        }

        agentClient = new HCS10Client({
          network: config.network,
          operatorId: account.accountId,
          operatorPrivateKey: account.privateKey,
          operatorPublicKey: operatorPrivateKey.publicKey.toString(),
          logLevel: 'info' as LogLevel,
          guardedRegistryBaseUrl: baseUrl,
        });

        this.logger.info('Resuming registration with existing state', {
          inboundTopicId: state.inboundTopicId,
          outboundTopicId: state.outboundTopicId,
          profileTopicId: state.profileTopicId,
          pfpTopicId: state.pfpTopicId,
        });
      }

      const operatorId = `${state.inboundTopicId}@${account.accountId}`;

      if (
        state.currentStage !== 'complete' ||
        !state.createdResources?.includes(
          `registration:${state.inboundTopicId}`,
        )
      ) {
        const registrationResult =
          await agentClient.registerAgentWithGuardedRegistry(
            account.accountId,
            config.network,
            {
              progressCallback: data => {
                const adjustedPercent = 60 + (data.progressPercent || 0) * 0.4;
                if (progressCallback) {
                  progressCallback({
                    stage: data.stage,
                    message: data.message,
                    progressPercent: adjustedPercent,
                    details: {
                      ...data.details,
                      outboundTopicId: state.outboundTopicId,
                      inboundTopicId: state.inboundTopicId,
                      pfpTopicId: state.pfpTopicId,
                      profileTopicId: state.profileTopicId,
                      operatorId,
                      state: data.details?.state || state,
                    },
                  });
                }
              },
              existingState: state,
            },
          );

        if (!registrationResult.success) {
          return {
            ...registrationResult,
            state,
          };
        }

        state = registrationResult.state || state;
      }

      if (progressCallback) {
        progressCallback({
          stage: 'completed',
          message: 'Agent creation and registration complete',
          progressPercent: 100,
          details: {
            outboundTopicId: state.outboundTopicId,
            inboundTopicId: state.inboundTopicId,
            pfpTopicId: state.pfpTopicId,
            profileTopicId: state.profileTopicId,
            operatorId,
            state,
          },
        });
      }

      return {
        success: true,
        state,
        metadata: {
          accountId: account.accountId,
          privateKey: account.privateKey,
          operatorId,
          inboundTopicId: state.inboundTopicId!,
          outboundTopicId: state.outboundTopicId!,
          profileTopicId: state.profileTopicId!,
          pfpTopicId: state.pfpTopicId!,
        },
      };
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to create and register agent: ${error.message}`;
      this.logger.error(logMessage);
      return {
        error: error.message,
        success: false,
        state:
          options?.existingState ||
          ({
            currentStage: 'init',
            completedPercentage: 0,
            error: error.message,
          } as AgentCreationState),
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
    },
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
        this.logger,
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
          Buffer.from(registrationResult.transaction, 'base64'),
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
        this.logger,
      );

      state.currentStage = 'complete';
      state.completedPercentage = 100;
      if (!state.createdResources) {
        state.createdResources = [];
      }
      if (registrationResult.transactionId) {
        state.createdResources.push(
          `registration:${registrationResult.transactionId}`,
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
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to register agent: ${error.message}`;
      this.logger.error(logMessage);
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
    submitKey?: string,
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
            `Topic ${topicId} is fee-based with ${customFees.fixed_fees.length} custom fees`,
          );
          return InboundTopicType.FEE_BASED;
        }
      }

      return InboundTopicType.CONTROLLED;
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Error determining topic type: ${error.message}`;
      this.logger.error(logMessage);
      throw new Error(logMessage);
    }
  }

  getNetwork(): string {
    return this.network;
  }

  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Public method to get the operator account ID configured for this client instance.
   * @returns The operator account ID string, or null if not set.
   */
  getOperatorAccountId(): string | null {
    return this.client.operatorAccountId?.toString() ?? null;
  }

  /**
   * Creates a scheduled transaction from a transaction object
   * @param transaction The transaction to schedule
   * @param memo Optional memo to include with the scheduled transaction
   * @param expirationTime Optional expiration time in seconds from now
   * @returns Object with schedule ID and transaction ID
   */
  private async createScheduledTransaction(
    transaction: Transaction,
    memo?: string,
    expirationTime?: number,
    schedulePayerAccountId?: string,
  ): Promise<{
    scheduleId: string;
    transactionId: string;
  }> {
    this.logger.info('Creating scheduled transaction');

    const scheduleTransaction = new ScheduleCreateTransaction()
      .setScheduledTransaction(transaction)
      .setPayerAccountId(
        schedulePayerAccountId
          ? AccountId.fromString(schedulePayerAccountId)
          : this.client.operatorAccountId,
      );

    if (memo) {
      scheduleTransaction.setScheduleMemo(memo);
    }

    if (expirationTime) {
      const expirationDate = addSeconds(new Date(), expirationTime);
      const timestamp = Timestamp.fromDate(expirationDate);
      scheduleTransaction.setExpirationTime(timestamp);
    }

    this.logger.debug('Executing schedule create transaction');
    const scheduleResponse = await scheduleTransaction.execute(this.client);
    const scheduleReceipt = await scheduleResponse.getReceipt(this.client);

    if (!scheduleReceipt.scheduleId) {
      this.logger.error(
        'Failed to create scheduled transaction: scheduleId is null',
      );
      throw new Error(
        'Failed to create scheduled transaction: scheduleId is null',
      );
    }

    const scheduleId = scheduleReceipt.scheduleId.toString();
    const transactionId = scheduleResponse.transactionId.toString();

    this.logger.info(
      `Scheduled transaction created successfully: ${scheduleId}`,
    );

    return {
      scheduleId,
      transactionId,
    };
  }

  /**
   * Sends a transaction operation on a connection topic
   * @param connectionTopicId Connection topic ID
   * @param scheduleId Schedule ID of the scheduled transaction
   * @param data Human-readable description of the transaction, can also be a JSON string or HRL
   * @param submitKey Optional submit key
   * @param options Optional parameters including memo (timestamp is no longer used here)
   * @returns Transaction receipt
   */
  public async sendTransactionOperation(
    connectionTopicId: string,
    scheduleId: string,
    data: string,
    submitKey?: string,
    options?: {
      memo?: string;
    },
  ): Promise<TransactionReceipt> {
    const submissionCheck = await this.canSubmitToTopic(
      connectionTopicId,
      this.client.operatorAccountId?.toString() || '',
    );

    const operatorId = await this.getOperatorId();

    const payload = {
      p: 'hcs-10',
      op: 'transaction',
      operator_id: operatorId,
      schedule_id: scheduleId,
      data,
      m: options?.memo,
    };

    this.logger.info(
      'Submitting transaction operation to connection topic',
      payload,
    );
    return await this.submitPayload(
      connectionTopicId,
      payload,
      submitKey,
      submissionCheck.requiresFee,
    );
  }

  /**
   * Creates and sends a transaction operation in one call
   * @param connectionTopicId Connection topic ID for sending the transaction operation
   * @param transaction The transaction to schedule
   * @param data Human-readable description of the transaction, can also be a JSON string or HRL
   * @param options Optional parameters for schedule creation and operation memo
   * @returns Object with schedule details (including scheduleId and its transactionId) and HCS-10 operation receipt
   */
  async sendTransaction(
    connectionTopicId: string,
    transaction: Transaction,
    data: string,
    options?: {
      scheduleMemo?: string;
      expirationTime?: number;
      submitKey?: string;
      operationMemo?: string;
      schedulePayerAccountId?: string;
    },
  ): Promise<{
    scheduleId: string;
    transactionId: string;
    receipt: TransactionReceipt;
  }> {
    this.logger.info(
      'Creating scheduled transaction and sending transaction operation',
    );

    const { scheduleId, transactionId } = await this.createScheduledTransaction(
      transaction,
      options?.scheduleMemo,
      options?.expirationTime,
      options?.schedulePayerAccountId,
    );

    const receipt = await this.sendTransactionOperation(
      connectionTopicId,
      scheduleId,
      data,
      options?.submitKey,
      {
        memo: options?.operationMemo,
      },
    );

    return {
      scheduleId,
      transactionId,
      receipt,
    };
  }

  /**
   * Creates a new MCP server with inbound and outbound topics.
   *
   * This method creates communication topics and profiles required for an MCP server,
   * registers the profile with the server's account, and handles profile picture
   * inscriptions if provided.
   *
   * @param builder The MCP server builder object
   * @param ttl Optional Time-To-Live for the topic memos, defaults to 60
   * @param existingState Optional existing state to resume from
   * @returns Object with topic IDs
   */
  async createMCPServer(
    builder: MCPServerBuilder,
    ttl: number = 60,
    existingState?: Partial<MCPServerCreationState>,
    progressCallback?: RegistrationProgressCallback,
  ): Promise<CreateMCPServerResponse> {
    if (!this.keyType) {
      await this.initializeOperator();
    }

    const config = builder.build();
    const accountId = this.client.operatorAccountId?.toString();
    if (!accountId) {
      throw new Error('Failed to retrieve operator account ID');
    }

    const result = await this._createEntityTopics(
      ttl,
      {
        outboundTopicId: existingState?.outboundTopicId || '',
        inboundTopicId: existingState?.inboundTopicId || '',
        pfpTopicId:
          existingState?.pfpTopicId || config.existingPfpTopicId || '',
        profileTopicId: existingState?.profileTopicId || '',
      },
      accountId,
      InboundTopicType.PUBLIC,
      undefined,
      config.pfpBuffer,
      config.pfpFileName,
      progressCallback,
    );

    if (!result.profileTopicId) {
      this.logger.info('Creating and storing HCS-11 MCP server profile');

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Creating MCP server profile',
          progressPercent: 60,
          details: {
            outboundTopicId: result.outboundTopicId,
            inboundTopicId: result.inboundTopicId,
            pfpTopicId: result.pfpTopicId,
            state: {
              currentStage: 'profile',
              completedPercentage: 60,
            },
          },
        });
      }

      // Get the current client's operator account ID and private key
      const currentOperatorAccountId = this.client.operatorAccountId?.toString();
      if (!currentOperatorAccountId) {
        throw new Error('No operator account ID found on current client');
      }

      this.logger.info(`Using operator account: ${currentOperatorAccountId} for profile inscription`);
      this.logger.debug(`Private key length: ${this.operatorPrivateKey?.length || 0} characters`);

      // Create a temporary HCS11Client with the current client's credentials
      // instead of using the base client's HCS11Client which may have different credentials
      const tempHcs11Client = new HCS11Client({
        network: this.network as 'mainnet' | 'testnet',
        auth: {
          operatorId: currentOperatorAccountId,
          privateKey: this.operatorPrivateKey,
        },
        logLevel: this.logger.getLevel(),
        silent: false,
        keyType: this.keyType,
      });

      await tempHcs11Client.initializeOperator();
      const profile = tempHcs11Client.createMCPServerProfile(
        config.name,
        config.mcpServer,
        {
          alias: config.alias,
          bio: config.bio,
          socials: config.socials || [],
          inboundTopicId: result.inboundTopicId,
          outboundTopicId: result.outboundTopicId,
          profileImage: result.pfpTopicId
            ? `hcs://1/${result.pfpTopicId}`
            : undefined,
        },
      );

      const profileResult = await tempHcs11Client.inscribeProfile(profile);

      if (!profileResult.success) {
        this.logger.error(
          `Failed to inscribe MCP server profile: ${profileResult.error}`,
        );
        throw new Error(
          profileResult.error || 'Failed to inscribe MCP server profile',
        );
      }

      result.profileTopicId = profileResult.profileTopicId;
      this.logger.info(
        `MCP server profile stored with topic ID: ${result.profileTopicId}`,
      );

      const memoResult = await tempHcs11Client.updateAccountMemoWithProfile(
        accountId,
        result.profileTopicId,
      );

      if (!memoResult.success) {
        this.logger.warn(
          `Failed to update account memo: ${memoResult.error}, but continuing with MCP server creation`,
        );
      } else {
        this.logger.info(`Updated account memo with profile reference`);
      }

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'MCP server profile created',
          progressPercent: 70,
          details: {
            outboundTopicId: result.outboundTopicId,
            inboundTopicId: result.inboundTopicId,
            pfpTopicId: result.pfpTopicId,
            profileTopicId: result.profileTopicId,
            state: {
              currentStage: 'profile',
              completedPercentage: 70,
            },
          },
        });
      }
    } else {
      this.logger.info(
        `Using existing profile topic ID: ${result.profileTopicId}`,
      );
    }

    return result;
  }

  /**
   * Creates the base topic structure for an entity (agent or MCP server).
   *
   * @param ttl Time-To-Live for topic memos
   * @param existingTopics Object containing any existing topic IDs to reuse
   * @param accountId The account ID associated with the entity
   * @param inboundTopicType Type of inbound topic
   * @param feeConfig Optional fee configuration for fee-based topics
   * @param pfpBuffer Optional profile picture buffer
   * @param pfpFileName Optional profile picture filename
   * @param progressCallback Optional callback for reporting progress
   * @returns Object with created topic IDs
   */
  private async _createEntityTopics(
    ttl: number,
    existingTopics: {
      outboundTopicId: string;
      inboundTopicId: string;
      pfpTopicId: string;
      profileTopicId: string;
    },
    accountId: string,
    inboundTopicType: InboundTopicType,
    feeConfig?: FeeConfigBuilderInterface,
    pfpBuffer?: Buffer,
    pfpFileName?: string,
    progressCallback?: RegistrationProgressCallback,
  ): Promise<CreateAgentResponse> {
    let { outboundTopicId, inboundTopicId, pfpTopicId, profileTopicId } =
      existingTopics;

    if (!outboundTopicId) {
      const outboundMemo = this._generateHcs10Memo(Hcs10MemoType.OUTBOUND, {
        ttl,
      });
      outboundTopicId = await this.createTopic(outboundMemo, true, true);
      this.logger.info(`Created new outbound topic ID: ${outboundTopicId}`);

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Created outbound topic',
          progressPercent: 30,
          details: {
            outboundTopicId,
            state: {
              currentStage: 'topics',
              completedPercentage: 30,
            },
          },
        });
      }
    } else {
      this.logger.info(`Using existing outbound topic ID: ${outboundTopicId}`);
    }

    if (!inboundTopicId) {
      inboundTopicId = await this.createInboundTopic(
        accountId,
        inboundTopicType,
        ttl,
        inboundTopicType === InboundTopicType.FEE_BASED ? feeConfig : undefined,
      );
      this.logger.info(`Created new inbound topic ID: ${inboundTopicId}`);

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Created inbound topic',
          progressPercent: 40,
          details: {
            outboundTopicId,
            inboundTopicId,
            state: {
              currentStage: 'topics',
              completedPercentage: 40,
            },
          },
        });
      }
    } else {
      this.logger.info(`Using existing inbound topic ID: ${inboundTopicId}`);
    }

    if (!pfpTopicId && pfpBuffer && pfpBuffer.length > 0 && pfpFileName) {
      this.logger.info('Inscribing new profile picture');

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Inscribing profile picture',
          progressPercent: 50,
          details: {
            outboundTopicId,
            inboundTopicId,
            state: {
              currentStage: 'pfp',
              completedPercentage: 50,
            },
          },
        });
      }

      const pfpResult = await this.inscribePfp(pfpBuffer, pfpFileName);
      pfpTopicId = pfpResult.pfpTopicId;
      this.logger.info(
        `Profile picture inscribed with topic ID: ${pfpTopicId}`,
      );

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Profile picture inscribed',
          progressPercent: 55,
          details: {
            outboundTopicId,
            inboundTopicId,
            pfpTopicId,
            state: {
              currentStage: 'pfp',
              completedPercentage: 55,
            },
          },
        });
      }
    } else if (pfpTopicId) {
      this.logger.info(
        `Using existing profile picture with topic ID: ${pfpTopicId}`,
      );
    }

    return {
      inboundTopicId,
      outboundTopicId,
      pfpTopicId,
      profileTopicId,
    };
  }

  /**
   * Creates and registers an MCP server with a Guarded registry.
   *
   * This function creates a new account if needed, initializes an HCS10 client,
   * creates an MCP server with inbound and outbound topics, and registers
   * it with the Hashgraph Online Guarded Registry.
   *
   * @param builder The MCP server builder object with configuration
   * @param options Optional settings for registration process
   * @returns Registration result with success status and metadata
   */
  async createAndRegisterMCPServer(
    builder: MCPServerBuilder,
    options?: {
      baseUrl?: string;
      progressCallback?: RegistrationProgressCallback;
      existingState?: MCPServerCreationState;
      initialBalance?: number;
    },
  ): Promise<AgentRegistrationResult> {
    try {
      const config = builder.build();
      const progressCallback = options?.progressCallback;
      const baseUrl = options?.baseUrl || this.guardedRegistryBaseUrl;

      let state =
        options?.existingState ||
        ({
          currentStage: 'init',
          completedPercentage: 0,
          createdResources: [],
        } as MCPServerCreationState);

      state.serverMetadata = {
        name: config.name,
        description: config.mcpServer.description,
        services: config.mcpServer.services,
      };

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: 'Starting MCP server creation process',
          progressPercent: 0,
          details: { state },
        });
      }

      let account = config.existingAccount;
      let serverClient: HCS10Client;

      if (
        !state.inboundTopicId ||
        !state.outboundTopicId ||
        !state.profileTopicId
      ) {
        if (!account) {
          if (
            state.createdResources &&
            state.createdResources.some(r => r.startsWith('account:'))
          ) {
            const accountResource = state.createdResources.find(r =>
              r.startsWith('account:'),
            );
            const existingAccountId = accountResource?.split(':')[1];

            if (existingAccountId && config.existingAccount) {
              account = config.existingAccount;
              this.logger.info(
                `Resuming with existing account: ${existingAccountId}`,
              );
            } else {
              account = await this.createAccount(options?.initialBalance);
              state.createdResources = state.createdResources || [];
              state.createdResources.push(`account:${account.accountId}`);
            }
          } else {
            account = await this.createAccount(options?.initialBalance);
            state.createdResources = state.createdResources || [];
            state.createdResources.push(`account:${account.accountId}`);
          }
        }

        if (progressCallback) {
          progressCallback({
            stage: 'preparing',
            message: 'Created account or using existing account',
            progressPercent: 20,
            details: { state, account },
          });
        }
        const keyType = detectKeyTypeFromString(account.privateKey);

        builder.setExistingAccount(account.accountId, account.privateKey);

        const { privateKey } = detectKeyTypeFromString(account.privateKey);
        const publicKey = privateKey.publicKey.toString();

        serverClient = new HCS10Client({
          network: config.network,
          operatorId: account.accountId,
          operatorPrivateKey: account.privateKey,
          operatorPublicKey: publicKey,
          keyType: keyType.detectedType as 'ed25519' | 'ecdsa',
          logLevel: 'info' as LogLevel,
          guardedRegistryBaseUrl: baseUrl,
        });

        if (progressCallback) {
          progressCallback({
            stage: 'preparing',
            message: 'Initialized MCP server client',
            progressPercent: 25,
            details: { state },
          });
        }

        let outboundTopicId = state.outboundTopicId;
        let inboundTopicId = state.inboundTopicId;
        let pfpTopicId = state.pfpTopicId;
        let profileTopicId = state.profileTopicId;

        if (!outboundTopicId || !inboundTopicId || !profileTopicId) {
          if (pfpTopicId) {
            builder.setExistingProfilePicture(pfpTopicId);
          }

          const createResult = await serverClient.createMCPServer(
            builder,
            60,
            state,
            data => {
              if (progressCallback) {
                progressCallback({
                  stage: data.stage,
                  message: data.message,
                  progressPercent: data.progressPercent || 0,
                  details: {
                    ...data.details,
                    state: {
                      ...state,
                      ...data.details?.state,
                    },
                  },
                });
              }
            },
          );

          outboundTopicId = createResult.outboundTopicId;
          inboundTopicId = createResult.inboundTopicId;
          pfpTopicId = createResult.pfpTopicId;
          profileTopicId = createResult.profileTopicId;

          state.outboundTopicId = outboundTopicId;
          state.inboundTopicId = inboundTopicId;
          state.pfpTopicId = pfpTopicId;
          state.profileTopicId = profileTopicId;

          if (!state.createdResources) {
            state.createdResources = [];
          }

          if (
            pfpTopicId &&
            !state.createdResources.includes(`pfp:${pfpTopicId}`)
          ) {
            state.createdResources.push(`pfp:${pfpTopicId}`);
          }
          if (!state.createdResources.includes(`inbound:${inboundTopicId}`)) {
            state.createdResources.push(`inbound:${inboundTopicId}`);
          }
          if (!state.createdResources.includes(`outbound:${outboundTopicId}`)) {
            state.createdResources.push(`outbound:${outboundTopicId}`);
          }
          if (!state.createdResources.includes(`profile:${profileTopicId}`)) {
            state.createdResources.push(`profile:${profileTopicId}`);
          }
        }

        state.currentStage = 'profile';
        state.completedPercentage = 60;

        if (progressCallback) {
          progressCallback({
            stage: 'submitting',
            message: 'Created MCP server with topics and profile',
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
      } else {
        account = account || config.existingAccount;
        if (!account) {
          throw new Error(
            'Cannot resume registration without account information',
          );
        }

        const keyType = detectKeyTypeFromString(account.privateKey);
        let operatorPrivateKey: PrivateKey;
        
        if (keyType.detectedType === 'ed25519') {
          operatorPrivateKey = PrivateKey.fromStringED25519(account.privateKey);
        } else {
          operatorPrivateKey = PrivateKey.fromStringECDSA(account.privateKey);
        }

        serverClient = new HCS10Client({
          network: config.network,
          operatorId: account.accountId,
          operatorPrivateKey: account.privateKey,
          operatorPublicKey: operatorPrivateKey.publicKey.toString(),
          logLevel: 'info' as LogLevel,
          guardedRegistryBaseUrl: baseUrl,
        });

        this.logger.info('Resuming registration with existing state', {
          inboundTopicId: state.inboundTopicId,
          outboundTopicId: state.outboundTopicId,
          profileTopicId: state.profileTopicId,
          pfpTopicId: state.pfpTopicId,
        });
      }

      const operatorId = `${state.inboundTopicId}@${account.accountId}`;

      if (
        state.currentStage !== 'complete' ||
        !state.createdResources?.includes(
          `registration:${state.inboundTopicId}`,
        )
      ) {
        const registrationResult =
          await serverClient.registerAgentWithGuardedRegistry(
            account.accountId,
            config.network,
            {
              progressCallback: data => {
                const adjustedPercent = 60 + (data.progressPercent || 0) * 0.4;
                if (progressCallback) {
                  progressCallback({
                    stage: data.stage,
                    message: data.message,
                    progressPercent: adjustedPercent,
                    details: {
                      ...data.details,
                      outboundTopicId: state.outboundTopicId,
                      inboundTopicId: state.inboundTopicId,
                      pfpTopicId: state.pfpTopicId,
                      profileTopicId: state.profileTopicId,
                      operatorId,
                      state: data.details?.state || state,
                    },
                  });
                }
              },
              existingState: state,
            },
          );

        if (!registrationResult.success) {
          return {
            ...registrationResult,
            state,
          };
        }

        state = registrationResult.state || state;
      }

      if (progressCallback) {
        progressCallback({
          stage: 'completed',
          message: 'MCP server creation and registration complete',
          progressPercent: 100,
          details: {
            outboundTopicId: state.outboundTopicId,
            inboundTopicId: state.inboundTopicId,
            pfpTopicId: state.pfpTopicId,
            profileTopicId: state.profileTopicId,
            operatorId,
            state,
          },
        });
      }

      return {
        success: true,
        state,
        metadata: {
          accountId: account.accountId,
          privateKey: account.privateKey,
          operatorId,
          inboundTopicId: state.inboundTopicId!,
          outboundTopicId: state.outboundTopicId!,
          profileTopicId: state.profileTopicId!,
          pfpTopicId: state.pfpTopicId!,
        },
      };
    } catch (e: any) {
      const error = e as Error;
      const logMessage = `Failed to create and register MCP server: ${error.message}`;
      this.logger.error(logMessage);
      return {
        error: error.message,
        success: false,
        state:
          options?.existingState ||
          ({
            currentStage: 'init',
            completedPercentage: 0,
            error: error.message,
          } as MCPServerCreationState),
      };
    }
  }
}
