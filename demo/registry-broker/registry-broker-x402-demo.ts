import 'dotenv/config';
import { PrivateKey } from '@hashgraph/sdk';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
} from '../../src/services/registry-broker';
import {
  startLocalA2AAgent,
  type LocalA2AAgentHandle,
} from '../utils/local-a2a-agent';
import {
  startLocalX402Facilitator,
  type LocalX402FacilitatorHandle,
} from '../utils/local-x402-facilitator';

interface SearchHit {
  id: string;
  uaid: string;
  registry: string;
  name: string;
  metadata?: Record<string, unknown>;
  endpoints?: Record<string, unknown> | string[];
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type LedgerNetwork = 'mainnet' | 'testnet';

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const readEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const resolveLedgerNetwork = (): LedgerNetwork =>
  readEnv('HEDERA_NETWORK')?.toLowerCase() === 'mainnet'
    ? 'mainnet'
    : 'testnet';

const resolveLedgerAccountId = (network: LedgerNetwork): string | undefined => {
  const scope = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  return (
    readEnv('HEDERA_ACCOUNT_ID') ||
    readEnv(`${scope}_HEDERA_ACCOUNT_ID`) ||
    readEnv(`${scope}_HEDERA_ACCOUNT`) ||
    readEnv('HEDERA_ACCOUNT')
  );
};

const resolveLedgerPrivateKey = (
  network: LedgerNetwork,
): string | undefined => {
  const scope = network === 'mainnet' ? 'MAINNET' : 'TESTNET';
  return (
    readEnv('HEDERA_PRIVATE_KEY') ||
    readEnv(`${scope}_HEDERA_PRIVATE_KEY`) ||
    readEnv(`${scope}_PRIVATE_KEY`) ||
    readEnv('PRIVATE_KEY')
  );
};

const ensureLedgerCredentials = (): {
  accountId: string;
  privateKey: string;
  network: LedgerNetwork;
} => {
  const network = resolveLedgerNetwork();
  const accountId = resolveLedgerAccountId(network);
  const privateKey = resolveLedgerPrivateKey(network);
  if (!accountId || !privateKey) {
    throw new Error(
      'Ledger authentication requires HEDERA_ACCOUNT_ID/HEDERA_PRIVATE_KEY or network-scoped TESTNET_/MAINNET_ values.',
    );
  }
  return { accountId, privateKey, network };
};

const authenticateWithLedger = async (
  client: RegistryBrokerClient,
): Promise<{ accountId: string; privateKey: string }> => {
  const credentials = ensureLedgerCredentials();
  const privateKey = PrivateKey.fromString(credentials.privateKey);
  let attemptError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const challenge = await client.createLedgerChallenge({
        accountId: credentials.accountId,
        network: credentials.network,
      });
      const signatureBytes = await privateKey.sign(
        Buffer.from(challenge.message, 'utf8'),
      );
      const signature = Buffer.from(signatureBytes).toString('base64');
      const publicKey = privateKey.publicKey.toString();
      const verification = await client.verifyLedgerChallenge({
        challengeId: challenge.challengeId,
        accountId: credentials.accountId,
        network: credentials.network,
        signature,
        publicKey,
      });
      console.log(
        `Ledger auth complete for ${verification.accountId} on ${verification.network}.`,
      );
      client.setLedgerApiKey(verification.key);
      client.setDefaultHeader('x-account-id', verification.accountId);
      return {
        accountId: credentials.accountId,
        privateKey: credentials.privateKey,
      };
    } catch (error) {
      attemptError = error;
      console.log(
        `Ledger auth attempt ${attempt + 1} failed: ${describeError(error)}`,
      );
      await delay(1000 * (attempt + 1));
    }
  }
  throw attemptError instanceof Error
    ? attemptError
    : new Error(describeError(attemptError));
};

const buildComparableEndpoints = (resourceUrl: string): string[] => {
  const variants = new Set<string>();
  variants.add(resourceUrl);
  try {
    const parsed = new URL(resourceUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost') {
      parsed.hostname = 'host.docker.internal';
      variants.add(parsed.toString());
    }
    if (host === 'host.docker.internal') {
      parsed.hostname = '127.0.0.1';
      variants.add(parsed.toString());
      parsed.hostname = 'localhost';
      variants.add(parsed.toString());
    }
  } catch {
    // ignore parse errors and just rely on the original URL
  }
  return Array.from(variants);
};

