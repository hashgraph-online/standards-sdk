import { HCS11Profile, SocialLink, SocialPlatform } from './types';
import { Logger } from '../utils/logger';

export class PersonBuilder {
  private config: Partial<
    HCS11Profile & { pfpBuffer?: Buffer; pfpFileName?: string }
  > = {
    version: '1.0',
    type: 0,
  };
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance({
      module: 'PersonBuilder',
    });
  }

  setName(name: string): this {
    this.config.display_name = name;
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
    return this.setBio(description);
  }

  addSocial(platform: SocialPlatform, handle: string): this {
    if (!this.config.socials) {
      this.config.socials = [];
    }
    const existingSocial = this.config.socials.find(
      (s: SocialLink) => s.platform === platform,
    );
    if (!existingSocial) {
      this.config.socials.push({ platform, handle });
    } else {
      existingSocial.handle = handle;
    }
    return this;
  }

  setProfileImage(profileImage: string): this {
    this.config.profileImage = profileImage;
    return this;
  }

  setProfilePicture(pfpBuffer: Buffer, pfpFileName: string): this {
    this.config.pfpBuffer = pfpBuffer;
    this.config.pfpFileName = pfpFileName;
    return this;
  }

  setExistingProfilePicture(pfpTopicId: string): this {
    this.config.profileImage = `hcs://1/${pfpTopicId}`;
    return this;
  }

  addProperty(key: string, value: any): this {
    if (!this.config.properties) {
      this.config.properties = {};
    }
    this.config.properties[key] = value;
    return this;
  }

  setInboundTopicId(topicId: string): this {
    this.config.inboundTopicId = topicId;
    return this;
  }

  setOutboundTopicId(topicId: string): this {
    this.config.outboundTopicId = topicId;
    return this;
  }

  getProfilePicture(): { pfpBuffer?: Buffer; pfpFileName?: string } {
    return {
      pfpBuffer: this.config.pfpBuffer,
      pfpFileName: this.config.pfpFileName,
    };
  }

  build(): HCS11Profile & { pfpBuffer?: Buffer; pfpFileName?: string } {
    if (!this.config.display_name) {
      throw new Error('Display name is required for the profile');
    }

    if (!this.config.bio) {
      this.logger.warn('No bio provided for person profile');
    }

    if (!this.config.pfpBuffer && !this.config.profileImage) {
      this.logger.warn('No profile picture provided or referenced');
    }

    return {
      version: this.config.version!,
      type: 0,
      display_name: this.config.display_name,
      alias: this.config.alias,
      bio: this.config.bio,
      socials: this.config.socials,
      profileImage: this.config.profileImage,
      properties: this.config.properties,
      inboundTopicId: this.config.inboundTopicId,
      outboundTopicId: this.config.outboundTopicId,
      pfpBuffer: this.config.pfpBuffer,
      pfpFileName: this.config.pfpFileName,
    };
  }
}
