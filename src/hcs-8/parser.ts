import { parsePollMetadata, parseVoteEntries } from '../hcs-9';
import {
  Hcs8BaseMessage,
  ManagePayload,
  RegisterPayload,
  UpdatePayload,
  VotePayload,
  hcs8BaseMessageSchema,
  managePayloadSchema,
  registerPayloadSchema,
  updatePayloadSchema,
  votePayloadSchema,
} from './types';

const DATA_PREFIX = 'data:application/json;utf8,';

function normaliseDataField(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  if (data.startsWith(DATA_PREFIX)) {
    const trimmed = data.slice(DATA_PREFIX.length);
    return trimmed.trim();
  }
  return data.trim();
}

export function decodeMessage(raw: string): Hcs8BaseMessage {
  const parsed = JSON.parse(raw);
  return hcs8BaseMessageSchema.parse(parsed);
}

export function parseRegisterPayload(data: unknown): RegisterPayload {
  const json = normaliseDataField(data);
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  const parsed = registerPayloadSchema.parse({
    metadata: parsePollMetadata(obj),
  });
  return parsed;
}

export function parseManagePayload(data: unknown): ManagePayload {
  const json = normaliseDataField(data);
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  return managePayloadSchema.parse(obj);
}

export function parseUpdatePayload(data: unknown): UpdatePayload {
  const json = normaliseDataField(data);
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  return updatePayloadSchema.parse(obj);
}

export function parseVotePayload(data: unknown, accountId: string): VotePayload {
  const json = normaliseDataField(data);
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  const entries = parseVoteEntries(obj);
  return votePayloadSchema.parse({ accountId, votes: entries });
}
