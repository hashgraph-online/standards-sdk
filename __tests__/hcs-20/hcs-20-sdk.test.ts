import { beforeEach, describe, expect, it } from '@jest/globals';
import type {
  SDKHCS20ClientConfig,
  DeployPointsOptions,
  MintPointsOptions,
  TransferPointsOptions,
  BurnPointsOptions,
  RegisterTopicOptions,
} from '../../src/hcs-20/types';

type HCS20ClientConstructor = typeof import('../../src/hcs-20/sdk').HCS20Client;
type TransactionBuildersModule = typeof import('../../src/hcs-20/tx');

interface TransactionReceiptStub {
  status: string;
  topicId: { toString(): string };
}

interface TransactionResponseStub {
  getReceipt: jest.Mock<Promise<TransactionReceiptStub>, [unknown?]>;
  transactionId: { toString(): string };
}

class TopicMessageSubmitTransactionDouble {
  private readonly response: TransactionResponseStub;
  readonly freezeWith: jest.Mock<TopicMessageSubmitTransactionDouble, [unknown?]>;
  readonly sign: jest.Mock<Promise<TopicMessageSubmitTransactionDouble>, [unknown?]>;
  readonly execute: jest.Mock<Promise<TransactionResponseStub>, [unknown?]>;

  constructor(response: TransactionResponseStub) {
    this.response = response;
    this.freezeWith = jest.fn<TopicMessageSubmitTransactionDouble, [unknown?]>(
      () => this,
    );
    this.sign = jest.fn<Promise<TopicMessageSubmitTransactionDouble>, [unknown?]>(
      async () => this,
    );
    this.execute = jest.fn<Promise<TransactionResponseStub>, [unknown?]>(
      async () => this.response,
    );
  }
}

const createTransactionResponse = (): TransactionResponseStub => {
  const receipt: TransactionReceiptStub = {
    status: 'SUCCESS',
    topicId: { toString: () => '0.0.200' },
  };
  return {
    getReceipt: jest.fn<Promise<TransactionReceiptStub>, [unknown?]>(
      async () => receipt,
    ),
    transactionId: { toString: () => '0.0.tx' },
  };
};

const createTransactionStub = (): TopicMessageSubmitTransactionDouble =>
  new TopicMessageSubmitTransactionDouble(createTransactionResponse());

const setClientTopics = (
  target: InstanceType<HCS20ClientConstructor>,
): void => {
  const mutableTarget = target as Record<string, unknown>;
  mutableTarget.publicTopicId = '0.0.200';
  mutableTarget.registryTopicId = '0.0.registry';
};

type MintPointsOptionsWithTopic = MintPointsOptions & { topicId: string };
type TransferPointsOptionsWithTopic = TransferPointsOptions & { topicId: string };
type BurnPointsOptionsWithTopic = BurnPointsOptions & { topicId: string };

