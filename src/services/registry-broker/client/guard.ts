import type {
  GuardAlertPreferences,
  GuardAlertPreferencesUpdate,
  GuardAbomResponse,
  GuardArtifactTimelineResponse,
  GuardBalanceResponse,
  GuardFeedResponse,
  GuardOverviewResponse,
  GuardPolicy,
  GuardDeviceListResponse,
  GuardExceptionListResponse,
  GuardExceptionUpsert,
  GuardInventoryDiffResponse,
  GuardInventoryResponse,
  GuardPainSignalAggregateResponse,
  GuardPainSignalIngestItem,
  GuardPainSignalListResponse,
  GuardPreflightRequest,
  GuardPreflightVerdictResponse,
  GuardReceiptExportResponse,
  GuardReceiptHistoryResponse,
  GuardReceiptSyncPayload,
  GuardReceiptSyncResponse,
  GuardRevocationResponse,
  GuardSessionResponse,
  GuardTeamPolicyPack,
  GuardTeamPolicyPackUpdate,
  GuardTrustByHashResponse,
  GuardTrustResolveQuery,
  GuardTrustResolveResponse,
  GuardWatchlistResponse,
  GuardWatchlistLookupResponse,
  GuardWatchlistUpsert,
  JsonValue,
} from '../types';
import {
  guardAlertPreferencesSchema,
  guardAbomResponseSchema,
  guardArtifactTimelineResponseSchema,
  guardBalanceResponseSchema,
  guardFeedResponseSchema,
  guardOverviewResponseSchema,
  guardPolicySchema,
  guardDeviceListResponseSchema,
  guardExceptionListResponseSchema,
  guardInventoryDiffResponseSchema,
  guardInventoryResponseSchema,
  guardPainSignalListResponseSchema,
  guardPainSignalAggregateResponseSchema,
  guardPreflightVerdictResponseSchema,
  guardReceiptExportResponseSchema,
  guardReceiptHistoryResponseSchema,
  guardReceiptSyncResponseSchema,
  guardRevocationResponseSchema,
  guardSessionResponseSchema,
  guardTeamPolicyPackSchema,
  guardTrustByHashResponseSchema,
  guardTrustResolveResponseSchema,
  guardWatchlistLookupResponseSchema,
  guardWatchlistResponseSchema,
} from '../schemas';
import type { RegistryBrokerClient, RequestConfig } from './base-client';
import { RegistryBrokerError } from './errors';

function isStatusError(error: unknown): error is { status: number } {
  if (error instanceof RegistryBrokerError) {
    return true;
  }
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }
  return typeof Reflect.get(error, 'status') === 'number';
}

function toPortalCanonicalGuardPath(path: string): string {
  const legacyPrefixes = ['/registry/api/v1/guard', '/api/v1/guard', '/guard'];
  for (const prefix of legacyPrefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `/api/guard${path.slice(prefix.length)}`;
    }
  }
  return path;
}

function buildPortalCanonicalGuardUrl(baseUrl: string, path: string): string {
  const target = new URL(path, 'https://guard.local');
  const canonicalPath = toPortalCanonicalGuardPath(target.pathname);
  const canonicalRelativePath = `${canonicalPath}${target.search}`;
  try {
    const base = new URL(baseUrl);
    return `${base.origin}${canonicalRelativePath}`;
  } catch {
    return canonicalRelativePath;
  }
}

async function requestPortalFirstJson<T extends JsonValue>(
  client: RegistryBrokerClient,
  path: string,
  init: RequestConfig,
): Promise<T> {
  try {
    return await client.requestJson<T>(path, init);
  } catch (error) {
    if (
      isStatusError(error) &&
      (error.status === 404 || error.status === 501)
    ) {
      return client.requestAbsoluteJson<T>(
        buildPortalCanonicalGuardUrl(client.baseUrl, path),
        init,
      );
    }
    throw error;
  }
}

export async function getGuardSession(
  client: RegistryBrokerClient,
): Promise<GuardSessionResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/auth/session',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardSessionResponseSchema,
    'guard session response',
  );
}

export async function getGuardEntitlements(
  client: RegistryBrokerClient,
): Promise<GuardSessionResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/entitlements',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardSessionResponseSchema,
    'guard entitlements response',
  );
}

export async function getGuardBillingBalance(
  client: RegistryBrokerClient,
): Promise<GuardBalanceResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/billing/balance',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardBalanceResponseSchema,
    'guard billing balance response',
  );
}

export async function getGuardFeed(
  client: RegistryBrokerClient,
  limit?: number,
): Promise<GuardFeedResponse> {
  const params = new URLSearchParams();
  if (
    typeof limit === 'number' &&
    Number.isFinite(limit) &&
    Math.trunc(limit) > 0
  ) {
    params.set('limit', String(Math.trunc(limit)));
  }
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    `/guard/feed${suffix}`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardFeedResponseSchema,
    'guard feed response',
  );
}

export async function getGuardOverview(
  client: RegistryBrokerClient,
): Promise<GuardOverviewResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/overview',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardOverviewResponseSchema,
    'guard overview response',
  );
}

