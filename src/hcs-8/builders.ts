import { pollMetadataSchema, PollMetadata, VoteEntry } from '../hcs-9';
import {
  Hcs8ManageAction,
  Hcs8ManageMessage,
  Hcs8RegisterChunkMessage,
  Hcs8RegisterMessage,
  Hcs8UpdateMessage,
  Hcs8VoteMessage,
  SequenceInfo,
  managePayloadSchema,
  registerPayloadSchema,
  updateChangeSchema,
  updatePayloadSchema,
  votePayloadSchema,
} from './types';

const DATA_PREFIX = 'data:application/json;utf8,';

function encodePayload(data: unknown): string {
  return `${DATA_PREFIX}${JSON.stringify(data)}`;
}

export function buildRegisterMessage(
  metadata: PollMetadata,
  memo?: string,
): Hcs8RegisterMessage {
  const validated = pollMetadataSchema.parse(metadata);
  const payload = registerPayloadSchema.parse({ metadata: validated });
  return {
    p: 'hcs-8',
    op: 'register',
    d: payload,
    m: memo,
  };
}

export function buildManageMessage(
  accountId: string,
  action: Hcs8ManageAction,
  memo?: string,
): Hcs8ManageMessage {
  const payload = managePayloadSchema.parse({ accountId, action });
  return {
    p: 'hcs-8',
    op: 'manage',
    d: payload,
    m: memo,
  };
}

export function buildUpdateMessage(
  accountId: string,
  change: Hcs8UpdateMessage['d']['change'],
  memo?: string,
): Hcs8UpdateMessage {
  const parsedChange = change ? updateChangeSchema.parse(change) : undefined;
  if (!parsedChange || Object.keys(parsedChange).length === 0) {
    throw new Error('Update change requires at least one field');
  }
  const payload = updatePayloadSchema.parse({ accountId, change: parsedChange });
  return {
    p: 'hcs-8',
    op: 'update',
    d: payload,
    m: memo,
  };
}

export function buildVoteMessage(
  accountId: string,
  votes: VoteEntry[],
  memo?: string,
): Hcs8VoteMessage {
  const payload = votePayloadSchema.parse({ accountId, votes });
  return {
    p: 'hcs-8',
    op: 'vote',
    d: payload,
    m: memo,
  };
}

export function encodeMessagePayload(
  message:
    | Hcs8RegisterMessage
    | Hcs8ManageMessage
    | Hcs8UpdateMessage
    | Hcs8VoteMessage,
): string {
  const toEncode: Record<string, unknown> = { ...message };
  switch (message.op) {
    case 'register':
      toEncode.d = encodePayload(message.d.metadata);
      break;
    case 'manage':
      toEncode.d = encodePayload(message.d);
      break;
    case 'update':
      toEncode.d = encodePayload(message.d);
      break;
    case 'vote':
      toEncode.d = encodePayload(message.d.votes);
      break;
  }
  return JSON.stringify(toEncode);
}

function chunkString(data: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < data.length) {
    chunks.push(data.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return chunks;
}

export interface RegisterChunkOptions {
  uid?: number;
  chunkSize?: number;
}

export function buildRegisterChunks(
  metadata: PollMetadata,
  memo?: string,
  options: RegisterChunkOptions = {},
): Hcs8RegisterChunkMessage[] {
  const encoded = encodePayload(pollMetadataSchema.parse(metadata));
  const chunkSize = options.chunkSize ?? 900;
  const uid = options.uid ?? 0;
  if (Buffer.byteLength(encoded, 'utf8') <= chunkSize) {
    return [
      {
        p: 'hcs-8',
        op: 'register',
        d: encoded,
        m: memo,
      },
    ];
  }

  const segments = chunkString(encoded, chunkSize);
  return segments.map((segment, index) => ({
    p: 'hcs-8' as const,
    op: 'register' as const,
    sid: [uid, index, segments.length] satisfies SequenceInfo,
    d: segment,
    m: index === 0 ? memo : undefined,
  }));
}
