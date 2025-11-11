import {
  createServer,
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  cloudflaredInstallHint,
  detectCloudflared,
  getTunnelPreference,
  startCloudflareTunnel,
  tunnelingDisabled,
  type CloudflareTunnelHandle,
} from './demo-tunnel';
import type { LocalX402FacilitatorHandle } from './local-x402-facilitator';
import type { LocalIngressProxyHandle } from './local-ingress-proxy';

export interface LocalPaidAgentOptions {
  agentId: string;
  facilitator: LocalX402FacilitatorHandle;
  port?: number;
  bindAddress?: string;
  priceUsd?: number;
  network?: string;
  token?: string;
  publicUrl?: string;
  ingressProxy?: LocalIngressProxyHandle;
  ingressPrefix?: string;
}

export interface LocalPaidAgentHandle {
  agentId: string;
  port: number;
  baseUrl: string;
  publicUrl?: string;
  agentCardUrl: string;
  rpcEndpoint: string;
  network?: string;
  token?: string;
  priceUsd?: number;
  facilitator: LocalX402FacilitatorHandle;
  stop: () => Promise<void>;
}

const collectRequestBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      data += chunk;
    });
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });

const jsonResponse = (
  response: ServerResponse,
  status: number,
  payload: unknown,
  headers?: Record<string, string>,
): void => {
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
  const ingressBaseHeader = request.headers['x-ingress-public-base'];
  if (typeof ingressBaseHeader === 'string') {
    const trimmed = ingressBaseHeader.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  } else if (Array.isArray(ingressBaseHeader) && ingressBaseHeader.length > 0) {
    const candidate = ingressBaseHeader[0]?.trim();
    if (candidate && candidate.length > 0) {
      return candidate;
    }
  }
  const host = request.headers.host;
  if (!host) {
    return `http://127.0.0.1:${fallbackPort}`;
  }
  const forwardedProto = request.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.trim().length > 0) {
    return `${forwardedProto}://${host}`;
  }
  const hostWithoutPort = host.split(':')[0]?.toLowerCase() ?? host;
  const isCloudflareHost =
    hostWithoutPort === 'trycloudflare.com' ||
    hostWithoutPort.endsWith('.trycloudflare.com');
  return isCloudflareHost ? `https://${host}` : `http://${host}`;
};

const extractPromptFromRequest = (body: Record<string, unknown>): string => {
  const params = body.params as Record<string, unknown> | undefined;
  const message = params?.message as Record<string, unknown> | undefined;
  const parts = Array.isArray(message?.parts)
    ? (message?.parts as Array<Record<string, unknown>>)
    : [];
  const textEntry = parts.find(
    part =>
      part?.kind === 'text' &&
      typeof part.text === 'string' &&
      part.text.trim().length > 0,
  );
  if (textEntry?.text) {
    return textEntry.text;
  }
  if (typeof params?.prompt === 'string' && params.prompt.trim().length > 0) {
    return params.prompt;
  }
  return 'local paid signal request';
};

const normalizeIngressPrefix = (
  rawPrefix: string,
  fallbackId: string,
): string => {
  const base = rawPrefix?.trim().length
    ? rawPrefix.trim()
    : `paid-${fallbackId}`;
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9\/-]/g, '-')
    .replace(/-+/g, '-');
  return sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
};

const ensureCloudflareInstalled = async (): Promise<void> => {
  const available = await detectCloudflared();
  if (!available) {
    throw new Error(
      `cloudflared is required for this demo. Install it via ${cloudflaredInstallHint()}.`,
    );
  }
};

const verifyPaidAgentPublicUrl = async (url: string): Promise<boolean> => {
  try {
    const healthUrl = new URL('/health', url).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timer);
    return response?.ok ?? false;
  } catch {
    return false;
  }
};

const forwardToFacilitator = async (
  facilitator: LocalX402FacilitatorHandle,
  prompt: string,
  paymentHeader?: string,
): Promise<Response> => {
  const resourceUrl = new URL(facilitator.resourceUrl);
  if (prompt) {
    resourceUrl.searchParams.set('prompt', prompt);
  }
  const headers: Record<string, string> = {};
  if (paymentHeader) {
    headers['x-payment'] = paymentHeader;
  }
  return fetch(resourceUrl, { headers });
};

interface CachedTunnelPayload {
  port: number;
  url: string;
  pid?: number;
  updatedAt: string;
}

const PAID_AGENT_CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'registry-broker-paid-agent-tunnel.json',
);

const persistPaidAgentTunnel = async (
  port: number,
  url: string,
  pid?: number,
): Promise<void> => {
  const payload: CachedTunnelPayload = {
    port,
    url,
    pid,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(PAID_AGENT_CACHE_PATH), { recursive: true });
  await writeFile(
    PAID_AGENT_CACHE_PATH,
    JSON.stringify(payload, null, 2),
    'utf8',
  );
};

