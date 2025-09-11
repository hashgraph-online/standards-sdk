/**
 * Issuer registry for HCS-14 DID adapters.
 */

import { DidIssueRequest, DidIssuer, IssuerRegistryApi } from './types';

export class IssuerRegistry implements IssuerRegistryApi {
  private issuers: DidIssuer[] = [];

  register(issuer: DidIssuer): void {
    this.issuers.push(issuer);
  }

  list(): DidIssuer[] {
    return [...this.issuers];
  }

  /** Return issuers that support a given DID method. */
  filterByDidMethod(method: string): DidIssuer[] {
    return this.issuers.filter(i => i.meta.didMethods.includes(method));
  }

  /** Return issuers that advertise a specific CAIP-2 network. */
  filterByCaip2(network: string): DidIssuer[] {
    return this.issuers.filter(i => i.meta.caip2Networks?.includes(network));
  }

  /** Generic predicate-based filter. */
  filter(predicate: (issuer: DidIssuer) => boolean): DidIssuer[] {
    return this.issuers.filter(predicate);
  }

  async issue(request: DidIssueRequest): Promise<string> {
    for (const issuer of this.issuers) {
      if (issuer.supports(request.method)) {
        return issuer.issue(request);
      }
    }
    throw new Error(`No issuer registered for method: ${request.method}`);
  }
}

export const defaultIssuerRegistry = new IssuerRegistry();
