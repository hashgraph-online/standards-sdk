import {
  createPublicClient,
  fallback,
  formatUnits,
  getAddress,
  http as httpTransport,
  type Address,
  type Chain,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';

/**
 * Aggregated on-chain x402 payment usage for a `payTo` address.
 */
export interface Hcs25X402UsageSummary {
  volume7dUsd: number;
  volume24hUsd: number;
  inboundTrades7d: number;
  outboundTrades7d: number;
}

/**
 * One UTC day of scanned payment activity.
 */
export interface Hcs25X402UsageDailyBucket {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  inboundTrades: number;
  outboundTrades: number;
  volumeUsd: number;
}

/**
 * Incremental scan checkpoint. Stored on the subject record
 * (`metadata.x402UsageCursor`) so subsequent refreshes only scan blocks
 * produced since the last run.
 */
export interface Hcs25X402UsageCursor {
  network: string;
  asset: string;
  payTo: string;
  lastScannedBlock: number;
  daily: Hcs25X402UsageDailyBucket[];
}

export interface Hcs25X402UsageStateParams {
  /** x402 network identifier (`base` or `base-sepolia`). */
  network: unknown;
  /** Payment asset contract address (e.g. USDC). */
  asset: unknown;
  /** Recipient address whose inbound/outbound transfers are scanned. */
  payTo: unknown;
  /** Previously stored `x402UsageCursor` for incremental refresh. */
  cursor?: unknown;
}

export interface Hcs25X402OnchainUsageOptions {
  /** Rolling window in days (1–14). Default 7. */
  days?: number;
  /** Cache TTL applied to per-block/per-contract lookups. Default 30 min. */
  ttlMs?: number;
  /** Retries per RPC call with exponential backoff. Default 2. */
  maxRetries?: number;
  /** getLogs range chunk size in blocks. Default 50000. */
  chunkSizeBlocks?: number;
  /** RPC endpoint overrides per network (replaces the built-in lists). */
  rpcUrls?: Partial<Record<string, readonly string[]>>;
}

export interface Hcs25X402UsageStateResult {
  summary: Hcs25X402UsageSummary | null;
  cursor: Hcs25X402UsageCursor | null;
}

type X402Network = 'base' | 'base-sepolia';

interface NetworkConfig {
  chain: Chain;
  rpcUrls: string[];
  usdcAddresses: Set<string>;
}

const TRANSFER_EVENT_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
    anonymous: false,
  },
] as const;

const DECIMALS_ABI = [
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

const NETWORK_CONFIG: Record<X402Network, NetworkConfig> = {
  base: {
    chain: base,
    rpcUrls: [
      'https://mainnet.base.org',
      'https://1rpc.io/base',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
    ],
    usdcAddresses: new Set(['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']),
  },
  'base-sepolia': {
    chain: baseSepolia,
    rpcUrls: [
      'https://sepolia.base.org',
      'https://1rpc.io/base-sepolia',
      'https://base-sepolia-rpc.publicnode.com',
    ],
    usdcAddresses: new Set(['0x036cbd53842c5426634e7929541ec2318f3dcf7e']),
  },
};

const toNetwork = (value: unknown): X402Network | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'base') {
    return 'base';
  }
  if (normalized === 'base-sepolia' || normalized === 'basesepolia') {
    return 'base-sepolia';
  }
  return null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

const toDayStringUtc = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
};

interface CachedValue<T> {
  value: T;
  expiresAt: number;
}

const decimalsCache = new Map<string, CachedValue<number>>();
const fromBlockCache = new Map<string, CachedValue<bigint>>();
const blockDayCache = new Map<string, CachedValue<string>>();

/**
 * Minimal structural view of a viem `PublicClient` — keeps the scanner's
 * type surface shallow (viem's full client type is too deep for tsc) and
 * makes the client mockable in tests.
 */
