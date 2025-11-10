import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AIAgentCapability,
  AIAgentProfile,
  AIAgentType,
  ProfileType,
} from '@hashgraphonline/standards-sdk';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
} from '../../src/services/registry-broker';
import type { RegisterAgentResponse } from '../../src/services/registry-broker/types';
import { resolveHederaLedgerAuthConfig } from '../utils/ledger-config';
import { startLocalX402Facilitator } from '../utils/local-x402-facilitator';
import { startLocalA2AAgent } from '../utils/local-a2a-agent';
import { startLocalPaidAgent } from '../utils/local-paid-agent';
import type { LocalPaidAgentHandle } from '../utils/local-paid-agent';
import type { LocalA2AAgentHandle } from '../utils/local-a2a-agent';
import { privateKeyToAccount } from 'viem/accounts';
import { startLocalIngressProxy } from '../utils/local-ingress-proxy';

interface RegisteredAgent {
  uaid: string;
  name: string;
}

const DEFAULT_BROKER_BASE_URL = 'https://registry.hashgraphonline.com/api/v1';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ensureEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const normalizeHexPrivateKey = (value: string): `0x${string}` =>
  value.startsWith('0x')
    ? (value as `0x${string}`)
    : (`0x${value}` as `0x${string}`);

const resolveDemoNetwork = (): 'base' | 'base-sepolia' => {
  const raw = process.env.DEMO_NETWORK?.trim().toLowerCase() ?? 'base-sepolia';
  return raw === 'base' ? 'base' : 'base-sepolia';
};

const fetchCreditBalance = async (
  baseUrl: string,
  ledgerApiKey: string | undefined,
  accountId: string,
): Promise<number | null> => {
  if (!ledgerApiKey) {
    return null;
  }
  const response = await fetch(
    `${baseUrl}/credits/balance?accountId=${encodeURIComponent(accountId)}`,
    {
      headers: { 'x-ledger-api-key': ledgerApiKey },
    },
  );
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { balance?: number };
  return typeof payload.balance === 'number' ? payload.balance : null;
};

const waitForAgentMatch = async (
  client: RegistryBrokerClient,
  registries: string | string[],
  query: string,
  matcher: (hit: {
    name: string;
    metadata?: Record<string, unknown>;
  }) => boolean,
  maxAttempts = 30,
  intervalMs = 2500,
): Promise<RegisteredAgent> => {
  const registryList = Array.isArray(registries)
    ? registries
    : [registries].filter(value => value.trim().length > 0);

  if (registryList.length === 0) {
    throw new Error('At least one registry namespace is required.');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      for (const registry of registryList) {
        const result = await client.search({
          registries: [registry],
          limit: 100,
          q: query,
        });
        const match = result.hits.find(hit => matcher(hit));
        if (match && match.uaid) {
          console.log(
            `Located ${registry} agent "${match.name}" on attempt ${attempt}.`,
          );
          return { uaid: match.uaid, name: match.name };
        }
      }
    } catch (error) {
      console.log(`Search attempt ${attempt} failed: ${describeError(error)}`);
    }
    await delay(intervalMs);
  }
  throw new Error(
    `Timed out waiting for ${registryList.join(
      ', ',
    )} agent "${query}" to appear in search results.`,
  );
};

const registerAgent = async (
  client: RegistryBrokerClient,
  payload: Parameters<RegistryBrokerClient['registerAgent']>[0],
): Promise<RegisterAgentResponse> => {
  const response = await client.registerAgent(payload);
  if (!response.attemptId) {
    return response;
  }
  await client.waitForRegistrationCompletion(response.attemptId, {
    intervalMs: 1500,
    timeoutMs: 120000,
    throwOnFailure: true,
  });
  return response;
};

const buildDemoProfile = (
  displayName: string,
  alias: string,
  bio: string,
): AIAgentProfile => ({
  version: '1.0',
  type: ProfileType.AI_AGENT,
  display_name: displayName,
  alias,
  bio,
  socials: [],
  aiAgent: {
    type: AIAgentType.AUTONOMOUS,
    creator: alias,
    model: alias,
    capabilities: [
      AIAgentCapability.API_INTEGRATION,
      AIAgentCapability.TEXT_GENERATION,
      AIAgentCapability.WORKFLOW_AUTOMATION,
    ],
  },
});

const logRawResponse = (
  label: string,
  payload: Record<string, unknown> | undefined,
): void => {
  if (!payload) {
    return;
  }
  console.log(label);
  console.log(JSON.stringify(payload, null, 2));
};

