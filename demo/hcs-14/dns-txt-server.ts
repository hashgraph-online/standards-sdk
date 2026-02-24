import { Resolver } from 'node:dns/promises';
import { createSocket, type Socket } from 'node:dgram';
import type { DnsTxtLookup } from '../../src/hcs-14/resolvers/dns';

const LOOPBACK_IPV4 = '127.0.0.1';
const DNS_TYPE_TXT = 16;
const DNS_CLASS_IN = 1;
const DNS_RESPONSE_FLAGS_NO_ERROR = 0x8180;

interface DnsQuestion {
  name: string;
  type: number;
  classCode: number;
  questionEndOffset: number;
}

function encodeDnsName(name: string): Buffer {
  const labels = name
    .split('.')
    .map(label => label.trim())
    .filter(label => label.length > 0);
  const parts: Buffer[] = [];
  for (const label of labels) {
    const bytes = Buffer.from(label, 'utf8');
    parts.push(Buffer.from([bytes.length]));
    parts.push(bytes);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function parseDnsQuestion(message: Buffer): DnsQuestion | null {
  if (message.length < 17) {
    return null;
  }

  const labels: string[] = [];
  let offset = 12;
  while (offset < message.length) {
    const labelLength = message[offset];
    if (labelLength === 0) {
      offset += 1;
      break;
    }
    if ((labelLength & 0xc0) !== 0) {
      return null;
    }
    const labelStart = offset + 1;
    const labelEnd = labelStart + labelLength;
    if (labelEnd > message.length) {
      return null;
    }
    labels.push(message.toString('utf8', labelStart, labelEnd));
    offset = labelEnd;
  }

  if (offset + 4 > message.length) {
    return null;
  }

  const type = message.readUInt16BE(offset);
  const classCode = message.readUInt16BE(offset + 2);
  return {
    name: labels.join('.').toLowerCase(),
    type,
    classCode,
    questionEndOffset: offset + 4,
  };
}

function buildTxtAnswer(name: string, txt: string): Buffer {
  const txtBytes = Buffer.from(txt, 'utf8');
  if (txtBytes.length > 255) {
    throw new Error('TXT answer payload exceeds DNS single-string limit.');
  }
  const rdata = Buffer.concat([Buffer.from([txtBytes.length]), txtBytes]);
  const answerHeader = Buffer.alloc(10);
  answerHeader.writeUInt16BE(DNS_TYPE_TXT, 0);
  answerHeader.writeUInt16BE(DNS_CLASS_IN, 2);
  answerHeader.writeUInt32BE(60, 4);
  answerHeader.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([encodeDnsName(name), answerHeader, rdata]);
}

function buildDnsResponse(
  query: Buffer,
  question: DnsQuestion,
  txtAnswers: string[],
): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(query.readUInt16BE(0), 0);
  header.writeUInt16BE(DNS_RESPONSE_FLAGS_NO_ERROR, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(txtAnswers.length, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  const questionSection = query.subarray(12, question.questionEndOffset);
  const answerSections = txtAnswers.map(answer =>
    buildTxtAnswer(question.name, answer),
  );
  return Buffer.concat([header, questionSection, ...answerSections]);
}

function normalizeDnsName(name: string): string {
  const withoutTrailingDot = name.endsWith('.') ? name.slice(0, -1) : name;
  return withoutTrailingDot.toLowerCase();
}

function normalizeRecordMap(
  records: Record<string, string[]>,
): Map<string, string[]> {
  const normalized = new Map<string, string[]>();
  for (const [name, values] of Object.entries(records)) {
    normalized.set(normalizeDnsName(name), values);
  }
  return normalized;
}

export async function startDnsTxtServer(
  records: Record<string, string[]>,
): Promise<{
  socket: Socket;
  port: number;
}> {
  const normalizedRecords = normalizeRecordMap(records);
  const socket = createSocket('udp4');
  socket.on('message', (message: Buffer, remote) => {
    const question = parseDnsQuestion(message);
    if (!question) {
      return;
    }

    let answers: string[] = [];
    if (question.type === DNS_TYPE_TXT && question.classCode === DNS_CLASS_IN) {
      const recordValues = normalizedRecords.get(
        normalizeDnsName(question.name),
      );
      answers = recordValues ?? [];
    }
    const response = buildDnsResponse(message, question, answers);
    socket.send(response, remote.port, remote.address);
  });

  return new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, LOOPBACK_IPV4, () => {
      socket.off('error', reject);
      const address = socket.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind local DNS server.'));
        return;
      }
      resolve({ socket, port: address.port });
    });
  });
}

export function createTxtLookup(dnsPort: number): DnsTxtLookup {
  const resolver = new Resolver();
  resolver.setServers([`${LOOPBACK_IPV4}:${dnsPort}`]);
  return async (hostname: string): Promise<string[]> => {
    const rows = await resolver.resolveTxt(hostname);
    return rows.map(row => row.join(''));
  };
}

export function closeDnsServer(socket: Socket): Promise<void> {
  return new Promise(resolve => {
    socket.close(() => {
      resolve();
    });
  });
}
