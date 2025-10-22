import { DidIssueRequest, DidIssueRequestHedera, DidIssuer } from './types';
import type { AdapterMeta } from '../adapters/types';
import { optionalImport } from '../../utils/dynamic-import';

type CreateDID = typeof import('@hiero-did-sdk/registrar').createDID;
type HieroRegistrarModule = typeof import('@hiero-did-sdk/registrar');

const hieroRegistrarModuleId = ['@hiero-did-sdk', 'registrar'].join('/');

let registrarPromise: Promise<CreateDID | null> | null = null;

async function loadCreateDID(): Promise<CreateDID | null> {
  if (!registrarPromise) {
    registrarPromise = optionalImport<HieroRegistrarModule>(
      hieroRegistrarModuleId,
    ).then((mod) => mod?.createDID ?? null);
  }
  return registrarPromise;
}

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
    homepage: 'https://github.com/hiero-ledger/hiero-did-sdk-js',
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
    const createDID = await loadCreateDID();
    if (!createDID) {
      throw new Error(
        'Hiero registrar unavailable. Ensure @hiero-did-sdk/registrar is installed.',
      );
    }
    const did = await createDID(
      {},
      { client: (request as DidIssueRequestHedera).client },
    );
    return did.did;
  }
}
