import type {
  AgentRegistrationRequest,
  DashboardStatsResponse,
  JsonValue,
  RegisterAgentOptions,
  RegisterAgentQuoteResponse,
  RegisterAgentResponse,
  RegistrationProgressRecord,
  RegistrationProgressWaitOptions,
  ResolvedAgentResponse,
  UaidConnectionStatus,
  UaidValidationResponse,
} from '../types';
import {
  dashboardStatsResponseSchema,
  registerAgentResponseSchema,
  registrationProgressResponseSchema,
  registrationQuoteResponseSchema,
  resolveResponseSchema,
  uaidConnectionStatusSchema,
  uaidValidationResponseSchema,
} from '../schemas';
import type { RegistryBrokerClient } from './base-client';
import { purchaseCreditsWithHbar } from './credits';
import {
  createAbortError,
  DEFAULT_PROGRESS_INTERVAL_MS,
  DEFAULT_PROGRESS_TIMEOUT_MS,
  MINIMUM_REGISTRATION_AUTO_TOP_UP_CREDITS,
  serialiseAgentRegistrationRequest,
} from './utils';
import { RegistryBrokerError } from './errors';

async function performRegisterAgent(
  client: RegistryBrokerClient,
  payload: AgentRegistrationRequest,
): Promise<RegisterAgentResponse> {
  const raw = await client.requestJson<JsonValue>('/register', {
    method: 'POST',
    body: serialiseAgentRegistrationRequest(payload),
    headers: { 'content-type': 'application/json' },
  });
  return client.parseWithSchema(
    raw,
    registerAgentResponseSchema,
    'register agent response',
  );
}

function calculateHbarAmount(
  creditsToPurchase: number,
  creditsPerHbar: number,
): number {
  if (creditsPerHbar <= 0) {
    throw new Error('creditsPerHbar must be positive');
  }
  if (creditsToPurchase <= 0) {
    throw new Error('creditsToPurchase must be positive');
  }
  const rawHbar = creditsToPurchase / creditsPerHbar;
  const tinybars = Math.ceil(rawHbar * 1e8);
  return tinybars / 1e8;
}

function resolveCreditsToPurchase(shortfallCredits: number): number {
  if (!Number.isFinite(shortfallCredits) || shortfallCredits <= 0) {
    return 0;
  }
  return Math.max(
    Math.ceil(shortfallCredits),
    MINIMUM_REGISTRATION_AUTO_TOP_UP_CREDITS,
  );
}

async function ensureCreditsForRegistration(
  client: RegistryBrokerClient,
  payload: AgentRegistrationRequest,
  autoTopUp: RegisterAgentOptions['autoTopUp'],
): Promise<void> {
  const details = autoTopUp ?? null;
  if (!details) {
    return;
  }

  if (!details.accountId || !details.accountId.trim()) {
    throw new Error('autoTopUp.accountId is required');
  }

  if (!details.privateKey || !details.privateKey.trim()) {
    throw new Error('autoTopUp.privateKey is required');
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const quote = await getRegistrationQuote(client, payload);
    const shortfall = quote.shortfallCredits ?? 0;
    if (shortfall <= 0) {
      return;
    }
    const creditsToPurchase = resolveCreditsToPurchase(shortfall);
    if (creditsToPurchase <= 0) {
      return;
    }

    const creditsPerHbar = quote.creditsPerHbar ?? null;
    if (!creditsPerHbar || creditsPerHbar <= 0) {
      throw new Error('Unable to determine credits per HBAR for auto top-up');
    }

    const hbarAmount = calculateHbarAmount(creditsToPurchase, creditsPerHbar);

    await purchaseCreditsWithHbar(client, {
      accountId: details.accountId.trim(),
      privateKey: details.privateKey.trim(),
      hbarAmount,
      memo: details.memo ?? 'Registry Broker auto top-up',
      metadata: {
        shortfallCredits: shortfall,
        requiredCredits: quote.requiredCredits,
        purchasedCredits: creditsToPurchase,
      },
    });
  }

  const finalQuote = await getRegistrationQuote(client, payload);
  if ((finalQuote.shortfallCredits ?? 0) > 0) {
    throw new Error('Unable to purchase sufficient credits for registration');
  }
}

