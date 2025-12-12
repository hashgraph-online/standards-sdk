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
import { RegistryBrokerClient } from './base-client';
import { toJsonObject } from './utils';

declare module './base-client' {
  interface RegistryBrokerClient {
    adapters(): Promise<AdaptersResponse>;
    adaptersDetailed(): Promise<AdapterDetailsResponse>;
    adapterRegistryCategories(): Promise<AdapterRegistryCategoriesResponse>;
    adapterRegistryAdapters(filters?: {
      category?: string;
      entity?: string;
      keywords?: string[];
      query?: string;
      limit?: number;
      offset?: number;
    }): Promise<AdapterRegistryAdaptersResponse>;
    createAdapterRegistryCategory(
      payload: CreateAdapterRegistryCategoryRequest,
    ): Promise<AdapterRegistryCategory>;
    submitAdapterRegistryAdapter(
      payload: SubmitAdapterRegistryAdapterRequest,
    ): Promise<AdapterRegistrySubmitAdapterAcceptedResponse>;
    adapterRegistrySubmissionStatus(
      submissionId: string,
    ): Promise<AdapterRegistrySubmissionStatusResponse>;
  }
}

RegistryBrokerClient.prototype.adapters = async function (
  this: RegistryBrokerClient,
): Promise<AdaptersResponse> {
  const raw = await this.requestJson<JsonValue>('/adapters', {
    method: 'GET',
  });
  return this.parseWithSchema(raw, adaptersResponseSchema, 'adapters response');
};

RegistryBrokerClient.prototype.adaptersDetailed = async function (
  this: RegistryBrokerClient,
): Promise<AdapterDetailsResponse> {
  const raw = await this.requestJson<JsonValue>('/adapters/details', {
    method: 'GET',
  });
  return this.parseWithSchema(
    raw,
    adapterDetailsResponseSchema,
    'adapter details response',
  );
};

RegistryBrokerClient.prototype.adapterRegistryCategories = async function (
  this: RegistryBrokerClient,
): Promise<AdapterRegistryCategoriesResponse> {
  const raw = await this.requestJson<JsonValue>(
    '/adapters/registry/categories',
    {
      method: 'GET',
    },
  );
  return this.parseWithSchema(
    raw,
    adapterRegistryCategoriesResponseSchema,
    'adapter registry categories response',
  );
};

RegistryBrokerClient.prototype.adapterRegistryAdapters = async function (
  this: RegistryBrokerClient,
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
  const raw = await this.requestJson<JsonValue>(
    `/adapters/registry/adapters${suffix}`,
    {
      method: 'GET',
    },
  );
  return this.parseWithSchema(
    raw,
    adapterRegistryAdaptersResponseSchema,
    'adapter registry adapters response',
  );
};

RegistryBrokerClient.prototype.createAdapterRegistryCategory = async function (
  this: RegistryBrokerClient,
  payload: CreateAdapterRegistryCategoryRequest,
): Promise<AdapterRegistryCategory> {
  const raw = await this.requestJson<JsonValue>(
    '/adapters/registry/categories',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: toJsonObject(payload),
    },
  );
  const parsed = this.parseWithSchema(
    raw,
    adapterRegistryCreateCategoryResponseSchema,
    'adapter registry create category response',
  );
  return parsed.category;
};

RegistryBrokerClient.prototype.submitAdapterRegistryAdapter = async function (
  this: RegistryBrokerClient,
  payload: SubmitAdapterRegistryAdapterRequest,
): Promise<AdapterRegistrySubmitAdapterAcceptedResponse> {
  const raw = await this.requestJson<JsonValue>('/adapters/registry/adapters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: toJsonObject(payload),
  });
  return this.parseWithSchema(
    raw,
    adapterRegistrySubmitAdapterAcceptedResponseSchema,
    'adapter registry submit adapter response',
  );
};

RegistryBrokerClient.prototype.adapterRegistrySubmissionStatus =
  async function (
    this: RegistryBrokerClient,
    submissionId: string,
  ): Promise<AdapterRegistrySubmissionStatusResponse> {
    const raw = await this.requestJson<JsonValue>(
      `/adapters/registry/submissions/${encodeURIComponent(submissionId)}`,
      {
        method: 'GET',
      },
    );
    return this.parseWithSchema(
      raw,
      adapterRegistrySubmissionStatusResponseSchema,
      'adapter registry submission status response',
    );
  };
