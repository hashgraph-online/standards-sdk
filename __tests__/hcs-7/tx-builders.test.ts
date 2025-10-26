import {
  buildHcs7SubmitMessageTx,
  buildHcs7EvmMessageTx,
  buildHcs7WasmMessageTx,
  buildHcs7CreateRegistryTx,
} from '../../src/hcs-7/tx';
import { PrivateKey } from '@hashgraph/sdk';

interface MockMessageTx {
  _topicId: string;
  _message: string;
  _memo?: string;
}

interface MockTopicTx {
  _memo: string;
  _submitKey?: unknown;
  _adminKey?: unknown;
  _operatorKey?: unknown;
}

const isMockTopicTx = (value: unknown): value is MockTopicTx =>
  typeof value === 'object' && value !== null && '_memo' in value;

jest.mock('../../src/common/tx/tx-utils', () => ({
  buildMessageTx: jest.fn(
    ({
      topicId,
      message,
      transactionMemo,
    }: {
      topicId: string;
      message: string;
      transactionMemo?: string;
    }) =>
      ({
        _topicId: topicId,
        _message: message,
        _memo: transactionMemo,
      }) satisfies MockMessageTx,
  ),
  buildTopicCreateTx: jest.fn(
    (params: {
      memo: string;
      submitKey?: unknown;
      adminKey?: unknown;
      operatorPublicKey?: unknown;
    }) =>
      ({
        _memo: params.memo,
        _submitKey: params.submitKey,
        _adminKey: params.adminKey,
        _operatorKey: params.operatorPublicKey,
      }) satisfies MockTopicTx,
  ),
}));

describe('HCS-7 tx builders', () => {
  const { buildMessageTx, buildTopicCreateTx } = jest.requireMock(
    '../../src/common/tx/tx-utils',
  );

  test('buildHcs7CreateRegistryTx encodes memo and forwards keys', () => {
    const fakeKey = PrivateKey.generateED25519().publicKey;
    buildHcs7CreateRegistryTx({
      ttl: 7200,
      submitKey: '0xabc',
      adminKey: '0xdef',
      operatorPublicKey: fakeKey,
    });
    expect(buildTopicCreateTx).toHaveBeenCalledWith({
      memo: 'hcs-7:indexed:7200',
      submitKey: '0xabc',
      adminKey: '0xdef',
      operatorPublicKey: fakeKey,
    });
    const result = buildTopicCreateTx.mock.results.at(-1)?.value;
    expect(isMockTopicTx(result) ? result._memo : undefined).toBe(
      'hcs-7:indexed:7200',
    );
  });

  test('buildHcs7SubmitMessageTx wraps base payload', () => {
    const tx: any = buildHcs7SubmitMessageTx({
      topicId: '0.0.100',
      message: { op: 'test', any: 'field' } as any,
      transactionMemo: 'memo',
    });
    expect(buildMessageTx).toHaveBeenCalled();
    expect(tx._topicId).toBe('0.0.100');
    const parsed = JSON.parse(tx._message);
    expect(parsed.p).toBe('hcs-7');
    expect(parsed.op).toBe('test');
    expect(tx._memo).toBe('memo');
  });

  test('buildHcs7EvmMessageTx sets op=evm and default memo', () => {
    const tx: any = buildHcs7EvmMessageTx({
      topicId: '0.0.200',
      config: { chainId: 295, to: '0xabc', data: '0x', gas: '1' } as any,
    });
    const parsed = JSON.parse(tx._message);
    expect(parsed.p).toBe('hcs-7');
    expect(parsed.op).toBe('register-config');
    expect(parsed.t).toBe('evm');
    expect(parsed.m).toBe('');
  });

  test('buildHcs7WasmMessageTx sets op=wasm and propagates memo', () => {
    const tx: any = buildHcs7WasmMessageTx({
      topicId: '0.0.300',
      config: { assemblyId: 'x', action: 'y', memo: 'hi' } as any,
      transactionMemo: 'meta',
    });
    const parsed = JSON.parse(tx._message);
    expect(parsed.op).toBe('register-config');
    expect(parsed.t).toBe('wasm');
    expect(parsed.m).toBe('hi');
    expect(tx._memo).toBe('meta');
  });
});
