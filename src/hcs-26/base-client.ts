import type { ILogger } from '../utils/logger';
import { Logger } from '../utils/logger';
import type { NetworkType } from '../utils/types';
import type { MirrorNodeConfig } from '../services/mirror-node';
import { Hcs26SkillRegistryResolver } from './resolver';
import type {
  Hcs26SkillManifest,
  Hcs26VersionRegister,
  Hcs26VersionRegisterLegacy,
} from './types';

export type HCS26SkillVerificationStatus = {
  name: string;
  verified: boolean;
  previouslyVerified: boolean;
  pendingRequest?: unknown;
};

export interface HCS26SkillVerificationProvider {
  getSkillVerificationStatus(params: {
    name: string;
  }): Promise<HCS26SkillVerificationStatus | null>;
}

export interface HCS26ClientConfig {
  network: NetworkType;
  logger?: ILogger;
  mirrorNode?: MirrorNodeConfig;
  verificationProvider?: HCS26SkillVerificationProvider;
}

export type HCS26DiscoveryRecord = {
  p: 'hcs-26';
  op: 'register';
  t_id: string;
  account_id: string;
  metadata: Record<string, unknown>;
  m?: string;
  sequence_number?: number;
};

export type HCS26ResolvedSkill = {
  directoryTopicId: string;
  skillUid: number;
  discovery: HCS26DiscoveryRecord;
  versionRegistryTopicId: string;
  latestVersion:
    | (Hcs26VersionRegister & { sequence_number?: number })
    | (Hcs26VersionRegisterLegacy & { sequence_number?: number });
  manifest: Hcs26SkillManifest;
  manifestSha256Hex: string;
  verification?: HCS26SkillVerificationStatus | null;
};

export type HCS26ResolvedSkillVersion = Omit<
  HCS26ResolvedSkill,
  'latestVersion'
> & {
  versionEntry:
    | (Hcs26VersionRegister & { sequence_number?: number })
    | (Hcs26VersionRegisterLegacy & { sequence_number?: number });
};

function getManifestTopicId(
  entry: Hcs26VersionRegister | Hcs26VersionRegisterLegacy,
): string {
  const topicIdCandidate = (entry as { t_id?: unknown }).t_id;
  if (typeof topicIdCandidate === 'string' && topicIdCandidate.trim()) {
    return topicIdCandidate.trim();
  }

  const hrlCandidate = (entry as { manifest_hcs1?: unknown }).manifest_hcs1;
  if (typeof hrlCandidate !== 'string' || !hrlCandidate.trim()) {
    throw new Error('Missing manifest reference in version register entry');
  }

  const hrl = hrlCandidate.trim();
  const prefix = 'hcs://1/';
  if (!hrl.startsWith(prefix)) {
    throw new Error(`Invalid manifest HRL: ${hrl}`);
  }
  return hrl.slice(prefix.length);
}

export class HCS26BaseClient {
  protected readonly network: NetworkType;
  protected readonly logger: ILogger;
  protected readonly resolver: Hcs26SkillRegistryResolver;
  protected readonly verificationProvider?: HCS26SkillVerificationProvider;

  constructor(config: HCS26ClientConfig) {
    this.network = config.network;
    this.logger =
      config.logger ??
      Logger.getInstance({
        module: 'HCS26Client',
        level: 'info',
      });
    this.verificationProvider = config.verificationProvider;

    this.resolver = new Hcs26SkillRegistryResolver({
      network: this.network,
      logger: this.logger,
      mirrorNode: config.mirrorNode,
    });
  }

