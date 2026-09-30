import type { Hcs25JsonValue, Hcs25Subject } from '../types';
import {
  generateSimpleMathQuestion,
  gradeSimpleMathResponse,
  gradeSimpleScienceResponse,
  isJsonObject,
  readString,
  sampleSimpleScienceQuestion,
  type Hcs25SimpleEvalStatus,
} from '../signals';
import { resolveSubjectEndpoint } from './endpoints';
import { isTimeoutError } from './http';
import type {
  Hcs25CollectContext,
  Hcs25SignalAdapter,
  Hcs25SignalAdapterResult,
} from './types';

/**
 * A transport that delivers an eval prompt to the subject and returns the
 * response text (or null when the subject cannot be reached in a way the
 * transport understands).
 */
export interface Hcs25EvalTransport {
  sendPrompt(input: {
    prompt: string;
    subject: Hcs25Subject;
    context: Hcs25CollectContext;
    sessionId?: string;
  }): Promise<string | null>;
}

/**
 * Extracts response text from common JSON reply shapes: `response`, `text`,
 * `message`, `content`, `choices[0].message.content` (OpenAI-style),
 * `result.parts[].text` / `result.status.message.parts[].text` (A2A-style).
 */
export function defaultExtractResponseText(data: unknown): string | null {
  if (typeof data === 'string') {
    return data;
  }
  if (!isJsonObject(data as Hcs25JsonValue)) {
    return null;
  }
  const record = data as Record<string, Hcs25JsonValue>;

  for (const key of ['response', 'text', 'message', 'content', 'answer']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (isJsonObject(first)) {
      const message = first.message;
      if (isJsonObject(message) && typeof message.content === 'string') {
        return message.content;
      }
      if (typeof first.text === 'string') {
        return first.text;
      }
    }
  }

  const partsText = (value: Hcs25JsonValue | undefined): string | null => {
    if (!Array.isArray(value)) {
      return null;
    }
    const texts: string[] = [];
    for (const part of value) {
      if (isJsonObject(part) && typeof part.text === 'string') {
        texts.push(part.text);
      }
    }
    return texts.length > 0 ? texts.join('\n') : null;
  };

  const result = record.result;
  if (isJsonObject(result)) {
    const direct = partsText(result.parts);
    if (direct) {
      return direct;
    }
    const status = result.status;
    if (isJsonObject(status)) {
      const message = status.message;
      if (isJsonObject(message)) {
        const nested = partsText(message.parts);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return null;
}

/**
 * Options for {@link createJsonHttpEvalTransport}.
 */
export interface Hcs25JsonHttpEvalTransportOptions {
  /** Endpoint URL (constant or resolved per subject). */
  endpoint: string | ((subject: Hcs25Subject) => string | null);
  /** Extra headers (e.g. authorization). */
  headers?: Record<string, string>;
  /**
   * Request body builder; default posts `{message: prompt}` (plus
   * `sessionId` when present).
   */
  buildBody?: (prompt: string, sessionId?: string) => unknown;
  /** Response extractor; defaults to {@link defaultExtractResponseText}. */
  extractResponse?: (data: unknown) => string | null;
}

/**
 * Creates a generic JSON HTTP transport: POSTs the prompt and extracts the
 * reply text from common response shapes.
 */
export function createJsonHttpEvalTransport(
  options: Hcs25JsonHttpEvalTransportOptions,
): Hcs25EvalTransport {
  const extractResponse = options.extractResponse ?? defaultExtractResponseText;
  return {
    async sendPrompt({ prompt, subject, context, sessionId }) {
      const url =
        typeof options.endpoint === 'function'
          ? options.endpoint(subject)
          : options.endpoint;
      if (!url) {
        return null;
      }
      const body =
        options.buildBody?.(prompt, sessionId) ??
        (sessionId ? { message: prompt, sessionId } : { message: prompt });
      const response = await context.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...options.headers },
        body: JSON.stringify(body),
        signal: context.signal,
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`eval endpoint returned HTTP ${response.status}`);
      }
      const data = (await response.json()) as unknown;
      return extractResponse(data);
    },
  };
}

