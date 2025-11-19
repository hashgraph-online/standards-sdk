import {
  createServer,
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns';
import { Resolver } from 'node:dns/promises';
import { Agent } from 'undici';
import localtunnel, { Tunnel } from 'localtunnel';
import {
  cloudflaredInstallHint,
  detectCloudflared,
  getTunnelPreference,
  startCloudflareTunnel,
  tunnelingDisabled,
  type CloudflareTunnelHandle,
} from './demo-tunnel';
import type { LocalIngressProxyHandle } from './local-ingress-proxy';

type TunnelHandle = CloudflareTunnelHandle;

export interface LocalA2AAgentOptions {
  agentId: string;
  port?: number;
  bindAddress?: string;
  /**
   * Optional pre-configured public URL (e.g. Cloudflare named tunnel). When provided we skip
   * spawning a new tunnel and assume the URL already forwards to the local server.
   */
  publicUrl?: string;
  ingressProxy?: LocalIngressProxyHandle;
  ingressPrefix?: string;
}

export interface LocalA2AAgentHandle {
  agentId: string;
  port: number;
  baseUrl: string;
  publicUrl?: string;
  a2aEndpoint: string;
  localA2aEndpoint: string;
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
): void => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(body);
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
  const hostHeader = request.headers.host;
  if (!hostHeader) {
    return `http://127.0.0.1:${fallbackPort}`;
  }
  const forwardedProto = request.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return `${forwardedProto}://${hostHeader}`;
  }
  const isSecureHost =
    /\.loca\.lt$/.test(hostHeader) || hostHeader.includes('ngrok.io');
  return `${isSecureHost ? 'https' : 'http'}://${hostHeader}`;
};

const buildAgentCard = (agentId: string, baseUrl: string) => ({
  id: agentId,
  name: `Local Demo Agent (${agentId})`,
  description:
    'Local test agent created automatically by the standards-sdk demo.',
  version: '1.0.0',
  capabilities: {
    streaming: false,
    messageHandling: true,
    testResponses: true,
  },
  url: `${baseUrl}/a2a`,
  serviceEndpoint: `${baseUrl}/a2a`,
  endpoints: {
    a2a: `${baseUrl}/a2a`,
  },
  created: new Date().toISOString(),
});

const buildMessageResponse = (agentId: string, text: string) => ({
  kind: 'message',
  role: 'agent',
  messageId: `msg-${Date.now()}`,
  parts: [
    {
      kind: 'text',
      text:
        text.length > 0 ? text : `Agent ${agentId} received an empty message.`,
    },
  ],
});

const verifyPublicUrlReachable = async (
  url: string,
  resolver?: Resolver,
): Promise<boolean> => {
  try {
    const healthUrl = new URL('/health', url).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const dispatcher = resolver
      ? new Agent({
          connect: {
            lookup: (hostname, _opts, callback) => {
              resolver
                .resolve4(hostname)
                .then(addresses => callback(null, addresses[0], 4))
                .catch(error => callback(error as Error, undefined as any, 0));
            },
          },
        })
      : undefined;
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      dispatcher,
    }).catch(() => null);
    if (dispatcher) {
      try {
        await dispatcher.close();
      } catch {}
    }
    clearTimeout(timer);
    return response?.ok ?? false;
  } catch {
    return false;
  }
};

interface CachedTunnelPayload {
  port: number;
  url: string;
  pid?: number;
  updatedAt: string;
}

const persistTunnelUrl = async (
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
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
};

const readPersistedTunnelUrl = async (
  port: number,
): Promise<string | undefined> => {
  try {
    const raw = await readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CachedTunnelPayload>;
    if (parsed.port === port && typeof parsed.url === 'string') {
      return parsed.url;
    }
  } catch {
    // ignore cache read failures
  }
  return undefined;
};

const clearPersistedTunnelUrl = async (): Promise<void> => {
  try {
    await rm(CACHE_PATH, { force: true });
  } catch {
    // ignore cache delete failures
  }
};

