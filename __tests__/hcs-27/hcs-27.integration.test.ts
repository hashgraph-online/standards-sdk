import { createHash } from 'crypto';
import { HCS27Client } from '../../src/hcs-27';

const shouldRunIntegration =
  process.env.RUN_INTEGRATION === '1' &&
  process.env.RUN_HCS27_INTEGRATION === '1';

const describeBlock = shouldRunIntegration ? describe : describe.skip;

function rootHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

async function waitForCheckpoints(
  client: HCS27Client,
  topicId: string,
  minCount: number,
): Promise<Awaited<ReturnType<HCS27Client['getCheckpoints']>>> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const records = await client.getCheckpoints(topicId);
    if (records.length >= minCount) {
      return records;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(
    `Timed out waiting for ${minCount} checkpoints on ${topicId}`,
  );
}

describeBlock('HCS-27 Integration Tests', () => {
  const network = (process.env.HEDERA_NETWORK || 'testnet')
    .trim()
    .toLowerCase();
  const operatorId = process.env.HEDERA_ACCOUNT_ID?.trim() || '';
  const operatorKey = process.env.HEDERA_PRIVATE_KEY?.trim() || '';
  let client: HCS27Client;

  beforeAll(() => {
    if (!operatorId || !operatorKey) {
      throw new Error(
        'Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in the shell environment',
      );
    }

    if (
      network === 'mainnet' &&
      process.env.ALLOW_MAINNET_INTEGRATION !== '1'
    ) {
      throw new Error(
        'Resolved mainnet credentials; set ALLOW_MAINNET_INTEGRATION=1 to permit writes',
      );
    }

    client = new HCS27Client({
      operatorId,
      operatorKey,
      network: network === 'mainnet' ? 'mainnet' : 'testnet',
    });
  });

  it('publishes a linked checkpoint chain end to end on testnet', async () => {
    const topic = await client.createCheckpointTopic({
      ttl: 600,
      adminKey: true,
      submitKey: true,
    });

    await client.publishCheckpoint(
      topic.topicId,
      {
        type: 'ans-checkpoint-v1',
        stream: { registry: 'ans', log_id: 'default' },
        log: {
          alg: 'sha-256',
          leaf: 'sha256(jcs(event))',
          merkle: 'rfc9162',
        },
        root: {
          treeSize: '1',
          rootHashB64u: rootHash('ts-sdk-hcs27-root-1'),
        },
      },
      'ts-sdk checkpoint 1',
    );

    await client.publishCheckpoint(
      topic.topicId,
      {
        type: 'ans-checkpoint-v1',
        stream: { registry: 'ans', log_id: 'default' },
        log: {
          alg: 'sha-256',
          leaf: 'sha256(jcs(event))',
          merkle: 'rfc9162',
        },
        root: {
          treeSize: '2',
          rootHashB64u: rootHash('ts-sdk-hcs27-root-2'),
        },
        prev: {
          treeSize: '1',
          rootHashB64u: rootHash('ts-sdk-hcs27-root-1'),
        },
      },
      'ts-sdk checkpoint 2',
    );

    const checkpoints = await waitForCheckpoints(client, topic.topicId, 2);
    expect(checkpoints.length).toBeGreaterThanOrEqual(2);
    expect(() => client.validateCheckpointChain(checkpoints)).not.toThrow();
  }, 120000);

  it('uses HCS-1 overflow metadata pointers when payloads exceed 1024 bytes', async () => {
    const topic = await client.createCheckpointTopic({
      ttl: 600,
      adminKey: true,
      submitKey: true,
    });

    await client.publishCheckpoint(
      topic.topicId,
      {
        type: 'ans-checkpoint-v1',
        stream: { registry: 'ans', log_id: 'overflow' },
        log: {
          alg: 'sha-256',
          leaf: 'sha256(jcs(event))-'.repeat(90),
          merkle: 'rfc9162',
        },
        root: {
          treeSize: '1',
          rootHashB64u: rootHash('ts-sdk-hcs27-overflow-root'),
        },
      },
      'ts-sdk overflow checkpoint',
    );

    const checkpoints = await waitForCheckpoints(client, topic.topicId, 1);
    expect(checkpoints).toHaveLength(1);
    const message = checkpoints[0].message;
    expect(typeof message.metadata).toBe('string');
    expect(message.metadata).toMatch(/^hcs:\/\/1\/\d+\.\d+\.\d+$/);
    expect(message.metadata_digest).toBeDefined();
  }, 180000);
});
