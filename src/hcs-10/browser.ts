import {
  KeyList,
  PublicKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransactionReceipt,
  PrivateKey,
  Hbar,
  AccountId,
} from '@hashgraph/sdk';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import { Logger, LogLevel } from '../utils/logger';
import {
  InscriptionSDK,
  RetrievedInscriptionResult,
} from '@kiloscribe/inscription-sdk';
import { HCS10BaseClient } from './base-client';
import * as mime from 'mime-types';
import {
  AgentConfig,
  InscribePfpResponse,
  StoreHCS11ProfileResponse,
  AgentRegistrationResult,
  HandleConnectionRequestResponse,
  RegistrationProgressCallback,
  AgentCreationState,
  GetAccountAndSignerResponse,
} from './types';
import {
  HCS11Client,
  AgentMetadata as AIAgentMetadata,
  InscribeProfileResponse,
  SocialLink,
  SocialPlatform,
} from '../hcs-11';
import { ProgressReporter } from '../utils/progress-reporter';
import { Transaction } from '@hashgraph/sdk';
import { AgentBuilder } from '../hcs-11/agent-builder';
import { PersonBuilder } from '../hcs-11/person-builder';
import { Hcs10MemoType } from './base-client';
import { inscribeWithSigner } from '../inscribe/inscriber';

const isBrowser = typeof window !== 'undefined';

/**
 * Configuration for HCS-10 browser client.
 *
 * @example
 * // Using default Hedera mirror nodes
 * const config = {
 *   network: 'testnet',
 *   hwc: walletConnectSDK
 * };
 *
 * @example
 * // Using HGraph custom mirror node provider
 * const config = {
 *   network: 'mainnet',
 *   hwc: walletConnectSDK,
 *   mirrorNode: {
 *     customUrl: 'https://mainnet.hedera.api.hgraph.dev/v1/<API-KEY>',
 *     apiKey: 'your-hgraph-api-key'
 *   }
 * };
 */
export type BrowserHCSClientConfig = {
  /** The Hedera network to connect to */
  network: 'mainnet' | 'testnet';
  /** Hashinals WalletConnect SDK instance */
  hwc: HashinalsWalletConnectSDK;
  /** Log level for the client */
  logLevel?: LogLevel;
  /** Whether to pretty print logs */
  prettyPrint?: boolean;
  /** Guarded registry topic ID (deprecated) */
  guardedRegistryTopicId?: string;
  /** Base URL for the guarded registry */
  guardedRegistryBaseUrl?: string;
  /** Default fee amount for HIP-991 fee payments */
  feeAmount?: number;
  /** Custom mirror node configuration */
  mirrorNode?: import('../services').MirrorNodeConfig;
  /** Whether to run logger in silent mode */
  silent?: boolean;
};

export type BrowserAgentConfig = Omit<
  AgentConfig<BrowserHCSClient>,
  'privateKey'
> & {
  client: BrowserHCSClient;
};

export type RegisteredAgent = {
  outboundTopicId: string;
  inboundTopicId: string;
  pfpTopicId: string;
  profileTopicId: string;
  error?: string;
  success: boolean;
  state: AgentCreationState;
};

export class BrowserHCSClient extends HCS10BaseClient {
  private hwc: HashinalsWalletConnectSDK;
  declare protected logger: Logger;
  private guardedRegistryBaseUrl: string;
  private hcs11Client: HCS11Client | null = null;

  constructor(config: BrowserHCSClientConfig) {
    super({
      network: config.network,
      logLevel: config.logLevel,
      prettyPrint: config.prettyPrint,
      feeAmount: config.feeAmount,
      mirrorNode: config.mirrorNode,
      silent: config.silent,
    });

    this.hwc = config.hwc;
    if (!config.guardedRegistryBaseUrl) {
      this.guardedRegistryBaseUrl = 'https://moonscape.tech';
    } else {
      this.guardedRegistryBaseUrl = config.guardedRegistryBaseUrl;
    }

    let logLevel: LogLevel;
    if (config.logLevel) {
      logLevel = config.logLevel;
    } else {
      logLevel = 'info';
    }

    this.logger = Logger.getInstance({
      level: logLevel,
      module: 'HCS-Browser',
      prettyPrint: config.prettyPrint,
      silent: config.silent,
    });

    if (isBrowser) {
      try {
        const { accountId, signer } = this.getAccountAndSigner();

        this.hcs11Client = new HCS11Client({
          network: config.network,
          auth: {
            operatorId: accountId,
            signer: signer as any,
          },
          logLevel: config.logLevel,
          silent: config.silent,
        });
      } catch (err) {
        this.logger.warn(`Failed to initialize HCS11Client: ${err}`);
      }
    } else {
      this.logger.error(
        'BrowserHCSClient initialized in server environment - browser-specific features will not be available. Use HCS10Client instead.',
      );
    }
  }