const verifyTunnelHealth = async (
  publicUrl: string,
  timeoutMs = 5000,
  resolver?: Resolver,
  debug = false,
): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const dispatcher = resolver
    ? new Agent({
        connect: {
          lookup: (hostname, _opts, callback) => {
            resolver
              .resolve4(hostname)
              .then(addresses => callback(null, addresses[0], 4))
              .catch(error => callback(error as Error, undefined as any, 0));
          },
        },
      })
    : undefined;
  try {
    const url = new URL(publicUrl);
    url.pathname = '/health';
    url.searchParams.set('ping', Date.now().toString());
    const response = await fetch(url, {
      signal: controller.signal,
      dispatcher,
    });
    if (!response.ok && debug) {
      console.log(
        `  ⛔️ Cloudflare health status ${response.status} for ${publicUrl}`,
      );
    }
    return response.ok;
  } catch (error) {
    if (debug) {
      console.log(
        `  ⛔️ Cloudflare health error for ${publicUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return false;
  } finally {
    if (dispatcher) {
      try {
        await dispatcher.close();
      } catch {}
    }
    clearTimeout(timer);
  }
};

const CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'registry-broker-a2a-tunnel.json',
);

const normalizeIngressPrefix = (rawPrefix: string): string => {
  const sanitized = rawPrefix
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\/-]/g, '-')
    .replace(/-+/g, '-');
  if (!sanitized) {
    return '/a2a-demo';
  }
  return sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
};

export const startLocalA2AAgent = async (
  options: LocalA2AAgentOptions,
): Promise<LocalA2AAgentHandle> => {
  const CLOUD_FLARE_HEALTH_TIMEOUT_MS =
    Number(
      process.env.REGISTRY_BROKER_DEMO_TUNNEL_HEALTH_TIMEOUT_MS ?? '60000',
    ) || 60000;
  const CLOUD_FLARE_HEALTH_INTERVAL_MS = 1_000;
  const CLOUD_FLARE_HEALTH_MAX_RETRIES =
    Number(process.env.REGISTRY_BROKER_DEMO_TUNNEL_HEALTH_RETRIES ?? '3') || 3;
  const requirePreconfiguredTunnel =
    process.env.REGISTRY_BROKER_DEMO_REQUIRE_PUBLIC_URL === '1';

  const {
    agentId,
    port,
    bindAddress = '0.0.0.0',
    publicUrl: explicitPublicUrl,
    ingressProxy,
    ingressPrefix,
  } = options;

  const defaultDnsServers = dns.getServers();
  const demoDnsServers = (
    process.env.REGISTRY_BROKER_DEMO_DNS_SERVERS || '1.1.1.1,8.8.8.8'
  )
    .split(',')
    .map(server => server.trim())
    .filter(Boolean);
  const demoResolver = demoDnsServers.length > 0 ? new Resolver() : undefined;
  if (demoResolver) {
    demoResolver.setServers(demoDnsServers);
  }
  if (demoDnsServers.length > 0) {
    dns.setServers(demoDnsServers);
    if (process.env.REGISTRY_BROKER_DEMO_DEBUG_TUNNEL === '1') {
      console.log(`  🌐 Using demo DNS servers: ${demoDnsServers.join(', ')}`);
    }
  }
  let resolvedPort: number | null = null;
  let tunnelHandle: TunnelHandle | null = null;
  let localTunnelInstance: Tunnel | null = null;
  const persistTunnels = process.env.REGISTRY_BROKER_DEMO_KEEP_TUNNELS === '1';

  const server: HttpServer = createServer(async (request, response) => {
    const { method, url } = request;
    const baseUrl = inferBaseUrl(request, resolvedPort ?? port ?? 0);
    const rawPath = (url ?? '/').split('?')[0] || '/';

    const stripA2aPrefix = (input: string): string => {
      let updated = input;
      while (updated === '/a2a' || updated.startsWith('/a2a/')) {
        updated = updated === '/a2a' ? '/' : updated.slice('/a2a'.length);
        if (!updated.startsWith('/')) {
          updated = `/${updated}`;
        }
      }
      return updated;
    };

    const path = stripA2aPrefix(rawPath);

    if (
      method === 'GET' &&
      (path.startsWith('/.well-known/agent.json') ||
        path.startsWith('/.well-known/agent-card.json'))
    ) {
      jsonResponse(response, 200, buildAgentCard(agentId, baseUrl));
      return;
    }

    if (
      method === 'GET' &&
      (path === '/agent.json' || path === '/agent-card.json')
    ) {
      jsonResponse(response, 200, buildAgentCard(agentId, baseUrl));
      return;
    }

    if (method === 'GET' && path === '/.well-known/hcs11-profile.json') {
      jsonResponse(response, 200, {
        version: '1.0',
        type: 1,
        display_name: `Local Demo Agent (${agentId})`,
        alias: agentId,
        bio: 'Local test agent created automatically by the standards-sdk demo.',
        aiAgent: {
          type: 0,
          capabilities: [0, 17],
          model: 'local-demo-model',
          creator: agentId,
        },
      });
      return;
    }

    if (method === 'GET' && path === '/health') {
      jsonResponse(response, 200, {
        status: 'healthy',
        agent_id: agentId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (method === 'POST' && path === '/tasks/send') {
      try {
        const rawBody = await collectRequestBody(request);
        const payload = rawBody ? JSON.parse(rawBody) : {};
        const contentText: string =
          payload?.content ?? payload?.message ?? 'Task received.';
        jsonResponse(response, 200, {
          status: {
            state: 'completed',
            message: {
              parts: [
                {
                  kind: 'text',
                  text: `Agent ${agentId} processed: ${contentText}`,
                },
              ],
            },
          },
          artifacts: [],
        });
        return;
      } catch (error) {
        jsonResponse(response, 500, {
          error:
            error instanceof Error ? error.message : 'Failed to process task',
        });
        return;
      }
    }

    if (method === 'POST' && (rawPath.startsWith('/a2a') || path === '/a2a')) {
      try {
        const rawBody = await collectRequestBody(request);
        const payload = rawBody ? JSON.parse(rawBody) : {};
        const { jsonrpc, method: rpcMethod, params, id } = payload;

        if (jsonrpc !== '2.0') {
          jsonResponse(response, 200, {
            jsonrpc: '2.0',
            id: id ?? null,
            error: {
              code: -32600,
              message: 'Invalid JSON-RPC version. Expected 2.0.',
            },
          });
          return;
        }

        if (rpcMethod !== 'message/send') {
          jsonResponse(response, 200, {
            jsonrpc: '2.0',
            id: id ?? null,
            error: {
              code: -32601,
              message: `Unsupported method: ${rpcMethod}`,
            },
          });
          return;
        }

        const messageText: string =
          params?.message?.parts?.[0]?.text ??
          'Hello from the registry broker demo agent!';

        jsonResponse(response, 200, {
          jsonrpc: '2.0',
          id,
          result: buildMessageResponse(
            agentId,
            `Agent ${agentId} says: ${messageText}`,
          ),
        });
        return;
      } catch (error) {
        jsonResponse(response, 200, {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
        return;
      }
    }

    let bodyPreview: string | undefined;
    if (method === 'POST') {
      try {
        const rawBody = await collectRequestBody(request);
        bodyPreview = rawBody.slice(0, 200);
      } catch {
        bodyPreview = undefined;
      }
    }
    console.log(
      `[${agentId}] Received unexpected request ${method} ${url}$${
        bodyPreview ? ` body=${bodyPreview}` : ''
      }`,
    );
    jsonResponse(response, 404, {
      error: 'Not found',
      path: url,
    });
  });

  const listeningPort = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port ?? 0, bindAddress, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolvedPort = address.port;
        resolve(address.port);
      } else {
        reject(
          new Error('Failed to obtain listening port for local A2A agent'),
        );
      }
    });
  });

  const baseUrl = `http://127.0.0.1:${listeningPort}`;
  const preconfiguredUrl =
    explicitPublicUrl ||
    process.env.REGISTRY_BROKER_DEMO_A2A_PUBLIC_URL?.trim() ||
    undefined;
  const hadPreconfiguredTunnel = Boolean(preconfiguredUrl);

  const tunnelPreference = getTunnelPreference();
  const disableTunneling = tunnelingDisabled(tunnelPreference);
  const shouldTryCloudflare =
    !disableTunneling &&
    (tunnelPreference === 'auto' || tunnelPreference === 'cloudflare');
  const shouldTryLocalTunnel =
    !disableTunneling &&
    (tunnelPreference === 'auto' || tunnelPreference === 'localtunnel');

  let publicUrl: string | undefined = preconfiguredUrl;
  let usingIngressProxy = false;
  if (!publicUrl && ingressProxy) {
    const prefix = normalizeIngressPrefix(ingressPrefix ?? `a2a-${agentId}`);
    publicUrl = ingressProxy.registerRoute(prefix, baseUrl);
    usingIngressProxy = true;
    console.log(
      `  🔗 Ingress proxy enabled for ${agentId}: ${publicUrl} (prefix ${prefix})`,
    );
  }
  if (publicUrl && !usingIngressProxy) {
    const waitForPublicUrlHealth = async (): Promise<boolean> => {
      const deadline = Date.now() + CLOUD_FLARE_HEALTH_TIMEOUT_MS;
      let attempt = 0;
      while (Date.now() < deadline) {
        attempt += 1;
        const ok = await verifyPublicUrlReachable(publicUrl!, demoResolver);
        if (ok) {
          return true;
        }
        await new Promise(resolve =>
          setTimeout(resolve, CLOUD_FLARE_HEALTH_INTERVAL_MS),
        );
      }
      return false;
    };

    const preconfiguredHealthy = await waitForPublicUrlHealth();
    if (preconfiguredHealthy) {
      console.log(`  🔗 Using preconfigured public URL: ${publicUrl}`);
    } else {
      const message = `  ⚠️  Preconfigured public URL ${publicUrl} was unreachable after ${CLOUD_FLARE_HEALTH_TIMEOUT_MS}ms.`;
      if (requirePreconfiguredTunnel) {
        throw new Error(`${message} Set REGISTRY_BROKER_DEMO_REQUIRE_PUBLIC_URL=0 to suppress.`);
      }
      console.warn(`${message} Continuing with provided URL.`);
    }
  }
  if (!publicUrl && !usingIngressProxy && shouldTryCloudflare) {
    const cloudflaredAvailable = await detectCloudflared();
    if (!cloudflaredAvailable) {
      const hint = cloudflaredInstallHint();
      const message = `Cloudflare tunnel is required but \`cloudflared\` is not installed. Install it via: ${hint}`;
      console.log(`  ⚠️  ${message}`);
      if (tunnelPreference === 'cloudflare') {
        throw new Error(message);
      }
    } else {
      const cachedUrl = await readPersistedTunnelUrl(listeningPort);
      // For quick tunnels we only reuse if persistence is explicitly on and the tunnel is healthy.
      if (cachedUrl && persistTunnels) {
        const healthy = await verifyTunnelHealth(cachedUrl).catch(() => false);
        if (healthy) {
          publicUrl = cachedUrl;
          console.log(`  🔁 Reusing cached Cloudflare tunnel: ${cachedUrl}`);
        } else {
          await clearPersistedTunnelUrl();
        }
      }
      const debugTunnel = process.env.REGISTRY_BROKER_DEMO_DEBUG_TUNNEL === '1';

      const waitForHealthyTunnel = async (
        url: string,
        handle: TunnelHandle,
      ) => {
        const deadline = Date.now() + CLOUD_FLARE_HEALTH_TIMEOUT_MS;
        let healthy = false;
        let attempts = 0;
        while (Date.now() < deadline) {
          attempts += 1;
          const status = await verifyTunnelHealth(
            url,
            CLOUD_FLARE_HEALTH_INTERVAL_MS,
            demoResolver,
            debugTunnel,
          ).catch(() => false);
          healthy = status;
          if (debugTunnel) {
            console.log(
              `  🔎 Cloudflare health check ${attempts}: ${status ? 'ok' : 'pending'} (${url})`,
            );
          }
          if (healthy) {
            break;
          }
          await new Promise(r => setTimeout(r, CLOUD_FLARE_HEALTH_INTERVAL_MS));
        }
        if (!healthy) {
          console.log(
            `  ⚠️  Cloudflare tunnel did not become healthy within ${CLOUD_FLARE_HEALTH_TIMEOUT_MS}ms`,
          );
          try {
            await handle.close();
          } catch {}
          return false;
        }
        return true;
      };

      if (!publicUrl) {
        let attempts = 0;
        while (!publicUrl && attempts < CLOUD_FLARE_HEALTH_MAX_RETRIES) {
          attempts += 1;
          try {
            tunnelHandle = await startCloudflareTunnel(listeningPort);
            publicUrl = tunnelHandle.url;
            console.log(`  🌐 Cloudflare tunnel established: ${publicUrl}`);
            const healthy = await waitForHealthyTunnel(publicUrl, tunnelHandle);
            if (!healthy) {
              publicUrl = undefined;
              tunnelHandle = null;
              await clearPersistedTunnelUrl();
              console.log(
                `  🔁 Retrying Cloudflare tunnel (attempt ${attempts}/${CLOUD_FLARE_HEALTH_MAX_RETRIES})...`,
              );
              continue;
            }
            await persistTunnelUrl(listeningPort, publicUrl, tunnelHandle.pid);
          } catch (error) {
            console.log(
              `  ⚠️  Cloudflare tunnel unavailable: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            publicUrl = undefined;
            tunnelHandle = null;
            if (
              attempts >= CLOUD_FLARE_HEALTH_MAX_RETRIES &&
              tunnelPreference === 'cloudflare'
            ) {
              throw new Error(
                `Cloudflare tunnel failed to start after ${attempts} attempts: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }
        }
        if (!publicUrl && tunnelPreference === 'cloudflare') {
          throw new Error(
            `Cloudflare tunnel failed to become healthy after ${CLOUD_FLARE_HEALTH_MAX_RETRIES} attempts`,
          );
        }
      }
    }
  }

  if (!publicUrl && !usingIngressProxy && shouldTryLocalTunnel) {
    try {
      localTunnelInstance = await localtunnel({ port: listeningPort });
      localTunnelInstance.on('error', (err: unknown) => {
        console.log(
          `  ⚠️  Localtunnel error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        try {
          localTunnelInstance?.close();
        } catch {
          // ignore close errors
        }
        localTunnelInstance = null;
      });
      const sanitizedUrl =
        localTunnelInstance.url?.replace(/\/$/, '') ?? undefined;
      if (sanitizedUrl) {
        tunnelHandle = {
          url: sanitizedUrl,
          close: async () => {
            if (localTunnelInstance) {
              localTunnelInstance.close();
              localTunnelInstance = null;
            }
          },
        };
        publicUrl = sanitizedUrl;
        console.log(`  🌐 Localtunnel established: ${sanitizedUrl}`);
      }
    } catch (error) {
      console.log(
        `  ⚠️  Unable to establish localtunnel for ${agentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      localTunnelInstance = null;
    }
  }

  if (!publicUrl && tunnelHandle?.url) {
    publicUrl = tunnelHandle.url;
  }
  if (publicUrl && (hadPreconfiguredTunnel || usingIngressProxy)) {
    console.log(`  🔗 Using preconfigured public URL: ${publicUrl}`);
  }
  const endpointBase = publicUrl ?? baseUrl;

  return {
    agentId,
    port: listeningPort,
    baseUrl,
    publicUrl,
    a2aEndpoint: `${endpointBase}/a2a`,
    localA2aEndpoint: `${baseUrl}/a2a`,
    stop: async () => {
      if (tunnelHandle) {
        const isCloudflareHandle =
          typeof tunnelHandle.url === 'string' &&
          (() => {
            try {
              const { hostname } = new URL(tunnelHandle.url);
              return (
                hostname === 'trycloudflare.com' ||
                hostname.endsWith('.trycloudflare.com')
              );
            } catch {
              return false;
            }
          })();
        if (persistTunnels && isCloudflareHandle) {
          console.log(
            '  🔁 Persisting Cloudflare tunnel for reuse (REGISTRY_BROKER_DEMO_KEEP_TUNNELS=1).',
          );
        } else {
          try {
            await tunnelHandle.close();
          } catch {
            // ignore shutdown errors
          } finally {
            tunnelHandle = null;
            localTunnelInstance = null;
            if (isCloudflareHandle) {
              await clearPersistedTunnelUrl();
            }
          }
        }
      } else if (!persistTunnels) {
        await clearPersistedTunnelUrl();
      }

      if (demoDnsServers.length > 0) {
        dns.setServers(defaultDnsServers);
      }

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
};
