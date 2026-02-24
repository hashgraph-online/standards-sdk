import { Resolver } from 'node:dns/promises';
import { createSocket, type Socket } from 'node:dgram';
import {
  createServer as createHttpsServer,
  request as httpsRequest,
  type Server as HttpsServer,
} from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { connect as tlsConnect } from 'node:tls';
import {
  ANS_DNS_WEB_PROFILE_ID,
  AnsDnsWebProfileResolver,
  ResolverRegistry,
} from '../../src/hcs-14';
import type { DnsTxtLookup } from '../../src/hcs-14/resolvers/dns';

const LOOPBACK_IPV4 = '127.0.0.1';
const DNS_TYPE_TXT = 16;
const DNS_CLASS_IN = 1;
const DNS_RESPONSE_FLAGS_NO_ERROR = 0x8180;
const DEMO_NATIVE_ID = 'ans.local';
const DEMO_UID = 'ans://v1.0.0.ans.local';
const DEMO_AID = 'QmAnsDemoAid123';
const DEMO_PROTOCOL = 'a2a';
const DEMO_UAID = `uaid:aid:${DEMO_AID};uid=${DEMO_UID};registry=ans;proto=${DEMO_PROTOCOL};nativeId=${DEMO_NATIVE_ID}`;

const TLS_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCqO+iQSWLd99fh
eAb0W0WrV7QdU07s1bO7plWJS0Ml8a5rgtqna8FMXzGxMV1KauN6oBUdMijY9P62
ZjVQllkwrNqWK7zC/OK9kBvUArHZ1DXNeo/Ej3h6xFD3LcOiH110t+d0Hzd13SP+
ahzXPxNc5gJr0jRai9u7IhSUhTGZhWMZ4Eu7XO5HNSqQtojFuu/aJp94FAWldXSz
BDTluVPX5Kynp1MNdMJrbW5SvS7rSCEez/ctY7Uwo/3RDctoK2KmRJCYMrxAJ3Qq
bQQ5CXlVhzNpKQHtcFBRvw/acbeODkhvaKEzq4qSOMV/3emf/VykaU7fVdRYQd2K
A1XrWq47AgMBAAECggEABaZ9+crqW1JTFVhYH1I586AgCercHRG/8ehpU0QBQP8F
nusRHpiiTpOkBZqfbV+g4ZgXhHYjU4Xq0m2iV6213QOY535FlKz8btF3Rmymwkyb
m/4+cD0QARsr5D0CfJz1nd6XqNTo/n3OKHhenrJfst72/wl31D/ZA2U9MVli/1uX
errMRfEd5MxXPmE628vF6bxX9//VvhMNiWmyTlKxI7lp/ZhiLXuHuWMIh/BmRh6w
DFwOFSZssWfnQXynWvfmKs6MQAZt4OYHwn8Qz6CvSjtTOFJ2pA8gaPsLUd7/yhV4
O5GDnULByWMybcjk58OlmAxng814G1/ni8aUCGP0SQKBgQDYNe0bTNpCoSsJ1x8l
/OWdtvfm2H1GDiJP1oFdMTD+M/nuFlpeA37htDf8lOakGqZiGPnjK0bPurmcQyrt
pyBFE5lUV9NFl7f8FscfM8949qiqWQgykwBqj+jvhiaoH9mtJpjtFqKJRKgGNwrD
31aYdIJ2WaHXazCM+Rudi1bydwKBgQDJj/CvDviTyQPaGJNBcVojX4ZqPOySV92n
xh+VJKui4I+SURFETr13GBe2jqvMGl/097xFDx3FsEjjjQ5lFi8tuwBZWm+dVoUl
iK6IltRY9tAszikaTtjimcUTsklaDN2iGw+4SuOPA1/6zU0FsruwZr5USVULCHhi
ElP2kTVvXQKBgGjI6dr7SiRUm9kvCweMI3RmQor8jOow22w6F4Qk3Qu2AQDkkHNT
2mBkyWV+fLE3wT91v1XbmXv/kQksfFelUbxonT0FO31U5HQmTebPY1PKpz+32oM4
P1Fl4YyERaPhm8uREziEac2BGrW4Y10+lmdYwAm/svIGHweTi1C1QTRNAoGAQJrg
XFwCFOxjTa5+1IUOjTP7E2Y/tZBwPWxlhxpf4S71FcLiM/DBDcEtKJiGPD9f7lbR
g5kaw9iDJFx79q6rpI7Bx+IS0G2A88zhlGoz2egSRao2xnXrUoZTAsMse66QA3uF
CF8InThJtUvEmkT1n87uxnlSxtyKKXUScH+OjwkCgYA6defjA/pYSyS7LpkZCWvH
8di4U0LoN4i1BDteUAh7cl3Di+Je/8Wj6vgJKimZAE9eLCr39XDKWQHlS7qdF2GX
9tXynapIBMZ2hkeqt3iNgZ59rfCAOHdTH4EFPZ4hZ9cNxAV4NgjyeSEtifXiXOnV
PDx2fCBDnJxbZ8zNwKHWPw==
-----END PRIVATE KEY-----`;

const TLS_CERTIFICATE_PEM = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUQDgQtE3Ysu/xss1QWCiRyCGn5mcwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJYW5zLmxvY2FsMB4XDTI2MDIyNDAyMjAxOVoXDTI3MDIy
NDAyMjAxOVowFDESMBAGA1UEAwwJYW5zLmxvY2FsMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAqjvokEli3ffX4XgG9FtFq1e0HVNO7NWzu6ZViUtDJfGu
a4Lap2vBTF8xsTFdSmrjeqAVHTIo2PT+tmY1UJZZMKzaliu8wvzivZAb1AKx2dQ1
zXqPxI94esRQ9y3Doh9ddLfndB83dd0j/moc1z8TXOYCa9I0WovbuyIUlIUxmYVj
GeBLu1zuRzUqkLaIxbrv2iafeBQFpXV0swQ05blT1+Ssp6dTDXTCa21uUr0u60gh
Hs/3LWO1MKP90Q3LaCtipkSQmDK8QCd0Km0EOQl5VYczaSkB7XBQUb8P2nG3jg5I
b2ihM6uKkjjFf93pn/1cpGlO31XUWEHdigNV61quOwIDAQABo1MwUTAdBgNVHQ4E
FgQUEiZz18ZrqEh+LL2HH6lbcad6IbswHwYDVR0jBBgwFoAUEiZz18ZrqEh+LL2H
H6lbcad6IbswDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEABHl1
YWYnbc5FeYFU7GVtUb1dBAJ1PZpKqpI11ktyMaM59PlFyigJaGigoAqXAwtcxvm3
JY9TJ8NWY+SKLhf4Ips3Oxgrq1e4s+2EbfkpxlKRcUcKR7wu4es6jlkZCcjfD88h
5QkhW5eDtiW7IEIyaf4LhXHjpFSU5yYJtL2YEKPZPxz0NspmbxuZs9VGC1TK++x0
P/fvdQjMhfCp2Q7PGYuvzhhZxmyGOGLPHoiNt7uvnsANncIh+yy9/6OImt4C35QB
sLmuPil4t1kVTalqQ9KYKTbS40PZNPn9ozgOlXYH8OKVrU6Sq9i8VLs3SP1TP6GQ
aN36B0zgnnw0EvyhaQ==
-----END CERTIFICATE-----`;

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

