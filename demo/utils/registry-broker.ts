import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  RegistryBrokerClient,
  SendMessageResponse,
} from '../../src/services/registry-broker';

export const normaliseMessage = (response: SendMessageResponse): string => {
  const primary = response.message?.trim();
  if (primary) {
    return primary;
  }

  const content = response.content?.trim();
  if (content) {
    return content;
  }

  return '';
};

export const waitForAgentAvailability = async (
  client: RegistryBrokerClient,
  uaid: string,
  timeoutMs = 15000,
): Promise<void> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const resolved = await client.resolveUaid(uaid);
      if (resolved) {
        return;
      }
    } catch {}
    await delay(500);
  }
  throw new Error(`Agent ${uaid} was not resolved within ${timeoutMs}ms`);
};

export const assertAdapterSupport = async (
  client: RegistryBrokerClient,
  baseUrl: string,
  adapterName: string,
): Promise<void> => {
  let adapters;
  try {
    adapters = await client.adapters();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown adapter query failure';
    throw new Error(`Unable to query adapters from ${baseUrl}: ${message}`);
  }
  if (!adapters.adapters.includes(adapterName)) {
    throw new Error(
      `Registry Broker is missing the ${adapterName}. Provide REGISTRY_BROKER_BASE_URL for a broker with A2A support or enable the adapter before running the demo.`,
    );
  }
};

export interface DemoHcs10AgentOptions {
  registryUrl: string;
  hederaAccountId: string;
  hederaPrivateKey: string;
  hederaNetwork?: 'mainnet' | 'testnet';
  enableDemoPfp?: boolean;
  startupTimeoutMs?: number;
  reuseExistingAgent?: boolean;
}

export interface DemoHcs10AgentHandle {
  readonly process: ChildProcessWithoutNullStreams;
  readonly accountId: string;
  readonly inboundTopicId: string;
  readonly outboundTopicId: string;
  readonly privateKey: string;
  readonly operatorId: string;
  stop: () => Promise<void>;
}

export const startDemoHcs10Agent = async (
  options: DemoHcs10AgentOptions,
): Promise<DemoHcs10AgentHandle> => {
  const { registryUrl, hederaAccountId, hederaPrivateKey, hederaNetwork } =
    options;

  if (!registryUrl) {
    throw new Error('registryUrl is required to start the HCS-10 agent demo');
  }
  if (!hederaAccountId || !hederaPrivateKey) {
    throw new Error(
      'hederaAccountId and hederaPrivateKey are required to start the HCS-10 agent demo',
    );
  }

  const repoRoot = process.cwd();
  const scriptPath = path.join(repoRoot, 'demo', 'hcs-10', 'transact-agent.ts');

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
  };

  if (options.reuseExistingAgent === false) {
    for (const key of Object.keys(childEnv)) {
      if (key.startsWith('BOB_')) {
        delete childEnv[key];
      }
    }
  }

  childEnv.REGISTRY_URL = registryUrl;
  childEnv.HEDERA_ACCOUNT_ID = hederaAccountId;
  childEnv.HEDERA_PRIVATE_KEY = hederaPrivateKey;
  if (hederaNetwork) {
    childEnv.HEDERA_NETWORK = hederaNetwork;
  }
  childEnv.ENABLE_DEMO_PFP = options.enableDemoPfp ? 'true' : 'false';

  const child = spawn('pnpm', ['tsx', scriptPath], {
    cwd: repoRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', chunk => {
    process.stdout.write(`[hcs-10-agent] ${chunk.toString()}`);
  });
  child.stderr?.on('data', chunk => {
    process.stderr.write(`[hcs-10-agent] ${chunk.toString()}`);
  });

  const readyPattern = /BOB POLLING AGENT DETAILS/;
  const accountRegex = /Account ID:\s*(\d+\.\d+\.\d+)/i;
  const inboundRegex = /Inbound Topic:\s*(\d+\.\d+\.\d+)/i;
  const outboundRegex = /Outbound Topic:\s*(\d+\.\d+\.\d+)/i;
  const operatorRegex = /Operator ID:\s*([^\s]+)/i;

  const capturedInfo: {
    accountId?: string;
    inboundTopicId?: string;
    outboundTopicId?: string;
    operatorId?: string;
  } = {};

  const rl = createInterface({ input: child.stdout });

  const startupTimeout = options.startupTimeoutMs ?? 120_000;

  await new Promise<void>((resolve, reject) => {
    let resolved = false;
    let readyAcknowledged = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(
          new Error(
            `Timed out after ${startupTimeout}ms waiting for HCS-10 agent to start`,
          ),
        );
      }
    }, startupTimeout);

    const handleLine = (line: string) => {
      const accountMatch = line.match(accountRegex);
      if (accountMatch) {
        capturedInfo.accountId = accountMatch[1];
      }
      const inboundMatch = line.match(inboundRegex);
      if (inboundMatch) {
        capturedInfo.inboundTopicId = inboundMatch[1];
      }
      const outboundMatch = line.match(outboundRegex);
      if (outboundMatch) {
        capturedInfo.outboundTopicId = outboundMatch[1];
      }
      const operatorMatch = line.match(operatorRegex);
      if (operatorMatch) {
        capturedInfo.operatorId = operatorMatch[1];
      }

      if (readyPattern.test(line)) {
        readyAcknowledged = true;
      }

      if (
        readyAcknowledged &&
        capturedInfo.accountId &&
        capturedInfo.inboundTopicId &&
        capturedInfo.outboundTopicId &&
        capturedInfo.operatorId &&
        !resolved
      ) {
        resolved = true;
        cleanup();
        resolve();
      }
    };

    const handleExit = (code?: number | null) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(
          new Error(
            `HCS-10 demo agent exited before startup completed (exit code: ${code ?? 'unknown'})`,
          ),
        );
      }
    };

    const handleError = (err: unknown) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(
          err instanceof Error
            ? err
            : new Error(`HCS-10 demo agent error: ${String(err)}`),
        );
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      rl.off('line', handleLine);
      child.off('exit', handleExit);
      child.off('error', handleError);
    };

    rl.on('line', handleLine);
    child.once('exit', handleExit);
    child.once('error', handleError);
  });

  if (
    !capturedInfo.accountId ||
    !capturedInfo.inboundTopicId ||
    !capturedInfo.outboundTopicId ||
    !capturedInfo.operatorId
  ) {
    child.kill('SIGINT');
    throw new Error(
      'Failed to capture HCS-10 agent connection details from startup logs',
    );
  }

  const envPath = path.join(repoRoot, '.env');
  const envContent = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8')
    : '';
  const privateKeyLine = envContent
    .split('\n')
    .find(line => line.trim().startsWith('BOB_PRIVATE_KEY='));
  const privateKey = privateKeyLine
    ? privateKeyLine.replace('BOB_PRIVATE_KEY=', '').trim()
    : '';

  if (!privateKey) {
    child.kill('SIGINT');
    throw new Error(
      'Unable to locate BOB_PRIVATE_KEY in .env after agent startup',
    );
  }

  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      child.kill('SIGINT');
      await once(child, 'exit');
    }
    rl.close();
  };

  return {
    process: child,
    accountId: capturedInfo.accountId,
    inboundTopicId: capturedInfo.inboundTopicId,
    outboundTopicId: capturedInfo.outboundTopicId,
    privateKey,
    operatorId: capturedInfo.operatorId,
    stop,
  };
};
