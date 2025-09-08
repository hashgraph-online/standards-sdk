/**
 * DID resolver types for HCS-14.
 */

export interface DidDocumentMinimal {
  id: string;
}

export interface DidResolver {
  supports(did: string): boolean;
  resolve(did: string): Promise<DidDocumentMinimal | null>;
}
