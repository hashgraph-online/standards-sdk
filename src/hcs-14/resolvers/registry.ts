/**
 * Resolver registry for HCS-14.
 */

import { DidDocumentMinimal, DidResolver } from './types';
import { HieroDidResolver } from './hiero';
import { parseHcs14Did } from '../did';
import { multibaseB58btcDecode } from '../base58';

export class ResolverRegistry {
  private resolvers: DidResolver[] = [];

  register(resolver: DidResolver): void {
    this.resolvers.push(resolver);
  }

  async resolveDid(did: string): Promise<DidDocumentMinimal | null> {
    for (const r of this.resolvers) {
      if (r.supports(did)) return r.resolve(did);
    }
    return null;
  }

  async resolveUaid(uaid: string): Promise<DidDocumentMinimal | null> {
    const parsed = parseHcs14Did(uaid);
    if (parsed.method !== 'uaid') return null;

    const src = parsed.params['src'];
    if (src) {
      const raw = Buffer.from(multibaseB58btcDecode(src)).toString('utf8');
      return this.resolveDid(raw);
    }

    const id = parsed.id;
    if (
      id.startsWith('testnet:') ||
      id.startsWith('mainnet:') ||
      id.startsWith('previewnet:') ||
      id.startsWith('devnet:')
    ) {
      const did = `did:hedera:${id}`;
      return this.resolveDid(did);
    }

    return null;
  }
}

export const defaultResolverRegistry = new ResolverRegistry();

export function registerDefaultResolvers(): void {
  defaultResolverRegistry.register(new HieroDidResolver());
}