/**
 * Creates an A2A-style transport: JSON-RPC `message/send` to the resolved
 * endpoint (or `options.endpoint`), extracting reply text from the task
 * result's parts.
 */
export function createA2aEvalTransport(options: {
  endpoint?: string | ((subject: Hcs25Subject) => string | null);
  headers?: Record<string, string>;
}): Hcs25EvalTransport {
  return {
    async sendPrompt({ prompt, subject, context, sessionId }) {
      const url =
        (typeof options.endpoint === 'function'
          ? options.endpoint(subject)
          : options.endpoint) ?? resolveSubjectEndpoint(subject);
      if (!url) {
        return null;
      }
      const response = await context.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: sessionId ?? `eval-${context.now.getTime()}`,
          method: 'message/send',
          params: {
            message: {
              role: 'user',
              parts: [{ kind: 'text', text: prompt }],
            },
          },
        }),
        signal: context.signal,
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`a2a endpoint returned HTTP ${response.status}`);
      }
      const data = (await response.json()) as unknown;
      return defaultExtractResponseText(data);
    },
  };
}

/**
 * The field-prefix family for a simple-evals collector: `a2a` writes the
 * shared `a2aSimple*` schema (also used by AgentVerse/uAgent), `nanda`
 * writes `nandaSimple*`.
 */
export type Hcs25SimpleEvalsFamily = 'a2a' | 'nanda';

/**
 * Options for {@link createSimpleEvalsSignalAdapter}.
 */
export interface Hcs25SimpleEvalsSignalAdapterOptions {
  family: Hcs25SimpleEvalsFamily;
  /**
   * Adapter identifier override (e.g. `agentverse-simple-evals` for the
   * AgentVerse-scoped variant of the `a2a` family).
   */
  adapterId?: string;
  /**
   * Transport(s) used to deliver prompts. A single transport applies to all
   * subjects; a record selects by `subject.protocol` (falling back to
   * `default` / `http`).
   */
  transport: Hcs25EvalTransport | Record<string, Hcs25EvalTransport>;
  /** Seeded RNG for deterministic question generation in tests. */
  rng?: () => number;
  /** Session/conversation id to correlate eval runs (a2a schema). */
  sessionId?: string | ((subject: Hcs25Subject) => string | undefined);
  timeoutMs?: number;
  includeRegistries?: readonly string[];
  excludeRegistries?: readonly string[];
  appliesTo?: (subject: Hcs25Subject) => boolean;
}

function pickTransport(
  transport: Hcs25EvalTransport | Record<string, Hcs25EvalTransport>,
  subject: Hcs25Subject,
): Hcs25EvalTransport | null {
  if (typeof (transport as Hcs25EvalTransport).sendPrompt === 'function') {
    return transport as Hcs25EvalTransport;
  }
  const map = transport as Record<string, Hcs25EvalTransport>;
  const protocol = subject.protocol?.toLowerCase();
  return (
    (protocol ? map[protocol] : undefined) ?? map.default ?? map.http ?? null
  );
}

function evalField(
  prefix: string,
  family: 'Math' | 'Science',
  suffix: string,
): string {
  return `${prefix}${family}${suffix}`;
}

/**
 * Creates a simple-evals signal adapter for a field family: generates a
 * SimpleMath and a SimpleScience prompt, dispatches them via the configured
 * transport, grades the responses per the methodology (binary 0/100), and
 * stores the `{a2a|nanda}Simple{Math,Science}*` fields under
 * `metadata.additional`.
 */