export interface X402PublicClient {
  chain?: { id?: number } | undefined;
  getBlockNumber(): Promise<bigint>;
  getBlock(params: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getLogs(params: {
    address: Address;
    event: unknown;
    args?: { from?: Address; to?: Address };
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<
    readonly { blockNumber: bigint | null; args: { value?: bigint } }[]
  >;
  readContract(params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
  }): Promise<unknown>;
}

type PublicClient = X402PublicClient;

async function withRetries<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

const keepRollingDays = (
  buckets: Hcs25X402UsageDailyBucket[],
  keepDays: number,
): Hcs25X402UsageDailyBucket[] => {
  const keep = new Set<string>();
  const today = toDayStringUtc(Date.now());
  const [year, month, day] = today.split('-').map(v => Number.parseInt(v, 10));
  const baseUtc = Date.UTC(year, month - 1, day);
  for (let offset = 0; offset < keepDays; offset += 1) {
    keep.add(toDayStringUtc(baseUtc - offset * 24 * 60 * 60 * 1000));
  }
  return buckets
    .filter(bucket => keep.has(bucket.day))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .slice(-keepDays);
};

function parseCursor(value: unknown): Hcs25X402UsageCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const cursor = value as Partial<Hcs25X402UsageCursor>;
  if (
    typeof cursor.asset !== 'string' ||
    typeof cursor.payTo !== 'string' ||
    typeof cursor.lastScannedBlock !== 'number' ||
    !Number.isFinite(cursor.lastScannedBlock) ||
    cursor.lastScannedBlock < 0 ||
    !Array.isArray(cursor.daily)
  ) {
    return null;
  }
  const network = toNetwork(cursor.network);
  if (!network) {
    return null;
  }
  const daily = cursor.daily
    .filter(
      (entry): entry is Hcs25X402UsageDailyBucket =>
        !!entry &&
        typeof entry === 'object' &&
        typeof entry.day === 'string' &&
        typeof entry.inboundTrades === 'number' &&
        Number.isFinite(entry.inboundTrades) &&
        typeof entry.outboundTrades === 'number' &&
        Number.isFinite(entry.outboundTrades) &&
        typeof entry.volumeUsd === 'number' &&
        Number.isFinite(entry.volumeUsd),
    )
    .map(entry => ({
      day: entry.day,
      inboundTrades: Math.max(0, Math.floor(entry.inboundTrades)),
      outboundTrades: Math.max(0, Math.floor(entry.outboundTrades)),
      volumeUsd: round6(Math.max(0, entry.volumeUsd)),
    }));
  return {
    network,
    asset: cursor.asset,
    payTo: cursor.payTo,
    lastScannedBlock: Math.floor(cursor.lastScannedBlock),
    daily,
  };
}

async function resolveDecimals(params: {
  client: PublicClient;
  asset: Address;
  isUsdc: boolean;
  cacheTtlMs: number;
  maxRetries: number;
}): Promise<number> {
  if (params.isUsdc) {
    return 6;
  }
  const cacheKey = `${params.client.chain?.id ?? 'unknown'}:${params.asset}:decimals`;
  const cached = decimalsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const decimals = await withRetries(
    async () => {
      const value = await params.client.readContract({
        address: params.asset,
        abi: DECIMALS_ABI,
        functionName: 'decimals',
      });
      return Number(value);
    },
    params.maxRetries,
    200,
  );
  const normalized = Number.isFinite(decimals)
    ? Math.max(0, Math.min(255, Math.floor(decimals)))
    : 18;
  decimalsCache.set(cacheKey, {
    value: normalized,
    expiresAt: Date.now() + params.cacheTtlMs,
  });
  return normalized;
}

async function estimateFromBlockByTimestamp(params: {
  client: PublicClient;
  targetTimestampSec: bigint;
  cacheKey: string;
  cacheTtlMs: number;
  maxRetries: number;
}): Promise<bigint> {
  const cached = fromBlockCache.get(params.cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const latestBlockNumber = await withRetries(
    () => params.client.getBlockNumber(),
    params.maxRetries,
    200,
  );
  const latest = await withRetries(
    () => params.client.getBlock({ blockNumber: latestBlockNumber }),
    params.maxRetries,
    200,
  );

  const probeDelta = 5000n;
  const probeBlockNumber =
    latestBlockNumber > probeDelta ? latestBlockNumber - probeDelta : 0n;
  const probe = await withRetries(
    () => params.client.getBlock({ blockNumber: probeBlockNumber }),
    params.maxRetries,
    200,
  );

  const latestTs = BigInt(latest.timestamp);
  const probeTs = BigInt(probe.timestamp);
  const deltaSeconds = latestTs > probeTs ? latestTs - probeTs : 0n;
  const secondsPerBlock =
    deltaSeconds > 0n
      ? Number(deltaSeconds) /
        Number(latestBlockNumber - probeBlockNumber || 1n)
      : 2;

  const secondsAgo =
    latestTs > params.targetTimestampSec
      ? latestTs - params.targetTimestampSec
      : 0n;
  const approxBlocksAgo =
    secondsPerBlock > 0
      ? BigInt(Math.ceil(Number(secondsAgo) / secondsPerBlock))
      : 0n;
  const margin = 1000n;
  let low =
    latestBlockNumber > approxBlocksAgo + margin
      ? latestBlockNumber - approxBlocksAgo - margin
      : 0n;
  let high = latestBlockNumber;
  while (low < high) {
    const mid = (low + high) / 2n;
    const block = await withRetries(
      () => params.client.getBlock({ blockNumber: mid }),
      params.maxRetries,
      200,
    );
    if (BigInt(block.timestamp) >= params.targetTimestampSec) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }

  fromBlockCache.set(params.cacheKey, {
    value: low,
    expiresAt: Date.now() + params.cacheTtlMs,
  });
  return low;
}

async function resolveBlockDay(params: {
  client: PublicClient;
  blockNumber: bigint;
  cacheTtlMs: number;
  maxRetries: number;
}): Promise<string> {
  const cacheKey = `${params.client.chain?.id ?? 'unknown'}:${params.blockNumber.toString()}:day`;
  const cached = blockDayCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const block = await withRetries(
    () => params.client.getBlock({ blockNumber: params.blockNumber }),
    params.maxRetries,
    200,
  );
  const day = toDayStringUtc(Number(block.timestamp) * 1000);
  blockDayCache.set(cacheKey, {
    value: day,
    expiresAt: Date.now() + params.cacheTtlMs,
  });
  return day;
}

/**
 * Scans ERC-20 `Transfer` events to/from `payTo` on the configured x402
 * network and aggregates daily inbound/outbound trade counts and USD
 * volume, resuming from a stored cursor when possible.
 *
 * Ported from Registry Broker's `fetchX402OnchainUsageState`: chunked
 * `getLogs` ranges, per-block day resolution caching, binary-search window
 * estimation, and retry/backoff on RPC failures.
 */
export async function fetchX402OnchainUsageState(
  params: Hcs25X402UsageStateParams,
  options: Hcs25X402OnchainUsageOptions = {},
): Promise<Hcs25X402UsageStateResult> {
  const network = toNetwork(params.network);
  if (!network) {
    return { summary: null, cursor: null };
  }
  const config = NETWORK_CONFIG[network];

  if (typeof params.asset !== 'string' || typeof params.payTo !== 'string') {
    return { summary: null, cursor: null };
  }
  let asset: Address;
  let payTo: Address;
  try {
    asset = getAddress(params.asset.trim());
    payTo = getAddress(params.payTo.trim());
  } catch {
    return { summary: null, cursor: null };
  }

  const now = Date.now();
  const ttlMs =
    typeof options.ttlMs === 'number' &&
    Number.isFinite(options.ttlMs) &&
    options.ttlMs > 0
      ? options.ttlMs
      : 30 * 60 * 1000;
  const maxRetries =
    typeof options.maxRetries === 'number' &&
    Number.isFinite(options.maxRetries) &&
    options.maxRetries >= 0
      ? Math.floor(options.maxRetries)
      : 2;
  const chunkSizeBlocks =
    typeof options.chunkSizeBlocks === 'number' &&
    Number.isFinite(options.chunkSizeBlocks) &&
    options.chunkSizeBlocks > 0
      ? BigInt(Math.floor(options.chunkSizeBlocks))
      : 50_000n;

  const rpcUrls = options.rpcUrls?.[network]?.length
    ? [...options.rpcUrls[network]!]
    : config.rpcUrls;
  const transports = rpcUrls.map(url => httpTransport(url));
  if (transports.length === 0) {
    return { summary: null, cursor: null };
  }
  const client = createPublicClient({
    chain: config.chain,
    transport: transports.length > 1 ? fallback(transports) : transports[0],
  }) as unknown as PublicClient;

  const assetLower = asset.toLowerCase();
  const payToLower = payTo.toLowerCase();
  const decimals = await resolveDecimals({
    client,
    asset,
    isUsdc: config.usdcAddresses.has(assetLower),
    cacheTtlMs: ttlMs,
    maxRetries,
  });

  const days =
    typeof options.days === 'number' &&
    Number.isFinite(options.days) &&
    options.days > 0
      ? Math.min(14, Math.max(1, Math.floor(options.days)))
      : 7;

  const targetTimestampSec = BigInt(
    Math.floor((now - days * 24 * 60 * 60 * 1000) / 1000),
  );
  const windowFromBlock = await estimateFromBlockByTimestamp({
    client,
    targetTimestampSec,
    cacheKey: `${network}:${assetLower}:${payToLower}:fromBlock:${days}`,
    cacheTtlMs: ttlMs,
    maxRetries,
  });
  const toBlock = await client.getBlockNumber();

  const parsedCursor = parseCursor(params.cursor);
  const hasMatchingCursor =
    parsedCursor !== null &&
    parsedCursor.network === network &&
    parsedCursor.asset.toLowerCase() === assetLower &&
    parsedCursor.payTo.toLowerCase() === payToLower;

  const cursorFromBlock =
    hasMatchingCursor && parsedCursor
      ? BigInt(Math.max(0, parsedCursor.lastScannedBlock + 1))
      : windowFromBlock;
  const fromBlock =
    cursorFromBlock < windowFromBlock ? windowFromBlock : cursorFromBlock;
  const shouldResync = !hasMatchingCursor || cursorFromBlock < windowFromBlock;

  const bucketsByDay = new Map<string, Hcs25X402UsageDailyBucket>();
  if (!shouldResync && parsedCursor) {
    for (const bucket of keepRollingDays(parsedCursor.daily, days)) {
      bucketsByDay.set(bucket.day, { ...bucket });
    }
  }
  const ensureBucket = (day: string): Hcs25X402UsageDailyBucket => {
    const existing = bucketsByDay.get(day);
    if (existing) {
      return existing;
    }
    const created: Hcs25X402UsageDailyBucket = {
      day,
      inboundTrades: 0,
      outboundTrades: 0,
      volumeUsd: 0,
    };
    bucketsByDay.set(day, created);
    return created;
  };

  const aggregateLogs = async (
    direction: 'inbound' | 'outbound',
  ): Promise<void> => {
    if (toBlock < fromBlock) {
      return;
    }
    for (let start = fromBlock; start <= toBlock; ) {
      const end =
        start + chunkSizeBlocks - 1n <= toBlock
          ? start + chunkSizeBlocks - 1n
          : toBlock;
      const args =
        direction === 'inbound'
          ? ({ to: payTo } as const)
          : ({ from: payTo } as const);
      const logs = await withRetries(
        () =>
          client.getLogs({
            address: asset,
            event: TRANSFER_EVENT_ABI[0],
            args,
            fromBlock: start,
            toBlock: end,
          }),
        maxRetries,
        200,
      );
      for (const log of logs) {
        const blockNumber = log.blockNumber ?? null;
        if (!blockNumber) {
          continue;
        }
        const value = (log.args as { value?: bigint }).value ?? 0n;
        if (value <= 0n) {
          continue;
        }
        const day = await resolveBlockDay({
          client,
          blockNumber,
          cacheTtlMs: ttlMs,
          maxRetries,
        });
        const bucket = ensureBucket(day);
        if (direction === 'inbound') {
          bucket.inboundTrades += 1;
        } else {
          bucket.outboundTrades += 1;
        }
        const amount = Number.parseFloat(formatUnits(value, decimals));
        if (Number.isFinite(amount) && amount > 0) {
          bucket.volumeUsd = round6(bucket.volumeUsd + amount);
        }
      }
      start = end + 1n;
    }
  };

  await aggregateLogs('inbound');
  await aggregateLogs('outbound');

  const mergedDaily = keepRollingDays(Array.from(bucketsByDay.values()), days);
  const inboundTrades7d = mergedDaily.reduce(
    (sum, bucket) => sum + bucket.inboundTrades,
    0,
  );
  const outboundTrades7d = mergedDaily.reduce(
    (sum, bucket) => sum + bucket.outboundTrades,
    0,
  );
  const volume7dUsd = round6(
    mergedDaily.reduce((sum, bucket) => sum + bucket.volumeUsd, 0),
  );
  const today = toDayStringUtc(now);
  const volume24hUsd = round6(
    mergedDaily
      .filter(bucket => bucket.day === today)
      .reduce((sum, bucket) => sum + bucket.volumeUsd, 0),
  );

  const cursor: Hcs25X402UsageCursor = {
    network,
    asset: assetLower,
    payTo: payToLower,
    lastScannedBlock: Number(toBlock),
    daily: mergedDaily,
  };

  if (inboundTrades7d + outboundTrades7d <= 0) {
    return { summary: null, cursor };
  }

  return {
    summary: {
      volume7dUsd,
      volume24hUsd,
      inboundTrades7d,
      outboundTrades7d,
    },
    cursor,
  };
}
