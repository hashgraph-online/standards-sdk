import type {
  AgentAuthConfig,
  AgentRegistrationRequest,
  JsonObject,
  JsonValue,
  SearchParams,
} from '../types';

export const DEFAULT_USER_AGENT = '@hol-org/rb-client';
export const DEFAULT_PROGRESS_INTERVAL_MS = 1_500;
export const DEFAULT_PROGRESS_TIMEOUT_MS = 5 * 60 * 1_000;
export const DEFAULT_BASE_URL = 'https://hol.org/registry/api/v1';
export const JSON_CONTENT_TYPE = /application\/json/i;
export const DEFAULT_HISTORY_TOP_UP_HBAR = 0.25;
export const MINIMUM_REGISTRATION_AUTO_TOP_UP_CREDITS = 1;

const stripTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
};

export const createAbortError = (): Error =>
  typeof DOMException === 'function'
    ? new DOMException('Aborted', 'AbortError')
    : new Error('The operation was aborted');

export const normaliseHeaderName = (name: string): string =>
  name.trim().toLowerCase();

export const isBrowserRuntime = (): boolean =>
  typeof window !== 'undefined' && typeof window.fetch === 'function';

export const toJsonValue = (value: unknown): JsonValue => {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => (item === undefined ? null : toJsonValue(item)));
  }
  if (typeof value === 'object') {
    const result: JsonObject = {};
    Object.entries(value as Record<string, unknown>).forEach(
      ([key, entryValue]) => {
        if (entryValue !== undefined) {
          result[key] = toJsonValue(entryValue);
        }
      },
    );
    return result;
  }
  throw new TypeError('Only JSON-compatible values are supported');
};

export const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const toJsonObject = (value: unknown): JsonObject => {
  const normalised = toJsonValue(value);
  if (isJsonObject(normalised)) {
    return normalised;
  }
  throw new TypeError('Expected JSON object value');
};

export const serialiseAuthConfig = (auth: AgentAuthConfig): JsonObject => {
  const authPayload: JsonObject = {};
  if (auth.type) {
    authPayload.type = auth.type;
  }
  if (auth.token) {
    authPayload.token = auth.token;
  }
  if (auth.username) {
    authPayload.username = auth.username;
  }
  if (auth.password) {
    authPayload.password = auth.password;
  }
  if (auth.headerName) {
    authPayload.headerName = auth.headerName;
  }
  if (auth.headerValue) {
    authPayload.headerValue = auth.headerValue;
  }
  if (auth.headers) {
    authPayload.headers = { ...auth.headers };
  }
  return authPayload;
};

export const serialiseAgentRegistrationRequest = (
  payload: AgentRegistrationRequest,
): JsonObject => {
  const body: JsonObject = {
    profile: toJsonObject(payload.profile),
  };
  if (payload.endpoint !== undefined) {
    body.endpoint = payload.endpoint;
  }
  if (payload.protocol !== undefined) {
    body.protocol = payload.protocol;
  }
  if (payload.communicationProtocol !== undefined) {
    body.communicationProtocol = payload.communicationProtocol;
  }
  if (payload.registry !== undefined) {
    body.registry = payload.registry;
  }
  if (payload.additionalRegistries !== undefined) {
    body.additionalRegistries = payload.additionalRegistries;
  }
  if (payload.metadata !== undefined) {
    body.metadata = toJsonObject(payload.metadata);
  }
  return body;
};

export type X402NetworkId = 'base' | 'base-sepolia';

export const normalizeHexPrivateKey = (value: string): `0x${string}` => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('evmPrivateKey is required');
  }
  return trimmed.startsWith('0x')
    ? (trimmed as `0x${string}`)
    : (`0x${trimmed}` as `0x${string}`);
};

export function normaliseBaseUrl(input?: string): string {
  const trimmed = input?.trim();
  let baseCandidate =
    trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BASE_URL;

  try {
    const url = new URL(stripTrailingSlashes(baseCandidate));
    const hostname = url.hostname.toLowerCase();
    const ensureRegistryPrefix = (): void => {
      if (!url.pathname.startsWith('/registry')) {
        url.pathname =
          url.pathname === '/' ? '/registry' : `/registry${url.pathname}`;
      }
    };

    if (hostname === 'hol.org') {
      ensureRegistryPrefix();
      baseCandidate = url.toString();
    } else if (
      hostname === 'registry.hashgraphonline.com' ||
      hostname === 'hashgraphonline.com'
    ) {
      ensureRegistryPrefix();
      url.hostname = 'hol.org';
      baseCandidate = url.toString();
    }
  } catch {
  }

  const withoutTrailing = stripTrailingSlashes(baseCandidate);
  if (/\/api\/v\d+$/i.test(withoutTrailing)) {
    return withoutTrailing;
  }
  if (/\/api$/i.test(withoutTrailing)) {
    return `${withoutTrailing}/v1`;
  }
  return `${withoutTrailing}/api/v1`;
}

export function buildSearchQuery(params: SearchParams): string {
  const query = new URLSearchParams();
  const appendList = (key: string, values?: string[]) => {
    if (!values) {
      return;
    }
    values.forEach(value => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          query.append(key, trimmed);
        }
      }
    });
  };

  if (params.q) {
    const trimmed = params.q.trim();
    if (trimmed.length > 0) {
      query.set('q', trimmed);
    }
  }
  if (typeof params.page === 'number') {
    query.set('page', params.page.toString());
  }
  if (typeof params.limit === 'number') {
    query.set('limit', params.limit.toString());
  }
  if (params.registry) {
    const trimmed = params.registry.trim();
    if (trimmed.length > 0) {
      query.set('registry', trimmed);
    }
  }
  appendList('registries', params.registries);
  if (typeof params.minTrust === 'number') {
    query.set('minTrust', params.minTrust.toString());
  }
  appendList('capabilities', params.capabilities);
  appendList('protocols', params.protocols);
  appendList('adapters', params.adapters);

  if (params.metadata) {
    Object.entries(params.metadata).forEach(([key, values]) => {
      if (!key || !Array.isArray(values) || values.length === 0) {
        return;
      }
      const trimmedKey = key.trim();
      if (trimmedKey.length === 0) {
        return;
      }
      values.forEach(value => {
        if (value === undefined || value === null) {
          return;
        }
        query.append(`metadata.${trimmedKey}`, String(value));
      });
    });
  }

  if (params.type) {
    const trimmedType = params.type.trim();
    if (trimmedType.length > 0 && trimmedType.toLowerCase() !== 'all') {
      query.set('type', trimmedType);
    }
  }

  if (params.verified === true) {
    query.set('verified', 'true');
  }

  if (params.online === true) {
    query.set('online', 'true');
  }

  if (params.sortBy) {
    const trimmedSort = params.sortBy.trim();
    if (trimmedSort.length > 0) {
      query.set('sortBy', trimmedSort);
    }
  }

  if (params.sortOrder) {
    const lowered = params.sortOrder.toLowerCase();
    if (lowered === 'asc' || lowered === 'desc') {
      query.set('sortOrder', lowered);
    }
  }
  const queryString = query.toString();
  return queryString.length > 0 ? `?${queryString}` : '';
}
