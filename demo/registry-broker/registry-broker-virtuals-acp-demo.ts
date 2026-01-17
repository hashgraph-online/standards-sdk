#!/usr/bin/env node
import 'dotenv/config';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import { Contract, JsonRpcProvider, formatUnits } from 'ethers';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  buildPaymentApproveMessage,
  buildPaymentDeclineMessage,
  buildJobStatusMessage,
  parseHolChatOps,
} from '../../src/services/registry-broker';
import { createEnhancedPrompt } from '../../cli/standards-cli/src/lib/enhanced-prompt';
import type {
  AgentSearchHit,
  SendMessageResponse,
} from '../../src/services/registry-broker/types';

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
      break;
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
    if (error.status < 500) {
      return false;
    }

    const body = error.body as any;
    const errorText =
      typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'error' in body
          ? String(body.error ?? '')
          : '';
    if (errorText.toLowerCase().includes('rejected')) {
      return false;
    }
    return true;
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

const FAST_DEMO_AGENT_URL =
  'acp://0xfc9f1fF5eC524759c1Dc8E0a6EBA6c22805b9d8B?network=base&offeringName=token_info&priceUsd=0.01';
const FAST_DEMO_LABEL = 'Fast token demo (token_info @ $0.01)';
const FAST_DEMO_DEFAULT_MESSAGE = 'ETH';
const FAST_DEMO_EXAMPLES = [
  'ETH',
  'WETH',
  'USDC',
  '0x4200000000000000000000000000000000000006 (WETH on Base)',
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USDC on Base)',
];

const normalizeFastDemoAsset = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }

  const addressMatch = /0x[a-fA-F0-9]{40}/.exec(trimmed);
  if (addressMatch) {
    return addressMatch[0];
  }

  const tokens = trimmed
    .replace(/[$.,!?;:()]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return trimmed;
  }

  const last = tokens[tokens.length - 1];
  if (last.length >= 2 && last.length <= 12) {
    return last.toUpperCase();
  }

  return trimmed.toUpperCase();
};

const buildSendMessagePayload = (input: {
  sessionId: string;
  message: string;
  uaid?: string | null;
  agentUrl?: string | null;
}): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    sessionId: input.sessionId,
    message: input.message,
  };
  if (input.uaid && input.uaid.trim().length > 0) {
    payload.uaid = input.uaid.trim();
  }
  if (input.agentUrl && input.agentUrl.trim().length > 0) {
    payload.agentUrl = input.agentUrl.trim();
  }
  return payload;
};

const sendChatMessage = (
  client: RegistryBrokerClient,
  input: Parameters<typeof buildSendMessagePayload>[0],
): Promise<SendMessageResponse> =>
  client.chat.sendMessage(buildSendMessagePayload(input) as any);

