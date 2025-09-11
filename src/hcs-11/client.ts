import {
  AccountId,
  AccountUpdateTransaction,
  Client,
  PrivateKey,
  Status,
  Transaction,
} from '@hashgraph/sdk';
import {
  inscribe,
  inscribeWithSigner,
  InscriptionInput,
  InscriptionOptions,
  InscriptionResult,
} from '../inscribe';
import { Logger, ILogger, detectKeyTypeFromString, getTopicId } from '../utils';
import * as mime from 'mime-types';
import { z, ZodIssue } from 'zod';
import type { DAppSigner } from '@hashgraph/hedera-wallet-connect';
import { ProgressReporter } from '../utils/progress-reporter';
import { HederaMirrorNode } from '../services';
import { isHederaNetwork, toHederaCaip10 } from '../hcs-14/caip';
import { HCS14Client } from '../hcs-14';
import { TopicInfo } from '../services/types';
import {
  ProfileType,
  AIAgentType,
  AIAgentCapability,
  SocialLink,
  PersonalProfile,
  AIAgentProfile,
  HCS11Profile,
  HCS11Auth,
  HCS11ClientConfig,
  TransactionResult,
  InscribeProfileResponse,
  InscribeImageResponse,
  AgentMetadata,
  InscribeImageOptions,
  InscribeProfileOptions,
  capabilityNameToCapabilityMap,
  MCPServerDetails,
  MCPServerProfile,
  MCPServerCapability,
  VerificationType,
} from './types';

export const SocialLinkSchema = z.object({
  platform: z.string().min(1),
  handle: z.string().min(1),
});

export const AIAgentDetailsSchema = z.object({
  type: z.nativeEnum(AIAgentType),
  capabilities: z.array(z.nativeEnum(AIAgentCapability)).min(1),
  model: z.string().min(1),
  creator: z.string().optional(),
});

export const MCPServerConnectionInfoSchema = z.object({
  url: z.string().min(1),
  transport: z.enum(['stdio', 'sse']),
});

export const MCPServerVerificationSchema = z.object({
  type: z.nativeEnum(VerificationType),
  value: z.string(),
  dns_field: z.string().optional(),
  challenge_path: z.string().optional(),
});

export const MCPServerHostSchema = z.object({
  minVersion: z.string().optional(),
});

export const MCPServerResourceSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export const MCPServerToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export const MCPServerDetailsSchema = z.object({
  version: z.string().min(1),
  connectionInfo: MCPServerConnectionInfoSchema,
  services: z.array(z.nativeEnum(MCPServerCapability)).min(1),
  description: z.string().min(1),
  verification: MCPServerVerificationSchema.optional(),
  host: MCPServerHostSchema.optional(),
  capabilities: z.array(z.string()).optional(),
  resources: z.array(MCPServerResourceSchema).optional(),
  tools: z.array(MCPServerToolSchema).optional(),
  maintainer: z.string().optional(),
  repository: z.string().optional(),
  docs: z.string().optional(),
});

export const BaseProfileSchema = z.object({
  version: z.string().min(1),
  type: z.nativeEnum(ProfileType),
  display_name: z.string().min(1),
  alias: z.string().optional(),
  bio: z.string().optional(),
  socials: z.array(SocialLinkSchema).optional(),
  profileImage: z.string().optional(),
  uaid: z.string().optional(),
  properties: z.record(z.any()).optional(),
  inboundTopicId: z.string().optional(),
  outboundTopicId: z.string().optional(),
});

export const PersonalProfileSchema = BaseProfileSchema.extend({
  type: z.literal(ProfileType.PERSONAL),
  language: z.string().optional(),
  timezone: z.string().optional(),
});

export const AIAgentProfileSchema = BaseProfileSchema.extend({
  type: z.literal(ProfileType.AI_AGENT),
  aiAgent: AIAgentDetailsSchema,
});

export const MCPServerProfileSchema = BaseProfileSchema.extend({
  type: z.literal(ProfileType.MCP_SERVER),
  mcpServer: MCPServerDetailsSchema,
});

export const HCS11ProfileSchema = z.union([
  PersonalProfileSchema,
  AIAgentProfileSchema,
  MCPServerProfileSchema,
]);

export class HCS11Client {
  private client: Client;
  private auth: HCS11Auth;
  private network: string;
  private logger: ILogger;
  private mirrorNode: HederaMirrorNode;
  private keyType: 'ed25519' | 'ecdsa';
  private operatorId: string;

