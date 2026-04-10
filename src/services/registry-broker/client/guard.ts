import type {
  GuardBalanceResponse,
  GuardReceiptSyncPayload,
  GuardReceiptSyncResponse,
  GuardRevocationResponse,
  GuardSessionResponse,
  GuardTrustByHashResponse,
  GuardTrustResolveQuery,
  GuardTrustResolveResponse,
  JsonValue,
} from '../types';
import {
  guardBalanceResponseSchema,
  guardReceiptSyncResponseSchema,
  guardRevocationResponseSchema,
  guardSessionResponseSchema,
  guardTrustByHashResponseSchema,
  guardTrustResolveResponseSchema,
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

export async function syncGuardReceipts(
  client: RegistryBrokerClient,
  payload: GuardReceiptSyncPayload,
): Promise<GuardReceiptSyncResponse> {
  const raw = await client.requestJson<JsonValue>('/guard/receipts/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  return client.parseWithSchema(
    raw,
    guardReceiptSyncResponseSchema,
    'guard receipt sync response',
  );
}
