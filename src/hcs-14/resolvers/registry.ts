/**
 * Resolver registry for HCS-14.
 */

import {
  DidDocumentMinimal,
  DidProfileResolver,
  DidProfileResolverContext,
  DidResolutionProfile,
  DidResolver,
  UaidProfileResolver,
  UaidProfileResolverContext,
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

  private supportsDidMethod(
    didMethods: string[] | undefined,
    method: string,
  ): boolean {
    return (
      !!didMethods && (didMethods.includes(method) || didMethods.includes('*'))
    );
  }

  register(resolver: DidResolver): void {
    this.resolvers.push(resolver);
  }

  registerProfileResolver(resolver: DidProfileResolver): void {
    this.profileResolvers.push(resolver);
  }

  registerUaidProfileResolver(resolver: UaidProfileResolver): void {
    this.uaidProfileResolvers.push(resolver);
  }

  list(): DidResolver[] {
    return [...this.resolvers];
  }

  listProfileResolvers(): DidProfileResolver[] {
    return [...this.profileResolvers];
  }

  listUaidProfileResolvers(): UaidProfileResolver[] {
    return [...this.uaidProfileResolvers];
  }

  filterByDidMethod(method: string): DidResolver[] {
    return this.resolvers.filter(r =>
      this.supportsDidMethod(r.meta?.didMethods, method),
    );
  }

  filterProfileResolversByDidMethod(method: string): DidProfileResolver[] {
    return this.profileResolvers.filter(r =>
      this.supportsDidMethod(r.meta?.didMethods, method),
    );
  }

  filterUaidProfileResolversByDidMethod(method: string): UaidProfileResolver[] {
    return this.uaidProfileResolvers.filter(r =>
      this.supportsDidMethod(r.meta?.didMethods, method),
    );
  }

  filterUaidProfileResolversByProfileId(
    profileId: string,
  ): UaidProfileResolver[] {
    return this.uaidProfileResolvers.filter(r => r.profile === profileId);
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
  defaultResolverRegistry.register(new HieroDidResolver());
}
