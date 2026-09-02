import { clampScore } from '../scoring';
import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../types';
import {
  readNumber,
  readSubjectAdditional,
  type Hcs25JsonObject,
} from '../signals';
import { clampUnit } from './normalization';

/**
 * Options for the AgentVerse insights adapter.
 */
export interface Hcs25AgentverseInsightsAdapterOptions {
  /** Registries where AgentVerse insights apply. */
  includeRegistries?: readonly string[];
}

/**
 * Options for the AgentVerse verifier reliability adapter.
 */
export interface Hcs25AgentverseVerifierAdapterOptions {
  /** Interaction count cap for the volume confidence factor. Default 1000. */
  interactionCap?: number;
  /** Average response time (seconds) that maps to a zero factor. Default 30. */
  responseTimeCapSeconds?: number;
  /** Registries where AgentVerse verifier counters apply. */
  includeRegistries?: readonly string[];
}

const DEFAULT_INCLUDED_REGISTRIES: readonly string[] = ['agentverse', 'uagent'];

const MISSING: Hcs25NormalizedValue = { value: 0, status: 'missing' };

function normalizeInsights(subject: Hcs25Subject): Hcs25NormalizedValue {
  const additional: Hcs25JsonObject = readSubjectAdditional(subject);
  const rating = readNumber(additional, 'agentverseInsightsRating');
  if (rating !== null) {
    return { value: clampScore((rating / 5) * 100), status: 'ok' };
  }

  const proxies = [
    readNumber(additional, 'agentverseInsightsReadmeQualityScore'),
    readNumber(additional, 'agentverseInsightsReadmeUniquenessScore'),
    readNumber(additional, 'agentverseInsightsInteractionsScore'),
  ].filter((value): value is number => value !== null);

  if (proxies.length === 0) {
    return MISSING;
  }

  const mean = proxies.reduce((sum, value) => sum + value, 0) / proxies.length;
  return { value: clampScore(mean * 100), status: 'ok' };
}

/**
 * Creates the `agentverse-insights` adapter: converts marketplace "insights"
 * indicators into a single normalized component, preferring the explicit
 * rating (scaled from five) and falling back to the mean of the available
 * quality proxies.
 */
export function createAgentverseInsightsAdapter(
  options: Hcs25AgentverseInsightsAdapterOptions = {},
): Hcs25AdapterDefinition {
  return {
    id: 'agentverse-insights',
    weight: 1,
    contributionMode: 'scoped',
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    defaultComponentKey: 'agentverse-insights.score',
    components: [
      { name: 'score', normalize: ({ subject }) => normalizeInsights(subject) },
    ],
  };
}

/**
 * Creates the `agentverse-verifier` adapter: converts verifier interaction
 * counters into a reliability score combining success rate, a response-time
 * penalty, and a volume confidence factor. Conditional contribution keeps
 * agents without verifier counters out of the denominator.
 */
export function createAgentverseVerifierAdapter(
  options: Hcs25AgentverseVerifierAdapterOptions = {},
): Hcs25AdapterDefinition {
  const interactionCap = options.interactionCap ?? 1000;
  const responseTimeCapSeconds = options.responseTimeCapSeconds ?? 30;

  return {
    id: 'agentverse-verifier',
    weight: 1,
    contributionMode: 'conditional',
    includeRegistries: options.includeRegistries ?? DEFAULT_INCLUDED_REGISTRIES,
    defaultComponentKey: 'agentverse-verifier.score',
    components: [
      {
        name: 'score',
        nonScorableWhenUnavailable: true,
        normalize: ({ subject }): Hcs25NormalizedValue => {
          const additional = readSubjectAdditional(subject);
          const recentInteractions =
            readNumber(
              additional,
              'agentverseInsightsVerifierRecentInteractions',
            ) ?? 0;
          const recentSuccesses =
            readNumber(
              additional,
              'agentverseInsightsVerifierRecentSuccessInteractions',
            ) ?? 0;
          const totalInteractions =
            readNumber(
              additional,
              'agentverseInsightsVerifierTotalInteractions',
            ) ?? 0;
          const totalSuccesses =
            readNumber(
              additional,
              'agentverseInsightsVerifierTotalSuccessInteractions',
            ) ?? 0;

          const useRecent = recentInteractions > 0;
          const interactions = useRecent
            ? recentInteractions
            : totalInteractions;
          const successes = useRecent ? recentSuccesses : totalSuccesses;

          if (interactions <= 0) {
            return MISSING;
          }

          const successRate = clampUnit(successes / interactions) * 100;
          const avgResponseTime = readNumber(
            additional,
            'agentverseInsightsAvgResponseTime',
          );
          const responseFactor =
            avgResponseTime === null
              ? 1
              : clampUnit(1 - avgResponseTime / responseTimeCapSeconds);
          const volumeFactor = clampUnit(
            Math.log1p(interactions) / Math.log1p(interactionCap),
          );

          return {
            value: clampScore(successRate * responseFactor * volumeFactor),
            status: 'ok',
          };
        },
      },
    ],
  };
}
