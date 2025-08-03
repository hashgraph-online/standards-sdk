import {
  InboundTopicType,
  AgentConfiguration,
  AgentMetadata,
  AIAgentCapability,
  SocialPlatform,
} from './types';
import { Logger , ILogger } from '../utils/logger';
import { FeeConfigBuilderInterface } from '../fees';
import { NetworkType } from '../utils/types';

/**
 * AgentBuilder is a builder class for creating agent configurations.
 * It provides a fluent interface for setting various properties of the agent.
 *
 * Example usage:
 * ```typescript
 * const agentBuilder = new AgentBuilder();
 * agentBuilder.setName('My Agent');
 * agentBuilder.setDescription('This is my agent');
 * agentBuilder.setCapabilities([AIAgentCapability.CREATE_CONTENT]);
 * agentBuilder.setModel('gpt-4o');
 * agentBuilder.setCreator('John Doe');
 * agentBuilder.addSocial('twitter', 'JohnDoe');
 * agentBuilder.addProperty('key', 'value');
 * const agentConfig = agentBuilder.build();
 * ```
 *
 */
export class AgentBuilder {
  private config: Partial<AgentConfiguration> = {};
  private logger: ILogger;

  constructor() {
    this.logger = Logger.getInstance({
      module: 'AgentBuilder',
    });
  }

  setName(name: string): this {
    this.config.name = name;
    return this;
  }

  setAlias(alias: string): this {
    this.config.alias = alias;
    return this;
  }

  setBio(bio: string): this {
    this.config.bio = bio;
    return this;
  }

  /**
   * @deprecated Use setBio instead
   */
  setDescription(description: string): this {
    this.config.bio = description;
    return this;
  }

  setCapabilities(capabilities: AIAgentCapability[]): this {
    this.config.capabilities = capabilities;
    return this;
  }

  /**
   * @deprecated Use setType instead
   */
  setAgentType(type: 'autonomous' | 'manual'): this {
    if (!this.config.metadata) {
      this.config.metadata = { type };
    } else {
      this.config.metadata.type = type;
    }
    return this;
  }

  setType(type: 'autonomous' | 'manual'): this {
    if (!this.config.metadata) {
      this.config.metadata = { type };
    } else {
      this.config.metadata.type = type;
    }
    return this;
  }

  setModel(model: string): this {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'manual' };
    }
    this.config.metadata.model = model;
    return this;
  }

  setCreator(creator: string): this {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'manual' };
    }
    this.config.metadata.creator = creator;
    return this;
  }

  addSocial(platform: SocialPlatform, handle: string): this {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'manual' };
    }
    if (!this.config.metadata.socials) {
      this.config.metadata.socials = {};
    }
    this.config.metadata.socials[platform] = handle;
    return this;
  }

  addProperty(key: string, value: any): this {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'manual' };
    }
    if (!this.config.metadata.properties) {
      this.config.metadata.properties = {};
    }
    this.config.metadata.properties[key] = value;
    return this;
  }

  setMetadata(metadata: AgentMetadata): this {
    this.config.metadata = metadata;
    return this;
  }

  setProfilePicture(pfpBuffer: Buffer, pfpFileName: string): this {
    this.config.pfpBuffer = pfpBuffer;
    this.config.pfpFileName = pfpFileName;
    return this;
  }

  setExistingProfilePicture(pfpTopicId: string): this {
    this.config.existingPfpTopicId = pfpTopicId;
    return this;
  }

  setNetwork(network: NetworkType): this {
    this.config.network = network;
    return this;
  }

  setInboundTopicType(inboundTopicType: InboundTopicType): this {
    this.config.inboundTopicType = inboundTopicType;
    return this;
  }

  setFeeConfig(feeConfigBuilder: FeeConfigBuilderInterface): this {
    this.config.feeConfig = feeConfigBuilder;
    return this;
  }

  setConnectionFeeConfig(feeConfigBuilder: FeeConfigBuilderInterface): this {
    this.config.connectionFeeConfig = feeConfigBuilder;
    return this;
  }

  setExistingAccount(accountId: string, privateKey: string): this {
    this.config.existingAccount = { accountId, privateKey };
    return this;
  }

  setInboundTopicId(inboundTopicId: string): this {
    this.config.inboundTopicId = inboundTopicId;
    return this;
  }

  setOutboundTopicId(outboundTopicId: string): this {
    this.config.outboundTopicId = outboundTopicId;
    return this;
  }

  build(): AgentConfiguration {
    if (!this.config.name) {
      throw new Error('Agent display name is required');
    }

    if (!this.config.bio) {
      this.logger?.warn('Agent description is not set');
    }

    if (!this.config.pfpBuffer && !this.config.existingPfpTopicId) {
      this.logger.warn('No profile picture provided or referenced.');
    }

    if (!this.config.network) {
      throw new Error('Network is required');
    }

    if (!this.config.inboundTopicType) {
      this.config.inboundTopicType = InboundTopicType.PUBLIC;
    }

    if (!this.config.capabilities) {
      this.config.capabilities = [];
    }

    if (!this.config.metadata) {
      this.config.metadata = { type: 'manual' };
    } else if (!this.config.metadata.type) {
      this.config.metadata.type = 'manual';
    }

    if (
      this.config.inboundTopicType === InboundTopicType.FEE_BASED &&
      !this.config.feeConfig
    ) {
      throw new Error('Fee configuration is required for fee-based topics');
    }

    return this.config as AgentConfiguration;
  }
}
