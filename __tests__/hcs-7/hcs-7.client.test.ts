import { PrivateKey, AccountId, Client } from '@hashgraph/sdk';
import { HCS7Client } from '../../src/hcs-7/sdk';
import { HCS7ConfigType } from '../../src/hcs-7/types';

const mockBuildCreateTx = jest.fn();
const mockBuildSubmitTx = jest.fn();

jest.mock('../../src/hcs-7/tx', () => ({
  buildHcs7CreateRegistryTx: (...args: unknown[]) => mockBuildCreateTx(...args),
  buildHcs7SubmitMessageTx: (...args: unknown[]) => mockBuildSubmitTx(...args),
}));

const mockMirrorNode = {
  getTopicMessages: jest.fn(),
} as const;

jest.mock('../../src/services/mirror-node', () => ({
  HederaMirrorNode: jest.fn().mockImplementation(() => mockMirrorNode),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/utils/logger', () => {
  const actual = jest.requireActual('../../src/utils/logger');
  return {
    ...actual,
    Logger: {
      getInstance: () => mockLogger,
    },
  };
});

const mockOperatorContext = {
  client: {} as Client,
  operatorId: AccountId.fromString('0.0.1001'),
  operatorKey: PrivateKey.generateED25519(),
  keyType: 'ed25519' as const,
  ensureInitialized: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/common/node-operator-resolver', () => ({
  createNodeOperatorContext: () => mockOperatorContext,
}));

