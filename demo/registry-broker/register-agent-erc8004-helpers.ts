import { Agent, fetch as undiciFetch } from 'undici';
import type { RegisteredAgent } from './register-agent';

const DEFAULT_ERC8004_NETWORKS = [
  'ethereum-sepolia',
  'base-sepolia',
  'erc-8004-solana:devnet',
];

export const resolvePreferredErc8004Selections = (): string[] => {
  const raw = process.env.REGISTRY_BROKER_DEMO_ERC8004_NETWORKS?.trim();
  const entries =
    raw && raw.length > 0
      ? raw
          .split(/[,\s]+/)
          .map(value => value.trim())
          .filter(Boolean)
      : DEFAULT_ERC8004_NETWORKS;
  return Array.from(
    new Set(
      entries.map(entry =>
        entry.includes(':')
          ? entry.toLowerCase()
          : `erc-8004:${entry.toLowerCase()}`,
      ),
    ),
  );
};

export const summariseProgressAdditionalRegistries = (
  registered: RegisteredAgent,
): Array<Record<string, unknown>> | undefined => {
  const progressSource =
    registered.updateProgress ?? registered.registrationProgress;
  if (!progressSource) {
    return undefined;
  }

  return Object.values(progressSource.additionalRegistries).map(entry => ({
    registry: entry.registryId,
    registryKey: entry.registryKey,
    status: entry.status,
    agentId: entry.agentId ?? undefined,
    agentUri: entry.agentUri ?? undefined,
    credits: entry.credits ?? undefined,
  }));
};

const headersTimeoutMs = Number(
  process.env.REGISTRY_BROKER_DEMO_HEADERS_TIMEOUT_MS ?? '600000',
);
const bodyTimeoutMs = Number(
  process.env.REGISTRY_BROKER_DEMO_BODY_TIMEOUT_MS ?? '600000',
);

export const dispatcher = new Agent({
  headersTimeout: Number.isFinite(headersTimeoutMs)
    ? headersTimeoutMs
    : 600_000,
  bodyTimeout: Number.isFinite(bodyTimeoutMs) ? bodyTimeoutMs : 600_000,
});

export const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
  undiciFetch(input as any, {
    ...(init as any),
    dispatcher,
  })) as unknown as typeof fetch;

export const parseBooleanFlag = (
  value: string | undefined,
  defaultValue: boolean,
) => {
  if (value === undefined) {
    return defaultValue;
  }
  const normalised = value.trim().toLowerCase();
  if (normalised === '1' || normalised === 'true' || normalised === 'yes') {
    return true;
  }
  if (normalised === '0' || normalised === 'false' || normalised === 'no') {
    return false;
  }
  return defaultValue;
};