function startAgentCardServer(): Promise<{
  server: HttpsServer;
  port: number;
}> {
  const server = createHttpsServer(
    {
      key: TLS_PRIVATE_KEY_PEM,
      cert: TLS_CERTIFICATE_PEM,
    },
    (_request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        response.statusCode = 500;
        response.end('Server address is unavailable.');
        return;
      }
      const payload = {
        ansName: DEMO_UID,
        endpoints: {
          a2a: { url: `https://${DEMO_NATIVE_ID}:${address.port}/a2a` },
          mcp: { url: `https://${DEMO_NATIVE_ID}:${address.port}/mcp` },
        },
      };
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(payload));
    },
  );

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_IPV4, () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind local HTTPS server.'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function startDnsTxtServer(
  agentCardUrl: string,
): Promise<{ socket: Socket; port: number }> {
  const socket = createSocket('udp4');
  socket.on('message', (message: Buffer, remote) => {
    const question = parseDnsQuestion(message);
    if (!question) {
      return;
    }
    const answers: string[] = [];
    if (
      question.name === `_ans.${DEMO_NATIVE_ID}` &&
      question.type === DNS_TYPE_TXT &&
      question.classCode === DNS_CLASS_IN
    ) {
      answers.push(`v=ans1; version=v1.0.0; url=${agentCardUrl}`);
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

function createTxtLookup(dnsPort: number): DnsTxtLookup {
  const resolver = new Resolver();
  resolver.setServers([`${LOOPBACK_IPV4}:${dnsPort}`]);
  return async (hostname: string): Promise<string[]> => {
    const rows = await resolver.resolveTxt(hostname);
    return rows.map(row => row.join(''));
  };
}

function createAgentCardFetcher(
  nativeId: string,
): (url: string) => Promise<unknown> {
  return async (url: string): Promise<unknown> => {
    const parsedUrl = new URL(url);
    const tlsHost =
      parsedUrl.hostname.toLowerCase() === nativeId
        ? LOOPBACK_IPV4
        : parsedUrl.hostname;
    return new Promise((resolve, reject) => {
      const request = httpsRequest(
        {
          method: 'GET',
          hostname: parsedUrl.hostname,
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          port: parsedUrl.port ? Number(parsedUrl.port) : 443,
          servername: parsedUrl.hostname,
          ca: TLS_CERTIFICATE_PEM,
          createConnection: options =>
            tlsConnect({
              ...options,
              host: tlsHost,
              servername: parsedUrl.hostname,
              ca: TLS_CERTIFICATE_PEM,
            }),
          headers: {
            accept: 'application/json',
          },
        },
        response => {
          const chunks: Buffer[] = [];
          response.on('data', chunk => {
            if (typeof chunk === 'string') {
              chunks.push(Buffer.from(chunk, 'utf8'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const statusCode = response.statusCode ?? 0;
            if (statusCode < 200 || statusCode >= 300) {
              reject(
                new Error(
                  `Agent card request failed with status ${statusCode}.`,
                ),
              );
              return;
            }
            const body = Buffer.concat(chunks).toString('utf8');
            try {
              resolve(JSON.parse(body) as unknown);
            } catch (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error('Agent card response was not valid JSON.'),
              );
            }
          });
        },
      );
      request.on('error', reject);
      request.end();
    });
  };
}

function closeDnsServer(socket: Socket): Promise<void> {
  return new Promise(resolve => {
    socket.close(() => {
      resolve();
    });
  });
}

function closeHttpsServer(server: HttpsServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const { server: agentCardServer, port: httpsPort } =
    await startAgentCardServer();
  const agentCardUrl = `https://${DEMO_NATIVE_ID}:${httpsPort}/agent-card.json`;
  const { socket: dnsSocket, port: dnsPort } =
    await startDnsTxtServer(agentCardUrl);

  try {
    const registry = new ResolverRegistry();
    registry.registerAdapter(
      new AnsDnsWebProfileResolver({
        dnsLookup: createTxtLookup(dnsPort),
        fetchJson: createAgentCardFetcher(DEMO_NATIVE_ID),
      }),
    );

    const profile = await registry.resolveUaidProfile(DEMO_UAID, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });
    if (!profile) {
      throw new Error('ANS profile resolver returned no profile.');
    }
    if (profile.error || profile.metadata?.resolved === false) {
      throw new Error(
        `ANS profile resolution failed: ${profile.error?.code ?? 'unknown error'}.`,
      );
    }

    const output = {
      uaid: DEMO_UAID,
      runtime: {
        dnsPort,
        httpsPort,
        nativeId: DEMO_NATIVE_ID,
        agentCardUrl,
      },
      resolvedProfile: profile,
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } finally {
    await Promise.all([
      closeDnsServer(dnsSocket),
      closeHttpsServer(agentCardServer),
    ]);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
