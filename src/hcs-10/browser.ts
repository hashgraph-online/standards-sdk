import {
  KeyList,
  PublicKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransactionReceipt,
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
  HCSClientConfig,
  NetworkType,
  RegistrationResponse,
  AgentConfig,
  CreateAgentResponse,
  InscribePfpResponse,
  StoreHCS11ProfileResponse,
  AgentRegistrationResult,
  HandleConnectionRequestResponse,
  WaitForConnectionConfirmationResponse,
  RegistrationProgressCallback,
  AgentCreationState,
  GetAccountAndSignerResponse
} from './types';
import { HCS11Client, AIAgentMetadata } from '../hcs-11';
import { ProgressReporter } from '../utils/progress-reporter';
import { Transaction } from '@hashgraph/sdk';
import { AgentBuilder } from './agent-builder';

const isBrowser = typeof window !== 'undefined';

export type BrowserHCSClientConfig = {
  network: 'mainnet' | 'testnet';
  hwc: HashinalsWalletConnectSDK;
  logLevel?: LogLevel;
  prettyPrint?: boolean;
  guardedRegistryTopicId?: string;
  guardedRegistryBaseUrl?: string;
};

interface AgentMetadata {
  name: string;
  description: string;
  version?: string;
  type?: string;
  logo?: string;
  socials?: SocialLinks;
}

