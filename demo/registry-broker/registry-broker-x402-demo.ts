#!/usr/bin/env node
import 'dotenv/config';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import crypto from 'node:crypto';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  parseHolChatOps,
  HOL_CHAT_PROTOCOL_ID,
} from '../../src/services/registry-broker';
import type { SendMessageResponse } from '../../src/services/registry-broker/types';
import { createEnhancedPrompt } from '../../cli/standards-cli/src/lib/enhanced-prompt';

const baseUrl =
  process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
  'http://127.0.0.1:4000/api/v1';

const isLocalBaseUrl = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('host.docker.internal')
  );
};

const maybeLoadRegistryBrokerEnv = (): void => {
  if (!isLocalBaseUrl(baseUrl)) {
    return;
  }

  const candidates = [
    resolvePath(process.cwd(), '../registry-broker/.env'),
    resolvePath(process.cwd(), '../../registry-broker/.env'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
      return;
    }
  }
};

maybeLoadRegistryBrokerEnv();

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof RegistryBrokerError) {
    if (error.status === 429) {
      return true;
    }
    return error.status >= 500;
  }
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes('fetch failed') || msg.includes('networkerror');
  }
  if (error && typeof error === 'object') {
    const anyError = error as any;
    if (anyError?.cause?.code === 'UND_ERR_SOCKET') {
      return true;
    }
    if (
      typeof anyError?.code === 'string' &&
      anyError.code === 'UND_ERR_SOCKET'
    ) {
      return true;
    }
  }
  return false;
};

const withRetry = async <T>(options: {
  prompt: ReturnType<typeof createEnhancedPrompt>;
  label: string;
  attempts?: number;
  baseDelayMs?: number;
  fn: () => Promise<T>;
}): Promise<T> => {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await options.fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) {
        throw error;
      }
      const backoff = Math.round(baseDelayMs * Math.pow(1.7, attempt - 1));
      options.prompt.warn(
        `${options.label} failed (attempt ${attempt}/${attempts}); retrying in ${backoff}ms...`,
      );
      await delay(backoff);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Retry failed');
};

const waitForLocalBroker = async (
  prompt: ReturnType<typeof createEnhancedPrompt>,
): Promise<void> => {
  if (!isLocalBaseUrl(baseUrl)) {
    return;
  }

  const url = new URL(
    'search?limit=1&page=1',
    baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
  );
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      if (res.ok) {
        return;
      }
    } catch {}
    await delay(500);
  }

  prompt.warn(
    'Local broker did not become ready within 30 seconds; continuing anyway.',
  );
};

const isInteractive = (): boolean => Boolean(process.stdin.isTTY);

const promptYesNo = async (
  prompt: ReturnType<typeof createEnhancedPrompt>,
  message: string,
  defaultValue: 'y' | 'n' = 'n',
): Promise<boolean> => {
  const defaultLabel = defaultValue === 'y' ? 'y' : 'n';
  const raw = await prompt.question(message, {
    default: defaultLabel,
    showProcessing: false,
  });
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return defaultValue === 'y';
  }
  return normalized === 'y' || normalized === 'yes';
};

const getHederaCredentialsFromEnv = (): {
  network: 'hedera:testnet' | 'hedera:mainnet';
  accountId: string;
  privateKey: string;
} | null => {
  const requested =
    process.env.HEDERA_DEFAULT_NETWORK?.trim().toLowerCase() || 'testnet';
  const useMainnet = requested === 'mainnet';

  const accountId =
    (useMainnet
      ? process.env.HEDERA_MAINNET_OPERATOR_ID
      : process.env.HEDERA_TESTNET_OPERATOR_ID
    )?.trim() ||
    process.env.HEDERA_OPERATOR_ID?.trim() ||
    '';

  const privateKey =
    (useMainnet
      ? process.env.HEDERA_MAINNET_OPERATOR_KEY
      : process.env.HEDERA_TESTNET_OPERATOR_KEY
    )?.trim() ||
    process.env.HEDERA_OPERATOR_KEY?.trim() ||
    '';

  if (!accountId || !privateKey) {
    return null;
  }

  return {
    network: useMainnet ? 'hedera:mainnet' : 'hedera:testnet',
    accountId,
    privateKey,
  };
};

