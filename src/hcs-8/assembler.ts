import { parseRegisterPayload } from './parser';
import {
  Hcs8BaseMessage,
  Hcs8Operation,
  SequenceAssemblyContext,
  Hcs8RegisterMessage,
} from './types';

export interface RegisterAssemblyResult {
  message: Hcs8RegisterMessage;
  context?: SequenceAssemblyContext;
}

export class RegisterSequenceAssembler {
  private readonly sequences = new Map<number, SequenceAssemblyContext>();
  private lastUid = -1;

  public ingest(
    message: Hcs8BaseMessage,
    timestamp: string,
  ): RegisterAssemblyResult | null {
    if (message.op !== 'register') {
      throw new Error('Sequence assembler only accepts register operations');
    }

    if (!message.sid) {
      const register: Hcs8RegisterMessage = {
        ...message,
        d: parseRegisterPayload(message.d),
      };
      return { message: register };
    }

    const [uid, num, len] = message.sid;
    if (this.lastUid >= 0 && uid < this.lastUid) {
      throw new Error('Sequence uid must be monotonically increasing');
    }
    this.lastUid = Math.max(this.lastUid, uid);

    let context = this.sequences.get(uid);
    if (!context) {
      context = {
        uid,
        op: message.op as Hcs8Operation,
        length: len,
        payloads: Array(len).fill(''),
        memo: message.m,
        firstTimestamp: timestamp,
        lastTimestamp: timestamp,
      };
      this.sequences.set(uid, context);
    }

    if (context.op !== message.op) {
      throw new Error('Sequence messages must share the same operation');
    }
    if (context.length !== len) {
      throw new Error('Sequence length changed unexpectedly');
    }

    if (num >= context.payloads.length) {
      throw new Error('Sequence index exceeds declared length');
    }

    context.payloads[num] =
      typeof message.d === 'string' ? message.d : JSON.stringify(message.d);
    context.lastTimestamp = timestamp;

    if (context.payloads.some((chunk) => chunk.length === 0)) {
      return null;
    }

    this.sequences.delete(uid);
    const combinedPayload = context.payloads.join('');
    const payload = parseRegisterPayload(combinedPayload);
    const register: Hcs8RegisterMessage = {
      ...message,
      sid: undefined,
      d: payload,
      m: context.memo ?? message.m,
    };
    return {
      message: register,
      context,
    };
  }
}
