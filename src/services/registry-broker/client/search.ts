import type {
  JsonValue,
  PopularSearchesResponse,
  ProtocolDetectionMessage,
  DetectProtocolResponse,
  ProtocolsResponse,
  RegistriesResponse,
  AdditionalRegistryCatalogResponse,
  RegistrySearchByNamespaceResponse,
  RegistryStatsResponse,
  SearchFacetsResponse,
  SearchParams,
  SearchResult,
  SearchStatusResponse,
  VectorSearchRequest,
  VectorSearchResponse,
  WebsocketStatsResponse,
  MetricsSummaryResponse,
} from '../types';
import {
  additionalRegistryCatalogResponseSchema,
  detectProtocolResponseSchema,
  metricsSummaryResponseSchema,
  popularResponseSchema,
  protocolsResponseSchema,
  registriesResponseSchema,
  registrySearchByNamespaceSchema,
  searchFacetsResponseSchema,
  searchResponseSchema,
  searchStatusResponseSchema,
  statsResponseSchema,
  vectorSearchResponseSchema,
  websocketStatsResponseSchema,
} from '../schemas';
import { RegistryBrokerClient } from './base-client';
import { buildSearchQuery } from './utils';
import { RegistryBrokerError } from './errors';

declare module './base-client' {
  interface RegistryBrokerClient {
    search(params?: SearchParams): Promise<SearchResult>;
    stats(): Promise<RegistryStatsResponse>;
    registries(): Promise<RegistriesResponse>;
    getAdditionalRegistries(): Promise<AdditionalRegistryCatalogResponse>;
    popularSearches(): Promise<PopularSearchesResponse>;
    listProtocols(): Promise<ProtocolsResponse>;
    detectProtocol(
      message: ProtocolDetectionMessage,
    ): Promise<DetectProtocolResponse>;
    registrySearchByNamespace(
      registry: string,
      query?: string,
    ): Promise<RegistrySearchByNamespaceResponse>;
    vectorSearch(request: VectorSearchRequest): Promise<VectorSearchResponse>;
    searchStatus(): Promise<SearchStatusResponse>;
    websocketStats(): Promise<WebsocketStatsResponse>;
    metricsSummary(): Promise<MetricsSummaryResponse>;
    facets(adapter?: string): Promise<SearchFacetsResponse>;
  }
}

function buildVectorFallbackSearchParams(
  request: VectorSearchRequest,
): SearchParams {
  const params: SearchParams = {
    q: request.query,
  };
  let effectiveLimit: number | undefined;
  if (typeof request.limit === 'number' && Number.isFinite(request.limit)) {
    effectiveLimit = request.limit;
    params.limit = request.limit;
  }
  if (
    typeof request.offset === 'number' &&
    Number.isFinite(request.offset) &&
    request.offset > 0
  ) {
    const limit = effectiveLimit && effectiveLimit > 0 ? effectiveLimit : 20;
    params.limit = limit;
    params.page = Math.floor(request.offset / limit) + 1;
  }
  if (request.filter?.registry) {
    params.registry = request.filter.registry;
  }
  if (request.filter?.protocols?.length) {
    params.protocols = [...request.filter.protocols];
  }
  if (request.filter?.adapter?.length) {
    params.adapters = [...request.filter.adapter];
  }
  if (request.filter?.capabilities?.length) {
    params.capabilities = request.filter.capabilities.map(value =>
      typeof value === 'number' ? value.toString(10) : value,
    );
  }
  if (request.filter?.type) {
    params.type = request.filter.type;
  }
  return params;
}

function convertSearchResultToVectorResponse(
  result: SearchResult,
): VectorSearchResponse {
  const hits = result.hits.map(agent => ({
    agent,
    score: 0,
    highlights: {},
  }));
  const total = result.total;
  const limit = result.limit;
  const page = result.page;
  const totalVisible = page * limit;
  const limited = total > totalVisible || page > 1;

  return {
    hits,
    total,
    took: 0,
    totalAvailable: total,
    visible: hits.length,
    limited,
    credits_used: 0,
  };
}

RegistryBrokerClient.prototype.search = async function (
  this: RegistryBrokerClient,
  params: SearchParams = {},
): Promise<SearchResult> {
  const query = buildSearchQuery(params);
  const raw = await this.requestJson<JsonValue>(`/search${query}`, {
    method: 'GET',
  });
  return this.parseWithSchema(raw, searchResponseSchema, 'search response');
};