  async sendMessage(
    connectionTopicId: string,
    data: string,
    memo?: string,
    submitKey?: PrivateKey,
    options?: {
      progressCallback?: RegistrationProgressCallback;
      waitMaxAttempts?: number;
      waitIntervalMs?: number;
    },
  ): Promise<TransactionReceipt> {
    this.logger.info('Sending message');
    const operatorId = await this.getOperatorId();

    const payload = {
      p: 'hcs-10',
      op: 'message',
      operator_id: operatorId,
      data,
      m: memo,
    };

    const submissionCheck = await this.canSubmitToTopic(
      connectionTopicId,
      this.hwc.getAccountInfo().accountId,
    );

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
      } catch (error) {
        this.logger.error('Error inscribing large message:', error);
        throw new Error(
          `Failed to handle large message: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    return await this.submitPayload(
      connectionTopicId,
      payload,
      submitKey,
      submissionCheck.requiresFee,
    );
  }

  async getPublicKey(accountId: string): Promise<PublicKey> {
    return await this.mirrorNode.getPublicKey(accountId);
  }

  async handleConnectionRequest(
    inboundTopicId: string,
    requestingAccountId: string,
    connectionId: number,
    connectionMemo: string = 'Connection accepted. Looking forward to collaborating!',
    ttl: number = 60,
  ): Promise<HandleConnectionRequestResponse> {
    this.logger.info('Handling connection request');
    const userAccountId = this.hwc.getAccountInfo().accountId;
    if (!userAccountId) {
      throw new Error('Failed to retrieve user account ID');
    }

    const requesterKey =
      await this.mirrorNode.getPublicKey(requestingAccountId);
    const accountKey = await this.mirrorNode.getPublicKey(userAccountId);

    if (!accountKey) {
      throw new Error('Failed to retrieve public key');
    }

    const thresholdKey = new KeyList([accountKey, requesterKey], 1);
    const memo = this._generateHcs10Memo(Hcs10MemoType.CONNECTION, {
      ttl,
      inboundTopicId,
      connectionId,
    });

    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAutoRenewAccountId(AccountId.fromString(userAccountId))
      .setAdminKey(thresholdKey)
      .setSubmitKey(thresholdKey);

    this.logger.debug('Executing topic creation transaction');
    const txResponse = await this.hwc.executeTransactionWithErrorHandling(
      transaction,
      false,
    );
    if (txResponse?.error) {
      this.logger.error(txResponse.error);
      throw new Error(txResponse.error);
    }

    const resultReceipt = txResponse?.result;
    if (!resultReceipt?.topicId) {
      this.logger.error('Failed to create topic: topicId is null');
      throw new Error('Failed to create topic: topicId is null');
    }

    const connectionTopicId = resultReceipt.topicId.toString();
    const operatorId = `${inboundTopicId}@${userAccountId}`;
    const confirmedConnectionSequenceNumber = await this.confirmConnection(
      inboundTopicId,
      connectionTopicId,
      requestingAccountId,
      connectionId,
      operatorId,
      connectionMemo,
    );

    const accountTopics = await this.retrieveCommunicationTopics(userAccountId);

    const requestingAccountTopics =
      await this.retrieveCommunicationTopics(requestingAccountId);

    const requestingAccountOperatorId = `${requestingAccountTopics.inboundTopic}@${requestingAccountId}`;

    await this.recordOutboundConnectionConfirmation({
      outboundTopicId: accountTopics.outboundTopic,
      requestorOutboundTopicId: requestingAccountTopics.outboundTopic,
      connectionRequestId: connectionId,
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

  async confirmConnection(
    inboundTopicId: string,
    connectionTopicId: string,
    connectedAccountId: string,
    connectionId: number,
    operatorId: string,
    memo: string,
  ): Promise<number> {
    this.logger.info('Confirming connection');
    const payload = {
      p: 'hcs-10',
      op: 'connection_created',
      connection_topic_id: connectionTopicId,
      connected_account_id: connectedAccountId,
      operator_id: operatorId,
      connection_id: connectionId,
      m: memo,
    };

    const transactionResponse = await this.submitPayload(
      inboundTopicId,
      payload,
    );
    if (!transactionResponse?.topicSequenceNumber) {
      this.logger.error(
        'Failed to confirm connection: sequence number is null',
      );
      throw new Error('Failed to confirm connection: sequence number is null');
    }
    return transactionResponse.topicSequenceNumber.toNumber();
  }

  async create(
    builder: AgentBuilder | PersonBuilder,
    options?: {
      progressCallback?: RegistrationProgressCallback;
      existingState?: AgentCreationState;
      ttl?: number;
      updateAccountMemo?: boolean;
    },
  ): Promise<RegisteredAgent | InscribeProfileResponse> {
    const progressCallback = options?.progressCallback;
    const progressReporter = new ProgressReporter({
      module: 'ProfileCreate',
      logger: this.logger,
      callback: progressCallback as any,
    });

    try {
      const isAgentBuilder = builder instanceof AgentBuilder;

      let state;
      if (options?.existingState) {
        state = options.existingState;
      } else {
        state = {
          currentStage: 'init',
          completedPercentage: 0,
          createdResources: [],
        } as AgentCreationState;
      }

      if (isAgentBuilder) {
        this.logger.info('Creating Agent Profile and HCS-10 Topics');
        const agentConfig = (builder as AgentBuilder).build();
        state.agentMetadata = agentConfig.metadata;
      } else {
        this.logger.info('Creating Person HCS-11 Profile');
      }

      progressReporter.preparing(
        `Starting ${isAgentBuilder ? 'agent' : 'person'} resource creation`,
        0,
        {
          state,
        },
      );

      const {
        inboundTopicId,
        outboundTopicId,
        state: updatedState,
      } = await this.createCommunicationTopics(options, progressReporter);

      state = updatedState;

      if (!isAgentBuilder) {
        (builder as PersonBuilder).setInboundTopicId(inboundTopicId);
        (builder as PersonBuilder).setOutboundTopicId(outboundTopicId);
      }

      let pfpTopicId: string | undefined;
      let hasPfpBuffer: Buffer | undefined;
      let pfpFileName: string | undefined;

      if (isAgentBuilder) {
        const agentProfile = (builder as AgentBuilder).build();
        pfpTopicId = agentProfile.existingPfpTopicId || state.pfpTopicId;
        hasPfpBuffer = agentProfile.pfpBuffer;
        pfpFileName = agentProfile.pfpFileName || 'pfp.png';
      } else {
        const personProfile = (builder as PersonBuilder).build();
        pfpTopicId = state.pfpTopicId;
        hasPfpBuffer = personProfile.pfpBuffer;
        pfpFileName = personProfile.pfpFileName;
      }

      if (!pfpTopicId && hasPfpBuffer && pfpFileName) {
        pfpTopicId = await this.handleProfilePictureCreation(
          hasPfpBuffer,
          pfpFileName,
          state,
          progressReporter,
        );
      } else if (pfpTopicId) {
        progressReporter.preparing(
          `Using existing profile picture: ${pfpTopicId}`,
          50,
          { state },
        );
        state.pfpTopicId = pfpTopicId;
      }

      await this.createAndInscribeProfile(
        isAgentBuilder,
        builder as any,
        pfpTopicId,
        state,
        inboundTopicId,
        outboundTopicId,
        options,
        progressReporter,
      );

      state.currentStage = 'complete';
      state.completedPercentage = 100;
      progressReporter.completed(
        `${isAgentBuilder ? 'Agent' : 'Person'} profile created successfully`,
        {
          profileTopicId: state.profileTopicId,
          inboundTopicId,
          outboundTopicId,
          pfpTopicId,
          state,
        },
      );

      let outTopicId = '';
      if (state.outboundTopicId) {
        outTopicId = state.outboundTopicId;
      }

      let inTopicId = '';
      if (state.inboundTopicId) {
        inTopicId = state.inboundTopicId;
      }

      let profilePicTopicId = '';
      if (state.pfpTopicId) {
        profilePicTopicId = state.pfpTopicId;
      }

      let profTopicId = '';
      if (state.profileTopicId) {
        profTopicId = state.profileTopicId;
      }

      return {
        outboundTopicId: outTopicId,
        inboundTopicId: inTopicId,
        pfpTopicId: profilePicTopicId,
        profileTopicId: profTopicId,
        success: true,
        state,
      } as RegisteredAgent | InscribeProfileResponse;
    } catch (error: any) {
      progressReporter.failed('Error during profile creation', {
        error: error.message,
      });
      return {
        outboundTopicId: '',
        inboundTopicId: '',
        pfpTopicId: '',
        profileTopicId: '',
        success: false,
        error: error.message,
        state: {
          currentStage: 'init',
          completedPercentage: 0,
          error: error.message,
        } as AgentCreationState,
      } as RegisteredAgent;
    }
  }

  private async handleProfilePictureCreation(
    pfpBuffer: Buffer,
    pfpFileName: string,
    state: AgentCreationState,
    progressReporter: ProgressReporter,
  ): Promise<string> {
    state.currentStage = 'pfp';
    progressReporter.preparing('Creating profile picture', 30, {
      state,
    });

    const pfpProgress = progressReporter.createSubProgress({
      minPercent: 30,
      maxPercent: 50,
      logPrefix: 'PFP',
    });

    const pfpResult = await this.inscribePfp(pfpBuffer, pfpFileName, {
      progressCallback: data =>
        pfpProgress.report({
          ...data,
          progressPercent: data.progressPercent ?? 0,
          details: { ...data.details, state },
        }),
    });

    if (!pfpResult.success) {
      let errorMessage = 'Failed to inscribe profile picture';
      if (pfpResult.error) {
        errorMessage = pfpResult.error;
      }
      throw new Error(errorMessage);
    }

    const pfpTopicId = pfpResult.pfpTopicId;
    state.pfpTopicId = pfpTopicId;

    if (state.createdResources) {
      state.createdResources.push(`pfp:${state.pfpTopicId}`);
    }

    progressReporter.preparing('Profile picture created', 50, { state });

    return pfpTopicId;
  }

  private async createAndInscribeProfile(
    isAgentBuilder: boolean,
    builder: AgentBuilder | PersonBuilder,
    pfpTopicId: string | undefined,
    state: AgentCreationState,
    inboundTopicId: string,
    outboundTopicId: string,
    options?: {
      updateAccountMemo?: boolean;
    },
    progressReporter?: ProgressReporter,
  ): Promise<void> {
    if (!this.hcs11Client) {
      if (progressReporter) {
        progressReporter.failed('HCS11Client is not available');
      }
      throw new Error('HCS11Client is not available');
    }

    this.logger.info('Creating and inscribing profile');
    if (!state.profileTopicId) {
      if (progressReporter) {
        progressReporter.preparing(
          `Storing HCS-11 ${isAgentBuilder ? 'agent' : 'person'} profile`,
          80,
        );
      }

      const profileProgress = progressReporter?.createSubProgress({
        minPercent: 80,
        maxPercent: 95,
        logPrefix: 'StoreProfile',
      });

      let hcs11Profile;

      if (isAgentBuilder) {
        const agentProfile = (builder as AgentBuilder).build();

        const socialLinks = agentProfile.metadata?.socials
          ? Object.entries(agentProfile.metadata.socials).map(
              ([platform, handle]) => ({
                platform: platform as SocialPlatform,
                handle: handle as string,
              }),
            )
          : [];

        hcs11Profile = this.hcs11Client.createAIAgentProfile(
          agentProfile.name,
          agentProfile.metadata?.type === 'manual' ? 0 : 1,
          agentProfile.capabilities || [],
          agentProfile.metadata?.model || 'unknown',
          {
            alias: agentProfile.name.toLowerCase().replace(/\s+/g, '_'),
            bio: agentProfile.bio,
            profileImage: pfpTopicId ? `hcs://1/${pfpTopicId}` : undefined,
            socials: socialLinks,
            properties: agentProfile.metadata?.properties || {},
            inboundTopicId,
            outboundTopicId,
            creator: agentProfile.metadata?.creator,
          },
        );
      } else {
        const personProfile = (builder as PersonBuilder).build();

        const { pfpBuffer, pfpFileName, ...cleanProfile } = personProfile;

        hcs11Profile = this.hcs11Client.createPersonalProfile(
          personProfile.display_name,
          {
            alias: personProfile.alias,
            bio: personProfile.bio,
            socials: personProfile.socials,
            profileImage: pfpTopicId
              ? `hcs://1/${pfpTopicId}`
              : personProfile.profileImage,
            properties: personProfile.properties,
            inboundTopicId,
            outboundTopicId,
          },
        );
      }

      const profileResult = await this.hcs11Client.createAndInscribeProfile(
        hcs11Profile,
        options?.updateAccountMemo ?? true,
        {
          progressCallback: data =>
            profileProgress?.report({
              ...data,
              progressPercent: data.progressPercent ?? 0,
            }),
        },
      );

      if (!profileResult.success) {
        if (progressReporter) {
          progressReporter.failed(
            `Failed to inscribe ${isAgentBuilder ? 'agent' : 'person'} profile`,
            {
              error: profileResult.error,
            },
          );
        }

        let errorMessage = `Failed to inscribe ${
          isAgentBuilder ? 'agent' : 'person'
        } profile`;
        if (profileResult.error) {
          errorMessage = profileResult.error;
        }
        throw new Error(errorMessage);
      }

      state.profileTopicId = profileResult.profileTopicId;

      if (state.createdResources) {
        state.createdResources.push(`profile:${profileResult.profileTopicId}`);
      }

      if (progressReporter) {
        progressReporter.preparing('HCS-11 Profile stored', 95, { state });
      }
    } else if (progressReporter) {
      progressReporter.preparing(
        `Using existing ${isAgentBuilder ? 'agent' : 'person'} profile`,
        95,
        {
          state,
        },
      );
    }
  }

  private initializeRegistrationState(
    inboundTopicId: string,
    existingState?: AgentCreationState,
  ): AgentCreationState {
    const state = existingState || {
      inboundTopicId,
      currentStage: 'registration',
      completedPercentage: 0,
      createdResources: [],
    };

    if (
      state.currentStage !== 'registration' &&
      state.currentStage !== 'complete'
    ) {
      state.currentStage = 'registration';
    }

    return state;
  }

  private updateStateForCompletedRegistration(
    state: AgentCreationState,
    inboundTopicId: string,
  ): void {
    state.currentStage = 'complete';
    state.completedPercentage = 100;
    if (state.createdResources) {
      state.createdResources.push(`registration:${inboundTopicId}`);
    }
  }

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

      const agentProfile = await this.retrieveProfile(accountId);
      const inboundTopicId = agentProfile.topicInfo.inboundTopic;
      const state = this.initializeRegistrationState(
        inboundTopicId,
        options?.existingState,
      );
      const progressReporter = new ProgressReporter({
        module: 'AgentRegistration',
        logger: this.logger,
        callback: options?.progressCallback,
      });

      progressReporter.preparing('Preparing agent registration', 10, {
        inboundTopicId,
        accountId,
      });

      const registrationResult = await this.executeRegistration(
        accountId,
        network as string,
        this.guardedRegistryBaseUrl,
        this.logger,
      );

      if (!registrationResult.success) {
        return {
          ...registrationResult,
          state,
        };
      }

      progressReporter.submitting('Submitting registration to registry', 30, {
        transactionId: registrationResult.transactionId,
      });

      if (registrationResult.transaction) {
        const transaction = Transaction.fromBytes(
          Buffer.from(registrationResult.transaction, 'base64'),
        );

        this.logger.info(`Processing registration transaction`);
        const txResult = await this.hwc.executeTransactionWithErrorHandling(
          transaction as any,
          true,
        );

        if (txResult.error) {
          return {
            ...registrationResult,
            error: txResult.error,
            success: false,
            state,
          };
        }

        this.logger.info(`Successfully processed registration transaction`);
      }

      progressReporter.confirming('Confirming registration transaction', 60, {
        accountId,
        inboundTopicId,
        transactionId: registrationResult.transactionId,
      });

      const maxAttempts = options?.maxAttempts ?? 60;
      const delayMs = options?.delayMs ?? 2000;

      const confirmed = await this.waitForRegistrationConfirmation(
        registrationResult.transactionId!,
        network,
        this.guardedRegistryBaseUrl,
        maxAttempts,
        delayMs,
        this.logger,
      );

      this.updateStateForCompletedRegistration(state, inboundTopicId);

      progressReporter.completed('Agent registration complete', {
        transactionId: registrationResult.transactionId,
        inboundTopicId,
        state,
        confirmed,
      });

      return {
        ...registrationResult,
        confirmed,
        state,
      };
    } catch (error: any) {
      this.logger.error(`Registration error: ${error.message}`);
      return {
        error: `Error during registration: ${error.message}`,
        success: false,
        state: {
          currentStage: 'registration',
          completedPercentage: 0,
          error: error.message,
        },
      };
    }
  }

  async createAndRegisterAgent(
    builder: AgentBuilder,
    options?: {
      progressCallback?: RegistrationProgressCallback;
      maxAttempts?: number;
      delayMs?: number;
      existingState?: AgentCreationState;
      baseUrl?: string;
    },
  ): Promise<AgentRegistrationResult> {
    try {
      const agentConfig = builder.build();
      const progressCallback = options?.progressCallback;
      const progressReporter = new ProgressReporter({
        module: 'AgentCreateRegister',
        logger: this.logger,
        callback: progressCallback as any,
      });

      let state =
        options?.existingState ||
        ({
          currentStage: 'init',
          completedPercentage: 0,
          createdResources: [],
        } as AgentCreationState);

      state.agentMetadata = agentConfig.metadata;

      progressReporter.preparing('Starting agent creation process', 0, {
        state,
      });

      if (
        state.currentStage !== 'complete' ||
        !state.inboundTopicId ||
        !state.outboundTopicId ||
        !state.profileTopicId
      ) {
        const createResult = await this.create(builder, {
          progressCallback: (progress: any) => {
            const adjustedPercent = (progress.progressPercent || 0) * 0.3;
            progressReporter.report({
              ...progress,
              progressPercent: adjustedPercent,
              details: {
                ...progress.details,
                state: progress.details?.state || state,
              },
            });
          },
          existingState: state,
          updateAccountMemo: false,
        });

        if (!('state' in createResult)) {
          throw new Error('Create method did not return expected agent state.');
        }

        if (!createResult.success) {
          throw new Error(
            createResult.error || 'Failed to create agent resources',
          );
        }

        state = createResult.state;
        state.agentMetadata = agentConfig.metadata;
      }

      progressReporter.preparing(
        `Agent creation status: ${state.currentStage}, ${state.completedPercentage}%`,
        30,
        { state },
      );

      const { accountId } = this.getAccountAndSigner();

      if (
        state.currentStage !== 'complete' ||
        !state.createdResources?.includes(
          `registration:${state.inboundTopicId}`,
        )
      ) {
        if (options?.baseUrl) {
          this.guardedRegistryBaseUrl = options.baseUrl;
        }

        const registrationResult = await this.registerAgentWithGuardedRegistry(
          accountId,
          agentConfig.network,
          {
            progressCallback: progress => {
              const adjustedPercent =
                30 + (progress.progressPercent || 0) * 0.7;
              progressReporter.report({
                ...progress,
                progressPercent: adjustedPercent,
                details: {
                  ...progress.details,
                  state: progress.details?.state || state,
                },
              });
            },
            maxAttempts: options?.maxAttempts,
            delayMs: options?.delayMs,
            existingState: state,
          },
        );

        if (!registrationResult.success) {
          throw new Error(
            registrationResult.error ||
              'Failed to register agent with registry',
          );
        }

        state = registrationResult.state;

        if (state.profileTopicId) {
          await this.hcs11Client?.updateAccountMemoWithProfile(
            accountId,
            state.profileTopicId,
          );
        }
      }

      progressReporter.completed('Agent creation and registration complete', {
        state,
      });

      return {
        success: true,
        state,
        metadata: {
          accountId,
          operatorId: `${state.inboundTopicId}@${accountId}`,
          inboundTopicId: state.inboundTopicId!,
          outboundTopicId: state.outboundTopicId!,
          profileTopicId: state.profileTopicId!,
          pfpTopicId: state.pfpTopicId!,
          privateKey: null,
          ...state.agentMetadata,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create and register agent: ${error.message}`,
      );
      return {
        success: false,
        error: `Failed to create and register agent: ${error.message}`,
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

  async storeHCS11Profile(
    agentName: string,
    agentBio: string,
    inboundTopicId: string,
    outboundTopicId: string,
    capabilities: number[] = [],
    metadata: Record<string, any> = {},
    pfpBuffer?: Buffer,
    pfpFileName?: string,
    existingPfpTopicId?: string,
    options?: {
      progressCallback?: RegistrationProgressCallback;
    },
  ): Promise<StoreHCS11ProfileResponse> {
    try {
      const progressCallback = options?.progressCallback;
      const progressReporter = new ProgressReporter({
        module: 'StoreHCS11Profile',
        logger: this.logger,
        callback: progressCallback as any,
      });

      progressReporter.preparing('Preparing agent profile data', 0);

      let pfpTopicId = existingPfpTopicId;

      if (!pfpTopicId && pfpBuffer && pfpFileName) {
        const pfpProgress = progressReporter.createSubProgress({
          minPercent: 0,
          maxPercent: 60,
          logPrefix: 'PFP',
        });

        const pfpResult = await this.inscribePfp(pfpBuffer, pfpFileName, {
          progressCallback: data => {
            pfpProgress.report({
              stage: data.stage,
              message: data.message,
              progressPercent: data.progressPercent || 0,
              details: data.details,
            });
          },
        });

        if (!pfpResult.success) {
          progressReporter.failed(
            'Failed to inscribe profile picture, continuing without PFP',
          );
        } else {
          pfpTopicId = pfpResult.pfpTopicId;
        }
      } else if (existingPfpTopicId) {
        progressReporter.preparing(
          `Using existing profile picture: ${existingPfpTopicId}`,
          30,
        );
      } else {
        progressReporter.preparing('No profile picture provided', 30);
      }

      if (!this.hcs11Client) {
        progressReporter.failed(
          'HCS11Client is not available in this environment',
        );
        return {
          profileTopicId: '',
          success: false,
          error: 'HCS11Client is not available in this environment',
          transactionId: '',
        };
      }

      const agentType = this.hcs11Client.getAgentTypeFromMetadata({
        type: metadata.type || 'autonomous',
      } as AIAgentMetadata);

      progressReporter.preparing('Building agent profile', 65);

      const formattedSocials: SocialLink[] | undefined = metadata.socials
        ? Object.entries(metadata.socials)
            .filter(([_, handle]) => handle)
            .map(([platform, handle]) => ({
              platform: platform as SocialPlatform,
              handle: handle as string,
            }))
        : undefined;

      const profile = this.hcs11Client.createAIAgentProfile(
        agentName,
        agentType,
        capabilities,
        metadata.model || 'unknown',
        {
          alias: agentName.toLowerCase().replace(/\s+/g, '_'),
          bio: agentBio,
          profileImage: pfpTopicId ? `hcs://1/${pfpTopicId}` : undefined,
          socials: formattedSocials,
          properties: {
            version: metadata.version || '1.0.0',
            creator: metadata.creator || 'Unknown',
            supported_languages: metadata.supported_languages || ['en'],
            permissions: metadata.permissions || [],
            model_details: metadata.model_details,
            training: metadata.training,
            capabilities_description: metadata.capabilities_description,
            ...metadata,
          },
          inboundTopicId,
          outboundTopicId,
          creator: metadata.creator,
        },
      );

      const profileProgress = progressReporter.createSubProgress({
        minPercent: 65,
        maxPercent: 100,
        logPrefix: 'Profile',
      });

      const profileResult = await this.hcs11Client.createAndInscribeProfile(
        profile,
        true,
        {
          progressCallback: profileData => {
            profileProgress.report({
              stage: profileData.stage,
              message: profileData.message,
              progressPercent: profileData.progressPercent || 0,
              details: profileData.details,
            });
          },
        },
      );

      if (!profileResult.success) {
        progressReporter.failed('Failed to inscribe profile');
        return {
          profileTopicId: '',
          success: false,
          error: profileResult.error || 'Failed to inscribe profile',
          transactionId: profileResult.transactionId || '',
        };
      }

      progressReporter.completed('Profile stored successfully', {
        profileTopicId: profileResult.profileTopicId,
      });

      return {
        profileTopicId: profileResult.profileTopicId,
        pfpTopicId,
        success: true,
        transactionId: profileResult.transactionId || '',
      };
    } catch (error: any) {
      this.logger.error(`Error storing HCS11 profile: ${error.message}`);
      return {
        profileTopicId: '',
        success: false,
        error: error.message,
        transactionId: '',
      };
    }
  }

  async createTopic(
    memo: string,
    adminKey?: boolean,
    submitKey?: boolean,
  ): Promise<{
    success: boolean;
    topicId?: string;
    error?: string;
  }> {
    this.logger.info('Creating topic');
    const { accountId, signer } = this.getAccountAndSigner();

    const transaction = new TopicCreateTransaction().setTopicMemo(memo);

    const publicKey = await this.mirrorNode.getPublicKey(accountId);

    if (adminKey && publicKey) {
      transaction.setAdminKey(publicKey);
      transaction.setAutoRenewAccountId(accountId);
    }

    if (submitKey && publicKey) {
      transaction.setSubmitKey(publicKey);
    }

    const transactionResponse =
      await this.hwc.executeTransactionWithErrorHandling(
        transaction as any,
        false,
      );

    const error = transactionResponse.error;

    if (error) {
      this.logger.error(error);
      return {
        success: false,
        error,
      };
    }

    const resultReceipt = transactionResponse.result;

    if (!resultReceipt?.topicId) {
      this.logger.error('Failed to create topic: topicId is null');
      return {
        success: false,
        error: 'Failed to create topic: topicId is null',
      };
    }

    return {
      success: true,
      topicId: resultReceipt.topicId.toString(),
    };
  }

  public async submitPayload(
    topicId: string,
    payload: object | string,
    submitKey?: PrivateKey,
    requiresFee?: boolean,
  ): Promise<TransactionReceipt> {
    this.logger.debug(`Submitting payload to topic ${topicId}`);

    let message: string;
    if (typeof payload === 'string') {
      message = payload;
    } else {
      message = JSON.stringify(payload);
    }

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message);

    const transactionMemo = this.getHcs10TransactionMemo(payload);
    if (transactionMemo) {
      transaction.setTransactionMemo(transactionMemo);
    }

    let transactionResponse: {
      result?: TransactionReceipt;
      error?: string;
    };

    if (requiresFee) {
      this.logger.info(
        'Topic requires fee payment, setting max transaction fee',
      );
      transaction.setMaxTransactionFee(new Hbar(this.feeAmount));
    }

    if (submitKey) {
      const { accountId, signer } = this.getAccountAndSigner();
      transaction.freezeWithSigner(signer as any);
      const signedTransaction = await transaction.sign(submitKey);
      transactionResponse = await this.hwc.executeTransactionWithErrorHandling(
        signedTransaction,
        true,
      );
    } else {
      transactionResponse = await this.hwc.executeTransactionWithErrorHandling(
        transaction,
        false,
      );
    }

    if (transactionResponse?.error) {
      this.logger.error(
        `Failed to submit payload: ${transactionResponse.error}`,
      );
      throw new Error(`Failed to submit payload: ${transactionResponse.error}`);
    }

    if (!transactionResponse?.result) {
      this.logger.error(
        'Failed to submit message: receipt is null or undefined',
      );
      throw new Error('Failed to submit message: receipt is null or undefined');
    }

    this.logger.debug('Payload submitted successfully via HWC');
    return transactionResponse.result;
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
    const { accountId, signer } = this.getAccountAndSigner();

    const mimeType = mime.lookup(fileName) || 'application/octet-stream';

    const sdk = await InscriptionSDK.createWithAuth({
      type: 'client',
      accountId: accountId,
      signer: signer as any,
      network: this.network as 'testnet' | 'mainnet',
    });

    const inscriptionOptions = {
      mode: 'file' as const,
      waitForConfirmation: true,
      waitMaxAttempts: options?.waitMaxAttempts || 30,
      waitIntervalMs: options?.waitIntervalMs || 4000,
      progressCallback: options?.progressCallback,
      logging: {
        level: this.logger.getLevel ? this.logger.getLevel() : 'info',
      },
    };

    const response = await inscribeWithSigner(
      {
        type: 'buffer',
        buffer,
        fileName,
        mimeType,
      },
      signer as any,
      {
        ...inscriptionOptions,
        network: this.network as 'testnet' | 'mainnet',
      },
      sdk,
    );

    if (!response.confirmed || !response.inscription) {
      throw new Error('Inscription was not confirmed');
    }

    return response.inscription;
  }

  getAccountAndSigner(): GetAccountAndSignerResponse {
    const accountInfo = this?.hwc?.getAccountInfo();
    const accountId = accountInfo?.accountId?.toString();
    const signer = this?.hwc?.dAppConnector?.signers?.find(s => {
      return s.getAccountId().toString() === accountId;
    });

    if (!signer) {
      this.logger.error('Failed to find signer', {
        accountId,
        signers: this?.hwc?.dAppConnector?.signers,
        accountInfo,
      });
      throw new Error('Failed to find signer');
    }

    return { accountId, signer: signer as any };
  }

  /**
   * Inscribes a profile picture (PFP) on HCS-11.
   *
   * @param buffer - The buffer containing the PFP image.
   * @param fileName - The name of the file containing the PFP image.
   * @param options - Optional configuration options.
   * @returns A promise that resolves to the topic ID of the inscribed PFP.
   */
  async inscribePfp(
    buffer: Buffer,
    fileName: string,
    options?: {
      progressCallback?: RegistrationProgressCallback;
    },
  ): Promise<InscribePfpResponse> {
    try {
      const progressCallback = options?.progressCallback;
      const progressReporter = new ProgressReporter({
        module: 'PFP-Inscription',
        logger: this.logger,
        callback: progressCallback as any,
      });

      if (!this.hcs11Client) {
        progressReporter.failed(
          'HCS11Client is not available in this environment',
        );
        return {
          pfpTopicId: '',
          success: false,
          error: 'HCS11Client is not available in this environment',
          transactionId: '',
        };
      }

      progressReporter.preparing('Preparing to inscribe profile picture', 10);
      this.logger.info('Inscribing profile picture using HCS-11 client');

      const wrappedProgressCallback = (data: any) => {
        progressReporter.report({
          stage: data.stage || 'confirming',
          message: data.message || 'Processing PFP inscription',
          progressPercent: data.progressPercent || 50,
          details: data.details,
        });
      };

      const imageResult = await this.hcs11Client.inscribeImage(
        buffer,
        fileName,
        { progressCallback: wrappedProgressCallback },
      );

      if (!imageResult.success) {
        let errorMessage = 'Failed to inscribe profile picture';
        if (imageResult.error) {
          errorMessage = imageResult.error;
        }

        let txId = '';
        if (imageResult.transactionId) {
          txId = imageResult.transactionId;
        }

        return {
          pfpTopicId: '',
          success: false,
          error: errorMessage,
          transactionId: txId,
        };
      }

      progressReporter.completed('Successfully inscribed profile picture', {
        pfpTopicId: imageResult.imageTopicId,
      });

      this.logger.info(
        `Successfully inscribed profile picture with topic ID: ${imageResult.imageTopicId}`,
      );
      return {
        pfpTopicId: imageResult.imageTopicId,
        success: true,
        transactionId: imageResult.transactionId || '',
      };
    } catch (error: any) {
      this.logger.error(`Error inscribing profile picture: ${error.message}`);
      return {
        pfpTopicId: '',
        success: false,
        error: error.message,
        transactionId: '',
      };
    }
  }

  private async createCommunicationTopics(
    options?: {
      existingState?: AgentCreationState;
      ttl?: number;
    },
    progressReporter?: ProgressReporter,
  ): Promise<{
    inboundTopicId: string;
    outboundTopicId: string;
    state: AgentCreationState;
  }> {
    let state =
      options?.existingState ||
      ({
        currentStage: 'init',
        completedPercentage: 0,
        createdResources: [],
      } as AgentCreationState);

    if (progressReporter) {
      progressReporter.preparing('Starting communication topic creation', 0, {
        state,
      });
    }

    const { accountId } = this.getAccountAndSigner();
    if (!state.outboundTopicId) {
      state.currentStage = 'topics';
      if (progressReporter) {
        progressReporter.preparing('Creating outbound topic', 5, {
          state,
        });
      }
      const outboundMemo = this._generateHcs10Memo(Hcs10MemoType.OUTBOUND, {
        ttl: options?.ttl,
        accountId,
      });
      const outboundResult = await this.createTopic(outboundMemo, true, true);
      if (!outboundResult.success || !outboundResult.topicId) {
        throw new Error(
          outboundResult.error || 'Failed to create outbound topic',
        );
      }
      state.outboundTopicId = outboundResult.topicId;
      if (state.createdResources)
        state.createdResources.push(`outbound:${state.outboundTopicId}`);
    }

    if (!state.inboundTopicId) {
      state.currentStage = 'topics';
      if (progressReporter) {
        progressReporter.preparing('Creating inbound topic', 10, {
          state,
        });
      }
      const inboundMemo = this._generateHcs10Memo(Hcs10MemoType.INBOUND, {
        ttl: options?.ttl,
        accountId,
      });
      // TODO: mimic SDK's createInboundTopic
      const inboundResult = await this.createTopic(inboundMemo, true, false);
      if (!inboundResult.success || !inboundResult.topicId) {
        throw new Error(
          inboundResult.error || 'Failed to create inbound topic',
        );
      }
      state.inboundTopicId = inboundResult.topicId;
      if (state.createdResources)
        state.createdResources.push(`inbound:${state.inboundTopicId}`);
    }

    return {
      inboundTopicId: state.inboundTopicId,
      outboundTopicId: state.outboundTopicId,
      state,
    };
  }
}
