import type {
  GuardAlertPreferences,
  GuardAlertPreferencesUpdate,
  GuardAbomResponse,
  GuardArtifactTimelineResponse,
  GuardBalanceResponse,
  GuardDeviceListResponse,
  GuardExceptionListResponse,
  GuardExceptionUpsert,
  GuardInventoryDiffResponse,
  GuardInventoryResponse,
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
  GuardWatchlistUpsert,
  JsonValue,
} from '../types';
import {
  guardAlertPreferencesSchema,
  guardAbomResponseSchema,
  guardArtifactTimelineResponseSchema,
  guardBalanceResponseSchema,
  guardDeviceListResponseSchema,
  guardExceptionListResponseSchema,
  guardInventoryDiffResponseSchema,
  guardInventoryResponseSchema,
  guardReceiptExportResponseSchema,
  guardReceiptHistoryResponseSchema,
  guardReceiptSyncResponseSchema,
  guardRevocationResponseSchema,
  guardSessionResponseSchema,
  guardTeamPolicyPackSchema,
  guardTrustByHashResponseSchema,
  guardTrustResolveResponseSchema,
  guardWatchlistResponseSchema,
} from '../schemas';
import type { RegistryBrokerClient } from './base-client';

export async function getGuardSession(
  client: RegistryBrokerClient,
): Promise<GuardSessionResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/auth/session', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardSessionResponseSchema,
    'guard session response',
  );
}

export async function getGuardEntitlements(
  client: RegistryBrokerClient,
): Promise<GuardSessionResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/entitlements', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardSessionResponseSchema,
    'guard entitlements response',
  );
}

export async function getGuardBillingBalance(
  client: RegistryBrokerClient,
): Promise<GuardBalanceResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/billing/balance', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardBalanceResponseSchema,
    'guard billing balance response',
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
  const raw = await client.requestJson<JsonValue>(
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
  const raw = await client.requestJson<JsonValue>(
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
  const raw = await client.requestJson<JsonValue>('/guard/revocations', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardRevocationResponseSchema,
    'guard revocations response',
  );
}

export async function getGuardInventory(
  client: RegistryBrokerClient,
): Promise<GuardInventoryResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/inventory', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardInventoryResponseSchema,
    'guard inventory response',
  );
}

export async function getGuardReceiptHistory(
  client: RegistryBrokerClient,
): Promise<GuardReceiptHistoryResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/history', {
    method: 'GET',
  });
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
  const raw = await client.requestJson<JsonValue>(
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
  const raw = await client.requestJson<JsonValue>('/guard/abom', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardAbomResponseSchema,
    'guard abom response',
  );
}

export async function exportGuardReceipts(
  client: RegistryBrokerClient,
): Promise<GuardReceiptExportResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/receipts/export', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardReceiptExportResponseSchema,
    'guard receipt export response',
  );
}

export async function getGuardInventoryDiff(
  client: RegistryBrokerClient,
): Promise<GuardInventoryDiffResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/inventory/diff', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardInventoryDiffResponseSchema,
    'guard inventory diff response',
  );
}

export async function getGuardDevices(
  client: RegistryBrokerClient,
): Promise<GuardDeviceListResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/devices', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardDeviceListResponseSchema,
    'guard devices response',
  );
}

export async function getGuardAlertPreferences(
  client: RegistryBrokerClient,
): Promise<GuardAlertPreferences> {
  const raw = await client.requestJson<JsonValue>('/guard/alerts/preferences', {
    method: 'GET',
  });
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
  const raw = await client.requestJson<JsonValue>('/guard/alerts/preferences', {
    method: 'PUT',
    body: payload,
  });
  return client.parseWithSchema(
    raw,
    guardAlertPreferencesSchema,
    'guard alert preferences response',
  );
}

export async function getGuardExceptions(
  client: RegistryBrokerClient,
): Promise<GuardExceptionListResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/exceptions', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardExceptionListResponseSchema,
    'guard exceptions response',
  );
}

export async function getGuardWatchlist(
  client: RegistryBrokerClient,
): Promise<GuardWatchlistResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/watchlist', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    guardWatchlistResponseSchema,
    'guard watchlist response',
  );
}

export async function addGuardWatchlistItem(
  client: RegistryBrokerClient,
  payload: GuardWatchlistUpsert,
): Promise<GuardWatchlistResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/watchlist', {
    method: 'POST',
    body: payload,
  });
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
  const raw = await client.requestJson<JsonValue>(
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
  const raw = await client.requestJson<JsonValue>('/guard/exceptions', {
    method: 'POST',
    body: payload,
  });
  return client.parseWithSchema(
    raw,
    guardExceptionListResponseSchema,
    'guard exceptions response',
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
  const raw = await client.requestJson<JsonValue>(
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
  const raw = await client.requestJson<JsonValue>('/guard/team/policy-pack', {
    method: 'GET',
  });
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
  const raw = await client.requestJson<JsonValue>('/guard/team/policy-pack', {
    method: 'PUT',
    body: payload,
  });
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
  const raw = await client.requestJson<JsonValue>('/guard/receipts/sync', {
    method: 'POST',
    body: payload,
  });
  return client.parseWithSchema(
    raw,
    guardReceiptSyncResponseSchema,
    'guard receipt sync response',
  );
}
