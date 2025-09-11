import { DidDocumentMinimal, DidResolver } from './types';
import { resolveDID } from '@hiero-did-sdk/resolver';
import type { AdapterMeta } from '../adapters/types';

export class HieroDidResolver implements DidResolver {
  readonly meta: AdapterMeta = {
    id: 'hedera/hiero-resolver',
    didMethods: ['hedera'],
    caip2Networks: ['hedera:mainnet', 'hedera:testnet', 'hedera:previewnet', 'hedera:devnet'],
    caip10Namespaces: ['hedera'],
    displayName: 'Hedera (Hiero Resolver)',
    description: 'Resolves did:hedera identifiers via Hiero DID resolver.',
    homepage: 'https://github.com/hashgraph-devrel/hiero-did-sdk',
  };
  supports(did: string): boolean {
    return did.startsWith('did:hedera:');
  }

  async resolve(did: string): Promise<DidDocumentMinimal | null> {
    type MinimalResolution = {
      id?: string;
      didDocument?: { id?: string };
    };
    const res = (await resolveDID(did)) as MinimalResolution;
    const id = res.id ?? res.didDocument?.id;
    return id ? { id } : null;
  }
}