export async function resolveUaid(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<ResolvedAgentResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/resolve/${encodeURIComponent(uaid)}`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    resolveResponseSchema,
    'resolve UAID response',
  );
}

export async function registerAgent(
  client: RegistryBrokerClient,
  payload: AgentRegistrationRequest,
  options?: RegisterAgentOptions,
): Promise<RegisterAgentResponse> {
  const autoTopUp = options?.autoTopUp ?? client.registrationAutoTopUp;

  if (!autoTopUp) {
    return performRegisterAgent(client, payload);
  }

  await ensureCreditsForRegistration(client, payload, autoTopUp);

  let retried = false;
  while (true) {
    try {
      return await performRegisterAgent(client, payload);
    } catch (error) {
      const shortfall = client.extractInsufficientCreditsDetails(error);
      if (shortfall && !retried) {
        await ensureCreditsForRegistration(client, payload, autoTopUp);
        retried = true;
        continue;
      }
      throw error;
    }
  }
}

export async function getRegistrationQuote(
  client: RegistryBrokerClient,
  payload: AgentRegistrationRequest,
): Promise<RegisterAgentQuoteResponse> {
  const raw = await client.requestJson<JsonValue>('/register/quote', {
    method: 'POST',
    body: serialiseAgentRegistrationRequest(payload),
    headers: { 'content-type': 'application/json' },
  });

  return client.parseWithSchema(
    raw,
    registrationQuoteResponseSchema,
    'registration quote response',
  );
}

export async function updateAgent(
  client: RegistryBrokerClient,
  uaid: string,
  payload: AgentRegistrationRequest,
): Promise<RegisterAgentResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/register/${encodeURIComponent(uaid)}`,
    {
      method: 'PUT',
      body: serialiseAgentRegistrationRequest(payload),
      headers: { 'content-type': 'application/json' },
    },
  );

  return client.parseWithSchema(
    raw,
    registerAgentResponseSchema,
    'update agent response',
  );
}

export async function getRegistrationProgress(
  client: RegistryBrokerClient,
  attemptId: string,
): Promise<RegistrationProgressRecord | null> {
  const normalisedAttemptId = attemptId.trim();
  if (!normalisedAttemptId) {
    throw new Error('attemptId is required');
  }

  try {
    const raw = await client.requestJson<JsonValue>(
      `/register/progress/${encodeURIComponent(normalisedAttemptId)}`,
      { method: 'GET' },
    );

    const parsed = client.parseWithSchema(
      raw,
      registrationProgressResponseSchema,
      'registration progress response',
    );

    return parsed.progress;
  } catch (error) {
    if (error instanceof RegistryBrokerError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function waitForRegistrationCompletion(
  client: RegistryBrokerClient,
  attemptId: string,
  options: RegistrationProgressWaitOptions = {},
): Promise<RegistrationProgressRecord> {
  const normalisedAttemptId = attemptId.trim();
  if (!normalisedAttemptId) {
    throw new Error('attemptId is required');
  }

  const interval = Math.max(
    250,
    options.intervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS,
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROGRESS_TIMEOUT_MS;
  const throwOnFailure = options.throwOnFailure ?? true;
  const signal = options.signal;
  const startedAt = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const progress = await client.getRegistrationProgress(normalisedAttemptId);

    if (progress) {
      options.onProgress?.(progress);

      if (progress.status === 'completed') {
        return progress;
      }

      if (progress.status === 'partial' || progress.status === 'failed') {
        if (throwOnFailure) {
          throw new RegistryBrokerError(
            'Registration did not complete successfully',
            {
              status: 409,
              statusText: progress.status,
              body: progress,
            },
          );
        }
        return progress;
      }
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(
        `Registration progress polling timed out after ${timeoutMs}ms`,
      );
    }

    await client.delay(interval, signal);
  }
}

export async function validateUaid(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<UaidValidationResponse> {
  const raw = await client.requestJson<JsonValue>(
    `/uaids/validate/${encodeURIComponent(uaid)}`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    uaidValidationResponseSchema,
    'UAID validation response',
  );
}

export async function getUaidConnectionStatus(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<UaidConnectionStatus> {
  const raw = await client.requestJson<JsonValue>(
    `/uaids/connections/${encodeURIComponent(uaid)}/status`,
    {
      method: 'GET',
    },
  );
  return client.parseWithSchema(
    raw,
    uaidConnectionStatusSchema,
    'UAID connection status',
  );
}

export async function closeUaidConnection(
  client: RegistryBrokerClient,
  uaid: string,
): Promise<void> {
  await client.request(`/uaids/connections/${encodeURIComponent(uaid)}`, {
    method: 'DELETE',
  });
}

export async function dashboardStats(
  client: RegistryBrokerClient,
): Promise<DashboardStatsResponse> {
  const raw = await client.requestJson<JsonValue>('/dashboard/stats', {
    method: 'GET',
  });
  return client.parseWithSchema(
    raw,
    dashboardStatsResponseSchema,
    'dashboard stats response',
  );
}
