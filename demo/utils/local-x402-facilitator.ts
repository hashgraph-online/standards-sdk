import {
  createServer,
  Server as HttpServer,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  cloudflaredInstallHint,
  detectCloudflared,
  getTunnelPreference,
  startCloudflareTunnel,
  tunnelingDisabled,
  type CloudflareTunnelHandle,
} from './demo-tunnel';

export interface LocalX402FacilitatorOptions {
  port?: number;
  bindAddress?: string;
  resourcePath?: string;
  description?: string;
  network?: string;
  assetAddress?: string;
  payToAddress?: string;
  maxAmountRequired?: string;
}

export interface LocalX402FacilitatorHandle {
  port: number;
  baseUrl: string;
  publicBaseUrl?: string;
  discoveryUrl: string;
  publicDiscoveryUrl?: string;
  resourceUrl: string;
  publicResourceUrl?: string;
  stop: () => Promise<void>;
}

const DEFAULT_PORT = 4102;
const DEFAULT_BIND_ADDRESS = '0.0.0.0';
const DEFAULT_RESOURCE_PATH = '/agents/local-x402';
const DEFAULT_DESCRIPTION = 'Local x402 facilitator demo signal';
const DEFAULT_NETWORK = 'base-sepolia';
const DEFAULT_ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DEFAULT_PAY_TO = '0x6813749E1eB9E0001A44C2684695FE8AD676cdD0';
const DEFAULT_MAX_AMOUNT = '2500'; // 0.0025 USD with 6 decimals
const FACILITATOR_CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'registry-broker-x402-facilitator.json',
);

const json = (
  response: ServerResponse,
  status: number,
  payload: unknown,
  headers?: Record<string, string>,
) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    ...(headers ?? {}),
  });
  response.end(JSON.stringify(payload));
};

const inferBaseUrl = (
  request: IncomingMessage,
  fallbackPort: number,
): string => {
  const host = request.headers.host;
  const protoHeader = request.headers['x-forwarded-proto'];
  const proto =
    typeof protoHeader === 'string' && protoHeader.trim().length > 0
      ? protoHeader.trim()
      : 'http';
  if (host && host.trim().length > 0) {
    return `${proto}://${host}`;
  }
  return `${proto}://127.0.0.1:${fallbackPort}`;
};

const formatUsdAmount = (raw: string): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed / 1_000_000) * 1e6) / 1e6;
};

const buildRequirement = (
  resourceUrl: string,
  description: string,
  network: string,
  assetAddress: string,
  payToAddress: string,
  maxAmountRequired: string,
) => ({
  asset: assetAddress,
  description,
  extra: {
    publisher: 'local-demo',
    category: 'signal',
  },
  maxAmountRequired,
  maxTimeoutSeconds: 60,
  mimeType: 'application/json',
  network,
  outputSchema: {
    input: {
      method: 'GET',
      type: 'http',
      queryParams: {
        prompt: {
          type: 'string',
          required: false,
          description: 'Optional topic for the signal request.',
        },
      },
    },
  },
  payTo: payToAddress,
  resource: resourceUrl,
  scheme: 'exact',
});

const buildResourceDescriptor = (
  resourceUrl: string,
  requirement: ReturnType<typeof buildRequirement>,
) => ({
  resource: resourceUrl,
  accepts: [requirement],
  type: 'http',
  lastUpdated: new Date().toISOString(),
  x402Version: 1,
  metadata: {
    provider: 'local-x402-facilitator',
    confidence: { overallScore: 0.8 },
    reliability: { apiSuccessRate: 0.99 },
    performance: { avgLatencyMs: 1200 },
    paymentAnalytics: { totalTransactions: 42 },
  },
});

