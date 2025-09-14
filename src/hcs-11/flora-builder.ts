import { FloraProfile, FloraMember } from '../hcs-16/types';
import { ILogger, Logger } from '../utils/logger';
import { NetworkType } from '../utils/types';

/**
 * FloraBuilder is a builder class for creating Flora profile configurations.
 * It provides a fluent interface for setting various properties of the Flora.
 */
export class FloraBuilder {
  private config: Partial<FloraProfile> = {
    version: '1.0',
    type: 3,
  };
  private logger: ILogger;

  constructor() {
    this.logger = Logger.getInstance({
      module: 'FloraBuilder',
    });
  }

  setDisplayName(displayName: string): this {
    this.config.display_name = displayName;
    return this;
  }

  setBio(bio: string): this {
    this.config.bio = bio;
    return this;
  }

  setMembers(members: FloraMember[]): this {
    this.config.members = members;
    return this;
  }

  setThreshold(threshold: number): this {
    this.config.threshold = threshold;
    return this;
  }

  setTopics(topics: {
    communication: string;
    transaction: string;
    state: string;
  }): this {
    this.config.topics = topics;
    this.config.inboundTopicId = topics.communication;
    this.config.outboundTopicId = topics.transaction;
    return this;
  }

  setPolicies(policies?: Record<string, string>): this {
    this.config.policies = policies;
    return this;
  }

  setMetadata(metadata: Record<string, any>): this {
    this.config.metadata = metadata;
    return this;
  }

  addMetadata(key: string, value: any): this {
    if (!this.config.metadata) {
      this.config.metadata = {};
    }
    this.config.metadata[key] = value;
    return this;
  }

  build(): FloraProfile {
    if (!this.config.display_name) {
      throw new Error('Flora display name is required');
    }

    if (!this.config.members || this.config.members.length === 0) {
      throw new Error('Flora must have at least one member');
    }

    if (!this.config.threshold || this.config.threshold < 1) {
      throw new Error('Flora threshold must be at least 1');
    }

    if (this.config.threshold > this.config.members.length) {
      throw new Error('Flora threshold cannot exceed number of members');
    }

    if (!this.config.topics) {
      throw new Error('Flora topics are required');
    }

    if (!this.config.inboundTopicId || !this.config.outboundTopicId) {
      throw new Error('Flora inbound and outbound topic IDs are required');
    }

    return this.config as FloraProfile;
  }
}
