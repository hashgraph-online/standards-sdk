import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { isJsonObject, readString, readSubjectAdditional } from '../signals';
import { resolveSubjectEndpoint } from './endpoints';
import {
  Hcs25CollectorHttpError,
  isTimeoutError,
  requestJson,
  requestText,
} from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
  Hcs25SignalStatus,
} from './types';

const GITHUB_API_BASE = 'https://api.github.com';
const NPM_API_BASE = 'https://api.npmjs.org';
const NPM_REGISTRY_BASE = 'https://registry.npmjs.org';
const PYPISTATS_API_BASE = 'https://pypistats.org/api';
const PYPI_API_BASE = 'https://pypi.org/pypi';
const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com';

const GITHUB_REPO_PATTERN =
  /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/;

/**
 * Options for the OSS popularity signal adapter.
 */
export interface Hcs25OssPopularitySignalAdapterOptions {
  /** GitHub API base URL. Default `https://api.github.com`. */
  githubApiBase?: string;
  /** Optional GitHub token for higher rate limits. */
  githubToken?: string;
  /** npm downloads API base. Default `https://api.npmjs.org`. */
  npmApiBase?: string;
  /** pypistats API base. Default `https://pypistats.org/api`. */
  pypiApiBase?: string;
  /**
   * When no GitHub repo is declared, infer one from the package's
   * registry metadata (npm `repository.url`, PyPI `project_urls` /
   * `home_page`). Default true.
   */
  inferRepository?: boolean;
  /**
   * When no package identity is declared, infer one from the repo's
   * `package.json` / `pyproject.toml` / `setup.cfg` on `main`/`master`.
   * Default true.
   */
  inferPackageIdentity?: boolean;
  /**
   * When the GitHub API lookup fails or returns no star count, scrape the
   * repo page's star counter as a fallback. Default true.
   */
  githubHtmlFallback?: boolean;
  /** Per-adapter timeout in milliseconds. */
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

/**
 * Extracts an `owner/repo` pair from a free-form value (URL, git SSH form,
 * or an already-normalized `owner/repo` slug).
 */
export function parseGithubRepo(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const direct = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (direct) {
    return `${direct[1]}/${direct[2]}`;
  }
  const match = value.match(GITHUB_REPO_PATTERN);
  if (!match) {
    return null;
  }
  return `${match[1]}/${match[2].replace(/\.git$/, '')}`;
}

function resolveGithubRepo(subject: Hcs25Subject): string | null {
  const additional = readSubjectAdditional(subject);
  const metadata = subject.metadata ?? {};
  const mcp = isJsonObject(metadata.mcp) ? metadata.mcp : undefined;

  for (const value of [
    readString(additional, 'githubRepo'),
    readString(additional, 'repository'),
    readString(metadata, 'repository'),
    readString(mcp, 'repository'),
    readString(metadata, 'repoUrl'),
    readString(additional, 'repoUrl'),
    readString(metadata, 'homepage'),
    readString(additional, 'homepage'),
    resolveSubjectEndpoint(subject),
  ]) {
    const repo = parseGithubRepo(value);
    if (repo) {
      return repo;
    }
  }
  return null;
}

function resolvePackage(
  subject: Hcs25Subject,
): { registry: 'npm' | 'pypi'; name: string } | null {
  const additional = readSubjectAdditional(subject);
  const registry = readString(additional, 'packageRegistry');
  const name = readString(additional, 'packageName');
  if (name && (registry === 'npm' || registry === 'pypi')) {
    return { registry, name };
  }
  if (name) {
    return { registry: 'npm', name };
  }
  return null;
}

interface GithubRepoResponse {
  stargazers_count?: number;
}

interface NpmDownloadsResponse {
  downloads?: number;
}

interface PyPiRecentResponse {
  data?: { last_month?: number };
}

function statusFromError(error: unknown): Hcs25SignalStatus {
  if (error instanceof Hcs25CollectorHttpError && error.status === 404) {
    return 'missing';
  }
  return isTimeoutError(error) ? 'timeout' : 'error';
}

const parseLikelyPackageName = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return /^[a-zA-Z0-9._~@/-]{1,214}$/.test(trimmed) ? trimmed : null;
};