export const startLocalX402Facilitator = async (
  options: LocalX402FacilitatorOptions = {},
): Promise<LocalX402FacilitatorHandle> => {
  const port = options.port ?? DEFAULT_PORT;
  const bindAddress = options.bindAddress ?? DEFAULT_BIND_ADDRESS;
  const resourcePath = options.resourcePath ?? DEFAULT_RESOURCE_PATH;
  const description = options.description ?? DEFAULT_DESCRIPTION;
  const network = options.network ?? DEFAULT_NETWORK;
  const assetAddress = options.assetAddress ?? DEFAULT_ASSET;
  const payToAddress = options.payToAddress ?? DEFAULT_PAY_TO;
  const maxAmountRequired = options.maxAmountRequired ?? DEFAULT_MAX_AMOUNT;

  let resolvedPort = port;

  const server: HttpServer = createServer((request, response) => {
    if (!request.url || !request.method) {
      json(response, 400, { error: 'Invalid request' });
      return;
    }

    const baseUrl = inferBaseUrl(request, resolvedPort);
    const url = new URL(request.url, baseUrl);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-PAYMENT',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
      });
      response.end();
      return;
    }

    if (request.method === 'GET' && pathname === '/health') {
      json(response, 200, { status: 'ok', port: resolvedPort });
      return;
    }

    if (
      request.method === 'GET' &&
      pathname.startsWith('/platform/v2/x402/discovery/resources')
    ) {
      const requirement = buildRequirement(
        `${baseUrl}${resourcePath}`,
        description,
        network,
        assetAddress,
        payToAddress,
        maxAmountRequired,
      );
      const resourceDescriptor = buildResourceDescriptor(
        `${baseUrl}${resourcePath}`,
        requirement,
      );
      const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
      const limit = Number(url.searchParams.get('limit') ?? '100') || 100;
      const items = offset > 0 ? [] : [resourceDescriptor];
      json(response, 200, {
        x402Version: 1,
        items,
        pagination: {
          limit,
          offset,
          total: 1,
        },
      });
      return;
    }

    if (request.method === 'GET' && pathname === resourcePath) {
      const requirement = buildRequirement(
        `${baseUrl}${resourcePath}`,
        description,
        network,
        assetAddress,
        payToAddress,
        maxAmountRequired,
      );
      const paymentHeader = request.headers['x-payment'];
      if (!paymentHeader) {
        json(
          response,
          402,
          {
            x402Version: 1,
            error: 'PAYMENT_REQUIRED',
            accepts: [requirement],
          },
          {
            'X-PAYMENT-STATUS': 'PAYMENT_REQUIRED',
          },
        );
        return;
      }

      const amountUsd = formatUsdAmount(requirement.maxAmountRequired);
      const prompt =
        url.searchParams.get('prompt') ??
        url.searchParams.get('topic') ??
        'latest market signal';
      const settledAt = new Date().toISOString();
      const receipt = {
        status: 'SETTLED',
        requestId: randomUUID(),
        amountUsd,
        network: requirement.network,
        resource: requirement.resource,
      };
      const encodedReceipt = Buffer.from(JSON.stringify(receipt)).toString(
        'base64',
      );

      json(
        response,
        200,
        {
          provider: 'Local x402 facilitator',
          prompt,
          settledAt,
          amountUsd,
          signal: `Paid response for "${prompt}" generated at ${settledAt}.`,
        },
        {
          'X-PAYMENT-STATUS': 'SETTLED',
          'X-PAYMENT-RESPONSE': encodedReceipt,
          'X-PAYMENT-AMOUNT-USD': String(amountUsd),
          'Access-Control-Expose-Headers':
            'X-PAYMENT-RESPONSE,X-PAYMENT-STATUS,X-PAYMENT-AMOUNT-USD',
        },
      );
      return;
    }

    json(response, 404, { error: 'Not found', path: pathname });
  });

  const listenResult = await new Promise<'started' | 'in-use'>(
    (resolve, reject) => {
      server.once('error', error => {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          resolve('in-use');
          return;
        }
        reject(error);
      });
      server.listen(port, bindAddress, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolvedPort = address.port;
          resolve('started');
        } else {
          reject(new Error('Failed to start x402 facilitator server'));
        }
      });
    },
  );

  let baseHandle: LocalX402FacilitatorHandle;
  let cachedUrl: string | undefined;
  if (listenResult === 'in-use') {
    server.close();
    cachedUrl = await readPersistedFacilitatorUrl(port);
    baseHandle = await reuseExistingFacilitator(port, resourcePath);
  } else {
    const baseUrl = `http://127.0.0.1:${resolvedPort}`;
    baseHandle = {
      port: resolvedPort,
      baseUrl,
      discoveryUrl: `${baseUrl}/platform/v2/x402/discovery/resources`,
      resourceUrl: `${baseUrl}${resourcePath}`,
      stop: async () => {
        await new Promise<void>((resolve, reject) => {
          server.close(error => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      },
    };
  }

  const { handle: tunnelHandle, publicBaseUrl } = await ensureFacilitatorTunnel(
    baseHandle.port,
    cachedUrl,
  );
  const publicDiscoveryUrl = publicBaseUrl
    ? `${publicBaseUrl}/platform/v2/x402/discovery/resources`
    : undefined;
  const publicResourceUrl = publicBaseUrl
    ? `${publicBaseUrl}${resourcePath}`
    : undefined;

  return {
    ...baseHandle,
    publicBaseUrl,
    publicDiscoveryUrl,
    publicResourceUrl,
    stop: async () => {
      await baseHandle.stop();
      if (tunnelHandle) {
        await tunnelHandle.close();
      }
    },
  };
};

const reuseExistingFacilitator = async (
  port: number,
  resourcePath: string,
): Promise<LocalX402FacilitatorHandle> => {
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fetch(`${baseUrl}/health`, { method: 'GET' });
  } catch (error) {
    throw new Error(
      `Port ${port} is already in use but the facilitator health check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  console.log(`Reusing existing x402 facilitator at ${baseUrl}`);

  return {
    port,
    baseUrl,
    discoveryUrl: `${baseUrl}/platform/v2/x402/discovery/resources`,
    resourceUrl: `${baseUrl}${resourcePath}`,
    stop: async () => {
      return;
    },
  };
};

const ensureFacilitatorTunnel = async (
  port: number,
  cachedUrl?: string,
): Promise<{
  handle: CloudflareTunnelHandle | null;
  publicBaseUrl?: string;
}> => {
  const preference = getTunnelPreference();
  if (tunnelingDisabled(preference)) {
    console.log('Cloudflare tunnel disabled; facilitator will stay private.');
    return { handle: null };
  }
  if (cachedUrl) {
    console.log(
      `Reusing cached Cloudflare tunnel for x402 facilitator: ${cachedUrl}`,
    );
    return { handle: null, publicBaseUrl: cachedUrl };
  }
  if (preference === 'localtunnel') {
    console.log(
      'REGISTRY_BROKER_DEMO_TUNNEL=localtunnel is not supported for the x402 facilitator; Cloudflare will be used instead.',
    );
  }
  const available = await detectCloudflared();
  if (!available) {
    const hint = cloudflaredInstallHint();
    throw new Error(
      `cloudflared is required for the x402 facilitator demo. Install it via: ${hint}`,
    );
  }
  try {
    const handle = await startCloudflareTunnel(port);
    console.log(`Cloudflare tunnel for x402 facilitator: ${handle.url}`);
    await persistFacilitatorTunnel(port, handle.url);
    return { handle, publicBaseUrl: handle.url };
  } catch (error) {
    throw new Error(
      `Unable to start Cloudflare tunnel for the x402 facilitator: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const persistFacilitatorTunnel = async (
  port: number,
  url: string,
): Promise<void> => {
  const payload = {
    port,
    url,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(FACILITATOR_CACHE_PATH), { recursive: true });
  await writeFile(
    FACILITATOR_CACHE_PATH,
    JSON.stringify(payload, null, 2),
    'utf8',
  );
};

const readPersistedFacilitatorUrl = async (
  port: number,
): Promise<string | undefined> => {
  try {
    const raw = await readFile(FACILITATOR_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { port?: number; url?: string };
    if (parsed.port === port && typeof parsed.url === 'string') {
      return parsed.url;
    }
  } catch {}
  return undefined;
};
