import { spawn } from 'node:child_process';
import { once } from 'node:events';

export interface CloudflareTunnelHandle {
  url: string;
  close: () => Promise<void>;
}

export type DemoTunnelPreference =
  | 'cloudflare'
  | 'localtunnel'
  | 'auto'
  | 'none';

const CLOUD_FLARE_URL_PATTERN = /https:\/\/[^\s]+trycloudflare\.com/;
const CLOUD_FLARE_TIMEOUT_MS = 15_000;

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

export const startCloudflareTunnel = async (
  port: number,
): Promise<CloudflareTunnelHandle> => {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let stderrBuffer = '';

    const child = spawn('cloudflared', [
      'tunnel',
      '--url',
      `http://127.0.0.1:${port}`,
      '--no-autoupdate',
    ]);

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

    const timer = setTimeout(() => {
      if (resolved) {
        return;
      }
      cleanup();
      child.kill();
      reject(new Error('Cloudflare tunnel startup timed out'));
    }, CLOUD_FLARE_TIMEOUT_MS);

    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);
    child.once('error', onError);
    child.once('exit', onExit);
  });
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
