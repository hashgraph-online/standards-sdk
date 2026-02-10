import { z } from 'zod';
import {
  HCS26_PROTOCOL,
  hcs26OperationEnumSchema,
  hcs26TopicTypeEnumSchema,
  type Hcs26OperationEnum,
  type Hcs26TopicTypeEnum,
} from './types';

export type Hcs26TopicMemo = {
  protocol: typeof HCS26_PROTOCOL;
  indexed: boolean;
  ttlSeconds: number;
  topicType: Hcs26TopicTypeEnum;
};

export const HCS26_DEFAULT_TTL_SECONDS = 86400;

function toPositiveInt(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Expected a finite number');
  }
  const intValue = Math.floor(value);
  if (intValue <= 0) {
    throw new Error('Expected a positive integer');
  }
  return intValue;
}

export function buildHcs26TopicMemo(input: {
  indexed?: boolean;
  ttlSeconds?: number;
  topicType: Hcs26TopicTypeEnum;
}): string {
  const indexed = input.indexed ?? true;
  const ttlSeconds = toPositiveInt(
    input.ttlSeconds ?? HCS26_DEFAULT_TTL_SECONDS,
  );
  const topicType = hcs26TopicTypeEnumSchema.parse(input.topicType);

  // HCS-2 memo convention: indexed topics use "0" in the second segment.
  const indexedSegment = indexed ? '0' : '1';
  return `${HCS26_PROTOCOL}:${indexedSegment}:${ttlSeconds}:${topicType}`;
}

export function parseHcs26TopicMemo(memoRaw: string): Hcs26TopicMemo | null {
  const memo = memoRaw.trim();
  if (!memo) {
    return null;
  }

  const match = memo.match(/^hcs-26:(\d+):(\d+):(\d+)$/);
  if (!match) {
    return null;
  }

  const indexedSegment = Number(match[1]);
  const ttlSeconds = Number(match[2]);
  const topicType = Number(match[3]);

  if (![indexedSegment, ttlSeconds, topicType].every(Number.isFinite)) {
    return null;
  }

  const parsedTopicType = hcs26TopicTypeEnumSchema.safeParse(topicType);
  if (!parsedTopicType.success) {
    return null;
  }

  if (indexedSegment !== 0 && indexedSegment !== 1) {
    return null;
  }

  return {
    protocol: HCS26_PROTOCOL,
    indexed: indexedSegment === 0,
    ttlSeconds,
    topicType: parsedTopicType.data,
  };
}

export function buildHcs26TransactionMemo(input: {
  operation: Hcs26OperationEnum;
  topicType: Hcs26TopicTypeEnum;
}): string {
  const operation = hcs26OperationEnumSchema.parse(input.operation);
  const topicType = hcs26TopicTypeEnumSchema.parse(input.topicType);
  return `${HCS26_PROTOCOL}:op:${operation}:${topicType}`;
}

export type Hcs26TransactionMemo = {
  protocol: typeof HCS26_PROTOCOL;
  operation: Hcs26OperationEnum;
  topicType: Hcs26TopicTypeEnum;
};

export function parseHcs26TransactionMemo(
  memoRaw: string,
): Hcs26TransactionMemo | null {
  const memo = memoRaw.trim();
  if (!memo) {
    return null;
  }

  const match = memo.match(/^hcs-26:op:(\d+):(\d+)$/);
  if (!match) {
    return null;
  }

  const operation = Number(match[1]);
  const topicType = Number(match[2]);
  if (![operation, topicType].every(Number.isFinite)) {
    return null;
  }

  const parsedOperation = hcs26OperationEnumSchema.safeParse(operation);
  if (!parsedOperation.success) {
    return null;
  }
  const parsedTopicType = hcs26TopicTypeEnumSchema.safeParse(topicType);
  if (!parsedTopicType.success) {
    return null;
  }

  return {
    protocol: HCS26_PROTOCOL,
    operation: parsedOperation.data,
    topicType: parsedTopicType.data,
  };
}

export const hcs26TopicMemoSchema = z.string().transform(value => {
  const parsed = parseHcs26TopicMemo(value);
  if (!parsed) {
    throw new Error('Invalid HCS-26 topic memo');
  }
  return parsed;
});

export const hcs26TransactionMemoSchema = z.string().transform(value => {
  const parsed = parseHcs26TransactionMemo(value);
  if (!parsed) {
    throw new Error('Invalid HCS-26 transaction memo');
  }
  return parsed;
});
