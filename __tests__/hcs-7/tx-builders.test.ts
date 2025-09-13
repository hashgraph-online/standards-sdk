import { buildHcs7SubmitMessageTx, buildHcs7EvmMessageTx, buildHcs7WasmMessageTx } from '../../src/hcs-7/tx';

jest.mock('../../src/common/tx/tx-utils', () => ({
  buildMessageTx: jest.fn(({ topicId, message, transactionMemo }) => ({
    _topicId: topicId,
    _message: message,
    _memo: transactionMemo,
  })),
}));

describe('HCS-7 tx builders', () => {
  const { buildMessageTx } = jest.requireMock('../../src/common/tx/tx-utils');

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
    expect(parsed.op).toBe('evm');
    expect(parsed.m).toBe('');
  });

  test('buildHcs7WasmMessageTx sets op=wasm and propagates memo', () => {
    const tx: any = buildHcs7WasmMessageTx({
      topicId: '0.0.300',
      config: { assemblyId: 'x', action: 'y', m: 'hi' } as any,
      transactionMemo: 'meta',
    });
    const parsed = JSON.parse(tx._message);
    expect(parsed.op).toBe('wasm');
    expect(parsed.m).toBe('hi');
    expect(tx._memo).toBe('meta');
  });
});

