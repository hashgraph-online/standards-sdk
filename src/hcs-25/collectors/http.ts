import type { Hcs25Fetch } from './types';

/**
 * Base error thrown by collector HTTP helpers.
 */
export class Hcs25CollectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Hcs25CollectorError';
  }
}

/**
 * A non-2xx HTTP response from an upstream source.
 */
export class Hcs25CollectorHttpError extends Hcs25CollectorError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'Hcs25CollectorHttpError';
    this.status = status;
  }
}

/**
 * The upstream source did not respond within the configured time budget.
 */
export class Hcs25CollectorTimeoutError extends Hcs25CollectorError {
  constructor(message = 'request timed out') {
    super(message);
    this.name = 'Hcs25CollectorTimeoutError';
  }
}

/**
 * True when an error represents an aborted or timed-out request, including
 * AbortSignal-driven rejections from injected fetch implementations.
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Hcs25CollectorTimeoutError) {
    return true;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/**
 * Resolves the fetch implementation: the injected one, else `globalThis.fetch`.
 */
export function resolveFetch(fetch?: Hcs25Fetch): Hcs25Fetch {
  if (fetch) {
    return fetch;
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Hcs25CollectorError(
      'no fetch implementation available; pass one via options.fetch',
    );
  }
  return (input, init) =>
    globalThis.fetch(input, init as RequestInit) as Promise<
      Awaited<ReturnType<Hcs25Fetch>>
    >;
}

export interface Hcs25RequestJsonOptions {
  fetch?: Hcs25Fetch;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Time budget in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** External abort signal (combined with the timeout). */
  signal?: AbortSignal;
}

/**
 * Performs a JSON HTTP request with a time budget. Throws
 * {@link Hcs25CollectorTimeoutError} on timeout/abort and
 * {@link Hcs25CollectorHttpError} on non-2xx responses. The timeout races
 * the fetch so injected implementations that ignore `signal` still respect
 * the budget.
 */
export async function requestJson<T = unknown>(
  url: string,
  options: Hcs25RequestJsonOptions = {},
): Promise<T> {
  const fetch = resolveFetch(options.fetch);
  const timeoutMs = options.timeoutMs ?? 30000;
  const controller = new AbortController();
  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Hcs25CollectorTimeoutError());
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(options.body !== undefined
            ? { 'content-type': 'application/json' }
            : {}),
          ...options.headers,
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);

    if (!response.ok) {
      throw new Hcs25CollectorHttpError(
        response.status,
        `HTTP ${response.status} from ${url}`,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw error instanceof Hcs25CollectorError
        ? error
        : new Hcs25CollectorTimeoutError();
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}