  constructor(config: HCS11ClientConfig) {
    this.client =
      config.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    this.auth = config.auth;
    this.network = config.network;
    this.operatorId = config.auth.operatorId;

    this.logger = Logger.getInstance({
      level: config.logLevel || 'info',
      module: 'HCS-11',
      silent: config.silent,
    });

    this.mirrorNode = new HederaMirrorNode(
      this.network as 'mainnet' | 'testnet',
      this.logger,
    );

    if (this.auth.privateKey) {
      if (config.keyType) {
        this.keyType = config.keyType;
        this.initializeOperatorWithKeyType();
      } else {
        try {
          const keyDetection = detectKeyTypeFromString(this.auth.privateKey);
          this.keyType = keyDetection.detectedType;

          if (keyDetection.warning) {
            this.logger.warn(keyDetection.warning);
          }

          this.client.setOperator(this.operatorId, keyDetection.privateKey);
        } catch (error) {
          this.logger.warn(
            'Failed to detect key type from private key format, will query mirror node',
          );
          this.keyType = 'ecdsa'; // Default to ECDSA
        }

        this.initializeOperator();
      }
    }
  }

  public getClient(): Client {
    return this.client;
  }

  public getOperatorId(): string {
    return this.auth.operatorId;
  }

  public async initializeOperator() {
    const account = await this.mirrorNode.requestAccount(this.operatorId);
    const keyType = account?.key?._type;

    if (keyType && keyType.includes('ECDSA')) {
      this.keyType = 'ecdsa';
    } else if (keyType && keyType.includes('ED25519')) {
      this.keyType = 'ed25519';
    } else {
      this.keyType = 'ecdsa'; // Default to ECDSA
    }

    this.initializeOperatorWithKeyType();
  }

  private initializeOperatorWithKeyType() {
    if (!this.auth.privateKey) {
      return;
    }

    const PK =
      this.keyType === 'ecdsa'
        ? PrivateKey.fromStringECDSA(this.auth.privateKey)
        : PrivateKey.fromStringED25519(this.auth.privateKey);

    this.client.setOperator(this.operatorId, PK);
  }

  public createPersonalProfile(
    displayName: string,
    options?: {
      alias?: string;
      bio?: string;
      socials?: SocialLink[];
      profileImage?: string;
      language?: string;
      timezone?: string;
      properties?: Record<string, any>;
      inboundTopicId?: string;
      outboundTopicId?: string;
    },
  ): PersonalProfile {
    return {
      version: '1.0',
      type: ProfileType.PERSONAL,
      display_name: displayName,
      alias: options?.alias,
      bio: options?.bio,
      socials: options?.socials,
      profileImage: options?.profileImage,
      properties: options?.properties,
      inboundTopicId: options?.inboundTopicId,
      outboundTopicId: options?.outboundTopicId,
    };
  }

  public createAIAgentProfile(
    displayName: string,
    agentType: AIAgentType,
    capabilities: AIAgentCapability[],
    model: string,
    options?: {
      alias?: string;
      bio?: string;
      socials?: SocialLink[];
      profileImage?: string;
      properties?: Record<string, any>;
      inboundTopicId?: string;
      outboundTopicId?: string;
      creator?: string;
    },
  ): AIAgentProfile {
    const validation = this.validateProfile({
      version: '1.0',
      type: ProfileType.AI_AGENT,
      display_name: displayName,
      alias: options?.alias,
      bio: options?.bio,
      socials: options?.socials,
      profileImage: options?.profileImage,
      properties: options?.properties,
      inboundTopicId: options?.inboundTopicId,
      outboundTopicId: options?.outboundTopicId,
      aiAgent: {
        type: agentType,
        capabilities,
        model,
        creator: options?.creator,
      },
    });

    if (!validation.valid) {
      throw new Error(
        `Invalid AI Agent Profile: ${validation.errors.join(', ')}`,
      );
    }

    return {
      version: '1.0',
      type: ProfileType.AI_AGENT,
      display_name: displayName,
      alias: options?.alias,
      bio: options?.bio,
      socials: options?.socials,
      profileImage: options?.profileImage,
      properties: options?.properties,
      inboundTopicId: options?.inboundTopicId,
      outboundTopicId: options?.outboundTopicId,
      aiAgent: {
        type: agentType,
        capabilities,
        model,
        creator: options?.creator,
      },
    };
  }

