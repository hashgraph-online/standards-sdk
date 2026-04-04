import type {
  JsonValue,
  SkillBadgeQuery,
  SkillBadgeResponse,
  SkillCatalogQueryOptions,
  SkillCatalogResponse,
  SkillDeprecationRecord,
  SkillDeprecationSetRequest,
  SkillDeprecationsResponse,
  SkillListOptions,
  SkillRecommendedVersionResponse,
  SkillRecommendedVersionSetRequest,
  SkillRegistryConfigResponse,
  SkillStatusResponse,
  SkillRegistryCategoriesResponse,
  SkillSecurityBreakdownRequest,
  SkillSecurityBreakdownResponse,
  SkillRegistryJobStatusResponse,
  SkillRegistryListResponse,
  SkillRegistryMineResponse,
  SkillRegistryMyListResponse,
  SkillRegistryOwnershipResponse,
  SkillRegistryPublishRequest,
  SkillRegistryPublishResponse,
  SkillRegistryQuoteRequest,
  SkillRegistryQuoteResponse,
  SkillRegistryTagsResponse,
  SkillRegistryVoteRequest,
  SkillRegistryVoteStatusResponse,
  SkillResolverManifestResponse,
  SkillRegistryVersionsResponse,
  SkillVerificationDomainProofChallengeRequest,
  SkillVerificationDomainProofChallengeResponse,
  SkillVerificationDomainProofVerifyRequest,
  SkillVerificationDomainProofVerifyResponse,
  SkillVerificationRequestCreateRequest,
  SkillVerificationRequestCreateResponse,
  SkillVerificationStatusResponse,
} from '../types';
import {
  skillBadgeResponseSchema,
  skillCatalogResponseSchema,
  skillDeprecationRecordSchema,
  skillDeprecationsResponseSchema,
  skillRecommendedVersionResponseSchema,
  skillRegistryConfigResponseSchema,
  skillStatusResponseSchema,
  skillRegistryCategoriesResponseSchema,
  skillRegistryJobStatusResponseSchema,
  skillRegistryListResponseSchema,
  skillSecurityBreakdownResponseSchema,
  skillRegistryMineResponseSchema,
  skillRegistryMyListResponseSchema,
  skillRegistryOwnershipResponseSchema,
  skillRegistryPublishResponseSchema,
  skillRegistryQuoteResponseSchema,
  skillRegistryTagsResponseSchema,
  skillRegistryVoteStatusResponseSchema,
  skillResolverManifestResponseSchema,
  skillVerificationDomainProofChallengeResponseSchema,
  skillVerificationDomainProofVerifyResponseSchema,
  skillRegistryVersionsResponseSchema,
  skillVerificationRequestCreateResponseSchema,
  skillVerificationStatusResponseSchema,
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

export async function getSkillStatus(
  client: RegistryBrokerClient,
  params: { name: string; version?: string },
): Promise<SkillStatusResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const query = new URLSearchParams();
  query.set('name', normalizedName);
  if (params.version?.trim()) {
    query.set('version', params.version.trim());
  }

  const raw = await client.requestJson<JsonValue>(
    `/skills/status?${query.toString()}`,
    {
      method: 'GET',
    },
  );

  return client.parseWithSchema(
    raw,
    skillStatusResponseSchema,
    'skill status response',
  );
}