  async resolveSkill(params: {
    directoryTopicId: string;
    skillUid: number;
    discoveryScanLimit?: number;
    includeVerification?: boolean;
  }): Promise<HCS26ResolvedSkill | null> {
    const discovery = (await this.resolver.resolveDiscoveryRecord({
      directoryTopicId: params.directoryTopicId,
      skillUid: params.skillUid,
      scanLimit: params.discoveryScanLimit,
    })) as HCS26DiscoveryRecord | null;

    if (!discovery) {
      return null;
    }

    const versionRegistryTopicId = discovery.t_id;
    const latestVersion = await this.resolver.getLatestVersionRegister({
      versionRegistryTopicId,
      skillUid: params.skillUid,
    });

    if (!latestVersion) {
      throw new Error(
        `No active version entries found for skill ${params.skillUid} in version registry ${versionRegistryTopicId}`,
      );
    }

    const manifestTopicId = getManifestTopicId(latestVersion);
    const { manifest, sha256Hex } = await this.resolver.resolveManifest({
      manifestTopicId,
    });

    await this.resolver.verifyVersionRegisterMatchesManifest({
      versionRegister: latestVersion,
      manifestSha256Hex: sha256Hex,
    });

    let verification: HCS26SkillVerificationStatus | null | undefined;
    const provider = this.verificationProvider;
    const includeVerification = params.includeVerification === true;
    const name =
      typeof discovery.metadata?.name === 'string'
        ? discovery.metadata.name.trim()
        : '';

    if (includeVerification && provider && name) {
      try {
        verification = await provider.getSkillVerificationStatus({ name });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to resolve verification status for skill "${name}": ${detail}`,
        );
        verification = null;
      }
    }

    return {
      directoryTopicId: params.directoryTopicId,
      skillUid: params.skillUid,
      discovery,
      versionRegistryTopicId,
      latestVersion,
      manifest,
      manifestSha256Hex: sha256Hex,
      ...(includeVerification ? { verification } : {}),
    };
  }

  async listSkillVersions(params: {
    directoryTopicId: string;
    skillUid: number;
    discoveryScanLimit?: number;
    limit?: number;
  }): Promise<
    Array<
      | (Hcs26VersionRegister & { sequence_number?: number })
      | (Hcs26VersionRegisterLegacy & { sequence_number?: number })
    >
  > {
    const discovery = (await this.resolver.resolveDiscoveryRecord({
      directoryTopicId: params.directoryTopicId,
      skillUid: params.skillUid,
      scanLimit: params.discoveryScanLimit,
    })) as HCS26DiscoveryRecord | null;

    if (!discovery) {
      return [];
    }

    const versionRegistryTopicId = discovery.t_id;
    return this.resolver.listVersionRegisters({
      versionRegistryTopicId,
      skillUid: params.skillUid,
      limit: params.limit,
    });
  }

  async resolveSkillVersion(params: {
    directoryTopicId: string;
    skillUid: number;
    version: string;
    discoveryScanLimit?: number;
    includeVerification?: boolean;
  }): Promise<HCS26ResolvedSkillVersion | null> {
    const versionRaw = params.version.trim();
    if (!versionRaw) {
      throw new Error('version is required');
    }

    const discovery = (await this.resolver.resolveDiscoveryRecord({
      directoryTopicId: params.directoryTopicId,
      skillUid: params.skillUid,
      scanLimit: params.discoveryScanLimit,
    })) as HCS26DiscoveryRecord | null;

    if (!discovery) {
      return null;
    }

    const versionRegistryTopicId = discovery.t_id;
    const entries = await this.resolver.listVersionRegisters({
      versionRegistryTopicId,
      skillUid: params.skillUid,
      limit: 250,
    });

    const target = entries.find(entry => entry.version.trim() === versionRaw);
    if (!target) {
      return null;
    }

    const manifestTopicId = getManifestTopicId(target);
    const { manifest, sha256Hex } = await this.resolver.resolveManifest({
      manifestTopicId,
    });

    await this.resolver.verifyVersionRegisterMatchesManifest({
      versionRegister: target,
      manifestSha256Hex: sha256Hex,
    });

    let verification: HCS26SkillVerificationStatus | null | undefined;
    const provider = this.verificationProvider;
    const includeVerification = params.includeVerification === true;
    const name =
      typeof discovery.metadata?.name === 'string'
        ? discovery.metadata.name.trim()
        : '';

    if (includeVerification && provider && name) {
      try {
        verification = await provider.getSkillVerificationStatus({ name });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to resolve verification status for skill "${name}": ${detail}`,
        );
        verification = null;
      }
    }

    return {
      directoryTopicId: params.directoryTopicId,
      skillUid: params.skillUid,
      discovery,
      versionRegistryTopicId,
      versionEntry: target,
      manifest,
      manifestSha256Hex: sha256Hex,
      ...(includeVerification ? { verification } : {}),
    };
  }
}
