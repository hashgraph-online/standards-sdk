/**
 * Content Inscription E2E Demo
 *
 * Tests the content inscription API against a running broker API endpoint.
 * Uses ledger authentication and allocates credits for the inscription.
 *
 * Prerequisites:
 * 1. `REGISTRY_BROKER_BASE_URL` set in `.env` (or environment) to a broker API base URL.
 * 2. `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY` set in `.env`.
 *
 * Usage:
 *   pnpm tsx <path-to-this-file>
 */
import dotenv from 'dotenv';

dotenv.config();

import { setTimeout as delay } from 'node:timers/promises';
import { RegistryBrokerClient } from '../../src/services';
import { authenticateWithDemoLedger } from '../utils/registry-auth';

const BASE_URL =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'https://hol.org/registry/api/v1';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

interface ContentInscriptionQuoteResponse {
  quoteId: string;
  contentHash: string;
  sizeBytes: number;
  totalCostHbar: number;
  credits: number;
  usdCents: number;
  expiresAt: string;
  mode: string;
}

interface ContentInscriptionJobResponse {
  jobId: string;
  status: string;
  credits?: number;
  usdCents?: number;
  quoteId?: string;
  sizeBytes?: number;
  mode?: string;
  createdAt: string;
  updatedAt: string;
  network?: string;
  hrl?: string;
  topicId?: string;
  error?: string;
}

interface ContentInscriptionConfigResponse {
  enabled: boolean;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

interface CreditBalanceResponse {
  accountId: string;
  balance: number;
  timestamp: string;
}

const log = (message: string, data?: unknown): void => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
};

const fetchJson = async <T>(
  url: string,
  options: RequestInit & { headers?: Record<string, string> },
): Promise<T> => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error?: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }
  return body as T;
};

const getConfig = async (
  baseUrl: string,
  headers: Record<string, string>,
): Promise<ContentInscriptionConfigResponse> => {
  return fetchJson<ContentInscriptionConfigResponse>(
    `${baseUrl}/inscribe/content/config`,
    { method: 'GET', headers },
  );
};