export async function listSkills(
  client: RegistryBrokerClient,
  params: SkillListOptions = {},
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
  if (params.q) {
    query.set('q', params.q);
  }
  if (params.tag) {
    query.set('tag', params.tag);
  }
  if (params.category) {
    query.set('category', params.category);
  }
  if (typeof params.featured === 'boolean') {
    query.set('featured', params.featured ? 'true' : 'false');
  }
  if (typeof params.verified === 'boolean') {
    query.set('verified', params.verified ? 'true' : 'false');
  }
  if (params.view) {
    query.set('view', params.view);
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

export async function getSkillSecurityBreakdown(
  client: RegistryBrokerClient,
  params: SkillSecurityBreakdownRequest,
): Promise<SkillSecurityBreakdownResponse> {
  const normalizedJobId = params.jobId.trim();
  if (!normalizedJobId) {
    throw new Error('jobId is required');
  }

  const raw = await client.requestJson<JsonValue>(
    `/skills/${encodeURIComponent(normalizedJobId)}/security-breakdown`,
    { method: 'GET' },
  );

  return client.parseWithSchema(
    raw,
    skillSecurityBreakdownResponseSchema,
    'skill security breakdown response',
  );
}

export async function getSkillsCatalog(
  client: RegistryBrokerClient,
  params: SkillCatalogQueryOptions = {},
): Promise<SkillCatalogResponse> {
  const query = new URLSearchParams();
  if (params.q) {
    query.set('q', params.q);
  }
  if (params.category) {
    query.set('category', params.category);
  }
  params.tags?.forEach(tag => {
    if (tag.trim()) {
      query.append('tag', tag.trim());
    }
  });
  if (typeof params.featured === 'boolean') {
    query.set('featured', params.featured ? 'true' : 'false');
  }
  if (typeof params.verified === 'boolean') {
    query.set('verified', params.verified ? 'true' : 'false');
  }
  if (params.channel) {
    query.set('channel', params.channel);
  }
  if (params.sortBy) {
    query.set('sortBy', params.sortBy);
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.trunc(params.limit)));
  }
  if (params.cursor) {
    query.set('cursor', params.cursor);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  const raw = await client.requestJson<JsonValue>(`/skills/catalog${suffix}`, {
    method: 'GET',
  });

  return client.parseWithSchema(
    raw,
    skillCatalogResponseSchema,
    'skill catalog response',
  );
}

export async function listSkillVersions(
  client: RegistryBrokerClient,
  params: { name: string },
): Promise<SkillRegistryVersionsResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const query = new URLSearchParams();
  query.set('name', normalizedName);

  const raw = await client.requestJson<JsonValue>(
    `/skills/versions?${query.toString()}`,
    { method: 'GET' },
  );

  return client.parseWithSchema(
    raw,
    skillRegistryVersionsResponseSchema,
    'skill registry versions response',
  );
}

export async function listMySkills(
  client: RegistryBrokerClient,
  params: { limit?: number } = {},
): Promise<SkillRegistryMineResponse> {
  const query = new URLSearchParams();
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.trunc(params.limit)));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  const raw = await client.requestJson<JsonValue>(`/skills/mine${suffix}`, {
    method: 'GET',
  });

  return client.parseWithSchema(
    raw,
    skillRegistryMineResponseSchema,
    'skill registry mine response',
  );
}

export async function getMySkillsList(
  client: RegistryBrokerClient,
  params: { limit?: number; cursor?: string; accountId?: string } = {},
): Promise<SkillRegistryMyListResponse> {
  const query = new URLSearchParams();
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.set('limit', String(Math.trunc(params.limit)));
  }
  if (params.cursor) {
    query.set('cursor', params.cursor);
  }
  if (params.accountId) {
    query.set('accountId', params.accountId);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  const raw = await client.requestJson<JsonValue>(`/skills/my-list${suffix}`, {
    method: 'GET',
  });

  return client.parseWithSchema(
    raw,
    skillRegistryMyListResponseSchema,
    'skill registry my list response',
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

export async function getRecommendedSkillVersion(
  client: RegistryBrokerClient,
  params: { name: string },
): Promise<SkillRecommendedVersionResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }
  const query = new URLSearchParams();
  query.set('name', normalizedName);
  const raw = await client.requestJson<JsonValue>(
    `/skills/recommended?${query.toString()}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    skillRecommendedVersionResponseSchema,
    'skill recommended version response',
  );
}

export async function setRecommendedSkillVersion(
  client: RegistryBrokerClient,
  payload: SkillRecommendedVersionSetRequest,
): Promise<SkillRecommendedVersionResponse> {
  const normalizedName = payload.name.trim();
  const normalizedVersion = payload.version.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }
  if (!normalizedVersion) {
    throw new Error('version is required');
  }
  const raw = await client.requestJson<JsonValue>('/skills/recommended', {
    method: 'POST',
    body: {
      name: normalizedName,
      version: normalizedVersion,
    },
    headers: { 'content-type': 'application/json' },
  });
  return client.parseWithSchema(
    raw,
    skillRecommendedVersionResponseSchema,
    'skill recommended version response',
  );
}

export async function getSkillDeprecations(
  client: RegistryBrokerClient,
  params: { name: string },
): Promise<SkillDeprecationsResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }
  const query = new URLSearchParams();
  query.set('name', normalizedName);
  const raw = await client.requestJson<JsonValue>(
    `/skills/deprecations?${query.toString()}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    skillDeprecationsResponseSchema,
    'skill deprecations response',
  );
}