const logError = (error: unknown): void => {
  if (error instanceof RegistryBrokerError) {
    console.error(
      `Registry broker request failed (${error.status} ${error.statusText})`,
      error.body,
    );
    return;
  }
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
    return;
  }
  console.error(String(error));
};

const ENV_FILE_PATH = process.env.REGISTRY_BROKER_DEMO_ENV_FILE?.trim()?.length
  ? path.resolve(
      process.cwd(),
      process.env.REGISTRY_BROKER_DEMO_ENV_FILE.trim(),
    )
  : path.resolve(process.cwd(), '.env');

const shouldPersistEnv = process.env.REGISTRY_BROKER_DEMO_PERSIST_UAIDS !== '0';

const persistDemoEnvValues = async (
  entries: Record<string, string | undefined>,
) => {
  if (!shouldPersistEnv) {
    return;
  }
  const updates = Object.entries(entries).filter(
    ([, value]) => typeof value === 'string' && value.trim().length > 0,
  ) as Array<[string, string]>;
  if (updates.length === 0) {
    return;
  }

  const escapeKey = (key: string) =>
    key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  let content = '';
  let existed = true;
  try {
    content = await fs.readFile(ENV_FILE_PATH, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      existed = false;
      content = '';
    } else {
      console.warn(
        `Unable to read ${ENV_FILE_PATH} to persist demo UAIDs: ${describeError(error)}`,
      );
      return;
    }
  }

  let updated = content;
  for (const [key, value] of updates) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const pattern = new RegExp(`^${escapeKey(key)}=.*$`, 'm');
    if (pattern.test(updated)) {
      updated = updated.replace(pattern, `${key}=${trimmed}`);
    } else {
      if (updated.length && !updated.endsWith('\n')) {
        updated += '\n';
      }
      updated += `${key}=${trimmed}\n`;
    }
    process.env[key] = trimmed;
  }

  try {
    await fs.writeFile(ENV_FILE_PATH, updated, 'utf8');
    const storedKeys = updates.map(([key]) => key).join(', ');
    console.log(
      `Cached ${storedKeys} in ${
        existed ? ENV_FILE_PATH : `new ${ENV_FILE_PATH}`
      }.`,
    );
  } catch (error) {
    console.warn(
      `Unable to write ${ENV_FILE_PATH} when persisting demo UAIDs: ${describeError(error)}`,
    );
  }
};

const resolveX402MinimumCredits = async (
  client: RegistryBrokerClient,
  network: string,
): Promise<number> => {
  try {
    const minimums = await client.getX402Minimums();
    const creditUnitUsd =
      typeof minimums.creditUnitUsd === 'number' && minimums.creditUnitUsd > 0
        ? minimums.creditUnitUsd
        : 0.01;
    if (!minimums.minimums) {
      return 0;
    }
    const entry =
      minimums.minimums[network] ??
      Object.values(minimums.minimums).find(
        candidate => candidate?.network === network,
      );
    if (!entry || typeof entry.minUsd !== 'number' || entry.minUsd <= 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(entry.minUsd / creditUnitUsd));
  } catch (error) {
    console.warn(
      `Unable to fetch x402 minimums for ${network}: ${describeError(error)}`,
    );
    return 0;
  }
};