const getQuote = async (
  baseUrl: string,
  headers: Record<string, string>,
  request: {
    inputType: 'url' | 'base64';
    url?: string;
    base64?: string;
    fileName?: string;
    mimeType?: string;
    mode?: string;
  },
): Promise<ContentInscriptionQuoteResponse> => {
  return fetchJson<ContentInscriptionQuoteResponse>(
    `${baseUrl}/inscribe/content/quote`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
};

const createJob = async (
  baseUrl: string,
  headers: Record<string, string>,
  request: {
    inputType: 'url' | 'base64';
    url?: string;
    base64?: string;
    fileName?: string;
    mimeType?: string;
    mode?: string;
    quoteId?: string;
    waitForConfirmation?: boolean;
  },
): Promise<ContentInscriptionJobResponse> => {
  return fetchJson<ContentInscriptionJobResponse>(
    `${baseUrl}/inscribe/content`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
};

const getJob = async (
  baseUrl: string,
  headers: Record<string, string>,
  jobId: string,
): Promise<ContentInscriptionJobResponse> => {
  return fetchJson<ContentInscriptionJobResponse>(
    `${baseUrl}/inscribe/content/${jobId}`,
    { method: 'GET', headers },
  );
};

const allocateCredits = async (
  baseUrl: string,
  headers: Record<string, string>,
  accountId: string,
  amount: number,
): Promise<void> => {
  await fetchJson<{ success: boolean }>(`${baseUrl}/credits/allocate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      amount,
      metadata: { description: 'Content inscription E2E test' },
    }),
  });
};

const getBalance = async (
  baseUrl: string,
  headers: Record<string, string>,
  accountId: string,
): Promise<CreditBalanceResponse> => {
  return fetchJson<CreditBalanceResponse>(
    `${baseUrl}/credits/balance/${accountId}`,
    { method: 'GET', headers },
  );
};

const pollForCompletion = async (
  baseUrl: string,
  headers: Record<string, string>,
  jobId: string,
): Promise<ContentInscriptionJobResponse> => {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const job = await getJob(baseUrl, headers, jobId);

    if (job.status !== lastStatus) {
      log(`Job status: ${job.status}`, { jobId });
      lastStatus = job.status;
    }

    if (job.status === 'completed') {
      return job;
    }

    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error || 'Unknown error'}`);
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(`Job ${jobId} did not complete within ${POLL_TIMEOUT_MS}ms`);
};

const runE2ETest = async (): Promise<void> => {
  log('Starting Content Inscription E2E Test');
  log(`Base URL: ${BASE_URL}`);

  const client = new RegistryBrokerClient({ baseUrl: BASE_URL });

  log('Authenticating with ledger credentials...');
  const authResult = await authenticateWithDemoLedger(client, {
    label: 'content-inscription-e2e',
    expiresInMinutes: 30,
    setAccountHeader: true,
  });

  log(`Authenticated as: ${authResult.accountId} (${authResult.network})`);

  const headers = client.getDefaultHeaders();

  log('Checking content inscription config...');
  const config = await getConfig(BASE_URL, headers);
  log('Config:', config);

  if (!config.enabled) {
    throw new Error('Content inscriptions are disabled on this broker');
  }

  log(`Allocating 100 credits to ${authResult.accountId}...`);
  await allocateCredits(BASE_URL, headers, authResult.accountId, 100);
  log('Credits allocated successfully');

  const balanceBefore = await getBalance(
    BASE_URL,
    headers,
    authResult.accountId,
  );
  log(`Balance before inscription: ${balanceBefore.balance} credits`);

  const testContent = Buffer.from(
    JSON.stringify({
      message: 'Content Inscription E2E Test',
      timestamp: new Date().toISOString(),
      testId: `e2e-${Date.now().toString(36)}`,
    }),
  ).toString('base64');

  log('Getting inscription quote...');
  const quote = await getQuote(BASE_URL, headers, {
    inputType: 'base64',
    base64: testContent,
    fileName: 'e2e-test.json',
    mimeType: 'application/json',
    mode: 'file',
  });

  log('Quote received:', {
    quoteId: quote.quoteId,
    credits: quote.credits,
    sizeBytes: quote.sizeBytes,
    mode: quote.mode,
  });

  log('Creating inscription job...');
  const job = await createJob(BASE_URL, headers, {
    inputType: 'base64',
    base64: testContent,
    fileName: 'e2e-test.json',
    mimeType: 'application/json',
    mode: 'file',
    quoteId: quote.quoteId,
  });

  log('Job created:', {
    jobId: job.jobId,
    status: job.status,
    credits: job.credits,
  });

  log('Polling for job completion...');
  const completedJob = await pollForCompletion(BASE_URL, headers, job.jobId);

  log('Job completed successfully!', {
    jobId: completedJob.jobId,
    status: completedJob.status,
    hrl: completedJob.hrl,
    topicId: completedJob.topicId,
    network: completedJob.network,
  });

  if (completedJob.hrl) {
    log(`\nContent inscribed at HRL: ${completedJob.hrl}`);
  }

  const balanceAfter = await getBalance(
    BASE_URL,
    headers,
    authResult.accountId,
  );
  log(`Balance after inscription: ${balanceAfter.balance} credits`);

  const creditsCharged = balanceBefore.balance - balanceAfter.balance;
  log(`Credits charged: ${creditsCharged}`);
  log(`Quote credits: ${quote.credits}`);

  if (creditsCharged !== quote.credits) {
    throw new Error(
      `Credit mismatch! Expected ${quote.credits} credits to be charged, but ${creditsCharged} were charged.`,
    );
  }

  log(
    `\n✅ Credit verification passed: ${creditsCharged} credits charged (matches quote)`,
  );
  log('\nE2E Test PASSED');
};

runE2ETest().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nE2E Test FAILED: ${message}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
