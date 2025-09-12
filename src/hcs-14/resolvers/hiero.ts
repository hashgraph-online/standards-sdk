import { DidDocumentMinimal, DidResolver } from './types';
import type { AdapterMeta } from '../adapters/types';
type ResolveDID = typeof import('@hiero-did-sdk/resolver').resolveDID;

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
    const mod = await import('@hiero-did-sdk/resolver');
    const resolveDID: ResolveDID = mod.resolveDID;
    const res = await resolveDID(did as Parameters<ResolveDID>[0]);
    return res && typeof res.id === 'string' ? { id: res.id } : null;
  }
}
