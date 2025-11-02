import { SCSParser } from '../../src/utils/parsers/scs-parser';
import { proto } from '@hashgraph/proto';
import { Long } from '@hashgraph/sdk';

describe('SCSParser', () => {
  test('parseContractCall extracts function name and amount', () => {
    const body: proto.IContractCallTransactionBody = {
      contractID: { shardNum: 0, realmNum: 0, contractNum: 55 },
      gas: 123,
      amount: 1000,
      functionParameters: Buffer.from('a9059cbb', 'hex'),
    };
    const res = SCSParser.parseContractCall(body)!;
    expect(res.contractId).toBe('0.0.55');
    expect(res.gas).toBeGreaterThan(0);
    expect(res.amount).toBeGreaterThan(0);
    expect(res.functionName).toBe('transfer');
  });

  test('parseContractCreate handles fileID initcode and flags', () => {
    const body: proto.IContractCreateTransactionBody = {
      initialBalance: 1000,
      gas: 500,
      adminKey: { ed25519: Uint8Array.from([1]) },
      constructorParameters: Buffer.from('abcd', 'hex'),
      memo: 'm',
      autoRenewPeriod: { seconds: Long.fromValue(5) },
      stakedAccountId: { shardNum: 0, realmNum: 0, accountNum: 99 },
      declineReward: true,
      maxAutomaticTokenAssociations: 1,
      fileID: { shardNum: 0, realmNum: 0, fileNum: 1 },
    };
    const res = SCSParser.parseContractCreate(body)!;
    expect(res.gas).toBe('500');
    expect(res.adminKey).toContain('ED25519');
    expect(res.constructorParameters).toBe('abcd');
    expect(res.autoRenewPeriod).toBe('5');
    expect(res.stakedAccountId).toBe('0.0.99');
    expect(res.declineReward).toBe(true);
    expect(res.maxAutomaticTokenAssociations).toBe(1);
    expect(res.initcodeSource).toBe('fileID');
    expect(res.initcode).toBe('0.0.1');
  });

  test('parseContractCreate handles bytes initcode', () => {
    const body: proto.IContractCreateTransactionBody = {
      initcode: Buffer.from('01', 'hex'),
    };
    const res = SCSParser.parseContractCreate(body)!;
    expect(res.initcodeSource).toBe('bytes');
    expect(res.initcode).toBe('01');
  });

  test('parseContractUpdate covers memo variants and staking', () => {
    const body: proto.IContractUpdateTransactionBody = {
      contractID: { shardNum: 0, realmNum: 0, contractNum: 10 },
      memo: { value: 'hello' },
      stakedNodeId: Long.fromValue(2),
      declineReward: { value: false },
      autoRenewPeriod: { seconds: Long.fromValue(9) },
      maxAutomaticTokenAssociations: { value: 3 },
    };
    const res = SCSParser.parseContractUpdate(body)!;
    expect(res.contractIdToUpdate).toBe('0.0.10');
    expect(res.memo).toBe('hello');
    expect(res.stakedNodeId).toBe('2');
    expect(res.declineReward).toBe(false);
    expect(res.autoRenewPeriod).toBe('9');
    expect(res.maxAutomaticTokenAssociations).toBe(3);
  });

  test('parseContractDelete with transfer account and contract', () => {
    const withAccount: proto.IContractDeleteTransactionBody = {
      contractID: { shardNum: 0, realmNum: 0, contractNum: 1 },
      transferAccountID: { shardNum: 0, realmNum: 0, accountNum: 2 },
    };
    const a = SCSParser.parseContractDelete(withAccount)!;
    expect(a.contractIdToDelete).toBe('0.0.1');
    expect(a.transferAccountId).toBe('0.0.2');

    const withContract: proto.IContractDeleteTransactionBody = {
      contractID: { shardNum: 0, realmNum: 0, contractNum: 3 },
      transferContractID: { shardNum: 0, realmNum: 0, contractNum: 4 },
    };
    const c = SCSParser.parseContractDelete(withContract)!;
    expect(c.transferContractId).toBe('0.0.4');
  });

  test('parseEthereumTransaction sets selector-derived function name', () => {
    const body: proto.IEthereumTransactionBody = {
      maxGasAllowance: 42,
      ethereumData: Buffer.from('a9059cbb', 'hex'),
    };
    const res = SCSParser.parseEthereumTransaction(body)!;
    expect(res.gas).toBe(42);
    expect(res.functionName).toBe('transfer');
  });
});
