export const HOL_CHAT_PROTOCOL_ID = 'hol-chat' as const;

export type HolChatOpName =
  | 'payment_request'
  | 'payment_approve'
  | 'payment_decline'
  | 'payment_result'
  | 'job_status';

export interface HolChatOpBase {
  p: typeof HOL_CHAT_PROTOCOL_ID;
  op: HolChatOpName;
  request_id: string;
  m?: string;
  data?: Record<string, unknown>;
}

export type HolChatOp = HolChatOpBase;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isHolChatOp = (value: unknown): value is HolChatOp => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.p !== HOL_CHAT_PROTOCOL_ID) {
    return false;
  }
  if (
    typeof value.request_id !== 'string' ||
    value.request_id.trim().length === 0
  ) {
    return false;
  }
  const op = value.op;
  if (
    op !== 'payment_request' &&
    op !== 'payment_approve' &&
    op !== 'payment_decline' &&
    op !== 'payment_result' &&
    op !== 'job_status'
  ) {
    return false;
  }
  return true;
};

export const parseHolChatOps = (ops: unknown): HolChatOp[] => {
  if (!Array.isArray(ops)) {
    return [];
  }
  return ops.filter(isHolChatOp).map(op => {
    const next: HolChatOp = {
      p: HOL_CHAT_PROTOCOL_ID,
      op: op.op,
      request_id: op.request_id.trim(),
    };
    if (typeof op.m === 'string' && op.m.trim().length > 0) {
      next.m = op.m.trim();
    }
    if (isRecord(op.data)) {
      next.data = { ...op.data };
    }
    return next;
  });
};

export const buildPaymentApproveMessage = (input: {
  requestId: string;
  jobId: number;
}): string =>
  JSON.stringify({
    p: HOL_CHAT_PROTOCOL_ID,
    op: 'payment_approve',
    request_id: input.requestId,
    data: { job_id: input.jobId },
  });

export const buildPaymentDeclineMessage = (input: {
  requestId: string;
}): string =>
  JSON.stringify({
    p: HOL_CHAT_PROTOCOL_ID,
    op: 'payment_decline',
    request_id: input.requestId,
  });

export const buildJobStatusMessage = (input: {
  requestId: string;
  jobId: number;
}): string =>
  JSON.stringify({
    p: HOL_CHAT_PROTOCOL_ID,
    op: 'job_status',
    request_id: input.requestId,
    data: { job_id: input.jobId },
  });
