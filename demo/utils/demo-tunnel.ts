import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';

export interface CloudflareTunnelHandle {
  url: string;
  pid?: number;
  metricsPort?: number;
  close: () => Promise<void>;
}

export type DemoTunnelPreference =
  | 'cloudflare'
  | 'localtunnel'
  | 'auto'
  | 'none';

const CLOUD_FLARE_URL_PATTERN = /https:\/\/[^\s]+trycloudflare\.com/;
const CLOUD_FLARE_TIMEOUT_MS = 15_000;
const CLOUD_FLARE_MAX_ATTEMPTS = 8;
const CLOUD_FLARE_RETRY_DELAY_MS = 2_000;

export const cloudflaredInstallHint = (): string => {
  if (process.platform === 'darwin') {
    return 'brew install cloudflared';
  }
  if (process.platform === 'win32') {
    return 'choco install cloudflared';
  }
  if (process.platform === 'linux') {
    return 'curl -L https://developers.cloudflare.com/cloudflare-one/static/downloads/cloudflared-linux-amd64.deb -o cloudflared.deb && sudo dpkg -i cloudflared.deb';
  }
  return 'See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
};

export const detectCloudflared = async (): Promise<boolean> => {
  return new Promise(resolve => {
    const detector = spawn('cloudflared', ['--version']);
    detector.once('error', () => resolve(false));
    detector.once('exit', code => resolve(code === 0));
  });
};

const allocateLocalPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const allocatedPort = address.port;
        server.close(err => {
          if (err) {
            reject(err);
          } else {
            resolve(allocatedPort);
          }
        });
      } else {
        server.close(() =>
          reject(new Error('Unable to determine allocated metrics port')),
        );
      }
    });
  });

const spawnCloudflareTunnel = (
  port: number,
  attempt: number,
  metricsPort?: number,
): Promise<CloudflareTunnelHandle> => {
  const defaultConfigPath = path.join(
    os.tmpdir(),
    'registry-broker-cloudflared.yaml',
  );
  const cloudflareConfigPath =
    process.env.REGISTRY_BROKER_DEMO_CLOUDFLARED_CONFIG?.trim() ||
    defaultConfigPath;

  if (!process.env.REGISTRY_BROKER_DEMO_CLOUDFLARED_CONFIG) {
    try {
      writeFileSync(defaultConfigPath, 'no-autoupdate: true\n', 'utf8');
    } catch {
      // best-effort stub config
    }
  }

  return new Promise((resolve, reject) => {
    let resolved = false;
    let stderrBuffer = '';

    const args = [
      'tunnel',
      '--config',
      cloudflareConfigPath,
      '--url',
      `http://127.0.0.1:${port}`,
      '--no-autoupdate',
    ];

    if (metricsPort) {
      args.push('--metrics', `127.0.0.1:${metricsPort}`);
    }

    if (process.env.REGISTRY_BROKER_DEMO_DEBUG_TUNNEL === '1') {
      console.log(
        `  🛠️  Spawning cloudflared (attempt ${attempt}) with args: ${args.join(' ')}`,
      );
    }

    const child = spawn('cloudflared', args);

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', onOutput);
      child.stderr?.off('data', onOutput);
      child.off('error', onError);
      child.off('exit', onExit);
    };

    const resolveWithHandle = (url: string) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve({
        url,
        pid: child.pid ?? undefined,
        metricsPort,
        close: async () => {
          if (child.exitCode !== null || child.signalCode) {
            return;
          }
          child.kill();
          try {
            await once(child, 'exit');
          } catch {}
        },
      });
    };

    const onOutput = (chunk: unknown) => {
      const text = (chunk ?? '').toString();
      const match = text.match(CLOUD_FLARE_URL_PATTERN);
      if (match) {
        resolveWithHandle(match[0]);
      }
      stderrBuffer += text;
    };

    const onError = (error: unknown) => {
      if (resolved) {
        return;
      }
      cleanup();
      reject(
        error instanceof Error
          ? error
          : new Error(`Failed to start cloudflared tunnel: ${String(error)}`),
      );
    };

    const onExit = (code: number | null) => {
      if (resolved) {
        return;
      }
      cleanup();
      reject(
        new Error(
          `Cloudflare tunnel exited before it was ready (code ${
            code ?? 'unknown'
          }): ${stderrBuffer.trim()}`,
        ),
      );
    };

    const timer = setTimeout(
      () => {
        if (resolved) {
          return;
        }
        cleanup();
        child.kill();
        reject(new Error('Cloudflare tunnel startup timed out'));
      },
      CLOUD_FLARE_TIMEOUT_MS + attempt * 1000,
    );

    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);
    child.once('error', onError);
    child.once('exit', onExit);
  });
};

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

interface CloudflareTunnelOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
}

export const startCloudflareTunnel = async (
  port: number,
  options: CloudflareTunnelOptions = {},
): Promise<CloudflareTunnelHandle> => {
  const maxAttempts = options.maxAttempts ?? CLOUD_FLARE_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? CLOUD_FLARE_RETRY_DELAY_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let metricsPort: number | undefined;
      try {
        metricsPort = await allocateLocalPort();
      } catch (error) {
        console.warn(
          `Failed to allocate metrics port for cloudflared: ${
            error instanceof Error ? error.message : String(error)
          }. Falling back to default health checks.`,
        );
        metricsPort = undefined;
      }
      return await spawnCloudflareTunnel(port, attempt, metricsPort);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = Math.min(30_000, retryDelayMs * 2 ** (attempt - 1));
        console.warn(
          `Cloudflare tunnel attempt ${attempt} failed (${(error as Error)?.message ?? error}). Retrying in ${delay}ms...`,
        );
        await wait(delay);
        continue;
      }
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Failed to establish Cloudflare tunnel');
};

export const getTunnelPreference = (): DemoTunnelPreference => {
  const raw = process.env.REGISTRY_BROKER_DEMO_TUNNEL?.trim().toLowerCase();
  if (raw === 'localtunnel' || raw === 'none' || raw === 'auto') {
    return raw;
  }
  return 'cloudflare';
};

export const tunnelingDisabled = (preference: DemoTunnelPreference): boolean =>
  process.env.NO_TUNNEL === '1' || preference === 'none';