const ensureBillingAuth = async (options: {
  client: RegistryBrokerClient;
  prompt: ReturnType<typeof createEnhancedPrompt>;
}): Promise<boolean> => {
  const headers = options.client.getDefaultHeaders();
  if (headers['x-api-key'] || headers['x-ledger-api-key']) {
    return true;
  }

  if (!isLocalBaseUrl(baseUrl)) {
    return false;
  }

  const creds = getHederaCredentialsFromEnv();
  if (!creds) {
    return false;
  }

  try {
    await withRetry({
      prompt: options.prompt,
      label: 'Ledger auth',
      attempts: 4,
      fn: () =>
        options.client.authenticateWithLedgerCredentials({
          accountId: creds.accountId,
          network: creds.network,
          hederaPrivateKey: creds.privateKey,
          expiresInMinutes: 60,
          label: 'x402 chat demo',
        }),
    });
    return true;
  } catch {
    options.prompt.warn(
      'Unable to authenticate for billing (credits); approvals will fail.',
    );
    return false;
  }
};

const DEFAULT_X402_RESOURCE_URL = 'https://x402.aiape.tech/signals';
const DEFAULT_X402_MESSAGE = 'latest';

const sha256Hex = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const buildX402Uaid = (resourceUrl: string): string => {
  const nativeId = resourceUrl.trim();
  const uid = sha256Hex(nativeId);
  return `uaid:aid:x402-demo;uid=${uid};registry=coinbase-x402-bazaar;proto=x402;nativeId=${nativeId}`;
};

const buildPaymentApproveMessage = (requestId: string): string =>
  JSON.stringify({
    p: HOL_CHAT_PROTOCOL_ID,
    op: 'payment_approve',
    request_id: requestId,
  });

const buildPaymentDeclineMessage = (requestId: string): string =>
  JSON.stringify({
    p: HOL_CHAT_PROTOCOL_ID,
    op: 'payment_decline',
    request_id: requestId,
  });

const extractPaymentRequest = (
  response: SendMessageResponse,
): {
  requestId: string;
  costUsd: number | null;
  costCredits: number | null;
} | null => {
  const ops = parseHolChatOps((response as { ops?: unknown }).ops);
  const paymentOp = ops.find(op => op.op === 'payment_request');
  if (!paymentOp) {
    return null;
  }
  const costUsdCandidate = paymentOp.data?.cost_usd;
  const costUsd =
    typeof costUsdCandidate === 'number' && Number.isFinite(costUsdCandidate)
      ? costUsdCandidate
      : null;
  const costCreditsCandidate = paymentOp.data?.cost_credits;
  const costCredits =
    typeof costCreditsCandidate === 'number' &&
    Number.isFinite(costCreditsCandidate)
      ? costCreditsCandidate
      : null;
  return {
    requestId: paymentOp.request_id,
    costUsd,
    costCredits,
  };
};

const sendChatMessage = (
  client: RegistryBrokerClient,
  input: { sessionId: string; uaid: string; message: string },
): Promise<SendMessageResponse> =>
  client.chat.sendMessage({
    sessionId: input.sessionId,
    uaid: input.uaid,
    message: input.message,
  } as any);

