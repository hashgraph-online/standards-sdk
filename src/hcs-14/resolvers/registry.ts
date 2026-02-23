/**
 * Resolver registry for HCS-14.
 */

import {
  DidDocumentMinimal,
  DidProfileResolver,
  DidProfileResolverContext,
  DidResolutionProfile,
  DidResolver,
  ResolverAdapter,
  ResolverAdapterFilterOptions,
  ResolverAdapterRecord,
  UaidProfileResolver,
  UaidProfileResolverContext,
  isDidProfileResolverAdapter,
  isDidResolverAdapter,
  isUaidProfileResolverAdapter,
} from './types';
import { HieroDidResolver } from './hiero';
import { parseHcs14Did } from '../did';
import { multibaseB58btcDecode } from '../base58';
import type { ParsedHcs14Did } from '../types';

interface ResolveUaidProfileInternalOptions {
  profileId?: string;
  excludeProfileId?: string;
}

export interface ResolveUaidProfileOptions {
  profileId?: string;
}

export class ResolverRegistry {
  private resolvers: DidResolver[] = [];
  private profileResolvers: DidProfileResolver[] = [];
  private uaidProfileResolvers: UaidProfileResolver[] = [];
  private adapters: ResolverAdapterRecord[] = [];

  private supportsDidMethod(
    didMethods: string[] | undefined,
    method: string,
  ): boolean {
    return (
      !!didMethods && (didMethods.includes(method) || didMethods.includes('*'))
    );
  }

  private addDidResolver(adapter: DidResolver): void {
    this.resolvers.push(adapter);
    this.adapters.push({
      capability: 'did-resolver',
      adapter,
    });
  }

  private addDidProfileResolver(adapter: DidProfileResolver): void {
    this.profileResolvers.push(adapter);
    this.adapters.push({
      capability: 'did-profile-resolver',
      adapter,
    });
  }

  private addUaidProfileResolver(adapter: UaidProfileResolver): void {
    this.uaidProfileResolvers.push(adapter);
    this.adapters.push({
      capability: 'uaid-profile-resolver',
      adapter,
    });
  }

  registerAdapter(adapter: ResolverAdapter): void {
    const isUaidProfile = isUaidProfileResolverAdapter(adapter);
    const isDidProfile = isDidProfileResolverAdapter(adapter);
    const isDid = isDidResolverAdapter(adapter);
    const capabilityMatchCount = [isUaidProfile, isDidProfile, isDid].filter(
      Boolean,
    ).length;

    if (capabilityMatchCount > 1) {
      throw new Error(
        'Adapter matches multiple resolver capabilities. Use an explicit deprecated register method for compatibility.',
      );
    }

    if (isUaidProfile) {
      this.addUaidProfileResolver(adapter);
      return;
    }
    if (isDidProfile) {
      this.addDidProfileResolver(adapter);
      return;
    }
    if (isDid) {
      this.addDidResolver(adapter);
      return;
    }
    throw new Error('Adapter does not match a supported resolver capability.');
  }

  listAdapters(): ResolverAdapterRecord[] {
    return [...this.adapters];
  }

  filterAdapters(
    options: ResolverAdapterFilterOptions = {},
  ): ResolverAdapterRecord[] {
    if (
      options.profileId !== undefined &&
      options.capability !== undefined &&
      options.capability !== 'uaid-profile-resolver'
    ) {
      throw new Error(
        'profileId filter requires capability "uaid-profile-resolver".',
      );
    }

    return this.adapters.filter(record => {
      if (
        options.capability !== undefined &&
        record.capability !== options.capability
      ) {
        return false;
      }
      if (
        options.didMethod !== undefined &&
        !this.supportsDidMethod(
          record.adapter.meta?.didMethods,
          options.didMethod,
        )
      ) {
        return false;
      }
      if (options.profileId !== undefined) {
        if (!isUaidProfileResolverAdapter(record.adapter)) {
          return false;
        }
        if (record.adapter.profile !== options.profileId) {
          return false;
        }
      }
      return true;
    });
  }

  /** @deprecated Use registerAdapter() instead. */
  register(resolver: DidResolver): void {
    this.addDidResolver(resolver);
  }

  /** @deprecated Use registerAdapter() instead. */
  registerProfileResolver(resolver: DidProfileResolver): void {
    this.addDidProfileResolver(resolver);
  }

  /** @deprecated Use registerAdapter() instead. */
  registerUaidProfileResolver(resolver: UaidProfileResolver): void {
    this.addUaidProfileResolver(resolver);
  }

  /** @deprecated Use filterAdapters({ capability: 'did-resolver' }) instead. */
  list(): DidResolver[] {
    return [...this.resolvers];
  }