describe('HCS20Client transaction builders', () => {
  let HCS20Client: HCS20ClientConstructor;
  let mockedTx: jest.Mocked<TransactionBuildersModule>;
  let client: InstanceType<HCS20ClientConstructor>;

  beforeEach(async () => {
    jest.resetModules();

    jest.doMock('@hashgraph/sdk', () => {
      const TopicMessageSubmitTransaction = jest
        .fn<unknown, []>()
        .mockImplementation(() => createTransactionStub());

      const clientFactory = () => ({
        operatorAccountId: { toString: () => '0.0.500' },
        setOperator: () => undefined,
        close: () => undefined,
      });

      class TopicCreateTransactionMock {
        setTopicMemo(): this {
          return this;
        }

        async execute(): Promise<{
          getReceipt: () => Promise<TransactionReceiptStub>;
        }> {
          return {
            getReceipt: async () => ({
              status: 'SUCCESS',
              topicId: { toString: () => '0.0.topic' },
            }),
          };
        }
      }

      return {
        TopicMessageSubmitTransaction,
        Client: {
          forTestnet: clientFactory,
          forMainnet: clientFactory,
        },
        AccountId: {
          fromString: (value: string) => ({
            toString: () => value,
          }),
        },
        PrivateKey: {
          fromStringED25519: () => ({
            toString: () => 'priv-ed25519',
            publicKey: { toString: () => 'pub-ed25519' },
          }),
          fromStringECDSA: () => ({
            toString: () => 'priv-ecdsa',
            publicKey: { toString: () => 'pub-ecdsa' },
          }),
        },
        TopicCreateTransaction: TopicCreateTransactionMock,
        Status: { Success: 'SUCCESS' },
      };
    });

    jest.doMock('../../src/utils/logger', () => {
      class MockLogger {
        debug(): void {}
        info(): void {}
        warn(): void {}
        error(): void {}
        trace(): void {}
        setLogLevel(): void {}
        getLevel(): 'silent' {
          return 'silent';
        }
        setSilent(): void {}
        setModule(): void {}
      }

      class LoggerMock extends MockLogger {
        static getInstance(): MockLogger {
          return new MockLogger();
        }
      }

      return {
        Logger: LoggerMock,
      };
    });

    jest.doMock('../../src/common/node-operator-resolver', () => ({
      createNodeOperatorContext: () => ({
        client: {
          operatorAccountId: { toString: () => '0.0.500' },
        },
        operatorKey: {
          publicKey: { toString: () => 'mock-public-key' },
        },
        keyType: 'ed25519',
        ensureInitialized: async () => undefined,
      }),
      NodeOperatorResolver: class {},
    }));

    jest.doMock('../../src/hcs-2/client', () => ({
      HCS2Client: class {
        async createRegistry(): Promise<{ success: boolean; topicId: string }> {
          return {
            success: true,
            topicId: '0.0.private',
          };
        }
      },
    }));

    jest.doMock('../../src/services/mirror-node', () => ({
      HederaMirrorNode: class {
        async requestAccount(): Promise<{ key: { _type: string } }> {
          return { key: { _type: 'ED25519' } };
        }

        async getTopicMessages(): Promise<Array<{ consensus_timestamp: string }>> {
          return [{ consensus_timestamp: '123456.000000001' }];
        }
      },
    }));

    jest.doMock('../../src/hcs-20/tx', () => {
      const txModule = {
        buildHcs20DeployTx: jest.fn(() => createTransactionStub()),
        buildHcs20MintTx: jest.fn(() => createTransactionStub()),
        buildHcs20TransferTx: jest.fn(() => createTransactionStub()),
        buildHcs20BurnTx: jest.fn(() => createTransactionStub()),
        buildHcs20RegisterTx: jest.fn(() => createTransactionStub()),
      } satisfies TransactionBuildersModule;
      return txModule;
    });

    const sdkModule = await import('../../src/hcs-20/sdk');
    HCS20Client = sdkModule.HCS20Client;

    const txModule = await import('../../src/hcs-20/tx');
    if (!txModule || typeof txModule !== 'object') {
      throw new Error('Failed to load transaction module mock');
    }
    mockedTx = txModule as jest.Mocked<TransactionBuildersModule>;

    const config: SDKHCS20ClientConfig = {
      operatorId: '0.0.1111',
      operatorKey:
        '302e020100300506032b657004220420deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdead',
      network: 'testnet',
    };

    client = new HCS20Client(config);
    setClientTopics(client);
  });

  it('deployPoints uses builder parameters', async () => {
    const options: DeployPointsOptions = {
      name: 'Test Points',
      tick: 'TEST',
      maxSupply: '1000',
      limitPerMint: '100',
      metadata: 'meta',
      usePrivateTopic: false,
    };

    await client.deployPoints(options);

    expect(mockedTx.buildHcs20DeployTx).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: '0.0.200',
        name: 'Test Points',
        tick: 'TEST',
        max: '1000',
        lim: '100',
        metadata: 'meta',
      }),
    );
  });

  it('mintPoints proxies through buildHcs20MintTx', async () => {
    const options: MintPointsOptionsWithTopic = {
      tick: 'TEST',
      amount: '10',
      to: '0.0.500',
      memo: 'mint',
      topicId: '0.0.200',
    };

    await client.mintPoints(options);

    expect(mockedTx.buildHcs20MintTx).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: '0.0.200',
        tick: 'TEST',
        amt: '10',
        to: '0.0.500',
        memo: 'mint',
      }),
    );
  });

  it('transferPoints delegates to buildHcs20TransferTx', async () => {
    const options: TransferPointsOptionsWithTopic = {
      tick: 'TEST',
      amount: '5',
      from: '0.0.1111',
      to: '0.0.2222',
      memo: 'transfer',
      topicId: '0.0.200',
    };

    await client.transferPoints(options);

    expect(mockedTx.buildHcs20TransferTx).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: '0.0.200',
        tick: 'TEST',
        amt: '5',
        from: '0.0.1111',
        to: '0.0.2222',
        memo: 'transfer',
      }),
    );
  });

  it('burnPoints uses buildHcs20BurnTx', async () => {
    const options: BurnPointsOptionsWithTopic = {
      tick: 'TEST',
      amount: '2',
      from: '0.0.1111',
      memo: 'burn',
      topicId: '0.0.200',
    };

    await client.burnPoints(options);

    expect(mockedTx.buildHcs20BurnTx).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: '0.0.200',
        tick: 'TEST',
        amt: '2',
        from: '0.0.1111',
        memo: 'burn',
      }),
    );
  });

  it('registerTopic pipes through buildHcs20RegisterTx', async () => {
    const options: RegisterTopicOptions = {
      name: 'Test Points',
      topicId: '0.0.200',
      metadata: 'meta',
      isPrivate: true,
      memo: 'register',
    };

    await client.registerTopic(options);

    expect(mockedTx.buildHcs20RegisterTx).toHaveBeenCalledWith(
      expect.objectContaining({
        registryTopicId: '0.0.registry',
        name: 'Test Points',
        topicId: '0.0.200',
        isPrivate: true,
        metadata: 'meta',
        memo: 'register',
      }),
    );
  });
});
