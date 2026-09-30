import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import { readString, readSubjectAdditional } from '../signals';
import { resolveSubjectEndpoint } from './endpoints';
import { Hcs25CollectorHttpError, isTimeoutError, requestJson } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
  Hcs25SignalStatus,
} from './types';

const GITHUB_API_BASE = 'https://api.github.com';
const NPM_API_BASE = 'https://api.npmjs.org';
const PYPISTATS_API_BASE = 'https://pypistats.org/api';

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

  for (const value of [
    readString(additional, 'githubRepo'),
    readString(additional, 'repository'),
    readString(metadata, 'repository'),
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

/**
 * Creates the `oss-popularity` signal adapter: collects GitHub repository
 * stars and npm/PyPI 30-day download counts, writing the catalog fields
 * under `metadata.additional`.
 */
export function createOssPopularitySignalAdapter(
  options: Hcs25OssPopularitySignalAdapterOptions = {},
): Hcs25SignalAdapter {
  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const repo = resolveGithubRepo(subject);
    const pkg = resolvePackage(subject);
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
        const data = await requestJson<GithubRepoResponse>(
          `${options.githubApiBase ?? GITHUB_API_BASE}/repos/${repo}`,
          {
            fetch: context.fetch,
            headers,
            timeoutMs: context.timeoutMs,
            signal: context.signal,
          },
        );
        const stars =
          typeof data.stargazers_count === 'number'
            ? Math.max(0, Math.floor(data.stargazers_count))
            : null;
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

    results.push({
      signalId: 'oss.popularity',
      status: 'ok',
      fields: [{ scope: 'additional', values: additional }],
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