export function createSimpleEvalsSignalAdapter(
  options: Hcs25SimpleEvalsSignalAdapterOptions,
): Hcs25SignalAdapter {
  const prefix = options.family === 'nanda' ? 'nandaSimple' : 'a2aSimple';
  const rng = options.rng ?? Math.random;

  const collect = async (
    subject: Hcs25Subject,
    context: Hcs25CollectContext,
  ): Promise<Hcs25SignalAdapterResult[]> => {
    const now = context.now.toISOString();
    const transport = pickTransport(options.transport, subject);
    const sessionId =
      typeof options.sessionId === 'function'
        ? options.sessionId(subject)
        : options.sessionId;

    if (!transport) {
      return ['Math', 'Science'].map(family => ({
        signalId: `simple-evals.${options.family}_${family.toLowerCase()}`,
        status: 'missing' as const,
        fields: [
          {
            scope: 'additional' as const,
            values: {
              [evalField(prefix, family as 'Math' | 'Science', 'Status')]:
                'skipped',
              [evalField(prefix, family as 'Math' | 'Science', 'Error')]:
                'no transport for protocol',
              [evalField(prefix, family as 'Math' | 'Science', 'UpdatedAt')]:
                now,
            },
          },
        ],
      }));
    }

    const math = generateSimpleMathQuestion(rng);
    const science = sampleSimpleScienceQuestion(rng);

    const runEval = async (
      family: 'Math' | 'Science',
      prompt: string,
      questionId: string,
      grade: (response: string) => {
        status: Hcs25SimpleEvalStatus;
        score: number;
      },
    ): Promise<Hcs25SignalAdapterResult> => {
      let response: string | null = null;
      let status: Hcs25SimpleEvalStatus;
      try {
        response = await transport.sendPrompt({
          prompt,
          subject,
          context,
          sessionId,
        });
        if (response === null) {
          status = 'missing';
        } else if (response.trim().length === 0) {
          status = 'empty';
        } else {
          const graded = grade(response);
          status = graded.status;
          const score = graded.score;
          const values: Record<string, Hcs25JsonValue> = {
            [evalField(prefix, family, 'Score')]: score,
            [evalField(prefix, family, 'Status')]: status,
            [evalField(prefix, family, 'QuestionId')]: questionId,
            [evalField(prefix, family, 'Response')]: response,
            [evalField(prefix, family, 'UpdatedAt')]: now,
          };
          if (options.family === 'a2a' && sessionId) {
            values[evalField(prefix, family, 'SessionId')] = sessionId;
          }
          return {
            signalId: `simple-evals.${options.family}_${family.toLowerCase()}`,
            status: 'ok',
            value: score,
            fields: [{ scope: 'additional', values }],
            provenance: {
              source: 'simple-evals',
              subjectId: subject.id,
              fetchedAt: now,
              params: { questionId },
            },
          };
        }
      } catch (error) {
        status = isTimeoutError(error) ? 'timeout' : 'error';
        response = null;
      }

      const failedScore = 0;
      const values: Record<string, Hcs25JsonValue> = {
        [evalField(prefix, family, 'Score')]: failedScore,
        [evalField(prefix, family, 'Status')]: status,
        [evalField(prefix, family, 'QuestionId')]: questionId,
        [evalField(prefix, family, 'UpdatedAt')]: now,
      };
      if (status === 'missing') {
        values[evalField(prefix, family, 'Score')] = null;
      }
      if (options.family === 'a2a' && sessionId) {
        values[evalField(prefix, family, 'SessionId')] = sessionId;
      }
      return {
        signalId: `simple-evals.${options.family}_${family.toLowerCase()}`,
        status:
          status === 'missing'
            ? 'missing'
            : status === 'timeout'
              ? 'timeout'
              : status === 'error'
                ? 'error'
                : 'ok',
        value: status === 'missing' ? null : failedScore,
        fields: [{ scope: 'additional', values }],
        provenance: {
          source: 'simple-evals',
          subjectId: subject.id,
          fetchedAt: now,
          params: { questionId },
        },
      };
    };

    return [
      await runEval('Math', math.prompt, math.questionId, response =>
        gradeSimpleMathResponse(response, math.expected),
      ),
      await runEval('Science', science.prompt, science.questionId, response =>
        gradeSimpleScienceResponse(
          response,
          science.correctChoice,
          science.options,
        ),
      ),
    ];
  };

  return {
    id:
      options.adapterId ??
      (options.family === 'nanda' ? 'nanda-simple-evals' : 'a2a-simple-evals'),
    produces: [
      `simple-evals.${options.family}_math`,
      `simple-evals.${options.family}_science`,
    ],
    timeoutMs: options.timeoutMs,
    includeRegistries: options.includeRegistries,
    excludeRegistries: options.excludeRegistries,
    appliesTo: options.appliesTo,
    collect,
  };
}