  /**
   * Creates an MCP server profile.
   *
   * @param displayName - The display name for the MCP server
   * @param serverDetails - The MCP server details
   * @param options - Additional profile options
   * @returns An MCPServerProfile object
   */
  public createMCPServerProfile(
    displayName: string,
    serverDetails: MCPServerDetails,
    options?: {
      alias?: string;
      bio?: string;
      socials?: SocialLink[];
      profileImage?: string;
      properties?: Record<string, any>;
      inboundTopicId?: string;
      outboundTopicId?: string;
    },
  ): MCPServerProfile {
    const validation = this.validateProfile({
      version: '1.0',
      type: ProfileType.MCP_SERVER,
      display_name: displayName,
      alias: options?.alias,
      bio: options?.bio,
      socials: options?.socials,
      profileImage: options?.profileImage,
      properties: options?.properties,
      inboundTopicId: options?.inboundTopicId,
      outboundTopicId: options?.outboundTopicId,
      mcpServer: serverDetails,
    });

    if (!validation.valid) {
      throw new Error(
        `Invalid MCP Server Profile: ${validation.errors.join(', ')}`,
      );
    }

    return {
      version: '1.0',
      type: ProfileType.MCP_SERVER,
      display_name: displayName,
      alias: options?.alias,
      bio: options?.bio,
      socials: options?.socials,
      profileImage: options?.profileImage,
      properties: options?.properties,
      inboundTopicId: options?.inboundTopicId,
      outboundTopicId: options?.outboundTopicId,
      mcpServer: serverDetails,
    };
  }

  public validateProfile(profile: unknown): {
    valid: boolean;
    errors: string[];
  } {
    const result = HCS11ProfileSchema.safeParse(profile);

    if (result.success) {
      return { valid: true, errors: [] };
    }

    const formattedErrors = result.error.errors.map((err: ZodIssue) => {
      const path = err.path.join('.');
      let message = err.message;

      if (err.code === 'invalid_type') {
        message = `Expected ${err.expected}, got ${err.received}`;
      } else if (err.code === 'invalid_enum_value') {
        const validOptions = err.options?.join(', ');
        message = `Invalid value. Valid options are: ${validOptions}`;
      } else if (err.code === 'too_small' && err.type === 'string') {
        message = 'Cannot be empty';
      }

      return `${path}: ${message}`;
    });

    return { valid: false, errors: formattedErrors };
  }

  public profileToJSONString(profile: HCS11Profile): string {
    return JSON.stringify(profile);
  }

  public parseProfileFromString(profileStr: string): HCS11Profile | null {
    try {
      const parsedProfile = JSON.parse(profileStr);
      const validation = this.validateProfile(parsedProfile);
      if (!validation.valid) {
        this.logger.error('Invalid profile format:', validation.errors);
        return null;
      }
      return parsedProfile as HCS11Profile;
    } catch (error) {
      this.logger.error('Error parsing profile:');
      return null;
    }
  }

  public setProfileForAccountMemo(
    topicId: string,
    topicStandard: 1 | 2 | 7 = 1,
  ): string {
    return `hcs-11:hcs://${topicStandard}/${topicId}`;
  }

  private async executeTransaction<T>(
    transaction: Transaction,
  ): Promise<TransactionResult<T>> {
    try {
      if (this.auth.privateKey) {
        const signedTx = await transaction.signWithOperator(this.client);
        const response = await signedTx.execute(this.client);
        const receipt = await response.getReceipt(this.client);

        if (receipt.status.toString() !== Status.Success.toString()) {
          return {
            success: false,
            error: `Transaction failed: ${receipt.status.toString()}`,
          };
        }

        return {
          success: true,
          result: receipt as T,
        };
      }

      if (!this.auth.signer) {
        throw new Error('No valid authentication method provided');
      }

      const signer = this.auth.signer;
      const frozenTransaction = await transaction.freezeWithSigner(signer);
      const response = await frozenTransaction.executeWithSigner(signer);
      const receipt = await response.getReceiptWithSigner(signer);

      if (receipt.status.toString() !== Status.Success.toString()) {
        return {
          success: false,
          error: `Transaction failed: ${receipt.status.toString()}: ${Status.Success.toString()}`,
        };
      }

      return {
        success: true,
        result: receipt as T,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during transaction execution',
      };
    }
  }

