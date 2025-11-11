import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import localtunnel, { Tunnel as LocalTunnel } from 'localtunnel';
import {
  cloudflaredInstallHint,
  detectCloudflared,
  getTunnelPreference,
  startCloudflareTunnel,
  tunnelingDisabled,
  type CloudflareTunnelHandle,
} from './demo-tunnel';

interface RouteEntry {
  prefix: string;
  target: string;
  publicBase: string;
}

export interface LocalIngressProxyHandle {
  publicBaseUrl: string;
  registerRoute: (prefix: string, target: string) => string;
  stop: () => Promise<void>;
}

interface CachedTunnelPayload {
  port: number;
  url: string;
  pid?: number;
  updatedAt: string;
  provider?: 'cloudflare' | 'localtunnel';
}

const CACHE_PATH = path.resolve(
  process.cwd(),
  '.cache',
  'registry-broker-ingress-tunnel.json',
);

const persistIngressTunnel = async (
  port: number,
  url: string,
  provider: 'cloudflare' | 'localtunnel',
  pid?: number,
): Promise<void> => {
  if (provider !== 'cloudflare') {
    await clearIngressTunnel();
    return;
  }
  const payload: CachedTunnelPayload = {
    port,
    url,
    pid,
    provider,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
};

const readIngressTunnel = async (port: number): Promise<string | undefined> => {
  try {
    const raw = await readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as CachedTunnelPayload;
    if (
      parsed.port === port &&
      typeof parsed.url === 'string' &&
      parsed.provider === 'cloudflare'
    ) {
      return parsed.url;
    }
  } catch {
    // ignore cache read errors
  }
  return undefined;
};

const clearIngressTunnel = async (): Promise<void> => {
  try {
    await rm(CACHE_PATH, { force: true });
  } catch {
    // ignore
  }
};

const normalizePrefix = (prefix: string): string => {
  if (!prefix.startsWith('/')) {
    return `/${prefix}`;
  }
  return prefix;
};

const waitForIngressHealth = async (
  baseUrl: string,
  retries = 10,
  delayMs = 1000,
): Promise<boolean> => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const healthUrl = new URL('/__ingress_health', baseUrl);
      healthUrl.searchParams.set('t', Date.now().toString());
      const response = await fetch(healthUrl).catch(() => null);
      if (response?.ok) {
        return true;
      }
    } catch {
      // ignore errors and retry
    }
    await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
  }
  return false;
};