const extractJobId = (response: SendMessageResponse): number | null => {
  const message = typeof response.message === 'string' ? response.message : '';
  const match = /jobId=(\d+)/.exec(message);
  if (!match) {
    const payment = extractPaymentRequest(response);
    if (payment?.jobId) {
      return payment.jobId;
    }
    const status = extractJobStatusOp(response);
    if (status?.jobId) {
      return status.jobId;
    }
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractPaymentRequest = (
  response: SendMessageResponse,
): {
  requestId: string;
  jobId: number | null;
  costUsd: number | null;
  costCredits: number | null;
  billingAvailable: boolean | null;
} | null => {
  const ops = parseHolChatOps((response as { ops?: unknown }).ops);
  const request = ops.find(op => op.op === 'payment_request');
  if (!request) {
    return null;
  }

  const data = request.data ?? {};
  const jobIdCandidate = data.job_id;
  const jobId =
    typeof jobIdCandidate === 'number' && Number.isFinite(jobIdCandidate)
      ? jobIdCandidate
      : null;

  const costUsdCandidate = data.cost_usd;
  const costUsd =
    typeof costUsdCandidate === 'number' && Number.isFinite(costUsdCandidate)
      ? costUsdCandidate
      : null;

  const costCreditsCandidate = data.cost_credits;
  const costCredits =
    typeof costCreditsCandidate === 'number' &&
    Number.isFinite(costCreditsCandidate)
      ? costCreditsCandidate
      : null;

  const billingAvailableCandidate = data.billing_available;
  const billingAvailable =
    typeof billingAvailableCandidate === 'boolean'
      ? billingAvailableCandidate
      : null;

  return {
    requestId: request.request_id,
    jobId,
    costUsd,
    costCredits,
    billingAvailable,
  };
};

const extractJobStatusOp = (
  response: SendMessageResponse,
): { requestId: string; jobId: number | null } | null => {
  const ops = parseHolChatOps((response as { ops?: unknown }).ops);
  const statusOp = ops.find(op => op.op === 'job_status');
  if (!statusOp) {
    return null;
  }
  const jobIdCandidate = statusOp.data?.job_id;
  const jobId =
    typeof jobIdCandidate === 'number' && Number.isFinite(jobIdCandidate)
      ? jobIdCandidate
      : null;
  return { requestId: statusOp.request_id, jobId };
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
  prompt?: ReturnType<typeof createEnhancedPrompt>;
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
    const authenticate = () =>
      options.client.authenticateWithLedgerCredentials({
        accountId: creds.accountId,
        network: creds.network,
        hederaPrivateKey: creds.privateKey,
        expiresInMinutes: 60,
        label: 'Virtuals ACP demo',
      });

    if (options.prompt) {
      await withRetry({
        prompt: options.prompt,
        label: 'Ledger auth',
        attempts: 4,
        fn: authenticate,
      });
    } else {
      await authenticate();
    }
    return true;
  } catch (error) {
    if (options.prompt) {
      options.prompt.warn(
        'Unable to authenticate for billing (credits); payment approvals will fail.',
      );
    }
    return false;
  }
};

const BASE_MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';

const getBaseRpcUrl = (): string =>
  process.env.VIRTUALS_BASE_RPC_URL?.trim() ||
  process.env.BASE_MAINNET_RPC_URL?.trim() ||
  process.env.BASE_RPC_URL?.trim() ||
  DEFAULT_BASE_RPC_URL;

const getUsdcBalanceBase = async (address: string): Promise<number | null> => {
  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  const provider = new JsonRpcProvider(getBaseRpcUrl());
  const usdc = new Contract(
    BASE_MAINNET_USDC,
    ['function balanceOf(address) view returns (uint256)'],
    provider,
  );
  const raw = (await usdc.balanceOf(trimmed)) as bigint;
  const formatted = Number(formatUnits(raw, 6));
  return Number.isFinite(formatted) ? formatted : null;
};

const pollJobUntilStable = async (options: {
  prompt: ReturnType<typeof createEnhancedPrompt>;
  client: RegistryBrokerClient;
  sessionId: string;
  uaid?: string | null;
  agentUrl?: string;
  jobId: number;
  requestId: string;
  maxWaitMs?: number;
  pollMs?: number;
}): Promise<SendMessageResponse> => {
  const maxWaitMs = options.maxWaitMs ?? 120_000;
  let pollMs = options.pollMs ?? 3_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    const status = await withRetry({
      prompt: options.prompt,
      label: 'Poll job status',
      fn: () =>
        sendChatMessage(options.client, {
          sessionId: options.sessionId,
          uaid: options.uaid,
          agentUrl: options.agentUrl,
          message: buildJobStatusMessage({
            requestId: options.requestId,
            jobId: options.jobId,
          }),
        }),
    });

    const payment = extractPaymentRequest(status);
    if (payment) {
      return status;
    }

    const message = typeof status.message === 'string' ? status.message : '';
    if (message && !message.toLowerCase().includes('processing')) {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, pollMs));
    pollMs = Math.min(pollMs * 1.25, 10_000);
  }

  return await withRetry({
    prompt: options.prompt,
    label: 'Poll job status',
    fn: () =>
      sendChatMessage(options.client, {
        sessionId: options.sessionId,
        uaid: options.uaid,
        agentUrl: options.agentUrl,
        message: buildJobStatusMessage({
          requestId: options.requestId,
          jobId: options.jobId,
        }),
      }),
  });
};

