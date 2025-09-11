import { DidIssueRequest, DidIssueRequestHedera, DidIssuer } from './types';
import type { AdapterMeta } from '../adapters/types';
import { createDID } from '@hiero-did-sdk/registrar';

export class HederaHieroIssuer implements DidIssuer {
  readonly meta: AdapterMeta = {
    id: 'hedera/hiero',
    didMethods: ['hedera'],
    caip2Networks: [
      'hedera:mainnet',
      'hedera:testnet',
      'hedera:previewnet',
      'hedera:devnet',
    ],
    caip10Namespaces: ['hedera'],
    displayName: 'Hedera (Hiero Registrar)',
    description: 'Issues did:hedera identifiers using the Hiero DID registrar.',
    homepage: 'https://github.com/hashgraph-devrel/hiero-did-sdk',
  };

  supports(method: string): boolean {
    return method === 'hedera';
  }

  async issue(request: DidIssueRequest): Promise<string> {
    if (request.method !== 'hedera') {
      throw new Error('HederaHieroIssuer only handles method "hedera"');
    }
    if (!('client' in request)) {
      throw new Error('Hedera client is required to issue did:hedera');
    }
    const did = await createDID(
      {},
      { client: (request as DidIssueRequestHedera).client },
    );
    return did.did;
  }
}