describe('HCS7Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildCreateTx.mockReset();
    mockBuildSubmitTx.mockReset();
    mockMirrorNode.getTopicMessages.mockReset();
  });

  const createClient = (): HCS7Client =>
    new HCS7Client({
      operatorId: mockOperatorContext.operatorId,
      operatorKey: mockOperatorContext.operatorKey,
      network: 'testnet',
      logger: mockLogger as never,
    });

  const createTopicCreateTx = () => {
    const tx = {
      freezeWith: jest.fn(),
      execute: jest.fn(),
    };
    tx.freezeWith.mockResolvedValue(tx);
    tx.execute.mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        topicId: { toString: () => '0.0.5000' },
      }),
      transactionId: { toString: () => '0.0.5000@123' },
    });
    return tx;
  };

  const createMessageTx = () => {
    const tx = {
      freezeWith: jest.fn(),
      sign: jest.fn(),
      execute: jest.fn(),
    };
    tx.freezeWith.mockResolvedValue(tx);
    tx.sign.mockResolvedValue(tx);
    tx.execute.mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        topicSequenceNumber: { toNumber: () => 42 },
      }),
      transactionId: { toString: () => '0.0.6000@123' },
    });
    return tx;
  };

  it('creates registry topics with memo encoding and default ttl', async () => {
    const tx = createTopicCreateTx();
    mockBuildCreateTx.mockReturnValue(tx);
    const client = createClient();
    const res = await client.createRegistry({});
    expect(res.success).toBe(true);
    expect(res.topicId).toBe('0.0.5000');
    const params = mockBuildCreateTx.mock.calls[0]?.[0] as {
      ttl: number;
      submitKey?: unknown;
    };
    expect(params.ttl).toBe(86400);
    expect(params.submitKey).toBeUndefined();
  });

  it('rejects ttl below minimum and surfaces builder errors', async () => {
    const client = createClient();
    const lowTtl = await client.createRegistry({ ttl: 10 });
    expect(lowTtl.success).toBe(false);
    mockBuildCreateTx.mockImplementation(() => {
      throw new Error('boom');
    });
    const failed = await client.createRegistry({ ttl: 7200 });
    expect(failed.success).toBe(false);
  });

  it('registers EVM configs via submit helper', async () => {
    const tx = createMessageTx();
    mockBuildSubmitTx.mockReturnValue(tx);
    const client = createClient();

    const res = await client.registerConfig({
      registryTopicId: '0.0.5000',
      memo: 'minted',
      submitKey: mockOperatorContext.operatorKey,
      config: {
        type: HCS7ConfigType.EVM,
        contractAddress: '0x0000000000000000000000000000000000000001',
        abi: {
          name: 'minted',
          inputs: [],
          outputs: [{ name: 'minted', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      },
    });

    expect(res.success).toBe(true);
    expect(res.sequenceNumber).toBe(42);
    const args = mockBuildSubmitTx.mock.calls[0]?.[0] as {
      topicId: string;
      message: { op: string; t: string; c: Record<string, unknown> };
    };
    expect(args.topicId).toBe('0.0.5000');
    expect(args.message.op).toBe('register-config');
    expect(args.message.t).toBe('evm');
  });

  it('registers WASM configs and handles invalid payloads', async () => {
    const tx = createMessageTx();
    mockBuildSubmitTx.mockReturnValue(tx);
    const client = createClient();
    const wasmResult = await client.registerConfig({
      registryTopicId: '0.0.5000',
      memo: 'router',
      config: {
        type: HCS7ConfigType.WASM,
        wasmTopicId: '0.0.123',
        inputType: { stateData: { value: 'number' } },
        outputType: { type: 'string', format: 'topic-id' },
      },
    });
    expect(wasmResult.success).toBe(true);
    const args = mockBuildSubmitTx.mock.calls.at(-1)?.[0] as {
      message: { t: string };
    };
    expect(args.message.t).toBe('wasm');

    const clientWithInvalid = createClient();
    (clientWithInvalid as any).validateMessage = () => ({
      valid: false,
      errors: ['bad'],
    });
    const invalid = await clientWithInvalid.registerConfig({
      registryTopicId: '0.0.5000',
      memo: 'bad',
      config: {
        type: HCS7ConfigType.WASM,
        wasmTopicId: '0.0.999',
        inputType: { stateData: {} },
        outputType: { type: 'string', format: 'topic-id' },
      },
    });
    expect(invalid.success).toBe(false);
  });

  it('registers metadata entries with routing data', async () => {
    const tx = createMessageTx();
    mockBuildSubmitTx.mockReturnValue(tx);
    const client = createClient();

    const res = await client.registerMetadata({
      registryTopicId: '0.0.5000',
      metadataTopicId: '0.0.7000',
      memo: 'blue',
      weight: 1,
      tags: ['odd'],
    });

    expect(res.success).toBe(true);
    const args = mockBuildSubmitTx.mock.calls[0]?.[0] as {
      message: { op: string; t_id: string; d: { weight: number } };
    };
    expect(args.message.op).toBe('register');
    expect(args.message.t_id).toBe('0.0.7000');
    expect(args.message.d.weight).toBe(1);
  });

  it('registers metadata with submit key strings', async () => {
    const tx = createMessageTx();
    mockBuildSubmitTx.mockReturnValue(tx);
    const client = createClient();
    const res = await client.registerMetadata({
      registryTopicId: '0.0.5000',
      metadataTopicId: '0.0.7001',
      memo: 'purple',
      weight: 2,
      tags: ['even'],
      data: { weight: 2 },
      submitKey: PrivateKey.generateED25519().toString(),
    });
    expect(res.success).toBe(true);
  });

  it('fetches registry entries via base client helpers', async () => {
    const client = createClient();
    mockMirrorNode.getTopicMessages.mockResolvedValue([
      {
        p: 'hcs-7',
        op: 'register',
        t_id: '0.0.1',
        d: { weight: 1, tags: ['odd'] },
        m: 'entry',
        sequence_number: 1,
        consensus_timestamp: '123',
        payer: '0.0.2',
      },
      { p: 'hcs-6' },
    ]);
    const registry = await client.getRegistry('0.0.5000');
    expect(registry.entries).toHaveLength(1);
    mockMirrorNode.getTopicMessages.mockRejectedValue(new Error('mirror'));
    const empty = await client.getRegistry('0.0.5000');
    expect(empty.entries).toHaveLength(0);
  });
});