  public async inscribeImage(
    buffer: Buffer,
    fileName: string,
    options?: InscribeImageOptions,
  ): Promise<InscribeImageResponse> {
    try {
      const progressCallback = options?.progressCallback;
      const progressReporter = new ProgressReporter({
        module: 'HCS11-Image',
        logger: this.logger,
        callback: progressCallback as any,
      });

      progressReporter.preparing('Preparing to inscribe image', 0);

      const mimeType = mime.lookup(fileName) || 'application/octet-stream';

      const waitForConfirmation = options?.waitForConfirmation ?? true;

      let inscriptionResponse;
      if (this.auth.signer) {
        if ('accountId' in this.auth.signer) {
          progressReporter.preparing('Using signer for inscription', 10);

          inscriptionResponse = await inscribeWithSigner(
            {
              type: 'buffer',
              buffer,
              fileName,
              mimeType,
            },
            this.auth.signer as DAppSigner,
            {
              network: this.network as 'mainnet' | 'testnet',
              waitForConfirmation,
              waitMaxAttempts: 150,
              waitIntervalMs: 4000,
              logging: {
                level: 'debug',
              },
              progressCallback: data => {
                const adjustedPercent = 10 + (data.progressPercent || 0) * 0.8;
                progressReporter.report({
                  stage: data.stage,
                  message: data.message,
                  progressPercent: adjustedPercent,
                  details: data.details,
                });
              },
            },
          );
        } else {
          progressReporter.failed(
            'Signer must be a DAppSigner for inscription',
          );
          throw new Error('Signer must be a DAppSigner for inscription');
        }
      } else {
        if (!this.auth.privateKey) {
          progressReporter.failed('Private key is required for inscription');
          this.logger.error('Private key is required for inscription');
          throw new Error('Private key is required for inscription');
        }

        progressReporter.preparing('Using private key for inscription', 10);

        const PK =
          this.keyType === 'ecdsa'
            ? PrivateKey.fromStringECDSA(this.auth.privateKey)
            : PrivateKey.fromStringED25519(this.auth.privateKey);

        inscriptionResponse = await inscribe(
          {
            type: 'buffer',
            buffer,
            fileName,
            mimeType,
          },
          {
            accountId: this.auth.operatorId,
            privateKey: PK,
            network: this.network as 'mainnet' | 'testnet',
          },
          {
            waitForConfirmation,
            waitMaxAttempts: 150,
            waitIntervalMs: 2000,
            logging: {
              level: 'debug',
            },
            progressCallback: data => {
              const adjustedPercent = 10 + (data.progressPercent || 0) * 0.8;
              progressReporter.report({
                stage: data.stage,
                message: data.message,
                progressPercent: adjustedPercent,
                details: data.details,
              });
            },
          },
        );
      }

      if (inscriptionResponse.confirmed) {
        progressReporter.completed('Image inscription completed', {
          topicId: getTopicId(inscriptionResponse.inscription),
        });
        return {
          imageTopicId: getTopicId(inscriptionResponse.inscription) || '',
          transactionId: (inscriptionResponse.result as InscriptionResult)
            .jobId,
          success: true,
        };
      } else {
        const jobId = inscriptionResponse.quote
          ? 'quote-only'
          : (inscriptionResponse.result as InscriptionResult).jobId;
        progressReporter.verifying('Waiting for inscription confirmation', 50, {
          jobId,
        });
        return {
          imageTopicId: '',
          transactionId: jobId,
          success: false,
          error: 'Inscription not confirmed',
        };
      }
    } catch (error) {
      this.logger.error('Error inscribing image:', error);
      return {
        imageTopicId: '',
        transactionId: '',
        success: false,
        error:
          error instanceof Error ? error.message : 'Error inscribing image',
      };
    }
  }

