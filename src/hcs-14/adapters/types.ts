/**
 * Common adapter metadata for issuers and resolvers.
 */

export interface AdapterMeta {
  /** A stable identifier for the adapter (e.g., 'hedera/hiero'). */
  id: string;
  /** DID methods supported by this adapter (e.g., ['hedera']). */
  didMethods: string[];
  /** Supported CAIP-2 network identifiers, if applicable (e.g., ['hedera:testnet']). */
  caip2Networks?: string[];
  /** Supported CAIP-10 namespaces, if applicable (e.g., ['hedera', 'eip155']). */
  caip10Namespaces?: string[];
  /** Human-readable name for UI listings. */
  displayName?: string;
  /** Optional short description. */
  description?: string;
  /** Optional homepage or documentation URL. */
  homepage?: string;
  /** Optional author or organization name. */
  author?: string;
  /** Optional semantic version for the adapter implementation. */
  version?: string;
}
