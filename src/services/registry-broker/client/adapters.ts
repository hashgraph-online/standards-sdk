import type {
  AdapterDetailsResponse,
  AdapterRegistryAdaptersResponse,
  AdapterRegistryCategoriesResponse,
  AdapterRegistryCategory,
  AdapterRegistrySubmitAdapterAcceptedResponse,
  AdapterRegistrySubmissionStatusResponse,
  AdaptersResponse,
  CreateAdapterRegistryCategoryRequest,
  JsonValue,
  SubmitAdapterRegistryAdapterRequest,
} from '../types';
import {
  adapterDetailsResponseSchema,
  adapterRegistryAdaptersResponseSchema,
  adapterRegistryCategoriesResponseSchema,
  adapterRegistryCreateCategoryResponseSchema,
  adapterRegistrySubmitAdapterAcceptedResponseSchema,
  adapterRegistrySubmissionStatusResponseSchema,
  adaptersResponseSchema,
} from '../schemas';
import type { RegistryBrokerClient } from './base-client';
import { toJsonObject } from './utils';

export async function adapters(
  client: RegistryBrokerClient,
): Promise<AdaptersResponse> {
  const raw = await client.requestJson<JsonValue>('/adapters', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    adaptersResponseSchema,
    'adapters response',
  );
}

export async function adaptersDetailed(
  client: RegistryBrokerClient,
): Promise<AdapterDetailsResponse> {
  const raw = await client.requestJson<JsonValue>('/adapters/details', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    adapterDetailsResponseSchema,
    'adapter details response',
  );
}

export async function adapterRegistryCategories(
  client: RegistryBrokerClient,
): Promise<AdapterRegistryCategoriesResponse> {
  const raw = await client.requestJson<JsonValue>(
    '/adapters/registry/categories',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    adapterRegistryCategoriesResponseSchema,
    'adapter registry categories response',
  );
}

export async function adapterRegistryAdapters(
  client: RegistryBrokerClient,
  filters: {
    category?: string;
    entity?: string;
    keywords?: string[];
    query?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AdapterRegistryAdaptersResponse> {
  const params = new URLSearchParams();
  if (filters.category) {
    params.set('category', filters.category);
  }
  if (filters.entity) {
    params.set('entity', filters.entity);
  }
  if (filters.keywords?.length) {
    params.set('keywords', filters.keywords.join(','));
  }
  if (filters.query) {
    params.set('query', filters.query);
  }
  if (typeof filters.limit === 'number') {
    params.set('limit', String(filters.limit));
  }
  if (typeof filters.offset === 'number') {
    params.set('offset', String(filters.offset));
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const raw = await client.requestJson<JsonValue>(
    `/adapters/registry/adapters${suffix}`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    adapterRegistryAdaptersResponseSchema,
    'adapter registry adapters response',
  );
}

export async function createAdapterRegistryCategory(
  client: RegistryBrokerClient,
  payload: CreateAdapterRegistryCategoryRequest,
): Promise<AdapterRegistryCategory> {
  const raw = await client.requestJson<JsonValue>(
    '/adapters/registry/categories',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: toJsonObject(payload),
    },
  );
  const parsed = client.parseWithSchema(
    raw,
    adapterRegistryCreateCategoryResponseSchema,
    'adapter registry create category response',
  );
  return parsed.category;
}

export async function submitAdapterRegistryAdapter(
  client: RegistryBrokerClient,
  payload: SubmitAdapterRegistryAdapterRequest,
): Promise<AdapterRegistrySubmitAdapterAcceptedResponse> {
  const raw = await client.requestJson<JsonValue>(
    '/adapters/registry/adapters',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: toJsonObject(payload),
    },
  );
  return client.parseWithSchema(
    raw,
    adapterRegistrySubmitAdapterAcceptedResponseSchema,
    'adapter registry submit adapter response',
  );
}

export async function adapterRegistrySubmissionStatus(
  client: RegistryBrokerClient,
  submissionId: string,
): Promise<AdapterRegistrySubmissionStatusResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/adapters/registry/submissions/${encodeURIComponent(submissionId)}`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    adapterRegistrySubmissionStatusResponseSchema,
    'adapter registry submission status response',
  );
}