const readPersistedPaidAgentTunnel = async (
  port: number,
): Promise<string | undefined> => {
  try {
    const raw = await readFile(PAID_AGENT_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CachedTunnelPayload>;
    if (parsed.port === port && typeof parsed.url === 'string') {
      return parsed.url;
    }
  } catch {
    // ignore cache read errors
  }
  return undefined;
};

const clearPersistedPaidAgentTunnel = async (): Promise<void> => {
  try {
    await rm(PAID_AGENT_CACHE_PATH, { force: true });
  } catch {
    // ignore cache delete errors
  }
};

export const startLocalPaidAgent = async (
  options: LocalPaidAgentOptions,
): Promise<LocalPaidAgentHandle> => {
  const {
    agentId,
    facilitator,
    port = 6205,
    bindAddress = '0.0.0.0',
    priceUsd = 0.05,
    network = 'base-sepolia',
    token = 'USDC',
    publicUrl: explicitPublicUrl,
    ingressProxy,
    ingressPrefix,
  } = options;

  const preconfiguredUrl =
    explicitPublicUrl ||
    process.env.REGISTRY_BROKER_DEMO_PAID_AGENT_PUBLIC_URL?.trim() ||
    undefined;
  const usingPreconfiguredTunnel = Boolean(preconfiguredUrl);
  const usingIngressProxy = Boolean(ingressProxy);
  if (!usingPreconfiguredTunnel && !usingIngressProxy) {
    await ensureCloudflareInstalled();
  }
  let resolvedPort: number | null = null;
  let tunnelHandle: CloudflareTunnelHandle | null = null;

  const server: HttpServer = createServer(async (request, response) => {
    const { method, url } = request;
    const baseUrl = inferBaseUrl(request, resolvedPort ?? port);
    const rawPathname = (url ?? '/').split('?')[0] || '/';
    const a2aAdjustedPath =
      rawPathname === '/a2a'
        ? '/rpc'
        : rawPathname.startsWith('/a2a/')
          ? `/${rawPathname.slice('/a2a/'.length)}`
          : rawPathname;
    const rpcPath = a2aAdjustedPath;
    const normalizedPath =
      rpcPath === '/rpc'
        ? '/'
        : rpcPath.startsWith('/rpc/')
          ? `/${rpcPath.slice('/rpc/'.length)}`
          : rpcPath;

    if (method === 'GET' && normalizedPath === '/health') {
      jsonResponse(response, 200, {
        status: 'ok',
        agentId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (
      method === 'GET' &&
      (normalizedPath === '/.well-known/agent-card.json' ||
        normalizedPath === '/.well-known/agent.json' ||
        normalizedPath === '/agent.json')
    ) {
      const card = {
        id: agentId,
        name: `Local Paid Agent (${agentId})`,
        description:
          'A local ERC-8004-compatible agent that requires x402 payments.',
        version: '1.0.0',
        url: `${baseUrl}/rpc`,
        serviceEndpoint: `${baseUrl}/rpc`,
        provider: {
          organization: 'Local Paid Demo',
          url: baseUrl,
        },
        capabilities: {
          streaming: false,
          pushNotifications: false,
          extensions: [
            {
              uri: 'https://github.com/a2aproject/A2A/blob/main/docs/extensions/x402.md',
              description: 'Paid responses via x402 facilitator',
              required: true,
              params: {
                gateway_url:
                  facilitator.publicResourceUrl ?? facilitator.resourceUrl,
                payment_network: network,
                payment_token: token,
                price_usdc: priceUsd.toFixed(2),
              },
            },
          ],
        },
        skills: [
          {
            id: 'paid-signals',
            name: 'Paid Signals',
            description:
              'Returns a short status message once the x402 payment settles.',
          },
        ],
      };
      jsonResponse(response, 200, card);
      return;
    }

    if (method === 'POST' && (rpcPath === '/rpc' || rpcPath === '/')) {
      try {
        const rawBody = await collectRequestBody(request);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const prompt = extractPromptFromRequest(body);
        const paymentHeader =
          typeof request.headers['x-payment'] === 'string'
            ? request.headers['x-payment']
            : undefined;
        const facilitatorResponse = await forwardToFacilitator(
          facilitator,
          prompt,
          paymentHeader,
        );
        const responseText = await facilitatorResponse.text();
        if (facilitatorResponse.status === 402) {
          response.writeHead(402, {
            'Content-Type': 'application/json',
            'X-PAYMENT-STATUS': 'PAYMENT_REQUIRED',
          });
          response.end(responseText);
          return;
        }
        if (!facilitatorResponse.ok) {
          response.writeHead(facilitatorResponse.status, {
            'Content-Type': 'application/json',
          });
          response.end(responseText);
          return;
        }
        const settledPayload = JSON.parse(responseText) as {
          signal?: string;
          amountUsd?: number;
        };
        const rpcResponse = {
          jsonrpc: '2.0',
          id: (body as { id?: unknown })?.id ?? null,
          result: {
            kind: 'message',
            role: 'agent',
            messageId: randomUUID(),
            parts: [
              {
                kind: 'text',
                text:
                  settledPayload.signal ?? `Payment accepted for "${prompt}".`,
              },
            ],
          },
        };
        const proxyHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        [
          'x-payment-status',
          'x-payment-response',
          'x-payment-amount-usd',
        ].forEach(key => {
          const headerValue = facilitatorResponse.headers.get(key);
          if (headerValue) {
            proxyHeaders[key.toUpperCase()] = headerValue;
          }
        });
        response.writeHead(200, proxyHeaders);
        response.end(JSON.stringify(rpcResponse));
      } catch (error) {
        jsonResponse(
          response,
          500,
          {
            error:
              error instanceof Error ? error.message : 'Failed to process RPC',
          },
          { 'X-PAYMENT-STATUS': 'FAILED' },
        );
      }
      return;
    }

    console.log(
      `[paid-agent:${agentId}] Unexpected request ${method} ${rawPathname}`,
    );
    jsonResponse(response, 404, {
      error: 'Not found',
      path: rawPathname,
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bindAddress, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolvedPort = address.port;
        resolve();
      } else {
        reject(new Error('Failed to start paid agent server'));
      }
    });
  });

  const baseUrl = `http://127.0.0.1:${resolvedPort ?? port}`;
  const preference = getTunnelPreference();
  if (
    tunnelingDisabled(preference) &&
    !usingPreconfiguredTunnel &&
    !ingressProxy
  ) {
    server.close();
    throw new Error('Cloudflare tunnel is required for the paid agent demo.');
  }
  let publicUrl = preconfiguredUrl || undefined;
  let ingressRouteActive = false;
  if (!publicUrl && ingressProxy) {
    const prefix = normalizeIngressPrefix(
      options.ingressPrefix ?? `paid-${agentId}`,
      agentId,
    );
    publicUrl = ingressProxy.registerRoute(prefix, baseUrl);
    ingressRouteActive = true;
    console.log(
      `  🔗 Ingress proxy enabled for paid agent ${agentId}: ${publicUrl} (prefix ${prefix})`,
    );
  }
  if (publicUrl && !ingressRouteActive) {
    const reachable = await verifyPaidAgentPublicUrl(publicUrl);
    if (reachable) {
      console.log(`  🔗 Using preconfigured paid agent URL: ${publicUrl}`);
    } else {
      console.warn(
        `  ⚠️  Preconfigured paid agent URL ${publicUrl} was unreachable. Falling back to Cloudflare tunnel.`,
      );
      publicUrl = undefined;
    }
  }
  if (!publicUrl) {
    const cachedUrl = await readPersistedPaidAgentTunnel(resolvedPort ?? port);
    if (cachedUrl) {
      const reachable = await verifyPaidAgentPublicUrl(cachedUrl);
      if (reachable) {
        console.log(
          `  🔁 Reusing cached paid agent Cloudflare tunnel: ${cachedUrl}`,
        );
        publicUrl = cachedUrl;
      } else {
        await clearPersistedPaidAgentTunnel();
      }
    }
  }
  if (!publicUrl) {
    tunnelHandle = await startCloudflareTunnel(resolvedPort ?? port);
    publicUrl = tunnelHandle.url;
    await persistPaidAgentTunnel(
      resolvedPort ?? port,
      publicUrl,
      tunnelHandle.pid,
    );
  }

  if (!publicUrl) {
    throw new Error('Failed to establish a public URL for the paid agent.');
  }

  const handle: LocalPaidAgentHandle = {
    agentId,
    port: resolvedPort ?? port,
    baseUrl,
    publicUrl,
    agentCardUrl: `${publicUrl}/.well-known/agent-card.json`,
    rpcEndpoint: `${publicUrl}/rpc`,
    network,
    token,
    priceUsd,
    facilitator,
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
      if (tunnelHandle && !usingPreconfiguredTunnel && !ingressRouteActive) {
        if (process.env.REGISTRY_BROKER_DEMO_KEEP_TUNNELS === '1') {
          console.log(
            '  🔁 Persisting paid agent Cloudflare tunnel for reuse (REGISTRY_BROKER_DEMO_KEEP_TUNNELS=1).',
          );
        } else {
          await tunnelHandle.close();
          await clearPersistedPaidAgentTunnel();
        }
      } else if (!usingPreconfiguredTunnel && !ingressRouteActive) {
        await clearPersistedPaidAgentTunnel();
      }
    },
  };

  return handle;
};