  public async inscribeProfile(
    profile: HCS11Profile,
    options?: InscribeProfileOptions,
  ): Promise<InscribeProfileResponse> {
    this.logger.info('Inscribing HCS-11 profile');

    const progressCallback = options?.progressCallback;
    const progressReporter = new ProgressReporter({
      module: 'HCS11-Profile',
      logger: this.logger,
      callback: progressCallback,
    });

    await this.attachUaidIfMissing(profile);

    progressReporter.preparing('Validating profile data', 5);

    const validation = this.validateProfile(profile);
    if (!validation.valid) {
      progressReporter.failed(
        `Invalid profile: ${validation.errors.join(', ')}`,
      );
      return {
        profileTopicId: '',
        transactionId: '',
        success: false,
        error: `Invalid profile: ${validation.errors.join(', ')}`,
      };
    }

    progressReporter.preparing('Formatting profile for inscription', 15);

    const profileJson = this.profileToJSONString(profile);
    const fileName = `profile-${profile.display_name
      .toLowerCase()
      .replace(/\s+/g, '-')}.json`;

    try {
      const contentBuffer = Buffer.from(profileJson, 'utf-8');
      const contentType = 'application/json';

      progressReporter.preparing('Preparing profile for inscription', 20);

      const input: InscriptionInput = {
        type: 'buffer',
        buffer: contentBuffer,
        fileName,
        mimeType: contentType,
      };

      const inscriptionOptions: InscriptionOptions = {
        waitForConfirmation: true,
        mode: 'file',
        network: this.network as 'mainnet' | 'testnet',
        waitMaxAttempts: 100,
        waitIntervalMs: 2000,
        progressCallback: data => {
          const adjustedPercent =
            20 + Number(data?.progressPercent || 0) * 0.75;
          progressReporter?.report({
            stage: data.stage,
            message: data.message,
            progressPercent: adjustedPercent,
            details: data.details,
          });
        },
      };

      progressReporter.submitting('Submitting profile to Hedera network', 30);

      let inscriptionResponse;

      if (this.auth.privateKey) {
        const PK =
          this.keyType === 'ecdsa'
            ? PrivateKey.fromStringECDSA(this.auth.privateKey)
            : PrivateKey.fromStringED25519(this.auth.privateKey);

        inscriptionResponse = await inscribe(
          input,
          {
            accountId: this.auth.operatorId,
            privateKey: PK,
            network: this.network as 'mainnet' | 'testnet',
          },
          inscriptionOptions,
        );
      } else if (this.auth.signer) {
        inscriptionResponse = await inscribeWithSigner(
          input,
          this.auth.signer as DAppSigner,
          inscriptionOptions,
        );
      } else {
        throw new Error(
          'No authentication method available - neither private key nor signer',
        );
      }

      if (
        !inscriptionResponse.confirmed ||
        !getTopicId(inscriptionResponse.inscription)
      ) {
        progressReporter.failed('Failed to inscribe profile content');
        return {
          profileTopicId: '',
          transactionId: '',
          success: false,
          error: 'Failed to inscribe profile content',
        };
      }
      const topicId = getTopicId(inscriptionResponse.inscription);

      progressReporter.completed('Profile inscription completed', {
        topicId,
        transactionId: (inscriptionResponse.result as InscriptionResult)
          .transactionId,
      });

      return {
        profileTopicId: topicId,
        transactionId: (inscriptionResponse.result as InscriptionResult)
          .transactionId,
        success: true,
      };
    } catch (error) {
      progressReporter.failed(
        `Error inscribing profile: ${error.message || 'Unknown error'}`,
      );
      return {
        profileTopicId: '',
        transactionId: '',
        success: false,
        error: error.message || 'Unknown error during inscription',
      };
    }
  }

  private async attachUaidIfMissing(profile: HCS11Profile): Promise<void> {
    if ((profile as { uaid?: string }).uaid) {
      return;
    }
    if (!isHederaNetwork(this.network)) return;
    try {
      const hcs14 = new HCS14Client({ client: this.client });
      const did = await hcs14.createDid({
        method: 'hedera',
        client: this.client,
      });
      const nativeId = toHederaCaip10(this.network, this.auth.operatorId);
      let uid = this.auth.operatorId;
      const inboundFromProfile = profile.inboundTopicId;
      if (inboundFromProfile && inboundFromProfile.trim().length > 0) {
        uid = `${inboundFromProfile}@${this.auth.operatorId}`;
      } else {
        try {
          const fetched = await this.fetchProfileByAccountId(
            this.auth.operatorId,
            this.network as 'mainnet' | 'testnet',
          );
          const inbound = fetched?.topicInfo?.inboundTopic;
          if (inbound && inbound.trim().length > 0) {
            uid = `${inbound}@${this.auth.operatorId}`;
          }
        } catch {}
      }

      const uaid = hcs14.createUaid(did, { proto: 'hcs-10', nativeId, uid });
      profile.uaid = uaid;
    } catch {
      this.logger.warn(
        'Hiero registrar not available; skipping UAID generation for profile',
      );
    }
  }