const findEndpointMatch = (
  endpoints: SearchHit['endpoints'],
  resourceUrl: string,
): boolean => {
  if (!endpoints) {
    return false;
  }
  const comparables = buildComparableEndpoints(resourceUrl);
  const matchesComparable = (candidate?: unknown): boolean => {
    if (typeof candidate !== 'string') {
      return false;
    }
    return comparables.some(variant => candidate.includes(variant));
  };
  if (Array.isArray(endpoints)) {
    return endpoints.some(entry => matchesComparable(entry));
  }
  return Object.values(endpoints).some(value => matchesComparable(value));
};

const waitForX402Agent = async (
  client: RegistryBrokerClient,
  resourceUrl: string,
  maxAttempts = 20,
  intervalMs = 3000,
): Promise<SearchHit> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const search = await client.search({
        registries: ['coinbase-x402-bazaar'],
        protocols: ['x402'],
        limit: 50,
        q: 'local',
      });
      console.log(
        `Search attempt ${attempt}: ${search.hits.length} candidates (looking for ${resourceUrl})`,
      );
      const match = search.hits.find(hit => {
        if (!hit.metadata) {
          return false;
        }
        const provider =
          typeof hit.metadata.provider === 'string'
            ? hit.metadata.provider
            : '';
        const endpointMatch = findEndpointMatch(hit.endpoints, resourceUrl);
        return provider.includes('local-x402-facilitator') || endpointMatch;
      }) as SearchHit | undefined;
      if (match) {
        return match;
      }
      const sampleNames = search.hits
        .slice(0, 3)
        .map(hit => hit.name)
        .join(', ');
      console.log(`  No match yet. Sample hits: ${sampleNames || 'none'}`);
    } catch (error) {
      console.log(
        `Search attempt ${attempt} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await delay(intervalMs);
  }
  throw new Error(
    'Timed out waiting for the local x402 facilitator to appear in the registry. ' +
      'Ensure registry-broker is running with X402_BAZAAR_BASE_URL pointed at the local facilitator.',
  );
};

const formatPaymentMetadata = (
  payload: unknown,
): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const headers = record.headers;
  if (!headers || typeof headers !== 'object') {
    return null;
  }
  const safeHeaders = headers as Record<string, unknown>;
  const paymentKeys = [
    'x-payment-status',
    'x-payment-response',
    'x-payment-requirement',
    'x-payment-amount-usd',
  ];
  const summary: Record<string, unknown> = {};
  paymentKeys.forEach(key => {
    if (key in safeHeaders) {
      summary[key] = safeHeaders[key];
    }
  });
  return Object.keys(summary).length > 0 ? summary : null;
};

const waitForA2AAgent = async (
  client: RegistryBrokerClient,
  agent: LocalA2AAgentHandle,
  maxAttempts = 20,
  intervalMs = 3000,
): Promise<SearchHit> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const search = await client.search({
        registries: ['a2a-registry'],
        protocols: ['a2a'],
        limit: 50,
        q: agent.agentId,
      });
      console.log(
        `A2A search attempt ${attempt}: ${search.hits.length} candidates (looking for ${agent.agentId})`,
      );
      const match = search.hits.find(hit => {
        const metadata = hit.metadata ?? {};
        const alias =
          typeof metadata?.alias === 'string' ? metadata.alias : undefined;
        const provider =
          typeof metadata?.provider === 'string' ? metadata.provider : '';
        const source =
          typeof metadata?.source === 'string' ? metadata.source : undefined;
        const sourceUrl =
          typeof metadata?.sourceUrl === 'string'
            ? metadata.sourceUrl
            : undefined;
        const endpointMatch = findEndpointMatch(
          hit.endpoints,
          agent.publicUrl ?? agent.localA2aEndpoint,
        );
        const matchesId =
          hit.name.includes(agent.agentId) ||
          alias?.includes(agent.agentId) ||
          provider?.includes(agent.agentId);
        const matchesSource =
          source === 'local' ||
          (sourceUrl
            ? sourceUrl.includes(agent.localA2aEndpoint) ||
              sourceUrl.includes(agent.agentId)
            : false);
        return endpointMatch || matchesId || matchesSource;
      }) as SearchHit | undefined;
      if (match) {
        return match;
      }
      await delay(intervalMs);
    } catch (error) {
      console.log(
        `A2A search attempt ${attempt} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await delay(intervalMs);
    }
  }
  throw new Error(
    `Timed out waiting for local A2A agent (${agent.agentId}) to appear in search results.`,
  );
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
    console.error(error.message);
    return;
  }
  console.error(String(error));
};