const run = async (): Promise<void> => {
  const prompt = createEnhancedPrompt();
  await waitForLocalBroker(prompt);

  const client = new RegistryBrokerClient({ baseUrl });
  const billingAvailable = await ensureBillingAuth({ client, prompt });
  if (!billingAvailable) {
    prompt.warn(
      'Billing auth is not configured. You can still run the demo, but payment approvals will fail.',
    );
  }

  const useDefault = await promptYesNo(
    prompt,
    `Use default x402 endpoint (${DEFAULT_X402_RESOURCE_URL})? [y]`,
    'y',
  );

  let resourceUrl = DEFAULT_X402_RESOURCE_URL;
  if (!useDefault) {
    resourceUrl = (
      await prompt.question('Enter an x402 resource URL', {
        showProcessing: false,
      })
    ).trim();
  }

  if (!resourceUrl) {
    throw new Error('x402 resource URL is required.');
  }

  const uaid = buildX402Uaid(resourceUrl);
  prompt.info(`Using UAID: ${uaid}`);

  const session = await withRetry({
    prompt,
    label: 'Create chat session',
    fn: () => client.chat.createSession({ uaid }),
  });

  prompt.success(`Chat session created: ${session.sessionId}`);
  prompt.info('Type a message and press enter. Type /exit to quit.');
  prompt.info(
    'If the provider requests payment, you will be prompted to approve or decline.',
  );

  if (!isInteractive()) {
    prompt.warn('Non-interactive mode detected (no TTY). Exiting.');
    return;
  }

  while (true) {
    const rawMessage = await prompt.question('Message', {
      default: DEFAULT_X402_MESSAGE,
      showProcessing: true,
      processingMessage: 'Sending message...',
    });
    const message = rawMessage.trim();
    if (!message) {
      prompt.clearProcessing();
      continue;
    }
    if (message === '/exit') {
      prompt.clearProcessing();
      break;
    }

    let response: SendMessageResponse;
    try {
      response = await withRetry({
        prompt,
        label: 'Send message',
        fn: () =>
          sendChatMessage(client, {
            sessionId: session.sessionId,
            uaid,
            message,
          }),
      });
    } finally {
      prompt.clearProcessing();
    }

    const payment = extractPaymentRequest(response);
    if (!payment) {
      const text =
        typeof response.message === 'string'
          ? response.message
          : JSON.stringify(response.message);
      prompt.success(text);
      continue;
    }

    prompt.info(
      'Broker response: Approval required to send this x402 request.',
    );
    prompt.info(
      `Cost (USD): ${payment.costUsd ?? 'unknown'} | Credits: ${payment.costCredits ?? 'unknown'}`,
    );

    if (!billingAvailable) {
      prompt.error('Billing is not available; cannot approve payment.');
      continue;
    }

    const approvalAnswer = await prompt.question(
      `Approve this charge and continue (requestId=${payment.requestId})?`,
      {
        default: 'n',
        showProcessing: true,
        processingMessage: 'Sending approval...',
      },
    );
    const approveAnswer = approvalAnswer.trim().toLowerCase();
    const approve = approveAnswer === 'y' || approveAnswer === 'yes';

    const opMessage = approve
      ? buildPaymentApproveMessage(payment.requestId)
      : buildPaymentDeclineMessage(payment.requestId);

    let approvalResponse: SendMessageResponse;
    try {
      approvalResponse = await withRetry({
        prompt,
        label: approve ? 'Approve payment' : 'Decline payment',
        fn: () =>
          sendChatMessage(client, {
            sessionId: session.sessionId,
            uaid,
            message: opMessage,
          }),
      });
    } finally {
      prompt.clearProcessing();
    }

    if (!approve) {
      prompt.warn('Payment declined.');
      continue;
    }

    const text =
      typeof approvalResponse.message === 'string'
        ? approvalResponse.message
        : JSON.stringify(approvalResponse.message);
    prompt.success(text);

    const raw = (approvalResponse as any).rawResponse;
    const headers = raw?.headers;
    const tx = headers?.['x-payment-response']?.transaction;
    const payer = headers?.['x-payment-response']?.payer;
    const status = headers?.['x-payment-status'];
    if (typeof status === 'string') {
      prompt.info(`x402 status: ${status}`);
    }
    if (typeof tx === 'string' && tx.trim().length > 0) {
      prompt.info(`x402 tx: ${tx}`);
    }
    if (typeof payer === 'string' && payer.trim().length > 0) {
      prompt.info(`payer: ${payer}`);
    }
  }

  prompt.info('Done.');
};

run().catch(error => {
  if (error instanceof RegistryBrokerError) {
    console.error(chalk.red(`Request failed (${error.status}):`), error.body);
    process.exit(1);
  }
  console.error(
    chalk.red('x402 demo failed:'),
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