  /** @deprecated Use filterAdapters({ capability: 'did-profile-resolver' }) instead. */
  listProfileResolvers(): DidProfileResolver[] {
    return [...this.profileResolvers];
  }

  /** @deprecated Use filterAdapters({ capability: 'uaid-profile-resolver' }) instead. */
  listUaidProfileResolvers(): UaidProfileResolver[] {
    return [...this.uaidProfileResolvers];
  }

  /** @deprecated Use filterAdapters({ capability: 'did-resolver', didMethod }) instead. */
  filterByDidMethod(method: string): DidResolver[] {
    return this.resolvers.filter(resolver => {
      return this.supportsDidMethod(resolver.meta?.didMethods, method);
    });
  }

  /** @deprecated Use filterAdapters({ capability: 'did-profile-resolver', didMethod }) instead. */
  filterProfileResolversByDidMethod(method: string): DidProfileResolver[] {
    return this.profileResolvers.filter(resolver => {
      return this.supportsDidMethod(resolver.meta?.didMethods, method);
    });
  }

  /** @deprecated Use filterAdapters({ capability: 'uaid-profile-resolver', didMethod }) instead. */
  filterUaidProfileResolversByDidMethod(method: string): UaidProfileResolver[] {
    return this.uaidProfileResolvers.filter(resolver => {
      return this.supportsDidMethod(resolver.meta?.didMethods, method);
    });
  }

  /** @deprecated Use filterAdapters({ capability: 'uaid-profile-resolver', profileId }) instead. */
  filterUaidProfileResolversByProfileId(
    profileId: string,
  ): UaidProfileResolver[] {
    return this.uaidProfileResolvers.filter(resolver => {
      return resolver.profile === profileId;
    });
  }

  async resolveDid(did: string): Promise<DidDocumentMinimal | null> {
    for (const resolver of this.resolvers) {
      if (resolver.supports(did)) {
        return resolver.resolve(did);
      }
    }
    return null;
  }

  private deriveDidFromParsedUaid(parsed: ParsedHcs14Did): string | null {
    if (parsed.method === 'aid') {
      const proto = parsed.params['proto'];
      const nativeId = parsed.params['nativeId'];
      if (proto === 'hcs-10' && nativeId) {
        const match = nativeId.match(
          /^hedera:(mainnet|testnet|previewnet|devnet):(.+)$/,
        );
        if (match) {
          const network = match[1];
          const accountId = match[2];
          return `did:hedera:${network}:${accountId}`;
        }
      }
      return null;
    }

    const src = parsed.params['src'];
    if (src) {
      try {
        return Buffer.from(multibaseB58btcDecode(src)).toString('utf8');
      } catch {
        return null;
      }
    }

    const id = parsed.id;
    if (
      id.startsWith('testnet:') ||
      id.startsWith('mainnet:') ||
      id.startsWith('previewnet:') ||
      id.startsWith('devnet:')
    ) {
      return `did:hedera:${id}`;
    }

    const proto = parsed.params['proto'];
    const nativeId = parsed.params['nativeId'];
    if (proto === 'hcs-10' && nativeId) {
      const match = nativeId.match(
        /^hedera:(mainnet|testnet|previewnet|devnet):/,
      );
      if (match) {
        const network = match[1];
        return `did:hedera:${network}:${id}`;
      }
    }

    return null;
  }

  private buildFallbackProfile(
    did: string,
    context: DidProfileResolverContext = {},
  ): DidResolutionProfile {
    const subjectId = context.uaid ?? did;
    const didDocument = context.didDocument ?? null;
    const alsoKnownAs = new Set<string>();

    if (subjectId !== did) {
      alsoKnownAs.add(did);
    }
    for (const value of didDocument?.alsoKnownAs ?? []) {
      alsoKnownAs.add(value);
    }

    return {
      id: subjectId,
      did,
      verificationMethod: didDocument?.verificationMethod,
      authentication: didDocument?.authentication,
      assertionMethod: didDocument?.assertionMethod,
      service: didDocument?.service,
      alsoKnownAs: alsoKnownAs.size > 0 ? [...alsoKnownAs] : undefined,
    };
  }

  private mergeResolvedProfile(
    fallback: DidResolutionProfile,
    resolved: DidResolutionProfile,
  ): DidResolutionProfile {
    const alsoKnownAs = new Set<string>([
      ...(fallback.alsoKnownAs ?? []),
      ...(resolved.alsoKnownAs ?? []),
    ]);

    return {
      ...fallback,
      ...resolved,
      id: resolved.id || fallback.id,
      did: resolved.did ?? fallback.did,
      verificationMethod:
        resolved.verificationMethod ?? fallback.verificationMethod,
      authentication: resolved.authentication ?? fallback.authentication,
      assertionMethod: resolved.assertionMethod ?? fallback.assertionMethod,
      service: resolved.service ?? fallback.service,
      profiles: resolved.profiles ?? fallback.profiles,
      metadata: resolved.metadata ?? fallback.metadata,
      error: resolved.error ?? fallback.error,
      alsoKnownAs: alsoKnownAs.size > 0 ? [...alsoKnownAs] : undefined,
    };
  }

