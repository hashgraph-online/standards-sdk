import type { HCS27TopicMemo } from './types';

export function buildHCS27TopicMemo(ttlSeconds: number = 86400): string {
  const ttl = ttlSeconds > 0 ? ttlSeconds : 86400;
  return `hcs-27:0:${ttl}:0`;
}

export function parseHCS27TopicMemo(memo: string): HCS27TopicMemo | undefined {
  const parts = memo.trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'hcs-27') {
    return undefined;
  }

  const indexedFlag = Number.parseInt(parts[1], 10);
  const ttlSeconds = Number.parseInt(parts[2], 10);
  const topicType = Number.parseInt(parts[3], 10);

  if (
    Number.isNaN(indexedFlag) ||
    Number.isNaN(ttlSeconds) ||
    Number.isNaN(topicType)
  ) {
    return undefined;
  }

  return {
    indexedFlag,
    ttlSeconds,
    topicType,
  };
}

export function buildHCS27TransactionMemo(): string {
  return 'hcs-27:op:0:0';
}
