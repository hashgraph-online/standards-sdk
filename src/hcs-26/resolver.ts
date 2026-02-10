import { Logger, type ILogger } from '../utils/logger';
import { HederaMirrorNode } from '../services/mirror-node';
import { HRLResolver } from '../utils/hrl-resolver';
import type { MirrorNodeConfig } from '../services/mirror-node';
import { hash } from '../utils/crypto-abstraction';
import {
  hcs26DiscoveryRegisterSchema,
  hcs26DiscoveryRegisterLegacySchema,
  hcs26DiscoveryMetadataSchema,
  hcs26DiscoveryMetadataPatchSchema,
  hcs26DiscoveryUpdateSchema,
  hcs26DiscoveryUpdateLegacySchema,
  hcs26DiscoveryDeleteSchema,
  hcs26SkillManifestSchema,
  hcs26VersionRegisterSchema,
  hcs26VersionRegisterLegacySchema,
  hcs26VersionUpdateSchema,
  hcs26VersionDeleteSchema,
  type HCS26Network,
  type Hcs26DiscoveryRegister,
  type Hcs26DiscoveryRegisterLegacy,
  type Hcs26SkillManifest,
  type Hcs26VersionRegister,
  type Hcs26VersionRegisterLegacy,
  type Hcs26VersionUpdate,
} from './types';

type Hcs26ResolverDeps = {
  network: HCS26Network;
  logger?: ILogger;
  mirrorNode?: MirrorNodeConfig;
};

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
};

function parseSemver(versionRaw: string): ParsedSemver | null {
  const trimmed = versionRaw.trim().replace(/^v/i, '');
  const match = trimmed.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) {
    return null;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isFinite)) {
    return null;
  }

  const prereleaseRaw = match[4];
  const prerelease = prereleaseRaw
    ? prereleaseRaw.split('.').map(part => {
        if (/^(0|[1-9]\d*)$/.test(part)) {
          return Number(part);
        }
        return part;
      })
    : [];

  return { major, minor, patch, prerelease };
}

function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  const aHasPre = a.prerelease.length > 0;
  const bHasPre = b.prerelease.length > 0;
  if (!aHasPre && bHasPre) return 1;
  if (aHasPre && !bHasPre) return -1;
  if (!aHasPre && !bHasPre) return 0;

  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < len; index += 1) {
    const aId = a.prerelease[index];
    const bId = b.prerelease[index];
    if (aId === undefined && bId !== undefined) return -1;
    if (aId !== undefined && bId === undefined) return 1;
    if (aId === bId) continue;

    if (typeof aId === 'number' && typeof bId === 'number') {
      return aId - bId;
    }
    if (typeof aId === 'number' && typeof bId === 'string') {
      return -1;
    }
    if (typeof aId === 'string' && typeof bId === 'number') {
      return 1;
    }
    if (typeof aId === 'string' && typeof bId === 'string') {
      return aId < bId ? -1 : 1;
    }
  }

  return 0;
}

function isActiveStatus(
  status: (Hcs26VersionRegister | Hcs26VersionRegisterLegacy)['status'],
): boolean {
  return !status || status === 'active';
}

function normalizeUidString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${field} to be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }
  return trimmed;
}

type NormalizedDiscoveryRegister = {
  p: 'hcs-26';
  op: 'register';
  t_id: string;
  account_id: string;
  metadata: Record<string, unknown>;
  m?: string;
  sequence_number?: number;
};

type NormalizedDiscoveryRegisterRaw = Omit<
  NormalizedDiscoveryRegister,
  'metadata'
> & {
  metadata: Record<string, unknown> | string;
};

function mergeDiscoveryMetadata(
  base: Record<string, unknown>,
  update?: Record<string, unknown>,
): Record<string, unknown> {
  if (!update) {
    return base;
  }
  return { ...base, ...update };
}