export async function setSkillDeprecation(
  client: RegistryBrokerClient,
  payload: SkillDeprecationSetRequest,
): Promise<SkillDeprecationRecord> {
  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }
  const version = payload.version?.trim();
  const reason = payload.reason.trim();
  if (!reason) {
    throw new Error('reason is required');
  }
  const replacementRef = payload.replacementRef?.trim();
  const raw = await client.requestJson<JsonValue>('/skills/deprecate', {
    method: 'POST',
    body: {
      name: normalizedName,
      version,
      reason,
      replacementRef,
    },
    headers: { 'content-type': 'application/json' },
  });
  return client.parseWithSchema(
    raw,
    skillDeprecationRecordSchema,
    'skill deprecation response',
  );
}

export async function getSkillBadge(
  client: RegistryBrokerClient,
  params: SkillBadgeQuery,
): Promise<SkillBadgeResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }
  const query = new URLSearchParams();
  query.set('name', normalizedName);
  if (params.metric) {
    query.set('metric', params.metric);
  }
  if (params.label?.trim()) {
    query.set('label', params.label.trim());
  }
  if (params.style) {
    query.set('style', params.style);
  }
  const raw = await client.requestJson<JsonValue>(
    `/skills/badge?${query.toString()}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    skillBadgeResponseSchema,
    'skill badge response',
  );
}

export async function listSkillTags(
  client: RegistryBrokerClient,
): Promise<SkillRegistryTagsResponse> {
  const raw = await client.requestJson<JsonValue>('/skills/tags', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    skillRegistryTagsResponseSchema,
    'skill tags response',
  );
}

export async function listSkillCategories(
  client: RegistryBrokerClient,
): Promise<SkillRegistryCategoriesResponse> {
  const raw = await client.requestJson<JsonValue>('/skills/categories', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    skillRegistryCategoriesResponseSchema,
    'skill categories response',
  );
}

export async function resolveSkillMarkdown(
  client: RegistryBrokerClient,
  skillRef: string,
): Promise<string> {
  const normalizedSkillRef = skillRef.trim();
  if (!normalizedSkillRef) {
    throw new Error('skillRef is required');
  }
  const response = await client.request(
    `/skills/${encodeURIComponent(normalizedSkillRef)}/SKILL.md`,
    {
      method: 'GET',
      headers: {
        accept: 'text/markdown, text/plain;q=0.9, */*;q=0.8',
      },
    },
  );
  return response.text();
}

export async function resolveSkillManifest(
  client: RegistryBrokerClient,
  skillRef: string,
): Promise<SkillResolverManifestResponse> {
  const normalizedSkillRef = skillRef.trim();
  if (!normalizedSkillRef) {
    throw new Error('skillRef is required');
  }
  const raw = await client.requestJson<JsonValue>(
    `/skills/${encodeURIComponent(normalizedSkillRef)}/manifest`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    skillResolverManifestResponseSchema,
    'skill resolver manifest response',
  );
}

export async function getSkillVoteStatus(
  client: RegistryBrokerClient,
  params: { name: string },
): Promise<SkillRegistryVoteStatusResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const query = new URLSearchParams();
  query.set('name', normalizedName);

  const raw = await client.requestJson<JsonValue>(
    `/skills/vote?${query.toString()}`,
    { method: 'GET' },
  );

  return client.parseWithSchema(
    raw,
    skillRegistryVoteStatusResponseSchema,
    'skill registry vote status response',
  );
}

export async function setSkillVote(
  client: RegistryBrokerClient,
  payload: SkillRegistryVoteRequest,
): Promise<SkillRegistryVoteStatusResponse> {
  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const raw = await client.requestJson<JsonValue>('/skills/vote', {
    method: 'POST',
    body: { name: normalizedName, upvoted: payload.upvoted },
    headers: { 'content-type': 'application/json' },
  });

  return client.parseWithSchema(
    raw,
    skillRegistryVoteStatusResponseSchema,
    'skill registry vote status response',
  );
}

export async function requestSkillVerification(
  client: RegistryBrokerClient,
  payload: SkillVerificationRequestCreateRequest,
): Promise<SkillVerificationRequestCreateResponse> {
  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const raw = await client.requestJson<JsonValue>(
    '/skills/verification/request',
    {
      method: 'POST',
      body: {
        name: normalizedName,
        version: payload.version,
        tier: payload.tier,
      },
      headers: { 'content-type': 'application/json' },
    },
  );

  return client.parseWithSchema(
    raw,
    skillVerificationRequestCreateResponseSchema,
    'skill verification request create response',
  );
}

export async function getSkillVerificationStatus(
  client: RegistryBrokerClient,
  params: { name: string; version?: string },
): Promise<SkillVerificationStatusResponse> {
  const normalizedName = params.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const query = new URLSearchParams();
  query.set('name', normalizedName);
  if (params.version) {
    query.set('version', params.version);
  }

  const raw = await client.requestJson<JsonValue>(
    `/skills/verification/status?${query.toString()}`,
    { method: 'GET' },
  );

  return client.parseWithSchema(
    raw,
    skillVerificationStatusResponseSchema,
    'skill verification status response',
  );
}

export async function createSkillDomainProofChallenge(
  client: RegistryBrokerClient,
  payload: SkillVerificationDomainProofChallengeRequest,
): Promise<SkillVerificationDomainProofChallengeResponse> {
  const normalizedName = payload.name.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }

  const raw = await client.requestJson<JsonValue>(
    '/skills/verification/domain/challenge',
    {
      method: 'POST',
      body: {
        name: normalizedName,
        version: payload.version,
        domain: payload.domain,
      },
      headers: { 'content-type': 'application/json' },
    },
  );

  return client.parseWithSchema(
    raw,
    skillVerificationDomainProofChallengeResponseSchema,
    'skill domain proof challenge response',
  );
}

export async function verifySkillDomainProof(
  client: RegistryBrokerClient,
  payload: SkillVerificationDomainProofVerifyRequest,
): Promise<SkillVerificationDomainProofVerifyResponse> {
  const normalizedName = payload.name.trim();
  const challengeToken = payload.challengeToken.trim();
  if (!normalizedName) {
    throw new Error('name is required');
  }
  if (!challengeToken) {
    throw new Error('challengeToken is required');
  }

  const raw = await client.requestJson<JsonValue>(
    '/skills/verification/domain/verify',
    {
      method: 'POST',
      body: {
        name: normalizedName,
        version: payload.version,
        domain: payload.domain,
        challengeToken,
      },
      headers: { 'content-type': 'application/json' },
    },
  );

  return client.parseWithSchema(
    raw,
    skillVerificationDomainProofVerifyResponseSchema,
    'skill domain proof verify response',
  );
}