RegistryBrokerClient.prototype.stats = async function (
  this: RegistryBrokerClient,
): Promise<RegistryStatsResponse> {
  const raw = await this.requestJson<JsonValue>('/stats', { method: 'GET' });
  return this.parseWithSchema(raw, statsResponseSchema, 'stats response');
};

RegistryBrokerClient.prototype.registries = async function (
  this: RegistryBrokerClient,
): Promise<RegistriesResponse> {
  const raw = await this.requestJson<JsonValue>('/registries', {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    registriesResponseSchema,
    'registries response',
  );
};

RegistryBrokerClient.prototype.getAdditionalRegistries = async function (
  this: RegistryBrokerClient,
) {
  const raw = await this.requestJson<JsonValue>(
    '/register/additional-registries',
    {
      method: 'GET',
    },
  );
  return this.parseWithSchema(
    raw,
    additionalRegistryCatalogResponseSchema,
    'additional registry catalog response',
  );
};

RegistryBrokerClient.prototype.popularSearches = async function (
  this: RegistryBrokerClient,
): Promise<PopularSearchesResponse> {
  const raw = await this.requestJson<JsonValue>('/popular', {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    popularResponseSchema,
    'popular searches response',
  );
};

RegistryBrokerClient.prototype.listProtocols = async function (
  this: RegistryBrokerClient,
): Promise<ProtocolsResponse> {
  const raw = await this.requestJson<JsonValue>('/protocols', {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    protocolsResponseSchema,
    'protocols response',
  );
};

RegistryBrokerClient.prototype.detectProtocol = async function (
  this: RegistryBrokerClient,
  message: ProtocolDetectionMessage,
): Promise<DetectProtocolResponse> {
  const raw = await this.requestJson<JsonValue>('/detect-protocol', {
    method: 'POST',
    body: { message },
    headers: { 'content-type': 'application/json' },
  });
  return this.parseWithSchema(
    raw,
    detectProtocolResponseSchema,
    'detect protocol response',
  );
};

RegistryBrokerClient.prototype.registrySearchByNamespace = async function (
  this: RegistryBrokerClient,
  registry: string,
  query?: string,
): Promise<RegistrySearchByNamespaceResponse> {
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const raw = await this.requestJson<JsonValue>(
    `/registries/${encodeURIComponent(registry)}/search${suffix}`,
    {
      method: 'GET',
    },
  );
  return this.parseWithSchema(
    raw,
    registrySearchByNamespaceSchema,
    'registry search response',
  );
};

RegistryBrokerClient.prototype.vectorSearch = async function (
  this: RegistryBrokerClient,
  request: VectorSearchRequest,
): Promise<VectorSearchResponse> {
  try {
    const raw = await this.requestJson<JsonValue>('/search', {
      method: 'POST',
      body: request,
      headers: { 'content-type': 'application/json' },
    });
    return this.parseWithSchema(
      raw,
      vectorSearchResponseSchema,
      'vector search response',
    );
  } catch (error) {
    if (error instanceof RegistryBrokerError && error.status === 501) {
      const fallback = await this.search(
        buildVectorFallbackSearchParams(request),
      );
      return convertSearchResultToVectorResponse(fallback);
    }
    throw error;
  }
};

RegistryBrokerClient.prototype.searchStatus = async function (
  this: RegistryBrokerClient,
): Promise<SearchStatusResponse> {
  const raw = await this.requestJson<JsonValue>('/search/status', {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    searchStatusResponseSchema,
    'search status response',
  );
};

RegistryBrokerClient.prototype.websocketStats = async function (
  this: RegistryBrokerClient,
): Promise<WebsocketStatsResponse> {
  const raw = await this.requestJson<JsonValue>('/websocket/stats', {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    websocketStatsResponseSchema,
    'websocket stats response',
  );
};

RegistryBrokerClient.prototype.metricsSummary = async function (
  this: RegistryBrokerClient,
): Promise<MetricsSummaryResponse> {
  const raw = await this.requestJson<JsonValue>('/metrics', {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    metricsSummaryResponseSchema,
    'metrics summary response',
  );
};

RegistryBrokerClient.prototype.facets = async function (
  this: RegistryBrokerClient,
  adapter?: string,
): Promise<SearchFacetsResponse> {
  const params = new URLSearchParams();
  if (adapter) {
    params.set('adapter', adapter);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const raw = await this.requestJson<JsonValue>(`/search/facets${suffix}`, {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    searchFacetsResponseSchema,
    'search facets response',
  );
};