function normalizeDiscoveryRegister(
  input: Hcs26DiscoveryRegister | Hcs26DiscoveryRegisterLegacy,
  messageSequenceNumber?: number,
): NormalizedDiscoveryRegisterRaw {
  const seq =
    typeof input.sequence_number === 'number'
      ? input.sequence_number
      : typeof messageSequenceNumber === 'number'
        ? messageSequenceNumber
        : undefined;

  if ('t_id' in input) {
    return {
      p: 'hcs-26',
      op: 'register',
      t_id: ensureNonEmptyString(input.t_id, 't_id'),
      account_id: ensureNonEmptyString(input.account_id, 'account_id'),
      metadata: input.metadata,
      ...(input.m ? { m: input.m } : {}),
      ...(typeof seq === 'number' ? { sequence_number: seq } : {}),
    };
  }

  return {
    p: 'hcs-26',
    op: 'register',
    t_id: ensureNonEmptyString(input.version_registry, 'version_registry'),
    account_id: ensureNonEmptyString(input.publisher, 'publisher'),
    metadata: input.metadata,
    ...(input.m ? { m: input.m } : {}),
    ...(typeof seq === 'number' ? { sequence_number: seq } : {}),
  };
}

function validateManifestPath(pathRaw: string): void {
  const path = pathRaw.trim();
  if (!path) {
    throw new Error('Manifest file path must be non-empty');
  }
  if (path.startsWith('/')) {
    throw new Error(`Manifest file path must be relative: ${path}`);
  }
  if (path.includes('\\')) {
    throw new Error(`Manifest file path must use "/" separators: ${path}`);
  }
  const segments = path.split('/');
  if (
    segments.some(
      segment => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error(
      `Manifest file path must be normalized (no '.', '..', or empty segments): ${path}`,
    );
  }
}

export class Hcs26SkillRegistryResolver {
  private readonly logger: ILogger;
  private readonly mirrorNode: HederaMirrorNode;
  private readonly hrlResolver: HRLResolver;
  private readonly network: HCS26Network;

  constructor(deps: Hcs26ResolverDeps) {
    this.network = deps.network;
    this.logger =
      deps.logger ??
      Logger.getInstance({
        module: 'HCS26Resolver',
        level: 'info',
      });
    this.mirrorNode = new HederaMirrorNode(
      deps.network,
      this.logger,
      deps.mirrorNode,
    );
    this.hrlResolver = new HRLResolver('warn');
  }

  private async resolveDiscoveryMetadataHrl(
    metadataHrl: string,
    mode: 'full' | 'patch',
  ): Promise<Record<string, unknown>> {
    const resolved = await this.hrlResolver.resolve(metadataHrl, {
      network: this.network,
      returnRaw: true,
    });

    const bytes =
      resolved.content instanceof ArrayBuffer
        ? Buffer.from(resolved.content)
        : Buffer.from(String(resolved.content), 'utf8');

    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error('Discovery metadata HRL content is not valid JSON');
    }

    const schema =
      mode === 'full'
        ? hcs26DiscoveryMetadataSchema
        : hcs26DiscoveryMetadataPatchSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid discovery metadata: ${parsed.error.message}`);
    }
    return this.normalizeDiscoveryMetadataObject(
      parsed.data as unknown as Record<string, unknown>,
    );
  }

  private normalizeDiscoveryMetadataObject(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      typeof metadata.icon !== 'string' ||
      metadata.icon.trim().length === 0
    ) {
      const iconLegacy = metadata.icon_hcs1;
      if (typeof iconLegacy === 'string' && iconLegacy.trim().length > 0) {
        return { ...metadata, icon: iconLegacy };
      }
    }
    return metadata;
  }

  private async resolveDiscoveryMetadataUri(
    metadataUri: string,
    mode: 'full' | 'patch',
  ): Promise<Record<string, unknown>> {
    const trimmed = metadataUri.trim();
    if (trimmed.startsWith('hcs://1/')) {
      return this.resolveDiscoveryMetadataHrl(trimmed, mode);
    }
    throw new Error(`Unsupported discovery metadata URI: ${trimmed}`);
  }

  private resolveDiscoveryMetadataObject(params: {
    metadata: unknown;
    mode: 'full' | 'patch';
  }): Promise<Record<string, unknown>> {
    if (typeof params.metadata === 'string') {
      return this.resolveDiscoveryMetadataUri(params.metadata, params.mode);
    }

    const schema =
      params.mode === 'full'
        ? hcs26DiscoveryMetadataSchema
        : hcs26DiscoveryMetadataPatchSchema;
    const parsed = schema.safeParse(params.metadata);
    if (!parsed.success) {
      throw new Error(`Invalid discovery metadata: ${parsed.error.message}`);
    }
    return Promise.resolve(
      this.normalizeDiscoveryMetadataObject(
        parsed.data as unknown as Record<string, unknown>,
      ),
    );
  }

  async getDiscoveryRegister(params: {
    directoryTopicId: string;
    skillUid: number;
  }): Promise<NormalizedDiscoveryRegister | null> {
    const messages = await this.mirrorNode.getTopicMessages(
      params.directoryTopicId,
      {
        sequenceNumber: `eq:${params.skillUid}`,
        limit: 5,
        order: 'asc',
      },
    );

    for (const message of messages) {
      const parsedNew = hcs26DiscoveryRegisterSchema.safeParse(message);
      const parsedLegacy = parsedNew.success
        ? null
        : hcs26DiscoveryRegisterLegacySchema.safeParse(message);
      const parsed = parsedNew.success
        ? parsedNew
        : parsedLegacy && parsedLegacy.success
          ? parsedLegacy
          : null;
      if (!parsed) {
        continue;
      }

      const normalized = normalizeDiscoveryRegister(
        parsed.data as Hcs26DiscoveryRegister | Hcs26DiscoveryRegisterLegacy,
        message.sequence_number,
      );
      const seq = normalized.sequence_number;
      if (typeof seq === 'number' && seq === params.skillUid) {
        const metadata = await this.resolveDiscoveryMetadataObject({
          metadata: normalized.metadata,
          mode: 'full',
        });
        return { ...normalized, metadata };
      }
    }

    return null;
  }

  async resolveDiscoveryRecord(params: {
    directoryTopicId: string;
    skillUid: number;
    scanLimit?: number;
  }): Promise<NormalizedDiscoveryRegister | null> {
    const register = await this.getDiscoveryRegister({
      directoryTopicId: params.directoryTopicId,
      skillUid: params.skillUid,
    });
    if (!register) {
      return null;
    }

    const scanLimit =
      typeof params.scanLimit === 'number' && params.scanLimit > 0
        ? Math.min(5000, Math.floor(params.scanLimit))
        : 1000;

    const messages = await this.mirrorNode.getTopicMessages(
      params.directoryTopicId,
      {
        limit: scanLimit,
        order: 'asc',
      },
    );

    const uid = String(params.skillUid);

    let current: NormalizedDiscoveryRegister = register;
    for (const message of messages) {
      const deleteParsed = hcs26DiscoveryDeleteSchema.safeParse(message);
      if (deleteParsed.success && deleteParsed.data.uid === uid) {
        return null;
      }

      const updateParsedNew = hcs26DiscoveryUpdateSchema.safeParse(message);
      const updateParsedLegacy = updateParsedNew.success
        ? null
        : hcs26DiscoveryUpdateLegacySchema.safeParse(message);
      const updateParsed = updateParsedNew.success
        ? updateParsedNew
        : updateParsedLegacy && updateParsedLegacy.success
          ? updateParsedLegacy
          : null;
      if (!updateParsed || updateParsed.data.uid !== uid) {
        continue;
      }

      const nextAccountId =
        'account_id' in updateParsed.data
          ? normalizeUidString(updateParsed.data.account_id)
          : normalizeUidString(updateParsed.data.publisher);
      const nextMetadataRaw = updateParsed.data.metadata;
      const nextMetadata =
        nextMetadataRaw !== undefined
          ? await this.resolveDiscoveryMetadataObject({
              metadata: nextMetadataRaw,
              mode: 'patch',
            })
          : undefined;
      current = {
        ...current,
        ...(nextAccountId ? { account_id: nextAccountId } : {}),
        metadata: mergeDiscoveryMetadata(current.metadata, nextMetadata),
      };
    }

    return current;
  }

  async listVersionRegisters(params: {
    versionRegistryTopicId: string;
    skillUid: number;
    limit?: number;
  }): Promise<Array<Hcs26VersionRegister | Hcs26VersionRegisterLegacy>> {
    const limit =
      typeof params.limit === 'number' && params.limit > 0
        ? Math.min(1000, params.limit)
        : 500;
    const messages = await this.mirrorNode.getTopicMessages(
      params.versionRegistryTopicId,
      {
        limit,
        order: 'desc',
      },
    );

    const registersByUid = new Map<
      string,
      Hcs26VersionRegister | Hcs26VersionRegisterLegacy
    >();
    const updatesByUid = new Map<string, Hcs26VersionUpdate[]>();
    const deletedUids = new Set<string>();

    for (const message of messages) {
      const parsedNew = hcs26VersionRegisterSchema.safeParse(message);
      const parsedLegacy = parsedNew.success
        ? null
        : hcs26VersionRegisterLegacySchema.safeParse(message);
      const registerParsed = parsedNew.success
        ? parsedNew
        : parsedLegacy && parsedLegacy.success
          ? parsedLegacy
          : null;

      if (registerParsed) {
        if (registerParsed.data.skill_uid !== params.skillUid) {
          continue;
        }
        const uid =
          typeof registerParsed.data.sequence_number === 'number'
            ? String(registerParsed.data.sequence_number)
            : typeof message.sequence_number === 'number'
              ? String(message.sequence_number)
              : null;
        if (uid) {
          registersByUid.set(
            uid,
            registerParsed.data as
              | Hcs26VersionRegister
              | Hcs26VersionRegisterLegacy,
          );
        }
        continue;
      }

      const updateParsed = hcs26VersionUpdateSchema.safeParse(message);
      if (updateParsed.success) {
        const uid = updateParsed.data.uid.trim();
        const list = updatesByUid.get(uid) ?? [];
        list.push(updateParsed.data);
        updatesByUid.set(uid, list);
        continue;
      }

      const deleteParsed = hcs26VersionDeleteSchema.safeParse(message);
      if (deleteParsed.success) {
        deletedUids.add(deleteParsed.data.uid.trim());
      }
    }

    const entries: Array<Hcs26VersionRegister | Hcs26VersionRegisterLegacy> =
      [];
    for (const [uid, register] of registersByUid.entries()) {
      if (deletedUids.has(uid)) {
        continue;
      }

      const updates = updatesByUid.get(uid);
      if (!updates || updates.length === 0) {
        entries.push(register);
        continue;
      }

      const sorted = [...updates].sort((a, b) => {
        const aSeq =
          typeof a.sequence_number === 'number' ? a.sequence_number : 0;
        const bSeq =
          typeof b.sequence_number === 'number' ? b.sequence_number : 0;
        return aSeq - bSeq;
      });
      const final = sorted.reduce<
        Hcs26VersionRegister | Hcs26VersionRegisterLegacy
      >((acc, update) => {
        if (update.status) {
          return { ...acc, status: update.status };
        }
        return acc;
      }, register);
      entries.push(final);
    }

    return entries;
  }

  async getLatestVersionRegister(params: {
    versionRegistryTopicId: string;
    skillUid: number;
  }): Promise<(Hcs26VersionRegister | Hcs26VersionRegisterLegacy) | null> {
    const entries = await this.listVersionRegisters({
      versionRegistryTopicId: params.versionRegistryTopicId,
      skillUid: params.skillUid,
      limit: 100,
    });
    const active = entries.filter(entry => isActiveStatus(entry.status));
    if (active.length === 0) {
      return null;
    }

    let best = active[0];
    let bestParsed = parseSemver(best.version);

    for (let index = 1; index < active.length; index += 1) {
      const candidate = active[index];
      const candidateParsed = parseSemver(candidate.version);

      if (!bestParsed && candidateParsed) {
        best = candidate;
        bestParsed = candidateParsed;
        continue;
      }

      if (bestParsed && candidateParsed) {
        const cmp = compareSemver(candidateParsed, bestParsed);
        if (cmp > 0) {
          best = candidate;
          bestParsed = candidateParsed;
          continue;
        }

        if (cmp === 0) {
          const bestSeq =
            typeof best.sequence_number === 'number' ? best.sequence_number : 0;
          const candSeq =
            typeof candidate.sequence_number === 'number'
              ? candidate.sequence_number
              : 0;
          if (candSeq > bestSeq) {
            best = candidate;
            bestParsed = candidateParsed;
          }
        }
      }
    }

    return best;
  }

  async resolveManifest(params: {
    manifestHrl?: string;
    manifestTopicId?: string;
  }): Promise<{
    manifest: Hcs26SkillManifest;
    raw: unknown;
    sha256Hex: string;
  }> {
    const manifestHrl =
      typeof params.manifestHrl === 'string' &&
      params.manifestHrl.trim().length > 0
        ? params.manifestHrl.trim()
        : typeof params.manifestTopicId === 'string' &&
            params.manifestTopicId.trim().length > 0
          ? `hcs://1/${params.manifestTopicId.trim()}`
          : null;
    if (!manifestHrl) {
      throw new Error('Manifest HRL or topic id is required');
    }

    const resolved = await this.hrlResolver.resolve(manifestHrl, {
      network: this.network,
      returnRaw: true,
    });

    const contentType = resolved.contentType ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      throw new Error(
        `Expected application/json for manifest, got ${resolved.contentType ?? 'unknown'}`,
      );
    }

    const bytes =
      resolved.content instanceof ArrayBuffer
        ? Buffer.from(resolved.content)
        : Buffer.from(String(resolved.content), 'utf8');

    const sha256Hex = await hash(bytes, 'sha256');

    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error('Manifest content is not valid JSON');
    }

    const parsed = hcs26SkillManifestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid HCS-26 manifest: ${parsed.error.message}`);
    }

    for (const file of parsed.data.files) {
      validateManifestPath(file.path);
    }

    const hasSkillMd = parsed.data.files.some(file => file.path === 'SKILL.md');
    if (!hasSkillMd) {
      throw new Error(
        'HCS-26 manifest must include SKILL.md at path "SKILL.md"',
      );
    }

    return { manifest: parsed.data, raw, sha256Hex };
  }

  async verifyVersionRegisterMatchesManifest(params: {
    versionRegister: Hcs26VersionRegister | Hcs26VersionRegisterLegacy;
    manifestSha256Hex: string;
  }): Promise<void> {
    const checksumRaw = params.versionRegister.checksum;
    if (!checksumRaw) {
      this.logger.warn(
        'HCS-26 version register is missing checksum; skipping manifest verification.',
      );
      return;
    }

    const checksum = checksumRaw.trim();
    if (!checksum.startsWith('sha256:')) {
      throw new Error(`Unsupported checksum: ${checksum}`);
    }
    const expectedHex = checksum.slice('sha256:'.length);
    if (params.manifestSha256Hex !== expectedHex) {
      throw new Error(
        `Manifest checksum mismatch (expected ${expectedHex}, got ${params.manifestSha256Hex})`,
      );
    }
  }
}