const runServerOnly = async (facilitator: LocalX402FacilitatorHandle) => {
  console.log('Local x402 facilitator running.');
  console.log(`Discovery endpoint: ${facilitator.discoveryUrl}`);
  console.log(
    `Set X402_BAZAAR_BASE_URL=${facilitator.baseUrl}/platform/v2/x402/ before starting registry-broker.`,
  );
  process.on('SIGINT', async () => {
    await facilitator.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await facilitator.stop();
    process.exit(0);
  });
  await new Promise(() => {
    /* keep process alive */
  });
};

const runDemo = async () => {
  const brokerBaseUrl =
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ||
    'http://127.0.0.1:4000/api/v1';
  const prompt =
    process.env.X402_DEMO_PROMPT?.trim() ||
    'latest Hedera ecosystem funding signals';
  const localA2APort = Number(process.env.A2A_LOCAL_PORT ?? '6102') || 6102;
  const localPort = Number(process.env.X402_LOCAL_PORT ?? '4102') || 4102;
  const serverOnly = process.argv.includes('--server-only');

  const facilitator = await startLocalX402Facilitator({ port: localPort });

  if (serverOnly) {
    await runServerOnly(facilitator);
    return;
  }

  const localAgent = await startLocalA2AAgent({
    agentId: 'demo-x402-client',
    port: localA2APort,
    bindAddress: '0.0.0.0',
  });
  const apiKey = process.env.REGISTRY_BROKER_API_KEY?.trim();
  const client = new RegistryBrokerClient({
    baseUrl: brokerBaseUrl,
    ...(apiKey ? { apiKey } : {}),
  });
  if (apiKey) {
    console.log('Using REGISTRY_BROKER_API_KEY for authenticated calls.');
  } else {
    console.log(
      'REGISTRY_BROKER_API_KEY not set; performing ledger authentication for paid chat.',
    );
    await authenticateWithLedger(client);
  }

  console.log('Local x402 facilitator started at', facilitator.baseUrl);
  console.log(
    `Ensure registry-broker is running with X402_BAZAAR_BASE_URL=${facilitator.baseUrl}/platform/v2/x402/`,
  );
  console.log(
    'Waiting for registry-broker to index the facilitator resource...',
  );

  try {
    const [x402Hit, a2aHit] = await Promise.all([
      waitForX402Agent(client, facilitator.resourceUrl),
      waitForA2AAgent(client, localAgent),
    ]);

    console.log(`Found local x402 agent: ${x402Hit.name}`);
    console.log(`Found local A2A agent: ${a2aHit.name}`);
    console.log(`[${localAgent.agentId}] sending prompt via /chat: ${prompt}`);
    const response = await client.chat.sendMessage({
      uaid: x402Hit.uaid,
      message: `Agent ${localAgent.agentId} requests: ${prompt}.`,
      sessionId: `x402-demo-${localAgent.agentId}-${Date.now().toString(36)}`,
    });

    console.log('\nChat response:');
    console.log(response.message || '(empty response)');
    const payment = response.rawResponse
      ? formatPaymentMetadata(response.rawResponse)
      : null;
    if (response.rawResponse) {
      if (payment) {
        console.log('\nPayment metadata:');
        for (const [key, value] of Object.entries(payment)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      } else {
        console.log('\nPayment metadata not present on raw response.');
      }
    }

    console.log(
      `\nForwarding paid response to registered A2A agent (${a2aHit.name}) via /chat...`,
    );
    const relayResponse = await client.chat.sendMessage({
      uaid: a2aHit.uaid,
      message: [
        `Forwarded response from ${x402Hit.name}`,
        response.message || '(empty response)',
        payment ? `Payment metadata: ${JSON.stringify(payment)}` : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      sessionId: `relay-${localAgent.agentId}-${Date.now().toString(36)}`,
    });
    console.log(
      `[${a2aHit.name}] acknowledged relay via /chat with message:`,
      relayResponse.message || '(empty response)',
    );
  } catch (error) {
    logError(error);
  } finally {
    await Promise.allSettled([facilitator.stop(), localAgent.stop()]);
  }
};

runDemo().catch(error => {
  logError(error);
  process.exit(1);
});