  public async updateAccountMemoWithProfile(
    accountId: string | AccountId,
    profileTopicId: string,
  ): Promise<TransactionResult> {
    try {
      this.logger.info(
        `Updating account memo for ${accountId} with profile ${profileTopicId}`,
      );
      const memo = this.setProfileForAccountMemo(profileTopicId);

      const transaction = new AccountUpdateTransaction()
        .setAccountMemo(memo)
        .setAccountId(accountId);

      return this.executeTransaction(transaction);
    } catch (error) {
      this.logger.error(
        `Error updating account memo: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error updating account memo',
      };
    }
  }

  /**
   * Creates and inscribes a profile.
   *
   * @param profile - The profile to create and inscribe.
   * @param updateAccountMemo - Whether to update the account memo with the profile.
   * @param options - Optional configuration options.
   * @returns A promise that resolves to the inscription result.
   */
  public async createAndInscribeProfile(
    profile: HCS11Profile,
    updateAccountMemo = true,
    options?: InscribeProfileOptions,
  ): Promise<InscribeProfileResponse> {
    const progressCallback = options?.progressCallback;
    const progressReporter = new ProgressReporter({
      module: 'HCS11-ProfileCreation',
      logger: this.logger,
      callback: progressCallback,
    });

    progressReporter.preparing('Starting profile creation process', 0);

    const inscriptionProgress = progressReporter.createSubProgress({
      minPercent: 0,
      maxPercent: 80,
      logPrefix: 'Inscription',
    });

    const inscriptionResult = await this.inscribeProfile(profile, {
      ...options,
      progressCallback: data => {
        inscriptionProgress.report({
          stage: data.stage,
          message: data.message,
          progressPercent: data.progressPercent,
          details: data.details,
        });
      },
    });

    if (!inscriptionResult?.success) {
      progressReporter.failed('Profile inscription failed', {
        error: inscriptionResult?.error,
      });
      return inscriptionResult;
    }

    progressReporter.confirming('Profile inscribed, updating account memo', 85);

    if (updateAccountMemo) {
      const memoResult = await this.updateAccountMemoWithProfile(
        this.auth.operatorId,
        inscriptionResult.profileTopicId,
      );

      if (!memoResult.success) {
        progressReporter.failed('Failed to update account memo', {
          error: memoResult?.error,
        });
        return {
          ...inscriptionResult,
          success: false,
          error: memoResult?.error,
        };
      }
    }

    progressReporter.completed('Profile creation completed successfully', {
      profileTopicId: inscriptionResult.profileTopicId,
      transactionId: inscriptionResult.transactionId,
    });

    return inscriptionResult;
  }

  /**
   * Gets the capabilities from the capability names.
   *
   * @param capabilityNames - The capability names to get the capabilities for.
   * @returns The capabilities.
   */
  public async getCapabilitiesFromTags(
    capabilityNames: string[],
  ): Promise<number[]> {
    const capabilities: number[] = [];

    if (capabilityNames.length === 0) {
      return [AIAgentCapability.TEXT_GENERATION];
    }

    for (const capabilityName of capabilityNames) {
      const capability =
        capabilityNameToCapabilityMap[capabilityName.toLowerCase()];
      if (capability !== undefined && !capabilities.includes(capability)) {
        capabilities.push(capability);
      }
    }

    if (capabilities.length === 0) {
      capabilities.push(AIAgentCapability.TEXT_GENERATION);
    }

    return capabilities;
  }

  /**
   * Gets the agent type from the metadata.
   *
   * @param metadata - The metadata of the agent.
   * @returns The agent type.
   */
  public getAgentTypeFromMetadata(metadata: AgentMetadata): AIAgentType {
    if (metadata.type === 'autonomous') {
      return AIAgentType.AUTONOMOUS;
    } else {
      return AIAgentType.MANUAL;
    }
  }

  /**
   * Fetches a profile from the account memo.
   *
   * @param accountId - The account ID of the agent to fetch the profile for.
   * @param network - The network to use for the fetch.
   * @returns A promise that resolves to the profile.
   */
  public async fetchProfileByAccountId(
    accountId: string | AccountId,
    network?: string,
  ): Promise<{
    success: boolean;
    profile?: HCS11Profile;
    error?: string;
    topicInfo?: TopicInfo;
  }> {
    try {
      this.logger.debug(
        `Fetching profile for account ${accountId.toString()} on ${this.network}`,
      );

      const memo = await this.mirrorNode.getAccountMemo(accountId.toString());

      this.logger.debug(`Got account memo: ${memo}`);

      if (!memo?.startsWith('hcs-11:')) {
        return {
          success: false,
          error: `Account ${accountId.toString()} does not have a valid HCS-11 memo. Current memo: ${memo || 'empty'}`,
        };
      }

      this.logger.debug(`Found HCS-11 memo: ${memo}`);

      const protocolReference = memo.substring(7);

      if (protocolReference?.startsWith('hcs://')) {
        const hcsFormat = protocolReference.match(/hcs:\/\/(\d+)\/(.+)/);

        if (!hcsFormat) {
          return {
            success: false,
            error: `Invalid HCS protocol reference format: ${protocolReference}`,
          };
        }

        const [_, protocolId, profileTopicId] = hcsFormat;
        const networkParam = network || this.network || 'mainnet';

        this.logger.debug(
          `Retrieving profile from Kiloscribe CDN: ${profileTopicId}`,
        );
        const cdnUrl = `https://kiloscribe.com/api/inscription-cdn/${profileTopicId}?network=${networkParam}`;

        try {
          const response = await fetch(cdnUrl);

          if (!response.ok) {
            return {
              success: false,
              error: `Failed to fetch profile from Kiloscribe CDN: ${response.statusText}`,
            };
          }

          const profileData = await response.json();

          if (!profileData) {
            return {
              success: false,
              error: `No profile data found for topic ${profileTopicId}`,
            };
          }

          const parsed = HCS11ProfileSchema.safeParse(profileData);
          if (!parsed.success) {
            return {
              success: false,
              error: `Invalid HCS-11 profile data for topic ${profileTopicId}`,
            };
          }

          return {
            success: true,
            profile: parsed.data as HCS11Profile,
            topicInfo: {
              inboundTopic: parsed.data.inboundTopicId || '',
              outboundTopic: parsed.data.outboundTopicId || '',
              profileTopicId,
            },
          };
        } catch (cdnError) {
          this.logger.error(
            `Error retrieving from Kiloscribe CDN: ${cdnError.message}`,
          );
          return {
            success: false,
            error: `Error retrieving from Kiloscribe CDN: ${cdnError.message}`,
          };
        }
      } else if (protocolReference.startsWith('ipfs://')) {
        this.logger.warn('IPFS protocol references are not fully supported');
        const response = await fetch(
          `https://ipfs.io/ipfs/${protocolReference.replace('ipfs://', '')}`,
        );
        const profileData = await response.json();
        const parsed = HCS11ProfileSchema.safeParse(profileData);
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid HCS-11 profile data from IPFS reference ${protocolReference}`,
          };
        }
        return {
          success: true,
          profile: parsed.data as HCS11Profile,
          topicInfo: {
            inboundTopic: parsed.data.inboundTopicId || '',
            outboundTopic: parsed.data.outboundTopicId || '',
            profileTopicId: '',
          },
        };
      } else if (protocolReference.startsWith('ar://')) {
        const arTxId = protocolReference.replace('ar://', '');
        const response = await fetch(`https://arweave.net/${arTxId}`);

        if (!response.ok) {
          return {
            success: false,
            error: `Failed to fetch profile from Arweave ${arTxId}: ${response.statusText}`,
          };
        }

        const profileData = await response.json();
        const parsed = HCS11ProfileSchema.safeParse(profileData);
        if (!parsed.success) {
          return {
            success: false,
            error: `Invalid HCS-11 profile data from Arweave reference ${arTxId}`,
          };
        }
        return {
          success: true,
          profile: parsed.data as HCS11Profile,
          topicInfo: {
            inboundTopic: parsed.data.inboundTopicId || '',
            outboundTopic: parsed.data.outboundTopicId || '',
            profileTopicId: '',
          },
        };
      } else {
        return {
          success: false,
          error: `Invalid protocol reference format: ${protocolReference}`,
        };
      }
    } catch (error) {
      this.logger.error(`Error fetching profile: ${error.message}`);
      return {
        success: false,
        error: `Error fetching profile: ${error.message}`,
      };
    }
  }
}