export const startLocalIngressProxy =
  async (): Promise<LocalIngressProxyHandle> => {
    const preference = getTunnelPreference();
    if (tunnelingDisabled(preference)) {
      throw new Error(
        'Cloudflare tunnel is required for the shared ingress proxy. Disable NO_TUNNEL or change REGISTRY_BROKER_DEMO_TUNNEL.',
      );
    }
    const routes: RouteEntry[] = [];

    const server = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        try {
          const rawPath = request.url ?? '/';
          if (rawPath.startsWith('/__ingress_health')) {
            response.writeHead(200, {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            });
            response.end(
              JSON.stringify({
                status: 'ok',
                timestamp: new Date().toISOString(),
              }),
            );
            return;
          }
          const route = routes
            .sort((a, b) => b.prefix.length - a.prefix.length)
            .find(entry => rawPath.startsWith(entry.prefix));
          if (!route) {
            response.writeHead(404, { 'content-type': 'application/json' });
            response.end(
              JSON.stringify({ error: 'No ingress route configured for path' }),
            );
            return;
          }
          const incomingUrl = new URL(rawPath, 'http://ingress.local');
          let strippedPath = incomingUrl.pathname.slice(route.prefix.length);
          if (!strippedPath.startsWith('/')) {
            strippedPath = `/${strippedPath}`;
          }
          if (strippedPath.length === 0) {
            strippedPath = '/';
          }
          const targetUrl = new URL(route.target);
          const forwardPath = `${strippedPath}${incomingUrl.search}`;

          const forwardHeaders: Record<string, string | string[] | undefined> =
            {
              ...request.headers,
              host: targetUrl.host,
            };
          if (request.headers.host) {
            forwardHeaders['x-forwarded-host'] = request.headers.host;
          }
          if (route.publicBase) {
            forwardHeaders['x-ingress-public-base'] = route.publicBase;
          }
          delete forwardHeaders['content-length'];

          const proxyReq = (
            targetUrl.protocol === 'https:' ? httpsRequest : httpRequest
          )(
            {
              protocol: targetUrl.protocol,
              hostname: targetUrl.hostname,
              port: targetUrl.port,
              path: forwardPath,
              method: request.method,
              headers: forwardHeaders,
            },
            proxyRes => {
              response.writeHead(
                proxyRes.statusCode ?? 502,
                proxyRes.headers as Record<string, string>,
              );
              proxyRes.pipe(response);
            },
          );
          proxyReq.on('error', error => {
            response.writeHead(502, { 'content-type': 'application/json' });
            response.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : 'Proxy request failed',
              }),
            );
          });
          if (request.headers['content-length']) {
            request.pipe(proxyReq);
          } else {
            proxyReq.end();
          }
        } catch (error) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Ingress error',
            }),
          );
        }
      },
    );

    const listeningPort = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Failed to bind ingress proxy'));
        }
      });
    });

    const cloudflaredAvailable = await detectCloudflared();
    if (!cloudflaredAvailable) {
      throw new Error(
        `cloudflared is required for ingress proxy. Install it via: ${cloudflaredInstallHint()}`,
      );
    }

    const cachedUrl = await readIngressTunnel(listeningPort);
    if (cachedUrl) {
      try {
        const healthy = await waitForIngressHealth(cachedUrl);
        if (healthy) {
          console.log(`Reusing cached ingress tunnel: ${cachedUrl}`);
          return {
            publicBaseUrl: cachedUrl,
            registerRoute: (prefix: string, target: string) => {
              const normalized = normalizePrefix(prefix);
              const publicBase = `${cachedUrl}${normalized}`;
              routes.push({ prefix: normalized, target, publicBase });
              return publicBase;
            },
            stop: async () => {
              await new Promise<void>((resolve, reject) => {
                server.close(err => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  resolve();
                });
              });
            },
          };
        }
      } catch {
        await clearIngressTunnel();
      }
    }

    let tunnelHandle: CloudflareTunnelHandle | null = null;
    let tunnelProvider: 'cloudflare' | 'localtunnel' = 'cloudflare';
    let localTunnelInstance: LocalTunnel | null = null;
    try {
      tunnelHandle = await startCloudflareTunnel(listeningPort, {
        maxAttempts: 2,
        retryDelayMs: 2_000,
      });
      console.log(`Cloudflare tunnel for ingress proxy: ${tunnelHandle.url}`);
      const healthy = await waitForIngressHealth(tunnelHandle.url);
      if (!healthy) {
        throw new Error('Cloudflare ingress tunnel health check failed');
      }
      await persistIngressTunnel(
        listeningPort,
        tunnelHandle.url,
        'cloudflare',
        tunnelHandle.pid,
      );
    } catch (error) {
      console.warn(
        `Cloudflare tunnel failed for ingress proxy: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.warn('Falling back to localtunnel for this run.');
      try {
        localTunnelInstance = await localtunnel({ port: listeningPort });
        if (!localTunnelInstance?.url) {
          throw new Error('localtunnel did not return a URL');
        }
        tunnelProvider = 'localtunnel';
        const publicUrl = localTunnelInstance.url.replace(/\/$/, '');
        tunnelHandle = {
          url: publicUrl,
          pid: undefined,
          close: async () => {
            try {
              localTunnelInstance?.close();
            } catch {
              // ignore close errors
            }
            localTunnelInstance = null;
          },
        };
        const healthy = await waitForIngressHealth(publicUrl);
        if (!healthy) {
          throw new Error('localtunnel ingress tunnel health check failed');
        }
      } catch (fallbackError) {
        throw new Error(
          `Unable to establish ingress tunnel. Cloudflare error: ${
            error instanceof Error ? error.message : String(error)
          }; localtunnel fallback failed: ${
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError)
          }`,
        );
      }
    }

    if (!tunnelHandle) {
      throw new Error('Failed to initialize ingress tunnel handle');
    }

    const handle: LocalIngressProxyHandle = {
      publicBaseUrl: tunnelHandle.url,
      registerRoute: (prefix: string, target: string) => {
        const normalized = normalizePrefix(prefix);
        const publicBase = `${tunnelHandle.url}${normalized}`;
        routes.push({ prefix: normalized, target, publicBase });
        return publicBase;
      },
      stop: async () => {
        await new Promise<void>((resolve, reject) => {
          server.close(err => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
        if (
          tunnelProvider === 'cloudflare' &&
          process.env.REGISTRY_BROKER_DEMO_KEEP_TUNNELS === '1'
        ) {
          console.log(
            '  🔁 Keeping ingress Cloudflare tunnel alive (REGISTRY_BROKER_DEMO_KEEP_TUNNELS=1).',
          );
        } else if (tunnelHandle) {
          await tunnelHandle.close();
          await clearIngressTunnel();
        }
      },
    };

    return handle;
  };
