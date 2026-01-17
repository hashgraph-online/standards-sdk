/**
 * @hol-org/registry-client
 * 
 * Lightweight client for the Hashgraph Online Universal Agentic Registry.
 * For full SDK features, use npm: @hashgraphonline/standards-sdk
 */

export interface SearchParams {
  q?: string;
  registry?: string;
  limit?: number;
  offset?: number;
  protocol?: string;
  capabilities?: string[];
}

export interface SearchHit {
  uaid: string;
  name: string;
  description?: string;
  registry: string;
  protocol?: string;
  capabilities?: string[];
  score?: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  limit: number;
  offset: number;
}

export interface AgentProfile {
  uaid: string;
  name: string;
  description?: string;
  registry: string;
  protocol?: string;
  capabilities?: string[];
  endpoints?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface RegistryStats {
  totalAgents: number;
  registries: string[];
  protocols: string[];
}

export interface RegistryClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = "https://hol.org/registry/api/v1";

export class RegistryClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(options: RegistryClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    };
  }

  async search(params: SearchParams = {}): Promise<SearchResponse> {
    const url = new URL(`${this.baseUrl}/search`);
    
    if (params.q) url.searchParams.set("q", params.q);
    if (params.registry) url.searchParams.set("registry", params.registry);
    if (params.limit) url.searchParams.set("limit", String(params.limit));
    if (params.offset) url.searchParams.set("offset", String(params.offset));
    if (params.protocol) url.searchParams.set("protocol", params.protocol);
    if (params.capabilities?.length) {
      url.searchParams.set("capabilities", params.capabilities.join(","));
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<SearchResponse>;
  }

  async resolve(uaid: string): Promise<AgentProfile | null> {
    const encodedUaid = encodeURIComponent(uaid);
    const response = await fetch(`${this.baseUrl}/resolve/${encodedUaid}`, {
      method: "GET",
      headers: this.headers,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Resolve failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<AgentProfile>;
  }

  async stats(): Promise<RegistryStats> {
    const response = await fetch(`${this.baseUrl}/stats`, {
      method: "GET",
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Stats failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<RegistryStats>;
  }
}

export default RegistryClient;