const runDemo = async () => {
  process.env.REGISTRY_BROKER_DEMO_TUNNEL = 'cloudflare';
  if (!process.env.REGISTRY_BROKER_DEMO_KEEP_TUNNELS) {
    process.env.REGISTRY_BROKER_DEMO_KEEP_TUNNELS = '1';
  }

  const brokerBaseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ?? DEFAULT_BROKER_BASE_URL;
  if (!process.env.REGISTRY_BROKER_BASE_URL) {
    console.log(
      `REGISTRY_BROKER_BASE_URL not set; defaulting to ${DEFAULT_BROKER_BASE_URL}.`,
    );
  }
  const prompt =
    process.env.X402_PAID_PROMPT?.trim() ||
    'Latest Hedera ecosystem funding updates.';
  const hederaLedgerAuth = resolveHederaLedgerAuthConfig();
  const ledgerAccountId = hederaLedgerAuth.accountId;
  const ledgerNetwork = hederaLedgerAuth.network;
  const demoNetwork = resolveDemoNetwork();
  if (demoNetwork !== ledgerNetwork) {
    console.log(
      `⚠️  DEMO_NETWORK (${demoNetwork}) does not match ledger network (${ledgerNetwork}); using DEMO_NETWORK for x402 payments.`,
    );
  }
  const resolvedA2APublicUrl =
    process.env.REGISTRY_BROKER_DEMO_A2A_PUBLIC_URL?.trim() || undefined;
  const resolvedPaidAgentPublicUrl =
    process.env.REGISTRY_BROKER_DEMO_PAID_AGENT_PUBLIC_URL?.trim() || undefined;
  const resolvedX402PublicBaseUrl =
    process.env.REGISTRY_BROKER_DEMO_X402_PUBLIC_BASE_URL?.trim() || undefined;

  const payeePk = normalizeHexPrivateKey(ensureEnv('ETH_PK_2'));
  const payerPk = ensureEnv('ETH_PK');

  const payeeAccount = privateKeyToAccount(payeePk);

  const client = new RegistryBrokerClient({ baseUrl: brokerBaseUrl });
  await client.authenticateWithLedgerCredentials({
    accountId: hederaLedgerAuth.accountId,
    network: hederaLedgerAuth.network,
    hederaPrivateKey: hederaLedgerAuth.privateKey,
    label: 'erc8004 x402 demo',
    expiresInMinutes: 30,
    setAccountHeader: true,
  });
  const ledgerApiKey = client.getDefaultHeaders()['x-ledger-api-key'];
  const logLedgerBalance = async (label: string) => {
    if (!ledgerApiKey) {
      return;
    }
    const balance = await fetchCreditBalance(
      brokerBaseUrl,
      ledgerApiKey,
      ledgerAccountId,
    );
    if (typeof balance === 'number') {
      console.log(`${label}: ${balance} credits`);
    }
  };

  await logLedgerBalance('Ledger credit balance before demo');
  const x402MinimumCredits = await resolveX402MinimumCredits(
    client,
    demoNetwork,
  );
  if (x402MinimumCredits > 0) {
    console.log(
      `Network ${demoNetwork} requires at least ${x402MinimumCredits} credits (${(
        x402MinimumCredits * 0.01
      ).toFixed(2)} USD) per x402 purchase.`,
    );
  }

  const resolveCachedAgent = async (
    label: string,
    uaid?: string | null,
  ): Promise<RegisteredAgent | null> => {
    if (!uaid) {
      return null;
    }
    try {
      const resolved = await client.resolveUaid(uaid);
      const name =
        resolved.agent.name ??
        resolved.agent.profile?.display_name ??
        resolved.agent.uaid ??
        uaid;
      console.log(`Reusing cached ${label} agent ${uaid}.`);
      return { uaid, name };
    } catch (error) {
      if (error instanceof RegistryBrokerError && error.status === 404) {
        console.log(
          `Cached ${label} agent ${uaid} was not found. A new registration will be created.`,
        );
        return null;
      }
      console.warn(
        `Unable to resolve cached ${label} agent ${uaid}: ${describeError(error)}`,
      );
      return null;
    }
  };

  const performRegistrationOperation = async (
    action: 'register' | 'update',
    op: () => Promise<RegisterAgentResponse>,
  ): Promise<RegisterAgentResponse> => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await op();
      } catch (error) {
        if (
          !(error instanceof RegistryBrokerError) ||
          error.status !== 402 ||
          typeof (error.body as { shortfallCredits?: number })
            ?.shortfallCredits !== 'number'
        ) {
          throw error;
        }
        const shortfall = (error.body as { shortfallCredits: number })
          .shortfallCredits;
        const creditsToBuy = Math.max(
          Math.ceil(shortfall * 1.25),
          x402MinimumCredits,
        );
        console.log(
          `[${action}] Insufficient credits (${shortfall}). Auto top-up ${creditsToBuy} credits...`,
        );
        await client.buyCreditsWithX402({
          accountId: ledgerAccountId,
          credits: creditsToBuy,
          description: `erc8004 x402 demo ${action} top-up`,
          evmPrivateKey: payerPk,
          network: demoNetwork,
        });
        await logLedgerBalance(
          `Ledger credit balance after ${action} top-up (attempt ${attempt})`,
        );
      }
    }
    throw new Error(`Unable to auto top-up credits for ${action}`);
  };

  const registerWithAutoTopUp = async (
    payload: Parameters<RegistryBrokerClient['registerAgent']>[0],
  ) =>
    performRegistrationOperation('register', () =>
      registerAgent(client, payload),
    );

  const updateWithAutoTopUp = async (
    uaid: string,
    payload: Parameters<RegistryBrokerClient['registerAgent']>[0],
  ) =>
    performRegistrationOperation('update', () =>
      client.updateAgent(uaid, payload),
    );

  const cachedA2ATarget = await resolveCachedAgent(
    'A2A',
    process.env.REGISTRY_BROKER_DEMO_A2A_UAID?.trim(),
  );
  const cachedPaidTarget = await resolveCachedAgent(
    'paid',
    process.env.REGISTRY_BROKER_DEMO_PAID_UAID?.trim(),
  );
  const needsFreshRegistration = !cachedA2ATarget || !cachedPaidTarget;
  const autoTopUpCredits = Number(process.env.DEMO_CREDITS ?? '0');
  const forceDemoTopUp = process.env.DEMO_FORCE_TOP_UP === '1';
  if (autoTopUpCredits > 0 && (needsFreshRegistration || forceDemoTopUp)) {
    const creditsToBuy = Math.max(autoTopUpCredits, x402MinimumCredits);
    console.log(`Auto top-up: purchasing ${creditsToBuy} credits via x402...`);
    await client.buyCreditsWithX402({
      accountId: ledgerAccountId,
      credits: creditsToBuy,
      description: 'erc8004 x402 demo auto top-up',
      evmPrivateKey: payerPk,
      network: demoNetwork,
    });
    const balance = await fetchCreditBalance(
      brokerBaseUrl,
      ledgerApiKey,
      ledgerAccountId,
    );
    if (typeof balance === 'number') {
      console.log(`Ledger credit balance after top-up: ${balance} credits`);
    }
  } else if (autoTopUpCredits > 0) {
    console.log(
      'Skipping initial auto top-up because cached registrations exist. Set DEMO_FORCE_TOP_UP=1 to override.',
    );
  }
  const balanceBeforeChat = await fetchCreditBalance(
    brokerBaseUrl,
    ledgerApiKey,
    ledgerAccountId,
  );

  const ingressProxy = await startLocalIngressProxy();
  const ingressSuffix = randomUUID().slice(0, 8);
  const ingressPaidPrefix = `/paid-${ingressSuffix}`;
  const ingressA2aPrefix = `/a2a-${ingressSuffix}`;
  const ingressFacilitatorPrefix = `/facilitator-${ingressSuffix}`;
  const registrationTag = randomUUID();
  const paidAgentId = `local-paid-erc8004-${registrationTag.slice(0, 8)}`;
  const a2aAgentId = `local-demo-a2a-${registrationTag.slice(0, 8)}`;

  const facilitator = await startLocalX402Facilitator({
    port: Number(process.env.X402_LOCAL_PORT ?? '4104') || 4104,
    description: 'Local ERC-8004 paid signals',
    network: 'base-sepolia',
    payToAddress: payeeAccount.address,
    maxAmountRequired: '50000',
    publicBaseUrl: resolvedX402PublicBaseUrl,
    ingressProxy,
    ingressPrefix: ingressFacilitatorPrefix,
  });

  const paidAgent = await startLocalPaidAgent({
    agentId: paidAgentId,
    facilitator,
    port: Number(process.env.ERC8004_LOCAL_PORT ?? '6207') || 6207,
    priceUsd: 0.05,
    network: 'base-sepolia',
    token: 'USDC',
    publicUrl: resolvedPaidAgentPublicUrl,
    ingressProxy,
    ingressPrefix: ingressPaidPrefix,
  });
  console.log(`Paid agent RPC endpoint: ${paidAgent.rpcEndpoint}`);
  const resolveErc8004RegistryKey = async (
    client: RegistryBrokerClient,
    fallbackNetwork?: string,
  ): Promise<string> => {
    const catalog = await client.getAdditionalRegistries();
    const normalizedFallback =
      typeof fallbackNetwork === 'string' && fallbackNetwork.trim().length > 0
        ? fallbackNetwork.trim().toLowerCase()
        : undefined;
    const registry = catalog.registries.find(
      entry => entry.id === 'erc-8004' && Array.isArray(entry.networks),
    );
    if (!registry || registry.networks.length === 0) {
      throw new Error(
        'ERC-8004 additional registry is not enabled on this broker instance.',
      );
    }

    const overrideRaw = process.env.ERC8004_REGISTRY_KEY?.trim();
    const normalizedOverride =
      overrideRaw && overrideRaw.length > 0
        ? overrideRaw.includes(':')
          ? overrideRaw.toLowerCase()
          : `erc-8004:${overrideRaw.toLowerCase()}`
        : undefined;

    const requested =
      (normalizedOverride &&
        registry.networks.find(net => net.key === normalizedOverride)) ??
      registry.networks.find(net => net.networkId === normalizedFallback) ??
      registry.networks[0];

    if (!requested) {
      throw new Error(
        'Unable to resolve a usable ERC-8004 network from the broker catalog.',
      );
    }

    if (normalizedOverride && requested.key !== normalizedOverride) {
      console.warn(
        `Requested ERC-8004 network ${normalizedOverride} was unavailable. Falling back to ${requested.key}.`,
      );
    }

    console.log(
      `Selected ERC-8004 network ${requested.networkId} (${requested.key}).`,
    );

    return requested.key;
  };

  const a2aAgent = await startLocalA2AAgent({
    agentId: a2aAgentId,
    port: Number(process.env.A2A_LOCAL_PORT ?? '6102') || 6102,
    bindAddress: '0.0.0.0',
    publicUrl: resolvedA2APublicUrl,
    ingressProxy,
    ingressPrefix: ingressA2aPrefix,
  });
  console.log(`Local A2A agent endpoint: ${a2aAgent.a2aEndpoint}`);

  const stopAll = async () => {
    await Promise.allSettled([
      paidAgent.stop(),
      a2aAgent.stop(),
      facilitator.stop(),
      ingressProxy.stop(),
    ]);
  };

  try {
    const registrationPayload: Parameters<
      RegistryBrokerClient['registerAgent']
    >[0] = {
      profile: buildDemoProfile(
        'Local Demo A2A Agent',
        a2aAgent.agentId,
        'Local test agent used as the chat initiator.',
      ),
      registry: 'hashgraph-online',
      communicationProtocol: 'a2a',
      endpoint: a2aAgent.a2aEndpoint,
      metadata: {
        source: 'erc8004-demo',
        provider: 'Local Demo',
        tunnelUrl: a2aAgent.publicUrl,
        nativeId: a2aAgent.publicUrl ?? a2aAgent.a2aEndpoint,
      },
    };

    let a2aTarget: RegisteredAgent | null = cachedA2ATarget ?? null;
    if (a2aTarget) {
      try {
        await updateWithAutoTopUp(a2aTarget.uaid, registrationPayload);
        console.log(
          `Updated cached A2A agent: ${a2aTarget.name} (${a2aTarget.uaid})`,
        );
      } catch (error) {
        console.warn(
          `Updating cached A2A agent failed (${describeError(error)}). Re-registering...`,
        );
        if (error instanceof RegistryBrokerError) {
          console.warn('Update error body:', error.body);
        }
        a2aTarget = null;
      }
    }

    if (!a2aTarget) {
      const localA2ARegistration =
        await registerWithAutoTopUp(registrationPayload);

      a2aTarget = localA2ARegistration?.uaid
        ? {
            uaid: localA2ARegistration.uaid,
            name:
              localA2ARegistration.agent?.name ??
              localA2ARegistration.profile?.display_name ??
              'Local Demo A2A Agent',
          }
        : await waitForAgentMatch(
            client,
            ['hashgraph-online'],
            a2aAgent.agentId,
            hit => hit.name.includes(a2aAgent.agentId),
            60,
          );

      console.log(
        `Registered local A2A agent UAID: ${a2aTarget.name} (${a2aTarget.uaid})`,
      );

      await persistDemoEnvValues({
        REGISTRY_BROKER_DEMO_A2A_UAID: a2aTarget.uaid,
      });
    }

    const erc8004RegistryKey = await resolveErc8004RegistryKey(
      client,
      paidAgent.network ?? 'base-sepolia',
    );

    const paidRegistrationPayload: Parameters<
      RegistryBrokerClient['registerAgent']
    >[0] = {
      profile: buildDemoProfile(
        'Local Paid ERC-8004 Agent',
        paidAgent.agentId,
        'Demonstrates x402-settled chat responses for ERC-8004 listings.',
      ),
      registry: 'hashgraph-online',
      communicationProtocol: 'a2a',
      endpoint: paidAgent.rpcEndpoint,
      additionalRegistries: [erc8004RegistryKey],
      metadata: {
        provider: 'Local Paid Demo',
        source: 'erc8004-demo',
        tunnelUrl: paidAgent.publicUrl,
        nativeId: paidAgent.publicUrl ?? paidAgent.rpcEndpoint,
        registrationId: registrationTag,
        payments: {
          supported: ['x402'],
          required: ['x402'],
          protocols: {
            x402: {
              protocol: 'x402',
              required: true,
              gatewayUrl:
                facilitator.publicResourceUrl ?? facilitator.resourceUrl,
              paymentNetwork: 'base-sepolia',
              paymentToken: 'USDC',
              priceUsdc: 0.05,
            },
          },
        },
      },
    };

    let paidAgentMatch: RegisteredAgent | null = cachedPaidTarget ?? null;
    if (paidAgentMatch) {
      try {
        await updateWithAutoTopUp(paidAgentMatch.uaid, paidRegistrationPayload);
        console.log(
          `Updated cached paid agent: ${paidAgentMatch.name} (${paidAgentMatch.uaid})`,
        );
      } catch (error) {
        console.warn(
          `Updating cached paid agent failed (${describeError(error)}). Re-registering...`,
        );
        if (error instanceof RegistryBrokerError) {
          console.warn('Update error body:', error.body);
        }
        paidAgentMatch = null;
      }
    }

    if (!paidAgentMatch) {
      const paidAgentRegistration = await registerWithAutoTopUp(
        paidRegistrationPayload,
      );

      paidAgentMatch = paidAgentRegistration?.uaid
        ? {
            uaid: paidAgentRegistration.uaid,
            name:
              paidAgentRegistration.agent?.name ??
              paidAgentRegistration.profile?.display_name ??
              'Local Paid ERC-8004 Agent',
          }
        : await waitForAgentMatch(
            client,
            'erc-8004',
            paidAgent.agentId,
            hit =>
              hit.metadata?.registrationId === registrationTag &&
              hit.metadata?.tunnelUrl === paidAgent.publicUrl,
          );

      console.log(
        `Discovered paid agent UAID: ${paidAgentMatch.name} (${paidAgentMatch.uaid})`,
      );

      await persistDemoEnvValues({
        REGISTRY_BROKER_DEMO_PAID_UAID: paidAgentMatch.uaid,
      });
    }

    console.log('Creating chat session via registry-broker…');
    const session = await client.chat.createSession({
      uaid: paidAgentMatch.uaid,
      historyTtlSeconds: 600,
    });
    console.log(`Session ${session.sessionId} created.`);

    console.log(`Sending paid prompt: "${prompt}"`);
    const reply = await client.chat.sendMessage({
      sessionId: session.sessionId,
      uaid: paidAgentMatch.uaid,
      message: prompt,
    });

    console.log('\nPaid agent reply:');
    console.log(reply.message);
    logRawResponse(
      'Sanitized raw response:',
      reply.rawResponse as Record<string, unknown> | undefined,
    );

    const headers =
      (reply.rawResponse as { headers?: Record<string, unknown> })?.headers ??
      {};
    console.log('\nPayment metadata:');
    Object.entries(headers).forEach(([key, value]) => {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    });

    if (typeof headers['x-payment-amount-usd'] === 'number') {
      const amount = headers['x-payment-amount-usd'] as number;
      const debited = (amount * 1.2) / 0.01;
      console.log(
        `\nEstimated credits debited (20% markup, $0.01 per credit): ${debited.toFixed(
          2,
        )}`,
      );
    }

    const postChatBalance = await fetchCreditBalance(
      brokerBaseUrl,
      ledgerApiKey,
      ledgerAccountId,
    );
    if (
      typeof balanceBeforeChat === 'number' &&
      typeof postChatBalance === 'number'
    ) {
      const debited = balanceBeforeChat - postChatBalance;
      console.log(
        `Credits before chat: ${balanceBeforeChat}, after chat: ${postChatBalance}, debited: ${debited.toFixed(
          2,
        )}`,
      );
    } else if (typeof postChatBalance === 'number') {
      console.log(`Ledger credit balance after chat: ${postChatBalance}`);
    }

    console.log('\nDemo complete.');
  } finally {
    await stopAll();
  }
};

const demoTimeoutMs = Number(process.env.DEMO_TIMEOUT_MS ?? '240000');
const timeoutHandle = setTimeout(() => {
  console.error(
    `Demo exceeded ${demoTimeoutMs}ms without completing. Exiting for safety.`,
  );
  process.exit(1);
}, demoTimeoutMs);

runDemo()
  .then(() => {
    clearTimeout(timeoutHandle);
    process.exit(0);
  })
  .catch(error => {
    clearTimeout(timeoutHandle);
    logError(error);
    process.exit(1);
  });
