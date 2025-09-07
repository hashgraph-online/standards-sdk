import { DidDocumentMinimal, DidResolver } from './types';
import { Logger } from '../../utils/logger';

export class HieroDidResolver implements DidResolver {
  supports(did: string): boolean {
    return did.startsWith('did:hedera:');
  }

  async resolve(did: string): Promise<DidDocumentMinimal | null> {
    const log = Logger.getInstance({ module: 'hcs-14:hiero-resolver' });
    try {
      const mod: typeof import('@hiero-did-sdk/resolver') = await import(
        '@hiero-did-sdk/resolver'
      );
      const doc = await mod.resolveDID(did);
      return { id: doc.id };
    } catch {
      log.error(
        'Hiero resolver dependency not found. Install @hiero-did-sdk/resolver to enable did:hedera resolution.',
      );
      return null;
    }
  }
}