export async function getGuardTrustByHash(
  client: RegistryBrokerClient,
  sha256: string,
): Promise<GuardTrustByHashResponse> {
  const normalizedHash = sha256.trim();
  if (!normalizedHash) {
    throw new Error('sha256 is required');
  }
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    `/guard/trust/by-hash/${encodeURIComponent(normalizedHash)}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    guardTrustByHashResponseSchema,
    'guard trust by hash response',
  );
}

export async function resolveGuardTrust(
  client: RegistryBrokerClient,
  query: GuardTrustResolveQuery,
): Promise<GuardTrustResolveResponse> {
  const params = new URLSearchParams();
  if (query.ecosystem?.trim()) {
    params.set('ecosystem', query.ecosystem.trim());
  }
  if (query.name?.trim()) {
    params.set('name', query.name.trim());
  }
  if (query.version?.trim()) {
    params.set('version', query.version.trim());
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    `/guard/trust/resolve${suffix}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    guardTrustResolveResponseSchema,
    'guard trust resolve response',
  );
}

export async function getGuardRevocations(
  client: RegistryBrokerClient,
): Promise<GuardRevocationResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/revocations',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardRevocationResponseSchema,
    'guard revocations response',
  );
}

export async function fetchGuardAdvisories(
  client: RegistryBrokerClient,
): Promise<GuardRevocationResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/advisories',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardRevocationResponseSchema,
    'guard advisories response',
  );
}

export async function fetchGuardPolicy(
  client: RegistryBrokerClient,
): Promise<GuardPolicy> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/policy/fetch',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardPolicySchema,
    'guard policy response',
  );
}

export async function getGuardInventory(
  client: RegistryBrokerClient,
): Promise<GuardInventoryResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/inventory',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardInventoryResponseSchema,
    'guard inventory response',
  );
}

export async function getGuardReceiptHistory(
  client: RegistryBrokerClient,
): Promise<GuardReceiptHistoryResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/history',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardReceiptHistoryResponseSchema,
    'guard receipt history response',
  );
}

