import {
  InboundTopicType,
  NetworkType,
  FeeConfigBuilderInterface,
  AgentConfiguration,
  AgentCreationState
} from './types';
import { AIAgentCapability } from '../hcs-11';
import { AgentMetadata } from './types';

type SocialPlatform =
  | 'twitter'
  | 'discord'
  | 'github'
  | 'website'
  | 'x'
  | 'linkedin'
  | 'youtube'
  | 'telegram';

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

  setName(name: string): AgentBuilder {
    this.config.name = name;
    return this;
  }

  setDescription(description: string): AgentBuilder {
    this.config.description = description;
    return this;
  }

  setCapabilities(capabilities: AIAgentCapability[]): AgentBuilder {
    this.config.capabilities = capabilities;
    return this;
  }

  setAgentType(type: 'autonomous' | 'manual'): AgentBuilder {
    if (!this.config.metadata) {
      this.config.metadata = { type };
    } else {
      this.config.metadata.type = type;
    }
    return this;
  }

  setModel(model: string): AgentBuilder {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'autonomous', model };
    } else {
      this.config.metadata.model = model;
    }
    return this;
  }

  setCreator(creator: string): AgentBuilder {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'autonomous', creator };
    } else {
      this.config.metadata.creator = creator;
    }
    return this;
  }

  addSocial(platform: SocialPlatform, handle: string): AgentBuilder {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'autonomous', socials: {} };
    } else if (!this.config.metadata.socials) {
      this.config.metadata.socials = {};
    }

    this.config.metadata.socials[platform] = handle;
    return this;
  }

  addProperty(key: string, value: any): AgentBuilder {
    if (!this.config.metadata) {
      this.config.metadata = { type: 'autonomous', properties: {} };
    } else if (!this.config.metadata.properties) {
      this.config.metadata.properties = {};
    }

    this.config.metadata.properties[key] = value;
    return this;
  }

  setMetadata(metadata: AgentMetadata): AgentBuilder {
    this.config.metadata = metadata;
    return this;
  }

  setProfilePicture(pfpBuffer: Buffer, pfpFileName: string): AgentBuilder {
    this.config.pfpBuffer = pfpBuffer;
    this.config.pfpFileName = pfpFileName;
    return this;
  }

  setExistingProfilePicture(pfpTopicId: string): AgentBuilder {
    this.config.existingPfpTopicId = pfpTopicId;
    return this;
  }

  setNetwork(network: NetworkType): AgentBuilder {
    this.config.network = network;
    return this;
  }

  setInboundTopicType(inboundTopicType: InboundTopicType): AgentBuilder {
    this.config.inboundTopicType = inboundTopicType;
    return this;
  }

  setFeeConfig(feeConfigBuilder: FeeConfigBuilderInterface): AgentBuilder {
    this.config.feeConfig = feeConfigBuilder;
    return this;
  }

  setConnectionFeeConfig(
    feeConfigBuilder: FeeConfigBuilderInterface
  ): AgentBuilder {
    this.config.connectionFeeConfig = feeConfigBuilder;
    return this;
  }

  setExistingAccount(accountId: string, privateKey: string): AgentBuilder {
    this.config.existingAccount = { accountId, privateKey };
    return this;
  }

  build(): AgentConfiguration {
    if (!this.config.name) {
      throw new Error('Agent name is required');
    }

    if (!this.config.description) {
      throw new Error('Agent description is required');
    }

    if (!this.config.pfpBuffer || !this.config.pfpFileName) {
      throw new Error('Profile picture is required');
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
      this.config.metadata = { type: 'autonomous' };
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
