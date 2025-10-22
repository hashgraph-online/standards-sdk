import { DidDocumentMinimal, DidResolver } from './types';
import type { AdapterMeta } from '../adapters/types';
import { optionalImport } from '../../utils/dynamic-import';

type ResolveDID = typeof import('@hiero-did-sdk/resolver').resolveDID;
type HieroResolverModule = typeof import('@hiero-did-sdk/resolver');

const hieroResolverModuleId = ['@hiero-did-sdk', 'resolver'].join('/');

let resolverPromise: Promise<ResolveDID | null> | null = null;

async function loadResolveDID(): Promise<ResolveDID | null> {
  if (!resolverPromise) {
    resolverPromise = optionalImport<HieroResolverModule>(
      hieroResolverModuleId,
    ).then((mod) => mod?.resolveDID ?? null);
  }
  return resolverPromise;
}

export class HieroDidResolver implements DidResolver {
  readonly meta: AdapterMeta = {
    id: 'hedera/hiero-resolver',
    didMethods: ['hedera'],
    caip2Networks: ['hedera:mainnet', 'hedera:testnet', 'hedera:previewnet', 'hedera:devnet'],
    caip10Namespaces: ['hedera'],
    displayName: 'Hedera (Hiero Resolver)',
    description: 'Resolves did:hedera identifiers via Hiero DID resolver.',
    homepage: 'https://github.com/hiero-ledger/hiero-did-sdk-js',
  };
  supports(did: string): boolean {
    return did.startsWith('did:hedera:');
  }

  async resolve(did: string): Promise<DidDocumentMinimal | null> {
    const resolveDID = await loadResolveDID();
    if (!resolveDID) {
      throw new Error(
        'Hiero resolver unavailable. Ensure @hiero-did-sdk/resolver is installed.',
      );
    }
    const res = await resolveDID(did as Parameters<ResolveDID>[0]);
    return res && typeof res.id === 'string' ? { id: res.id } : null;
  }
}