export async function getGuardArtifactTimeline(
  client: RegistryBrokerClient,
  artifactId: string,
): Promise<GuardArtifactTimelineResponse> {
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) {
    throw new Error('artifactId is required');
  }
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    `/guard/history/${encodeURIComponent(normalizedArtifactId)}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    guardArtifactTimelineResponseSchema,
    'guard artifact timeline response',
  );
}

export async function exportGuardAbom(
  client: RegistryBrokerClient,
): Promise<GuardAbomResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(client, '/guard/abom', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardAbomResponseSchema,
    'guard abom response',
  );
}

export async function exportGuardArtifactAbom(
  client: RegistryBrokerClient,
  artifactId: string,
): Promise<GuardAbomResponse> {
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) {
    throw new Error('artifactId is required');
  }
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    `/guard/abom/${encodeURIComponent(normalizedArtifactId)}`,
    { method: 'GET' },
  );
  return client.parseWithSchema(
    raw,
    guardAbomResponseSchema,
    'guard artifact abom response',
  );
}

export async function exportGuardReceipts(
  client: RegistryBrokerClient,
): Promise<GuardReceiptExportResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/receipts/export',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardReceiptExportResponseSchema,
    'guard receipt export response',
  );
}

export async function getGuardInventoryDiff(
  client: RegistryBrokerClient,
): Promise<GuardInventoryDiffResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/inventory/diff',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardInventoryDiffResponseSchema,
    'guard inventory diff response',
  );
}

export async function getGuardDevices(
  client: RegistryBrokerClient,
): Promise<GuardDeviceListResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/devices',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardDeviceListResponseSchema,
    'guard devices response',
  );
}

export async function getGuardAlertPreferences(
  client: RegistryBrokerClient,
): Promise<GuardAlertPreferences> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/alerts/preferences',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardAlertPreferencesSchema,
    'guard alert preferences response',
  );
}

export async function updateGuardAlertPreferences(
  client: RegistryBrokerClient,
  payload: GuardAlertPreferencesUpdate,
): Promise<GuardAlertPreferences> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/alerts/preferences',
    {
      method: 'PUT',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardAlertPreferencesSchema,
    'guard alert preferences response',
  );
}

export async function getGuardExceptions(
  client: RegistryBrokerClient,
): Promise<GuardExceptionListResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/exceptions',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardExceptionListResponseSchema,
    'guard exceptions response',
  );
}

export async function getGuardWatchlist(
  client: RegistryBrokerClient,
): Promise<GuardWatchlistResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/watchlist',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardWatchlistResponseSchema,
    'guard watchlist response',
  );
}

export async function lookupGuardWatchlist(
  client: RegistryBrokerClient,
  payload: GuardPreflightRequest,
): Promise<GuardWatchlistLookupResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/watchlist/lookup',
    {
      method: 'POST',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardWatchlistLookupResponseSchema,
    'guard watchlist lookup response',
  );
}

export async function getGuardPainSignals(
  client: RegistryBrokerClient,
): Promise<GuardPainSignalListResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/signals/pain',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardPainSignalListResponseSchema,
    'guard pain signals response',
  );
}

export async function getGuardAggregatedPainSignals(
  client: RegistryBrokerClient,
): Promise<GuardPainSignalAggregateResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/signals/pain/aggregate',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardPainSignalAggregateResponseSchema,
    'guard aggregated pain signals response',
  );
}

async function getGuardPreflightVerdict(
  client: RegistryBrokerClient,
  path: '/guard/verdict/pre-install' | '/guard/verdict/pre-execution',
  payload: GuardPreflightRequest,
): Promise<GuardPreflightVerdictResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(client, path, {
    method: 'POST',
    body: payload,
  });
  return client.parseWithSchema(
    raw,
    guardPreflightVerdictResponseSchema,
    'guard preflight verdict response',
  );
}

export async function getGuardPreInstallVerdict(
  client: RegistryBrokerClient,
  payload: GuardPreflightRequest,
): Promise<GuardPreflightVerdictResponse> {
  return getGuardPreflightVerdict(
    client,
    '/guard/verdict/pre-install',
    payload,
  );
}

export async function getGuardPreExecutionVerdict(
  client: RegistryBrokerClient,
  payload: GuardPreflightRequest,
): Promise<GuardPreflightVerdictResponse> {
  return getGuardPreflightVerdict(
    client,
    '/guard/verdict/pre-execution',
    payload,
  );
}

export async function ingestGuardPainSignals(
  client: RegistryBrokerClient,
  items: GuardPainSignalIngestItem[],
): Promise<GuardPainSignalListResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/signals/pain',
    {
      method: 'POST',
      body: { items },
    },
  );
  return client.parseWithSchema(
    raw,
    guardPainSignalListResponseSchema,
    'guard pain signals response',
  );
}

export async function submitGuardReceipts(
  client: RegistryBrokerClient,
  payload: GuardReceiptSyncPayload,
): Promise<GuardReceiptSyncResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/receipts/submit',
    {
      method: 'POST',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardReceiptSyncResponseSchema,
    'guard receipt submit response',
  );
}

export async function addGuardWatchlistItem(
  client: RegistryBrokerClient,
  payload: GuardWatchlistUpsert,
): Promise<GuardWatchlistResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/watchlist',
    {
      method: 'POST',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardWatchlistResponseSchema,
    'guard watchlist response',
  );
}

export async function removeGuardWatchlistItem(
  client: RegistryBrokerClient,
  artifactId: string,
): Promise<GuardWatchlistResponse> {
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) {
    throw new Error('artifactId is required');
  }
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    `/guard/watchlist/${encodeURIComponent(normalizedArtifactId)}`,
    { method: 'DELETE' },
  );
  return client.parseWithSchema(
    raw,
    guardWatchlistResponseSchema,
    'guard watchlist response',
  );
}

export async function addGuardException(
  client: RegistryBrokerClient,
  payload: GuardExceptionUpsert,
): Promise<GuardExceptionListResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/exceptions',
    {
      method: 'POST',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardExceptionListResponseSchema,
    'guard exceptions response',
  );
}

export async function requestGuardException(
  client: RegistryBrokerClient,
  payload: GuardExceptionUpsert,
): Promise<GuardExceptionListResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/exceptions/request',
    {
      method: 'POST',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardExceptionListResponseSchema,
    'guard exception request response',
  );
}

export async function syncGuardInventory(
  client: RegistryBrokerClient,
  payload: GuardReceiptSyncPayload,
): Promise<GuardReceiptSyncResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/inventory/sync',
    {
      method: 'POST',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardReceiptSyncResponseSchema,
    'guard inventory sync response',
  );
}

export async function removeGuardException(
  client: RegistryBrokerClient,
  exceptionId: string,
): Promise<GuardExceptionListResponse> {
  const normalizedExceptionId = exceptionId.trim();
  if (!normalizedExceptionId) {
    throw new Error('exceptionId is required');
  }
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    `/guard/exceptions/${encodeURIComponent(normalizedExceptionId)}`,
    { method: 'DELETE' },
  );
  return client.parseWithSchema(
    raw,
    guardExceptionListResponseSchema,
    'guard exceptions response',
  );
}

export async function getGuardTeamPolicyPack(
  client: RegistryBrokerClient,
): Promise<GuardTeamPolicyPack> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/team/policy-pack',
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    guardTeamPolicyPackSchema,
    'guard team policy pack response',
  );
}

export async function updateGuardTeamPolicyPack(
  client: RegistryBrokerClient,
  payload: GuardTeamPolicyPackUpdate,
): Promise<GuardTeamPolicyPack> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/team/policy-pack',
    {
      method: 'PUT',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardTeamPolicyPackSchema,
    'guard team policy pack response',
  );
}

export async function syncGuardReceipts(
  client: RegistryBrokerClient,
  payload: GuardReceiptSyncPayload,
): Promise<GuardReceiptSyncResponse> {
  const raw = await requestPortalFirstJson<JsonValue>(
    client,
    '/guard/receipts/sync',
    {
      method: 'POST',
      body: payload,
    },
  );
  return client.parseWithSchema(
    raw,
    guardReceiptSyncResponseSchema,
    'guard receipt sync response',
  );
}
