import { DidDocumentMinimal, DidResolver } from './types';
import { getResolver } from '@hiero-did-sdk/resolver';
import type { DIDResolution } from '@hiero-did-sdk/core';

export class HieroDidResolver implements DidResolver {
  supports(did: string): boolean {
    return did.startsWith('did:hedera:');
  }

  async resolve(did: string): Promise<DidDocumentMinimal | null> {
    const resolver = getResolver();
    const doc: DIDResolution = await resolver.hedera(did);
    const id = doc.didDocument?.id;
    if (!id) return null;
    return { id };
  }
}
