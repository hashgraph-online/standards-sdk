import { HCS2Client } from '../../src/hcs-2/client';

jest.mock('@hashgraph/sdk', () => {
  const PrivateKey = {
    fromStringECDSA: (s: string) => ({ toString: () => s, publicKey: { toString: () => 'pk-ecdsa' } }),
    fromStringED25519: (s: string) => ({ toString: () => s, publicKey: { toString: () => 'pk-ed25519' } }),
  } as any;
  return {
    Client: { forTestnet: jest.fn(() => ({ setOperator: jest.fn() })), forMainnet: jest.fn(() => ({ setOperator: jest.fn() })) },
    AccountId: { fromString: (s: string) => ({ toString: () => s }) },
    PublicKey: {
      fromString: (s: string) => ({ toString: () => s }),
      fromBytesED25519: (b: Buffer) => ({ toString: () => b.toString('hex') }),
      fromBytesECDSA: (b: Buffer) => ({ toString: () => b.toString('hex') }),
    },
    PrivateKey,
  };
});

jest.mock('../../src/common/tx/tx-utils', () => ({
  buildMessageTx: jest.fn(({ topicId, message }) => ({
    execute: async () => ({ getReceipt: async () => ({ topicId: { toString: () => topicId }, topicSequenceNumber: { low: 7 } }) }),
  })),
}));

jest.mock('../../src/hcs-2/tx', () => ({
  buildHcs2CreateRegistryTx: jest.fn(({ ttl }) => ({
    freezeWith: async () => ({
      execute: async () => ({
        transactionId: { toString: () => 'tx@0.0' },
        getReceipt: async () => ({ topicId: { toString: () => `0.0.${ttl}` } }),
      }),
    }),
  })),
}));

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => ({
    getTopicInfo: jest.fn(async (topicId: string) => ({ memo: topicId.endsWith('i') ? 'hcs-2:1:3600' : 'hcs-2:0:3600' })),
    getTopicMessages: jest.fn(async () => [
      { op: 'register', t_id: '0.0.9', sequence_number: 1, consensus_timestamp: '1', payer: '0.0.2' },
    ]),
  })),
}));

describe('HCS2Client (unit)', () => {
  const base = { network: 'testnet' as const, operatorId: '0.0.3', operatorKey: 'priv' };

  test('createRegistry returns topicId and tx id', async () => {
    const c = new HCS2Client(base as any);
    const res = await c.createRegistry({ ttl: 3601 });
    expect(res.success).toBe(true);
    expect(res.topicId).toBe('0.0.3601');
    expect(res.transactionId).toBe('tx@0.0');
  });

  test('registerEntry returns sequenceNumber from receipt', async () => {
    const c = new HCS2Client(base as any);
    const res = await c.registerEntry('0.0.1', { targetTopicId: '0.0.2' });
    expect(res.success).toBe(true);
    expect(res.sequenceNumber).toBe(7);
  });

  test('getRegistry parses memo and returns entries', async () => {
    const c = new HCS2Client(base as any);
    const reg = await c.getRegistry('0.0.1');
    expect(reg.registryType).toBe(0);
    expect(reg.entries.length).toBe(1);
  });
});