const parseNpmPackageName = (body: string): string | null => {
  try {
    const parsed = JSON.parse(body) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : null;
  } catch {
    return null;
  }
};

const parsePyProjectName = (body: string): string | null => {
  const match = body.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
  return match?.[1] ?? null;
};

const parseSetupCfgName = (body: string): string | null => {
  const match = body.match(/^\s*name\s*=\s*(\S+)\s*$/m);
  return match?.[1] ?? null;
};

/**
 * Infers the package identity (`npm`/`pypi` + name) from the repository's
 * package manifests on `main`/`master`, per production behavior.
 */
async function inferPackageIdentity(
  repo: string,
  context: Hcs25CollectContext,
): Promise<{ registry: 'npm' | 'pypi'; name: string } | null> {
  const base = `${RAW_GITHUB_BASE}/${repo
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  let npmName: string | null = null;
  let pypiName: string | null = null;

  for (const branch of ['main', 'master']) {
    if (!npmName) {
      try {
        const body = await requestText(`${base}/${branch}/package.json`, {
          fetch: context.fetch,
          timeoutMs: context.timeoutMs,
          signal: context.signal,
        });
        npmName = parseLikelyPackageName(parseNpmPackageName(body));
      } catch {
        // manifest not present on this branch
      }
    }
    if (!pypiName) {
      try {
        const body = await requestText(`${base}/${branch}/pyproject.toml`, {
          fetch: context.fetch,
          timeoutMs: context.timeoutMs,
          signal: context.signal,
        });
        pypiName = parseLikelyPackageName(parsePyProjectName(body));
      } catch {
        try {
          const body = await requestText(`${base}/${branch}/setup.cfg`, {
            fetch: context.fetch,
            timeoutMs: context.timeoutMs,
            signal: context.signal,
          });
          pypiName = parseLikelyPackageName(parseSetupCfgName(body));
        } catch {
          // no python manifest either
        }
      }
    }
    if (npmName || pypiName) {
      break;
    }
  }

  if (npmName && !pypiName) {
    return { registry: 'npm', name: npmName };
  }
  if (pypiName && !npmName) {
    return { registry: 'pypi', name: pypiName };
  }
  return null;
}

/**
 * Infers the GitHub repository for a package from its registry metadata
 * (PyPI `project_urls`/`home_page`; npm `repository.url`/`homepage`/
 * `bugs.url`).
 */
async function inferRepositoryFromPackage(
  pkg: { registry: 'npm' | 'pypi'; name: string },
  context: Hcs25CollectContext,
): Promise<string | null> {
  const candidates: string[] = [];
  try {
    if (pkg.registry === 'pypi') {
      const payload = await requestJson<{
        info?: {
          home_page?: unknown;
          project_urls?: Record<string, unknown>;
        };
      }>(`${PYPI_API_BASE}/${encodeURIComponent(pkg.name)}/json`, {
        fetch: context.fetch,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
      const home = payload.info?.home_page;
      if (typeof home === 'string') {
        candidates.push(home);
      }
      const urls = payload.info?.project_urls;
      if (urls && typeof urls === 'object' && !Array.isArray(urls)) {
        for (const value of Object.values(urls)) {
          if (typeof value === 'string') {
            candidates.push(value);
          }
        }
      }
    } else {
      const payload = await requestJson<{
        repository?: { url?: unknown } | unknown;
        homepage?: unknown;
        bugs?: { url?: unknown } | unknown;
      }>(`${NPM_REGISTRY_BASE}/${encodeURIComponent(pkg.name)}`, {
        fetch: context.fetch,
        timeoutMs: context.timeoutMs,
        signal: context.signal,
      });
      const repo =
        payload.repository &&
        typeof payload.repository === 'object' &&
        !Array.isArray(payload.repository)
          ? (payload.repository as Record<string, unknown>).url
          : payload.repository;
      if (typeof repo === 'string') {
        candidates.push(repo);
      }
      if (typeof payload.homepage === 'string') {
        candidates.push(payload.homepage);
      }
      const bugs =
        payload.bugs &&
        typeof payload.bugs === 'object' &&
        !Array.isArray(payload.bugs)
          ? (payload.bugs as Record<string, unknown>).url
          : payload.bugs;
      if (typeof bugs === 'string') {
        candidates.push(bugs);
      }
    }
  } catch {
    return null;
  }
  for (const candidate of candidates) {
    const repo = parseGithubRepo(candidate);
    if (repo) {
      return repo;
    }
  }
  return null;
}

/**
 * Reads GitHub star count from the repo HTML page's counter badge
 * (production fallback when the API is rate-limited).
 */
async function fetchGithubStarsViaHtml(
  repo: string,
  context: Hcs25CollectContext,
): Promise<number | null> {
  const url = `https://github.com/${repo
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const body = await requestText(url, {
    fetch: context.fetch,
    timeoutMs: context.timeoutMs,
    signal: context.signal,
    headers: { accept: 'text/html' },
  });
  const match =
    body.match(
      /id="repo-stars-counter-star"[^>]*aria-label="(?<count>[0-9,]+)\s+users?\s+starred/i,
    ) ??
    body.match(/id="repo-stars-counter-star"[^>]*title="(?<count>[0-9,]+)"/i);
  const raw = match?.groups?.count;
  if (!raw) {
    return null;
  }
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

/**
 * Creates the `oss-popularity` signal adapter: collects GitHub repository
 * stars and npm/PyPI 30-day download counts — with package/repo identity
 * inference across `package.json`, `pyproject.toml`, `setup.cfg`, PyPI
 * metadata, and npm registry metadata — writing the catalog fields under
 * `metadata.additional`.
 */
export function createOssPopularitySignalAdapter(
  options: Hcs25OssPopularitySignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    let repo = resolveGithubRepo(subject);
    let pkg = resolvePackage(subject);

    // Cross-inference: repo ⇄ package (production behavior).
    if (!repo && pkg && options.inferRepository !== false) {
      repo = await inferRepositoryFromPackage(pkg, context).catch(
        (): null => null,
      );
    }
    if (!pkg && repo && options.inferPackageIdentity !== false) {
      pkg = await inferPackageIdentity(repo, context).catch((): null => null);
    }

    const results: Hcs25SignalAdapterResult[] = [];
    const additional: Record<string, Hcs25JsonValue> = {};

    if (repo) {
      additional.githubRepo = repo;
      additional.packageRepositoryUpdatedAt = now;
      try {
        const headers: Record<string, string> = {
          accept: 'application/vnd.github+json',
        };
        if (options.githubToken) {
          headers.authorization = `Bearer ${options.githubToken}`;
        }
        let stars: number | null = null;
        try {
          const data = await requestJson<GithubRepoResponse>(
            `${options.githubApiBase ?? GITHUB_API_BASE}/repos/${repo}`,
            {
              fetch: context.fetch,
              headers,
              timeoutMs: context.timeoutMs,
              signal: context.signal,
            },
          );
          stars =
            typeof data.stargazers_count === 'number'
              ? Math.max(0, Math.floor(data.stargazers_count))
              : null;
        } catch (error) {
          if (options.githubHtmlFallback === false) {
            throw error;
          }
        }
        if (stars === null && options.githubHtmlFallback !== false) {
          stars = await fetchGithubStarsViaHtml(repo, context).catch(
            (): null => null,
          );
        }
        additional.githubStars = stars;
        additional.githubStarsUpdatedAt = now;
        results.push({
          signalId: 'oss.github_stars',
          status: stars === null ? 'missing' : 'ok',
          value: stars,
          provenance: {
            source: 'github',
            sourceUrl: `${options.githubApiBase ?? GITHUB_API_BASE}/repos/${repo}`,
            subjectId: repo,
            fetchedAt: now,
          },
        });
      } catch (error) {
        results.push({
          signalId: 'oss.github_stars',
          status: statusFromError(error),
          provenance: {
            source: 'github',
            subjectId: repo,
            fetchedAt: now,
          },
        });
      }
    }

    if (pkg) {
      additional.packageRegistry = pkg.registry;
      additional.packageName = pkg.name;
      additional.packageIdentityUpdatedAt = now;
      const signalId =
        pkg.registry === 'npm' ? 'oss.npm_downloads' : 'oss.pypi_downloads';
      try {
        if (pkg.registry === 'npm') {
          const data = await requestJson<NpmDownloadsResponse>(
            `${options.npmApiBase ?? NPM_API_BASE}/downloads/point/last-month/${encodeURIComponent(pkg.name)}`,
            {
              fetch: context.fetch,
              timeoutMs: context.timeoutMs,
              signal: context.signal,
            },
          );
          const downloads =
            typeof data.downloads === 'number'
              ? Math.max(0, Math.floor(data.downloads))
              : null;
          additional.npmDownloads30d = downloads;
          additional.npmDownloadsUpdatedAt = now;
          if (downloads !== null) {
            additional.packageDownloadCount = downloads;
          }
          results.push({
            signalId,
            status: downloads === null ? 'missing' : 'ok',
            value: downloads,
            provenance: {
              source: 'npm',
              subjectId: pkg.name,
              fetchedAt: now,
            },
          });
        } else {
          const data = await requestJson<PyPiRecentResponse>(
            `${options.pypiApiBase ?? PYPISTATS_API_BASE}/packages/${encodeURIComponent(pkg.name)}/recent`,
            {
              fetch: context.fetch,
              timeoutMs: context.timeoutMs,
              signal: context.signal,
            },
          );
          const downloads =
            typeof data.data?.last_month === 'number'
              ? Math.max(0, Math.floor(data.data.last_month))
              : null;
          additional.pypiDownloads30d = downloads;
          additional.pypiDownloadsUpdatedAt = now;
          if (downloads !== null) {
            additional.packageDownloadCount = downloads;
          }
          results.push({
            signalId,
            status: downloads === null ? 'missing' : 'ok',
            value: downloads,
            provenance: {
              source: 'pypi',
              subjectId: pkg.name,
              fetchedAt: now,
            },
          });
        }
      } catch (error) {
        results.push({
          signalId,
          status: statusFromError(error),
          provenance: {
            source: pkg.registry,
            subjectId: pkg.name,
            fetchedAt: now,
          },
        });
      }
    }

    if (results.length === 0) {
      return [
        {
          signalId: 'oss.github_stars',
          status: 'missing',
        },
      ];
    }

    const rootValues: Record<string, Hcs25JsonValue> = {};
    // Persist an inferred repository at the metadata root so downstream
    // collectors and the stored record share the canonical value.
    if (repo && !readString(subject.metadata ?? {}, 'repository')) {
      rootValues.repository = `https://github.com/${repo}`;
    }

    results.push({
      signalId: 'oss.popularity',
      status: 'ok',
      fields: [
        { scope: 'additional', values: additional },
        ...(Object.keys(rootValues).length > 0
          ? [{ scope: 'root' as const, values: rootValues }]
          : []),
      ],
      provenance: {
        source: 'oss-popularity',
        subjectId: subject.id,
        fetchedAt: now,
      },
    });
    return results;
  };

  return {
    id: 'oss-popularity',
    produces: [
      'oss.github_stars',
      'oss.npm_downloads',
      'oss.pypi_downloads',
      'oss.popularity',
    ],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}