interface SocialLinks {
  twitter?: string;
  discord?: string;
  github?: string;
  website?: string;
}

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
  protected declare logger: Logger;
  private guardedRegistryBaseUrl: string;
  private hcs11Client: HCS11Client | null = null;

  constructor(config: BrowserHCSClientConfig) {
    super({
      network: config.network,
      logLevel: config.logLevel,
      prettyPrint: config.prettyPrint,
    });

    this.hwc = config.hwc;
    this.guardedRegistryBaseUrl =
      config.guardedRegistryBaseUrl || 'https://moonscape.tech';
    this.logger = Logger.getInstance({
      level: config.logLevel || 'info',
      module: 'HCS-Browser',
      prettyPrint: config.prettyPrint,
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
        });
      } catch (err) {
        this.logger.warn(`Failed to initialize HCS11Client: ${err}`);
      }
    } else {
      this.logger.error(
        'BrowserHCSClient initialized in server environment - browser-specific features will not be available. Use HCS10Client instead.'
      );
    }
  }

  async sendMessage(
    connectionTopicId: string,
    operatorId: string,
    data: string,
    memo?: string
  ): Promise<void> {
    this.logger.info('Sending message');
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

    await this.submitPayload(connectionTopicId, payload);
  }

  async submitConnectionRequest(
    inboundTopicId: string,
    requestingAccountId: string,
    operatorId: string,
    memo: string
  ): Promise<TransactionReceipt | undefined> {
    this.logger.info('Submitting connection request');
    const connectionRequestMessage = {
      p: 'hcs-10',
      op: 'connection_request',
      requesting_account_id: requestingAccountId,
      operator_id: operatorId,
      m: memo,
    };

    const response = await this.submitPayload(
      inboundTopicId,
      connectionRequestMessage
    );
    this.logger.info(
      `Submitted connection request to topic ID: ${inboundTopicId}`
    );

    const outboundTopic = await this.retrieveOutboundConnectTopic(
      requestingAccountId
    );

    if (!outboundTopic?.outboundTopic) {
      this.logger.error(
        `Failed to retrieve outbound topic for account ID: ${requestingAccountId}`
      );
      throw new Error(
        `Failed to retrieve outbound topic for account ID: ${requestingAccountId}`
      );
    }

    this.logger.info(
      `Retrieved outbound topic ID: ${outboundTopic.outboundTopic} for account ID: ${requestingAccountId}`
    );
    const responseSequenceNumber =
      response?.result?.topicSequenceNumber?.toNumber();

    if (!responseSequenceNumber) {
      throw new Error('Failed to get response sequence number');
    }

    await this.submitPayload(outboundTopic.outboundTopic, {
      ...connectionRequestMessage,
      outbound_topic_id: inboundTopicId,
      connection_request_id: responseSequenceNumber,
    });

    return response.result;
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
  }): Promise<{
    result?: TransactionReceipt;
    error?: string;
  }> {
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

  async getPublicKey(accountId: string): Promise<PublicKey> {
    return await this.mirrorNode.getPublicKey(accountId);
  }

  async handleConnectionRequest(
    inboundTopicId: string,
    requestingAccountId: string,
    connectionId: number,
    connectionMemo: string = 'Connection accepted. Looking forward to collaborating!'
  ): Promise<HandleConnectionRequestResponse> {
    this.logger.info('Handling connection request');
    const userAccountId = this.hwc.getAccountInfo().accountId;
    if (!userAccountId) {
      throw new Error('Failed to retrieve user account ID');
    }

    const requesterKey = await this.mirrorNode.getPublicKey(
      requestingAccountId
    );
    const accountKey = await this.mirrorNode.getPublicKey(userAccountId);

    if (!accountKey) {
      throw new Error('Failed to retrieve public key');
    }

    const thresholdKey = new KeyList([accountKey, requesterKey], 1);
    const memo = `hcs-10:${inboundTopicId}:${connectionId}`;

    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(thresholdKey)
      .setSubmitKey(thresholdKey);

    this.logger.debug('Executing topic creation transaction');
    const receipt = await this.hwc.executeTransactionWithErrorHandling(
      transaction as any,
      false
    );
    if (receipt.error) {
      this.logger.error(receipt.error);
      throw new Error(receipt.error);
    }

    const result = receipt.result;
    if (!result?.topicId) {
      this.logger.error('Failed to create topic: topicId is null');
      throw new Error('Failed to create topic: topicId is null');
    }

    const connectionTopicId = result.topicId.toString();
    const operatorId = `${inboundTopicId}@${userAccountId}`;
    const confirmedConnectionSequenceNumber = await this.confirmConnection(
      inboundTopicId,
      connectionTopicId,
      requestingAccountId,
      connectionId,
      operatorId,
      connectionMemo
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
    memo: string
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
      payload
    );
    if (!transactionResponse?.result?.topicSequenceNumber) {
      this.logger.error(
        'Failed to confirm connection: sequence number is null'
      );
      throw new Error('Failed to confirm connection: sequence number is null');
    }
    return transactionResponse.result.topicSequenceNumber.toNumber();
  }

  async submitMessage(
    topicId: string,
    content: string,
    metadata: object = {},
    memo: string = ''
  ): Promise<{
    result?: TransactionReceipt;
    error?: string;
  }> {
    this.logger.info('Submitting message');
    const payload = {
      p: 'hcs-10',
      op: 'message',
      data: {
        content,
        metadata,
      },
      m: memo,
    };

    return await this.submitPayload(topicId, payload);
  }

  /**
   * Creates an agent directly, but does not register.
   * We highly recommend calling createAndRegisterAgent instead.
   *
   * @param pfpBuffer - The buffer containing the PFP image.
   * @param pfpFileName - The name of the file containing the PFP image.
   * @param agentName - The name of the agent.
   * @param agentDescription - The description of the agent.
   * @param capabilities - The capabilities of the agent.
   * @param metadata - The metadata of the agent.
   * @param existingPfpTopicId - The topic ID of the existing PFP.
   * @param options - Optional configuration options.
   * @returns A promise that resolves to the agent creation state.
   */
  async createAgent(
    pfpBuffer: Buffer,
    pfpFileName: string,
    agentName: string,
    agentDescription: string,
    capabilities: number[],
    metadata: AgentMetadata,
    existingPfpTopicId?: string,
    options?: {
      progressCallback?: RegistrationProgressCallback;
      existingState?: AgentCreationState;
    }
  ): Promise<RegisteredAgent> {
    try {
      const progressCallback = options?.progressCallback;
      const progressReporter = new ProgressReporter({
        module: 'AgentCreate',
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

      if (!state.outboundTopicId) {
        state.currentStage = 'topics';
        progressReporter.preparing('Creating agent outbound topic', 0, {
          state,
        });

        const outboundResult = await this.createTopic(
          'hcs-10:0:60:1',
          true,
          true
        );
        if (!outboundResult.success || !outboundResult.topicId) {
          state.error =
            outboundResult.error || 'Failed to create outbound topic';
          progressReporter.failed(
            `Failed to create outbound topic: ${state.error}`,
            { state }
          );
          return {
            outboundTopicId: '',
            inboundTopicId: '',
            pfpTopicId: '',
            profileTopicId: '',
            success: false,
            error: state.error,
            state,
          };
        }

        state.outboundTopicId = outboundResult.topicId;
        if (state.createdResources) {
          state.createdResources.push(`outbound:${state.outboundTopicId}`);
        }
        progressReporter.preparing('Outbound topic created', 20, { state });
      } else {
        progressReporter.preparing('Using existing outbound topic', 20, {
          state,
        });
      }

      const accountId = this.hwc.getAccountInfo().accountId;
      if (!accountId) {
        throw new Error('Failed to retrieve user account ID');
      }

      if (!state.inboundTopicId) {
        const memo = `hcs-10:0:60:0:${accountId}`;
        const inboundResult = await this.createTopic(memo, true, true);

        if (!inboundResult.success || !inboundResult.topicId) {
          state.error = inboundResult.error || 'Failed to create inbound topic';
          progressReporter.failed(
            `Failed to create inbound topic: ${state.error}`,
            { state }
          );
          return {
            outboundTopicId: state.outboundTopicId || '',
            inboundTopicId: '',
            pfpTopicId: '',
            profileTopicId: '',
            success: false,
            error: state.error,
            state,
          };
        }

        state.inboundTopicId = inboundResult.topicId;
        if (state.createdResources) {
          state.createdResources.push(`inbound:${state.inboundTopicId}`);
        }
        progressReporter.preparing('Inbound topic created', 40, { state });
      } else {
        progressReporter.preparing('Using existing inbound topic', 40, {
          state,
        });
      }

      if (!state.pfpTopicId && !existingPfpTopicId) {
        state.currentStage = 'pfp';
        progressReporter.preparing('Creating agent profile picture', 40, {
          state,
        });

        const pfpProgress = progressReporter.createSubProgress({
          minPercent: 40,
          maxPercent: 60,
          logPrefix: 'PFP',
        });

        const pfpResult = await this.inscribePfp(pfpBuffer, pfpFileName, {
          progressCallback: (data) => {
            pfpProgress.report({
              stage: data.stage,
              message: data.message,
              progressPercent: data.progressPercent || 0,
              details: { ...data.details, state },
            });
          },
        });

        if (!pfpResult.success) {
          state.error = pfpResult.error || 'Failed to inscribe profile picture';
          progressReporter.failed(
            `Failed to inscribe profile picture: ${state.error}`,
            { state }
          );
          return {
            outboundTopicId: state.outboundTopicId || '',
            inboundTopicId: state.inboundTopicId || '',
            pfpTopicId: '',
            profileTopicId: '',
            success: false,
            error: state.error,
            state,
          };
        }

        state.pfpTopicId = pfpResult.pfpTopicId;
        state.completedPercentage = 60;
        if (state.createdResources) {
          state.createdResources.push(`pfp:${state.pfpTopicId}`);
        }

        progressReporter.preparing('Profile picture created', 60, { state });
      } else {
        state.pfpTopicId = existingPfpTopicId || state.pfpTopicId;
        progressReporter.preparing(
          `Using existing profile picture: ${state.pfpTopicId}`,
          60,
          {
            state,
          }
        );
      }

      if (!state.profileTopicId) {
        state.currentStage = 'profile';
        progressReporter.preparing('Creating agent profile', 60, { state });

        const profileProgress = progressReporter.createSubProgress({
          minPercent: 60,
          maxPercent: 100,
          logPrefix: 'Profile',
        });

        if (!this.hcs11Client) {
          state.error = 'HCS11Client is not available in this environment';
          progressReporter.failed(state.error, { state });
          return {
            outboundTopicId: state.outboundTopicId || '',
            inboundTopicId: state.inboundTopicId || '',
            pfpTopicId: state.pfpTopicId || '',
            profileTopicId: '',
            success: false,
            error: state.error,
            state,
          };
        }

        const storeProfileResult = await this.storeHCS11Profile(
          agentName,
          agentDescription,
          state.inboundTopicId!,
          state.outboundTopicId!,
          capabilities,
          metadata,
          undefined,
          undefined,
          state.pfpTopicId,
          {
            progressCallback: (data) => {
              profileProgress.report({
                stage: data.stage,
                message: data.message,
                progressPercent: data.progressPercent || 0,
                details: { ...data.details, state },
              });
            },
          }
        );

        if (!storeProfileResult.success) {
          state.error =
            storeProfileResult.error || 'Failed to store agent profile';
          progressReporter.failed(
            `Failed to store agent profile: ${state.error}`,
            { state }
          );
          return {
            outboundTopicId: state.outboundTopicId || '',
            inboundTopicId: state.inboundTopicId || '',
            pfpTopicId: state.pfpTopicId || '',
            profileTopicId: '',
            success: false,
            error: state.error,
            state,
          };
        }

        state.profileTopicId = storeProfileResult.profileTopicId;
        if (state.createdResources) {
          state.createdResources.push(`profile:${state.profileTopicId}`);
        }

        state.currentStage = 'complete';
        state.completedPercentage = 100;
      } else {
        progressReporter.preparing('Using existing agent profile', 100, {
          state,
        });
        if (state.currentStage !== 'complete') {
          state.currentStage = 'complete';
          state.completedPercentage = 100;
        }
      }

      progressReporter.completed('Agent successfully created', {
        inboundTopicId: state.inboundTopicId,
        outboundTopicId: state.outboundTopicId,
        pfpTopicId: state.pfpTopicId,
        profileTopicId: state.profileTopicId,
        state,
      });

      return {
        outboundTopicId: state.outboundTopicId || '',
        inboundTopicId: state.inboundTopicId || '',
        pfpTopicId: state.pfpTopicId || '',
        profileTopicId: state.profileTopicId || '',
        success: true,
        state,
      };
    } catch (error: any) {
      this.logger.error(`Error creating agent: ${error.message}`);
      return {
        outboundTopicId: '',
        inboundTopicId: '',
        pfpTopicId: '',
        profileTopicId: '',
        success: false,
        error: `Error creating agent: ${error.message}`,
        state: {
          currentStage: 'init',
          completedPercentage: 0,
          error: error.message,
        },
      };
    }
  }

  private initializeRegistrationState(
    inboundTopicId: string,
    existingState?: AgentCreationState
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
    inboundTopicId: string
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
    }
  ): Promise<AgentRegistrationResult> {
    try {
      this.logger.info('Registering agent with guarded registry');

      const agentProfile = await this.retrieveProfile(accountId);
      const inboundTopicId = agentProfile.topicInfo.inboundTopic;
      const state = this.initializeRegistrationState(
        inboundTopicId,
        options?.existingState
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
        this.logger
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
          Buffer.from(registrationResult.transaction, 'base64')
        );

        this.logger.info(`Processing registration transaction`);
        const txResult = await this.hwc.executeTransactionWithErrorHandling(
          transaction as any,
          true
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
        this.logger
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
    }
  ): Promise<AgentRegistrationResult> {
    try {
      const config = builder.build();
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

      state.agentMetadata = config.metadata;

      progressReporter.preparing('Starting agent creation process', 0, {
        state,
      });

      if (
        state.currentStage !== 'complete' ||
        !state.inboundTopicId ||
        !state.outboundTopicId ||
        !state.profileTopicId
      ) {
        const agentResult = await this.createAgent(
          config.pfpBuffer || Buffer.from([]),
          config.pfpFileName || 'default.png',
          config.name,
          config.description,
          config.capabilities,
          config.metadata,
          config.existingPfpTopicId,
          {
            progressCallback: (progress) => {
              const adjustedPercent = (progress.progressPercent || 0) * 0.3;
              progressReporter.report({
                stage: progress.stage,
                message: progress.message,
                progressPercent: adjustedPercent,
                details: {
                  ...progress.details,
                  state: progress.details?.state || state,
                },
              });
            },
            existingState: state,
          }
        );

        if (!agentResult.success) {
          throw new Error(
            agentResult.error || 'Failed to create agent with topics'
          );
        }

        state = agentResult.state;
        state.agentMetadata = config.metadata;
      }

      progressReporter.preparing(
        `Agent creation status: ${state.currentStage}, ${state.completedPercentage}%`,
        30,
        { state }
      );

      const { accountId } = this.getAccountAndSigner();

      if (
        state.currentStage !== 'complete' ||
        !state.createdResources?.includes(
          `registration:${state.inboundTopicId}`
        )
      ) {
        if (options?.baseUrl) {
          this.guardedRegistryBaseUrl = options.baseUrl;
        }

        const registrationResult = await this.registerAgentWithGuardedRegistry(
          accountId,
          config.network,
          {
            progressCallback: (progress) => {
              const adjustedPercent =
                30 + (progress.progressPercent || 0) * 0.7;
              progressReporter.report({
                stage: progress.stage,
                message: progress.message,
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
          }
        );

        if (!registrationResult.success) {
          throw new Error(
            registrationResult.error || 'Failed to register agent with registry'
          );
        }

        state = registrationResult.state;
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
      throw new Error(`Failed to create and register agent: ${error.message}`);
    }
  }

  async storeHCS11Profile(
    agentName: string,
    agentDescription: string,
    inboundTopicId: string,
    outboundTopicId: string,
    capabilities: number[] = [],
    metadata: Record<string, any> = {},
    pfpBuffer?: Buffer,
    pfpFileName?: string,
    existingPfpTopicId?: string,
    options?: {
      progressCallback?: RegistrationProgressCallback;
    }
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
          progressCallback: (data) => {
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
            'Failed to inscribe profile picture, continuing without PFP'
          );
        } else {
          pfpTopicId = pfpResult.pfpTopicId;
        }
      } else if (existingPfpTopicId) {
        progressReporter.preparing(
          `Using existing profile picture: ${existingPfpTopicId}`,
          30
        );
      } else {
        progressReporter.preparing('No profile picture provided', 30);
      }

      const agentType = this.hcs11Client?.getAgentTypeFromMetadata({
        type: metadata.type || 'autonomous',
      } as AIAgentMetadata);

      progressReporter.preparing('Building agent profile', 65);

      const formattedSocials = [];
      if (metadata.socials) {
        if (metadata.socials.twitter) {
          formattedSocials.push({
            platform: 'twitter',
            handle: metadata.socials.twitter,
          });
        }
        if (metadata.socials.discord) {
          formattedSocials.push({
            platform: 'discord',
            handle: metadata.socials.discord,
          });
        }
        if (metadata.socials.github) {
          formattedSocials.push({
            platform: 'github',
            handle: metadata.socials.github,
          });
        }
        if (metadata.socials.website) {
          formattedSocials.push({
            platform: 'website',
            handle: metadata.socials.website,
          });
        }
        if (metadata.socials.x) {
          formattedSocials.push({
            platform: 'twitter',
            handle: metadata.socials.x,
          });
        }
        if (metadata.socials.linkedin) {
          formattedSocials.push({
            platform: 'linkedin',
            handle: metadata.socials.linkedin,
          });
        }
        if (metadata.socials.youtube) {
          formattedSocials.push({
            platform: 'youtube',
            handle: metadata.socials.youtube,
          });
        }
        if (metadata.socials.telegram) {
          formattedSocials.push({
            platform: 'telegram',
            handle: metadata.socials.telegram,
          });
        }
      }

      if (!this.hcs11Client) {
        progressReporter.failed(
          'HCS11Client is not available in this environment'
        );
        return {
          profileTopicId: '',
          success: false,
          error: 'HCS11Client is not available in this environment',
          transactionId: '',
        };
      }

      const profile = this.hcs11Client.createAIAgentProfile(
        agentName,
        agentType!,
        capabilities,
        metadata.model || 'unknown',
        {
          alias: agentName.toLowerCase().replace(/\s+/g, '_'),
          bio: agentDescription,
          profileImage: pfpTopicId ? `hcs://1/${pfpTopicId}` : undefined,
          socials: formattedSocials.length > 0 ? formattedSocials : undefined,
          properties: {
            description: agentDescription,
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
        }
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
          progressCallback: (profileData) => {
            profileProgress.report({
              stage: profileData.stage,
              message: profileData.message,
              progressPercent: profileData.progressPercent || 0,
              details: profileData.details,
            });
          },
        }
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
    submitKey?: boolean
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
        false
      );

    const error = transactionResponse.error;

    if (error) {
      this.logger.error(error);
      return {
        success: false,
        error,
      };
    }

    const result = transactionResponse.result;

    if (!result?.topicId) {
      this.logger.error('Failed to create topic: topicId is null');
      return {
        success: false,
        error: 'Failed to create topic: topicId is null',
      };
    }

    return {
      success: true,
      topicId: result.topicId.toString(),
    };
  }

  private async submitPayload(
    topicId: string,
    payload: object
  ): Promise<{
    result?: TransactionReceipt;
    error?: string;
  }> {
    this.logger.debug('Submitting payload');

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(payload));

    return await this.hwc.executeTransactionWithErrorHandling(
      transaction,
      false
    );
  }

  async inscribeFile(
    buffer: Buffer,
    fileName: string
  ): Promise<RetrievedInscriptionResult> {
    const { accountId, signer } = this.getAccountAndSigner();

    const mimeType = mime.lookup(fileName) || 'application/octet-stream';

    const sdk = await InscriptionSDK.createWithAuth({
      type: 'client',
      accountId: accountId,
      signer: signer as any,
      network: this.network as 'testnet' | 'mainnet',
    });

    const result = await sdk.inscribe(
      {
        file: {
          type: 'base64',
          base64: buffer.toString('base64'),
          fileName,
          mimeType,
        },
        holderId: accountId.toString(),
        mode: 'file',
        network: this.network as 'testnet' | 'mainnet',
      },
      signer as any
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

  getAccountAndSigner(): GetAccountAndSignerResponse {
    const accountInfo = this.hwc.getAccountInfo();
    const accountId = accountInfo.accountId.toString();
    const signer = this.hwc.dAppConnector.signers.find((s) => {
      return s.getAccountId().toString() === accountId;
    });

    if (!signer) {
      this.logger.error('Failed to find signer');
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
    }
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
          'HCS11Client is not available in this environment'
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
        { progressCallback: wrappedProgressCallback }
      );

      if (!imageResult.success) {
        progressReporter.failed(
          `Failed to inscribe profile picture: ${imageResult.error}`
        );
        this.logger.error(
          `Failed to inscribe profile picture: ${imageResult.error}`
        );
        return {
          pfpTopicId: '',
          success: false,
          error: imageResult.error || 'Failed to inscribe profile picture',
          transactionId: imageResult.transactionId || '',
        };
      }

      progressReporter.completed('Successfully inscribed profile picture', {
        pfpTopicId: imageResult.imageTopicId,
      });

      this.logger.info(
        `Successfully inscribed profile picture with topic ID: ${imageResult.imageTopicId}`
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
}