  async resolveDidProfile(
    did: string,
    context: DidProfileResolverContext = {},
  ): Promise<DidResolutionProfile> {
    const didDocument = context.didDocument ?? (await this.resolveDid(did));
    const resolverContext: DidProfileResolverContext = {
      ...context,
      didDocument,
    };
    const fallback = this.buildFallbackProfile(did, resolverContext);

    for (const resolver of this.profileResolvers) {
      if (!resolver.supports(did)) {
        continue;
      }
      const resolved = await resolver.resolveProfile(did, resolverContext);
      if (resolved) {
        return this.mergeResolvedProfile(fallback, resolved);
      }
    }

    return fallback;
  }

  private async resolveUaidProfileByIdInternal(
    profileId: string,
    uaid: string,
    options: ResolveUaidProfileInternalOptions,
  ): Promise<DidResolutionProfile | null> {
    const parsed = parseHcs14Did(uaid);
    return this.resolveUaidProfileInternal(uaid, parsed, {
      profileId,
      excludeProfileId: options.excludeProfileId,
    });
  }

  private async resolveUaidProfileInternal(
    uaid: string,
    parsed: ParsedHcs14Did,
    options: ResolveUaidProfileInternalOptions = {},
  ): Promise<DidResolutionProfile | null> {
    const did = this.deriveDidFromParsedUaid(parsed);
    const didDocument = did ? await this.resolveDid(did) : null;
    const fallback = did
      ? this.buildFallbackProfile(did, {
          uaid,
          parsedUaid: parsed,
          didDocument,
        })
      : ({ id: uaid } as DidResolutionProfile);

    const resolvers =
      options.profileId !== undefined
        ? this.filterUaidProfileResolversByProfileId(options.profileId)
        : this.uaidProfileResolvers;

    for (const resolver of resolvers) {
      if (
        options.excludeProfileId !== undefined &&
        resolver.profile === options.excludeProfileId
      ) {
        continue;
      }
      if (!resolver.supports(uaid, parsed)) {
        continue;
      }

      const context: UaidProfileResolverContext = {
        parsedUaid: parsed,
        did,
        didDocument,
        resolveDid: async targetDid => this.resolveDid(targetDid),
        resolveDidProfile: async (targetDid, targetContext) =>
          this.resolveDidProfile(targetDid, targetContext),
        resolveUaidProfileById: async (profileId, targetUaid) =>
          this.resolveUaidProfileByIdInternal(profileId, targetUaid, {
            excludeProfileId: resolver.profile,
          }),
      };

      const resolved = await resolver.resolveProfile(uaid, context);
      if (!resolved) {
        continue;
      }

      const shouldContinueAfterErrorProfile =
        options.profileId === undefined &&
        (resolved.error !== undefined || resolved.metadata?.resolved === false);

      if (shouldContinueAfterErrorProfile) {
        continue;
      }

      return this.mergeResolvedProfile(fallback, resolved);
    }

    return null;
  }

  async resolveUaid(uaid: string): Promise<DidDocumentMinimal | null> {
    const parsed = parseHcs14Did(uaid);
    const did = this.deriveDidFromParsedUaid(parsed);
    if (!did) {
      return null;
    }
    return this.resolveDid(did);
  }

  async resolveUaidProfile(
    uaid: string,
    options: ResolveUaidProfileOptions = {},
  ): Promise<DidResolutionProfile | null> {
    const parsed = parseHcs14Did(uaid);
    const uaidProfile = await this.resolveUaidProfileInternal(uaid, parsed, {
      profileId: options.profileId,
    });
    if (uaidProfile) {
      return uaidProfile;
    }
    if (options.profileId !== undefined) {
      return null;
    }

    const did = this.deriveDidFromParsedUaid(parsed);
    if (!did) {
      return parsed.method === 'aid' ? { id: uaid } : null;
    }

    const didDocument = await this.resolveDid(did);
    return this.resolveDidProfile(did, {
      uaid,
      parsedUaid: parsed,
      didDocument,
    });
  }
}

export const defaultResolverRegistry = new ResolverRegistry();

export function registerDefaultResolvers(): void {
  defaultResolverRegistry.registerAdapter(new HieroDidResolver());
}