const handlePaymentInteractive = async (options: {
  prompt: ReturnType<typeof createEnhancedPrompt>;
  client: RegistryBrokerClient;
  sessionId: string;
  uaid?: string | null;
  agentUrl?: string;
  payment: NonNullable<ReturnType<typeof extractPaymentRequest>>;
}): Promise<SendMessageResponse | null> => {
  const authed = await ensureBillingAuth({
    client: options.client,
    prompt: options.prompt,
  });
  if (!authed) {
    options.prompt.error(
      'Billing auth is not configured. Ensure `HEDERA_OPERATOR_ID` + `HEDERA_OPERATOR_KEY` (or network-specific variants) are set in `../registry-broker/.env`.',
    );
    return null;
  }

  const { payment } = options;
  const jobId = payment.jobId;
  if (!jobId) {
    options.prompt.error(
      'Payment request did not include a job id; cannot approve.',
    );
    return null;
  }

  options.prompt.info('ACP provider requested payment approval.');
  process.stdout.write(
    chalk.dim(
      `Cost (USD/USDC): ${payment.costUsd ?? '(unknown)'} | Credits: ${payment.costCredits ?? '(unknown)'}\n`,
    ),
  );

  if (!payment.billingAvailable) {
    options.prompt.error(
      'Billing is not available on this broker; cannot approve.',
    );
    return null;
  }

  const payerAddress = process.env.ETH_ACCOUNT_ID?.trim() || '';
  if (
    payerAddress &&
    typeof payment.costUsd === 'number' &&
    Number.isFinite(payment.costUsd)
  ) {
    try {
      const balance = await getUsdcBalanceBase(payerAddress);
      if (typeof balance === 'number' && balance < payment.costUsd) {
        options.prompt.warn(
          `ACP smart wallet ${payerAddress} has ${balance} USDC, which is below the required ${payment.costUsd} USDC.`,
        );
        const decline = await promptYesNo(
          options.prompt,
          'Decline this payment request?',
          'y',
        );
        if (decline) {
          const declined = await withRetry({
            prompt: options.prompt,
            label: 'Decline payment',
            fn: () =>
              sendChatMessage(options.client, {
                sessionId: options.sessionId,
                uaid: options.uaid,
                agentUrl: options.agentUrl,
                message: buildPaymentDeclineMessage({
                  requestId: payment.requestId,
                }),
              }),
          });
          options.prompt.info(
            `Declined payment. Broker response: ${declined.message ?? '(no message)'}`,
          );
          return declined;
        }
      }
    } catch {
      options.prompt.warn('Unable to check Base USDC balance; continuing.');
    }
  }

  const shouldApprove = await promptYesNo(
    options.prompt,
    `Approve this charge and continue (jobId=${jobId})?`,
    'n',
  );

  if (!shouldApprove) {
    const declined = await withRetry({
      prompt: options.prompt,
      label: 'Decline payment',
      fn: () =>
        sendChatMessage(options.client, {
          sessionId: options.sessionId,
          uaid: options.uaid,
          agentUrl: options.agentUrl,
          message: buildPaymentDeclineMessage({ requestId: payment.requestId }),
        }),
    });
    options.prompt.info(
      `Declined payment. Broker response: ${declined.message ?? '(no message)'}`,
    );
    return declined;
  }

  try {
    const approved = await withRetry({
      prompt: options.prompt,
      label: 'Approve payment',
      fn: () =>
        sendChatMessage(options.client, {
          sessionId: options.sessionId,
          uaid: options.uaid,
          agentUrl: options.agentUrl,
          message: buildPaymentApproveMessage({
            requestId: payment.requestId,
            jobId,
          }),
        }),
    });

    options.prompt.success('Payment approved.');
    if (approved.message) {
      process.stdout.write(`${approved.message}\n`);
    }
    return approved;
  } catch (error) {
    if (error instanceof RegistryBrokerError) {
      const body = error.body as any;
      const errorText =
        typeof body === 'string'
          ? body
          : body && typeof body === 'object' && 'error' in body
            ? String(body.error ?? '')
            : '';

      options.prompt.error(
        `Payment approval failed (${error.status}): ${errorText || error.statusText}`,
      );
      if (errorText.toLowerCase().includes('user operation')) {
        options.prompt.info(
          'Tip: this often means the ACP wallet lacks enough USDC for that offering.',
        );
      }
      return null;
    }

    options.prompt.error(
      `Payment approval failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

type SelectedAgent = Pick<
  AgentSearchHit,
  'name' | 'registry' | 'protocol' | 'metadata' | 'uaid'
>;

const describeAgent = (hit: SelectedAgent): string => {
  const registry = typeof hit.registry === 'string' ? hit.registry : '';
  const protocol = typeof hit.protocol === 'string' ? hit.protocol : '';

  const metadata = hit.metadata;
  const version =
    metadata && typeof metadata === 'object' && 'version' in metadata
      ? String((metadata as Record<string, unknown>).version ?? '')
      : '';

  const labelParts = [`${hit.name}`];
  if (registry) {
    labelParts.push(registry);
  }
  if (protocol) {
    labelParts.push(protocol);
  }
  if (version) {
    labelParts.push(`v${version}`);
  }
  return labelParts.filter(Boolean).join(' • ');
};

const findCheapestPromptOffering = (
  offerings: unknown,
): { name: string; priceUsd: number } | null => {
  if (!Array.isArray(offerings) || offerings.length === 0) {
    return null;
  }

  let best: { name: string; priceUsd: number } | null = null;
  for (const entry of offerings) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const priceUsd = record.priceUsd;
    if (
      !name ||
      typeof priceUsd !== 'number' ||
      !Number.isFinite(priceUsd) ||
      priceUsd <= 0
    ) {
      continue;
    }

    const schema = record.requirementSchema as any;
    const required = schema?.required;
    const isPromptOnly =
      Array.isArray(required) &&
      required.length === 1 &&
      required[0] === 'prompt';
    if (!isPromptOnly) {
      continue;
    }

    if (!best || priceUsd < best.priceUsd) {
      best = { name, priceUsd };
    }
  }

  return best;
};

const extractOwnerAddress = (hit: SelectedAgent): string | null => {
  const owner = hit.metadata?.ownerAddress;
  if (typeof owner === 'string') {
    const trimmed = owner.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  const nativeId = hit.metadata?.nativeId;
  if (typeof nativeId === 'string') {
    const match = /0x[a-fA-F0-9]{40}/.exec(nativeId);
    if (match) {
      return match[0];
    }
  }

  return null;
};

const pickVirtualsAcpAgent = async (options: {
  client: RegistryBrokerClient;
  prompt: ReturnType<typeof createEnhancedPrompt>;
}): Promise<{
  agent: SelectedAgent;
  agentUrl: string | null;
  offeringLabel: string | null;
}> => {
  const explicitUaid = process.env.VIRTUALS_ACP_UAID?.trim();
  if (explicitUaid) {
    const resolved = await withRetry({
      prompt: options.prompt,
      label: 'Resolve UAID',
      fn: () => options.client.resolveUaid(explicitUaid),
    });
    const agent: SelectedAgent = {
      uaid: resolved.uaid,
      name: resolved.agent.name,
      registry: resolved.agent.registry,
      protocol: resolved.agent.protocol,
      metadata:
        (resolved.agent.metadata as Record<string, unknown> | undefined) ?? {},
    };

    const owner = extractOwnerAddress(agent);
    const offering = findCheapestPromptOffering(agent.metadata?.offerings);
    const agentUrl =
      owner && offering
        ? `acp://${owner}?network=base&offeringName=${encodeURIComponent(offering.name)}&priceUsd=${offering.priceUsd}`
        : null;
    return {
      agent,
      agentUrl,
      offeringLabel: offering ? `$${offering.priceUsd}` : null,
    };
  }

  const query = process.env.VIRTUALS_ACP_QUERY?.trim();
  const searchResult = await withRetry({
    prompt: options.prompt,
    label: 'Search Virtuals agents',
    fn: () =>
      options.client.search({
        q: query && query.length > 0 ? query : undefined,
        registries: ['virtuals-protocol'],
        sortBy: 'trust-score',
        sortOrder: 'desc',
        limit: 100,
      }),
  });

  if (searchResult.hits.length === 0) {
    throw new Error(
      'Unable to locate any Virtuals agents via registry-broker search.',
    );
  }

  const candidates = searchResult.hits
    .map(hit => {
      const offering = findCheapestPromptOffering(hit.metadata?.offerings);
      return offering ? { hit, offering } : null;
    })
    .filter(Boolean) as Array<{
    hit: SelectedAgent;
    offering: { name: string; priceUsd: number };
  }>;

  const chosen = candidates.sort((a, b) => {
    if (a.offering.priceUsd !== b.offering.priceUsd) {
      return a.offering.priceUsd - b.offering.priceUsd;
    }
    const aScore =
      typeof (a.hit as any).trustScore === 'number'
        ? (a.hit as any).trustScore
        : 0;
    const bScore =
      typeof (b.hit as any).trustScore === 'number'
        ? (b.hit as any).trustScore
        : 0;
    return bScore - aScore;
  })[0] ?? {
    hit: searchResult.hits[0] as SelectedAgent,
    offering: null as any,
  };

  const agent = chosen.hit;
  const offering =
    chosen.offering ?? findCheapestPromptOffering(agent.metadata?.offerings);
  const owner = extractOwnerAddress(agent);
  const agentUrl =
    owner && offering
      ? `acp://${owner}?network=base&offeringName=${encodeURIComponent(offering.name)}&priceUsd=${offering.priceUsd}`
      : null;

  return {
    agent,
    agentUrl,
    offeringLabel: offering ? `$${offering.priceUsd}` : null,
  };
};

const run = async (): Promise<void> => {
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const client = new RegistryBrokerClient({
    baseUrl,
    apiKey: isLocalBaseUrl(baseUrl) ? undefined : apiKey,
  });

  const prompt = createEnhancedPrompt();
  await waitForLocalBroker(prompt);
  await ensureBillingAuth({ client, prompt });

  const hasExplicitTarget =
    Boolean(process.env.VIRTUALS_ACP_UAID?.trim()) ||
    Boolean(process.env.VIRTUALS_ACP_QUERY?.trim());

  const shouldUseFastDefault = !hasExplicitTarget;
  let useFast = shouldUseFastDefault;
  if (shouldUseFastDefault && isInteractive()) {
    const choice = await prompt.question(
      `Choose demo mode:\n  1) ${FAST_DEMO_LABEL}\n  2) Cheapest prompt-based agent (freeform question; may be slower)\nEnter 1 or 2`,
      { default: '1', showProcessing: false },
    );
    useFast = choice.trim() !== '2';
  }

  let uaid: string | null = null;
  let agentUrl: string | null = null;
  let selectedAgentLabel = 'Virtuals ACP agent';
  let defaultMessageFallback =
    'Say hello and briefly describe what you can do.';

  if (useFast) {
    agentUrl = FAST_DEMO_AGENT_URL;
    selectedAgentLabel = FAST_DEMO_LABEL;
    defaultMessageFallback = FAST_DEMO_DEFAULT_MESSAGE;
    prompt.info(`Selected Virtuals agent: ${selectedAgentLabel}`);
    prompt.info('This mode runs a token lookup job (not freeform chat).');
    prompt.info('Enter a token ticker or a 0x... contract address.');
    prompt.info(`Examples: ${FAST_DEMO_EXAMPLES.join(', ')}`);
  } else {
    const selection = await pickVirtualsAcpAgent({ client, prompt });
    const agent = selection.agent;
    uaid = agent.uaid?.trim() || null;
    agentUrl = selection.agentUrl;
    selectedAgentLabel = describeAgent(agent);

    prompt.info(`Selected Virtuals agent: ${selectedAgentLabel}`);
    if (uaid) {
      prompt.info(`UAID: ${uaid}`);
    }
    if (selection.offeringLabel) {
      prompt.info(
        `Default offering: prompt-based (${selection.offeringLabel})`,
      );
    }

    if (!agentUrl && !uaid) {
      prompt.error('Selected agent is missing both UAID and agentUrl.');
      prompt.close();
      return;
    }
    if (!agentUrl) {
      prompt.warn(
        'Unable to derive a safe ACP agentUrl (missing ownerAddress/offerings); falling back to UAID-only session.',
      );
    }
  }

  const session = await withRetry({
    prompt,
    label: 'Create chat session',
    fn: () =>
      client.chat.createSession(
        agentUrl
          ? { agentUrl, historyTtlSeconds: 900 }
          : { uaid: uaid as string, historyTtlSeconds: 900 },
      ),
  });
  prompt.success(`Chat session created: ${session.sessionId}`);

  const defaultMessage1 =
    process.env.VIRTUALS_ACP_MESSAGE_1?.trim() || defaultMessageFallback;

  if (!isInteractive()) {
    prompt.warn('Non-interactive mode detected (no TTY).');
    prompt.info(
      'Tip: run this demo in a terminal to approve ACP payments interactively.',
    );
    prompt.info('Sending one message and printing payment instructions...');

    const response1 = await withRetry({
      prompt,
      label: 'Send chat message',
      fn: () =>
        sendChatMessage(client, {
          sessionId: session.sessionId,
          uaid,
          agentUrl,
          message: defaultMessage1,
        }),
    });
    prompt.info(`Broker response: ${response1.message ?? '(no message)'}`);
    prompt.info(`Job ID: ${extractJobId(response1) ?? '(not detected)'}`);

    const payment1 = extractPaymentRequest(response1);
    if (payment1?.jobId) {
      prompt.warn('ACP provider requested payment approval.');
      prompt.info(
        `Cost (USD/USDC): ${payment1.costUsd ?? '(unknown)'} | Credits: ${payment1.costCredits ?? '(unknown)'} | Billing available: ${payment1.billingAvailable ?? '(unknown)'}`,
      );
      prompt.info('To approve via SDK, call:');
      process.stdout.write(
        JSON.stringify(
          {
            sessionId: session.sessionId,
            ...(uaid ? { uaid } : { agentUrl }),
            message: buildPaymentApproveMessage({
              requestId: payment1.requestId,
              jobId: payment1.jobId,
            }),
          },
          null,
          2,
        ),
      );
      process.stdout.write('\n');
      prompt.info('To decline via SDK, call:');
      process.stdout.write(
        JSON.stringify(
          {
            sessionId: session.sessionId,
            ...(uaid ? { uaid } : { agentUrl }),
            message: buildPaymentDeclineMessage({
              requestId: payment1.requestId,
            }),
          },
          null,
          2,
        ),
      );
      process.stdout.write('\n');
    }

    prompt.close();
    return;
  }

  try {
    prompt.info(
      useFast
        ? 'Enter a token ticker / address and press enter. Type /exit to quit.'
        : 'Type a message and press enter. Type /exit to quit.',
    );
    prompt.info(
      'If the provider requests payment, you will be prompted to approve or decline.',
    );

    let firstMessage = true;
    while (true) {
      const inputLabel = useFast ? 'Asset' : 'Message';
      const raw = await prompt.question(inputLabel, {
        default: firstMessage ? defaultMessage1 : '',
        showProcessing: true,
        processingMessage: 'Sending message...',
      });

      const trimmedRaw = raw.trim();
      if (trimmedRaw === '/exit' || trimmedRaw === '/quit') {
        prompt.clearProcessing();
        break;
      }

      const message = useFast ? normalizeFastDemoAsset(raw) : raw;
      if (useFast && trimmedRaw && message !== trimmedRaw) {
        prompt.info(`Using asset: ${message}`);
      }
      firstMessage = false;

      if (!message) {
        prompt.clearProcessing();
        continue;
      }

      let response: SendMessageResponse;
      try {
        response = await withRetry({
          prompt,
          label: 'Send chat message',
          fn: () =>
            sendChatMessage(client, {
              sessionId: session.sessionId,
              uaid,
              agentUrl,
              message,
            }),
        });
      } catch (error) {
        if (error instanceof RegistryBrokerError) {
          const body = error.body as any;
          const errorText =
            typeof body === 'string'
              ? body
              : body && typeof body === 'object' && 'error' in body
                ? String(body.error ?? '')
                : '';
          prompt.error(
            `Request failed (${error.status}): ${errorText || error.statusText}`,
          );
          if (
            useFast &&
            errorText
              .toLowerCase()
              .includes('asset is not a valid ticker or contract address')
          ) {
            prompt.info(`Try one of: ${FAST_DEMO_EXAMPLES.join(', ')}`);
          }
          continue;
        }

        prompt.error(
          `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      } finally {
        prompt.clearProcessing();
      }

      prompt.info(`Broker response: ${response.message ?? '(no message)'}`);
      const jobId = extractJobId(response);
      prompt.info(`Job ID: ${jobId ?? '(not detected)'}`);

      const payment = extractPaymentRequest(response);
      if (payment) {
        const approved = await handlePaymentInteractive({
          prompt,
          client,
          sessionId: session.sessionId,
          uaid,
          agentUrl: agentUrl ?? undefined,
          payment,
        });

        const approvedJobId = payment.jobId ?? jobId;
        if (approved && approvedJobId) {
          prompt.info('Polling job status...');
          const settled = await pollJobUntilStable({
            prompt,
            client,
            sessionId: session.sessionId,
            uaid,
            agentUrl: agentUrl ?? undefined,
            jobId: approvedJobId,
            requestId: payment.requestId,
          });
          prompt.info(`Job result: ${settled.message ?? '(no message)'}`);
        }
        continue;
      }

      const statusOp = extractJobStatusOp(response);
      if (!statusOp?.jobId) {
        continue;
      }

      const shouldPoll = await promptYesNo(
        prompt,
        `Job is pending (jobId=${statusOp.jobId}). Poll until it settles?`,
        'y',
      );
      if (!shouldPoll) {
        continue;
      }

      prompt.info('Polling job status...');
      const settled = await pollJobUntilStable({
        prompt,
        client,
        sessionId: session.sessionId,
        uaid,
        agentUrl: agentUrl ?? undefined,
        jobId: statusOp.jobId,
        requestId: statusOp.requestId,
      });

      const paymentAfterPoll = extractPaymentRequest(settled);
      if (paymentAfterPoll) {
        const approved = await handlePaymentInteractive({
          prompt,
          client,
          sessionId: session.sessionId,
          uaid,
          agentUrl: agentUrl ?? undefined,
          payment: paymentAfterPoll,
        });

        const approvedJobId = paymentAfterPoll.jobId ?? statusOp.jobId;
        if (approved && approvedJobId) {
          prompt.info('Polling job status...');
          const final = await pollJobUntilStable({
            prompt,
            client,
            sessionId: session.sessionId,
            uaid,
            agentUrl: agentUrl ?? undefined,
            jobId: approvedJobId,
            requestId: paymentAfterPoll.requestId,
          });
          prompt.info(`Job result: ${final.message ?? '(no message)'}`);
        }
        continue;
      }

      prompt.info(`Job result: ${settled.message ?? '(no message)'}`);
    }
  } finally {
    prompt.close();
  }
};

run().catch(error => {
  if (error instanceof RegistryBrokerError) {
    const body = error.body;
    const errorText =
      typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'error' in body
          ? String((body as { error?: unknown }).error ?? '')
          : '';

    if (errorText.includes('ACP Contract Client validation failed')) {
      console.error(
        'Virtuals ACP demo failed: broker ACP wallet is not configured for on-chain execution.',
      );
      console.error(
        'Fix: set broker `.env` with a Virtuals ACP-whitelisted `ETH_PK` (and `ETH_ACCOUNT_ID` if you use a non-zero entity id), then restart docker.',
      );
      process.exit(1);
    }
  }

  console.error('Virtuals ACP demo failed:', error);
  process.exit(1);
});
