import type {
  JsonValue,
  SkillRegistryConfigResponse,
  SkillRegistryJobStatusResponse,
  SkillRegistryListResponse,
  SkillRegistryOwnershipResponse,
  SkillRegistryPublishRequest,
  SkillRegistryPublishResponse,
  SkillRegistryQuoteRequest,
  SkillRegistryQuoteResponse,
} from '../types';
import {
  skillRegistryConfigResponseSchema,
  skillRegistryJobStatusResponseSchema,
  skillRegistryListResponseSchema,
  skillRegistryOwnershipResponseSchema,
  skillRegistryPublishResponseSchema,
  skillRegistryQuoteResponseSchema,
} from '../schemas';
import type { RegistryBrokerClient } from './base-client';

export async function skillsConfig(
  client: RegistryBrokerClient,
): Promise<SkillRegistryConfigResponse> {
  const raw = await client.requestJson<JsonValue>('/skills/config', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    skillRegistryConfigResponseSchema,
    'skill registry config response',
  );
}

export async function listSkills(
  client: RegistryBrokerClient,
  params: {
    name?: string;
    version?: string;
    limit?: number;
    cursor?: string;
    includeFiles?: boolean;
    accountId?: string;
  } = {},
): Promise<SkillRegistryListResponse> {
  const query = new URLSearchParams();
  if (params.name) {
    query.set('name', params.name);
  }
  if (params.version) {
    query.set('version', params.version);
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.trunc(params.limit)));
  }
  if (params.cursor) {
    query.set('cursor', params.cursor);
  }
  if (typeof params.includeFiles === 'boolean') {
    query.set('includeFiles', params.includeFiles ? 'true' : 'false');
  }
  if (params.accountId) {
    query.set('accountId', params.accountId);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  const raw = await client.requestJson<JsonValue>(`/skills${suffix}`, {
    method: 'GET',
  });

  return client.parseWithSchema(
    raw,
    skillRegistryListResponseSchema,
    'skill registry list response',
  );
}

export async function quoteSkillPublish(
  client: RegistryBrokerClient,
  payload: SkillRegistryQuoteRequest,
): Promise<SkillRegistryQuoteResponse> {
  const raw = await client.requestJson<JsonValue>('/skills/quote', {
    method: 'POST',
    body: payload,
    headers: { 'content-type': 'application/json' },
  });

  return client.parseWithSchema(
    raw,
    skillRegistryQuoteResponseSchema,
    'skill registry quote response',
  );
}

export async function publishSkill(
  client: RegistryBrokerClient,
  payload: SkillRegistryPublishRequest,
): Promise<SkillRegistryPublishResponse> {
  const raw = await client.requestJson<JsonValue>('/skills/publish', {
    method: 'POST',
    body: payload,
    headers: { 'content-type': 'application/json' },
  });

  return client.parseWithSchema(
    raw,
    skillRegistryPublishResponseSchema,
    'skill registry publish response',
  );
}

export async function getSkillPublishJob(
  client: RegistryBrokerClient,
  jobId: string,
  params: { accountId?: string } = {},
): Promise<SkillRegistryJobStatusResponse> {
  const normalized = jobId.trim();
  if (!normalized) {
    throw new Error('jobId is required');
  }

  const query = new URLSearchParams();
  if (params.accountId) {
    query.set('accountId', params.accountId);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  const raw = await client.requestJson<JsonValue>(
    `/skills/jobs/${encodeURIComponent(normalized)}${suffix}`,
    { method: 'GET' },
  );

  return client.parseWithSchema(
    raw,
    skillRegistryJobStatusResponseSchema,
    'skill registry job status response',
  );
}

export async function getSkillOwnership(
  client: RegistryBrokerClient,
  params: { name: string; accountId?: string },
): Promise<SkillRegistryOwnershipResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const query = new URLSearchParams();
  query.set('name', normalizedName);
  if (params.accountId) {
    query.set('accountId', params.accountId);
  }

  const raw = await client.requestJson<JsonValue>(
    `/skills/ownership?${query.toString()}`,
    {
      method: 'GET',
    },
  );

  return client.parseWithSchema(
    raw,
    skillRegistryOwnershipResponseSchema,
    'skill registry ownership response',
  );
}
