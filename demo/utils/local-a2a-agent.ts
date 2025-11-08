import {
  createServer,
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'http';
import localtunnel, { Tunnel } from 'localtunnel';
import {
  cloudflaredInstallHint,
  detectCloudflared,
  getTunnelPreference,
  startCloudflareTunnel,
  tunnelingDisabled,
  type CloudflareTunnelHandle,
} from './demo-tunnel';

type TunnelHandle = CloudflareTunnelHandle;

export interface LocalA2AAgentOptions {
  agentId: string;
  port?: number;
  bindAddress?: string;
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

export const startLocalA2AAgent = async (
  options: LocalA2AAgentOptions,
): Promise<LocalA2AAgentHandle> => {
  const { agentId, port, bindAddress = '0.0.0.0' } = options;
  let resolvedPort: number | null = null;
  let tunnelHandle: TunnelHandle | null = null;
  let localTunnelInstance: Tunnel | null = null;

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

    if (method === 'GET' && path.startsWith('/.well-known/agent.json')) {
      jsonResponse(response, 200, buildAgentCard(agentId, baseUrl));
      return;
    }

    if (method === 'GET' && path === '/agent.json') {
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

  const tunnelPreference = getTunnelPreference();
  const disableTunneling = tunnelingDisabled(tunnelPreference);
  const shouldTryCloudflare =
    !disableTunneling &&
    (tunnelPreference === 'auto' || tunnelPreference === 'cloudflare');
  const shouldTryLocalTunnel =
    !disableTunneling &&
    (tunnelPreference === 'auto' || tunnelPreference === 'localtunnel');

  if (shouldTryCloudflare) {
    const cloudflaredAvailable = await detectCloudflared();
    if (!cloudflaredAvailable) {
      const hint = cloudflaredInstallHint();
      const message = `Cloudflare tunnel is required but \`cloudflared\` is not installed. Install it via: ${hint}`;
      console.log(`  ⚠️  ${message}`);
      if (tunnelPreference === 'cloudflare') {
        throw new Error(message);
      }
    } else {
      try {
        tunnelHandle = await startCloudflareTunnel(listeningPort);
        console.log(`  🌐 Cloudflare tunnel established: ${tunnelHandle.url}`);
      } catch (error) {
        console.log(
          `  ⚠️  Cloudflare tunnel unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (tunnelPreference === 'cloudflare') {
          throw new Error(
            `Cloudflare tunnel failed to start: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  if (!tunnelHandle && shouldTryLocalTunnel) {
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

  const publicUrl = tunnelHandle?.url;
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
        try {
          await tunnelHandle.close();
        } catch {
          // ignore shutdown errors
        } finally {
          tunnelHandle = null;
          localTunnelInstance = null;
        }
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
