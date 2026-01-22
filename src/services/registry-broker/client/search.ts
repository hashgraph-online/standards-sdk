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
import type { RegistryBrokerClient } from './base-client';
import { buildSearchQuery } from './utils';
import { RegistryBrokerError } from './errors';

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

export async function search(
  client: RegistryBrokerClient,
  params: SearchParams = {},
): Promise<SearchResult> {
  const query = buildSearchQuery(params);
  const raw = await client.requestJson<JsonValue>(`/search${query}`, {
    method: 'GET',
  });
  return client.parseWithSchema(raw, searchResponseSchema, 'search response');
}

export async function stats(
  client: RegistryBrokerClient,
): Promise<RegistryStatsResponse> {
  const raw = await client.requestJson<JsonValue>('/stats', { method: 'GET' });
  return client.parseWithSchema(raw, statsResponseSchema, 'stats response');
}

export async function registries(
  client: RegistryBrokerClient,
): Promise<RegistriesResponse> {
  const raw = await client.requestJson<JsonValue>('/registries', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    registriesResponseSchema,
    'registries response',
  );
}

export async function getAdditionalRegistries(
  client: RegistryBrokerClient,
): Promise<AdditionalRegistryCatalogResponse> {
  const raw = await client.requestJson<JsonValue>(
    '/register/additional-registries',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    additionalRegistryCatalogResponseSchema,
    'additional registry catalog response',
  );
}

export async function popularSearches(
  client: RegistryBrokerClient,
): Promise<PopularSearchesResponse> {
  const raw = await client.requestJson<JsonValue>('/popular', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    popularResponseSchema,
    'popular searches response',
  );
}

export async function listProtocols(
  client: RegistryBrokerClient,
): Promise<ProtocolsResponse> {
  const raw = await client.requestJson<JsonValue>('/protocols', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    protocolsResponseSchema,
    'protocols response',
  );
}

export async function detectProtocol(
  client: RegistryBrokerClient,
  message: ProtocolDetectionMessage,
): Promise<DetectProtocolResponse> {
  const raw = await client.requestJson<JsonValue>('/detect-protocol', {
    method: 'POST',
    body: { message },
    headers: { 'content-type': 'application/json' },
  });
  return client.parseWithSchema(
    raw,
    detectProtocolResponseSchema,
    'detect protocol response',
  );
}

export async function registrySearchByNamespace(
  client: RegistryBrokerClient,
  registry: string,
  query?: string,
): Promise<RegistrySearchByNamespaceResponse> {
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const raw = await client.requestJson<JsonValue>(
    `/registries/${encodeURIComponent(registry)}/search${suffix}`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    registrySearchByNamespaceSchema,
    'registry search response',
  );
}

export async function vectorSearch(
  client: RegistryBrokerClient,
  request: VectorSearchRequest,
): Promise<VectorSearchResponse> {
  try {
    const raw = await client.requestJson<JsonValue>('/search', {
      method: 'POST',
      body: request,
      headers: { 'content-type': 'application/json' },
    });
    return client.parseWithSchema(
      raw,
      vectorSearchResponseSchema,
      'vector search response',
    );
  } catch (error) {
    if (error instanceof RegistryBrokerError && error.status === 501) {
      const fallback = await search(
        client,
        buildVectorFallbackSearchParams(request),
      );
      return convertSearchResultToVectorResponse(fallback);
    }
    throw error;
  }
}

export async function searchStatus(
  client: RegistryBrokerClient,
): Promise<SearchStatusResponse> {
  const raw = await client.requestJson<JsonValue>('/search/status', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    searchStatusResponseSchema,
    'search status response',
  );
}

export async function websocketStats(
  client: RegistryBrokerClient,
): Promise<WebsocketStatsResponse> {
  const raw = await client.requestJson<JsonValue>('/websocket/stats', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    websocketStatsResponseSchema,
    'websocket stats response',
  );
}

export async function metricsSummary(
  client: RegistryBrokerClient,
): Promise<MetricsSummaryResponse> {
  const raw = await client.requestJson<JsonValue>('/metrics', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    metricsSummaryResponseSchema,
    'metrics summary response',
  );
}

export async function facets(
  client: RegistryBrokerClient,
  adapter?: string,
): Promise<SearchFacetsResponse> {
  const params = new URLSearchParams();
  if (adapter) {
    params.set('adapter', adapter);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const raw = await client.requestJson<JsonValue>(`/search/facets${suffix}`, {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    searchFacetsResponseSchema,
    'search facets response',
  );
}
