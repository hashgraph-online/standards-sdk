import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import { readNumber, readString, readSubjectAdditional } from '../signals';
import { logScale } from './normalization';

/**
 * Options for the OSS popularity adapter.
 */
export interface Hcs25OssPopularityAdapterOptions {
  /** GitHub star cap for log scaling. Default 5000. */
  starsCap?: number;
  /** Package download cap for log scaling. Default 100000. */
  downloadsCap?: number;
  /** Within-adapter weight for the stars component. Default 0.6. */
  starsWeight?: number;
  /** Within-adapter weight for the downloads component. Default 0.4. */
  downloadsWeight?: number;
}

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

function readDownloadCount(subject: Hcs25Subject): number | null {
  const additional = readSubjectAdditional(subject);
  return (
    readNumber(additional, 'npmDownloads30d') ??
    readNumber(additional, 'pypiDownloads30d') ??
    readNumber(additional, 'packageDownloadCount')
  );
}

/**
 * Creates the `oss-popularity` adapter: log-scales GitHub stars and package
 * downloads into adoption-related trust components for open-source
 * artifacts. It only applies to subjects that look like software artifacts
 * (repository, star count, or package name present).
 */
export function createOssPopularityAdapter(
  options: Hcs25OssPopularityAdapterOptions = {},
): Hcs25AdapterDefinition {
  const starsCap = options.starsCap ?? 5000;
  const downloadsCap = options.downloadsCap ?? 100000;
  const starsWeight = options.starsWeight ?? 0.6;
  const downloadsWeight = options.downloadsWeight ?? 0.4;

  const looksLikeOssArtifact = (subject: Hcs25Subject): boolean => {
    const additional = readSubjectAdditional(subject);
    return (
      readString(additional, 'githubRepo') !== null ||
      readNumber(additional, 'githubStars') !== null ||
      readString(additional, 'packageName') !== null
    );
  };

  return {
    id: 'oss-popularity',
    weight: 0.7,
    contributionMode: 'scoped',
    appliesTo: looksLikeOssArtifact,
    components: [
      {
        name: 'githubStars',
        weight: starsWeight,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const stars = readNumber(
            readSubjectAdditional(subject),
            'githubStars',
          );
          return stars === null
            ? MISSING
            : { value: logScale(stars, starsCap), status: 'ok' };
        },
      },
      {
        name: 'downloads',
        weight: downloadsWeight,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const downloads = readDownloadCount(subject);
          return downloads === null
            ? MISSING
            : { value: logScale(downloads, downloadsCap), status: 'ok' };
        },
      },
    ],
  };
}
