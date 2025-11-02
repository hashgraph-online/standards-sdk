import { CryptoParser } from '../../src/utils/parsers/crypto-parser';
import { proto } from '@hashgraph/proto';
import { Long } from '@hashgraph/sdk';
import type {
  AccountAmount,
  TokenAmount,
} from '../../src/utils/transaction-parser-types';

describe('CryptoParser', () => {
  test('parseCryptoCreateAccount full shape', () => {
    const body: proto.ICryptoCreateTransactionBody = {
      initialBalance: 1000,
      key: { ed25519: Uint8Array.from([1, 2, 3]) },
      receiverSigRequired: true,
      autoRenewPeriod: { seconds: Long.fromValue(33) },
      memo: 'm',
      maxAutomaticTokenAssociations: 2,
      stakedAccountId: { shardNum: 0, realmNum: 0, accountNum: 77 },
      declineReward: false,
      alias: Uint8Array.from([0xde, 0xad]),
    };
    const res = CryptoParser.parseCryptoCreateAccount(body)!;
    expect(res.initialBalance).toBeDefined();
    expect(res.key).toContain('ED25519');
    expect(res.receiverSigRequired).toBe(true);
    expect(res.autoRenewPeriod).toBe('33');
    expect(res.memo).toBe('m');
    expect(res.maxAutomaticTokenAssociations).toBe(2);
    expect(res.stakedAccountId).toBe('0.0.77');
    expect(res.declineReward).toBe(false);
    expect(res.alias).toBe('dead');
  });

  test('parseCryptoUpdateAccount branches and booleans', () => {
    const body: proto.ICryptoUpdateTransactionBody = {
      accountIDToUpdate: { shardNum: 0, realmNum: 0, accountNum: 1 },
      key: { ECDSASecp256k1: Uint8Array.from([9]) },
      expirationTime: { seconds: Long.fromValue(5), nanos: 1 },
      receiverSigRequired: true,
      autoRenewPeriod: { seconds: Long.fromValue(8) },
      memo: { value: 'mm' },
      maxAutomaticTokenAssociations: { value: 3 },
      declineReward: { value: true },
      stakedNodeId: Long.fromValue(10),
    };
    const res = CryptoParser.parseCryptoUpdateAccount(body)!;
    expect(res.accountIdToUpdate).toBe('0.0.1');
    expect(res.key).toContain('ECDSA_secp256k1');
    expect(res.expirationTime).toContain('.');
    expect(res.receiverSigRequired).toBe(true);
    expect(res.autoRenewPeriod).toBe('8');
    expect(res.memo).toBe('mm');
    expect(res.maxAutomaticTokenAssociations).toBe(3);
    expect(res.declineReward).toBe(true);
    expect(res.stakedNodeId).toBe('10');
  });

  test('parseCryptoDelete', () => {
    const body: proto.ICryptoDeleteTransactionBody = {
      deleteAccountID: { shardNum: 0, realmNum: 0, accountNum: 2 },
      transferAccountID: { shardNum: 0, realmNum: 0, accountNum: 3 },
    };
    const res = CryptoParser.parseCryptoDelete(body)!;
    expect(res.deleteAccountId).toBe('0.0.2');
    expect(res.transferAccountId).toBe('0.0.3');
  });

  test('parseCryptoApproveAllowance for hbar/token/nft', () => {
    const body: proto.ICryptoApproveAllowanceTransactionBody = {
      cryptoAllowances: [
        {
          owner: { shardNum: 0, realmNum: 0, accountNum: 1 },
          spender: { shardNum: 0, realmNum: 0, accountNum: 2 },
          amount: 1000,
        },
      ],
      tokenAllowances: [
        {
          tokenId: { shardNum: 0, realmNum: 0, tokenNum: 9 },
          owner: { shardNum: 0, realmNum: 0, accountNum: 1 },
          spender: { shardNum: 0, realmNum: 0, accountNum: 2 },
          amount: 5,
        },
      ],
      nftAllowances: [
        {
          tokenId: { shardNum: 0, realmNum: 0, tokenNum: 9 },
          owner: { shardNum: 0, realmNum: 0, accountNum: 1 },
          spender: { shardNum: 0, realmNum: 0, accountNum: 2 },
          serialNumbers: [Long.fromValue(1), Long.fromValue(2)],
          approvedForAll: { value: true },
          delegatingSpender: { shardNum: 0, realmNum: 0, accountNum: 5 },
        },
      ],
    };
    const res = CryptoParser.parseCryptoApproveAllowance(body)!;
    expect(res.hbarAllowances?.length).toBe(1);
    expect(res.tokenAllowances?.[0].tokenId).toBe('0.0.9');
    expect(res.nftAllowances?.[0].serialNumbers).toEqual(['1', '2']);
    expect(res.nftAllowances?.[0].delegatingSpender).toBe('0.0.5');
    expect(res.nftAllowances?.[0].approvedForAll).toBe(true);
  });

  test('parseCryptoDeleteAllowance', () => {
    const body: proto.ICryptoDeleteAllowanceTransactionBody = {
      nftAllowances: [
        {
          owner: { shardNum: 0, realmNum: 0, accountNum: 7 },
          tokenId: { shardNum: 0, realmNum: 0, tokenNum: 9 },
          serialNumbers: [Long.fromValue(5)],
        },
      ],
    };
    const res = CryptoParser.parseCryptoDeleteAllowance(body)!;
    expect(res.nftAllowancesToRemove?.[0].ownerAccountId).toBe('0.0.7');
    expect(res.nftAllowancesToRemove?.[0].serialNumbers).toEqual(['5']);
  });

  test('parseCryptoTransfers populates hbar and token', () => {
    const result: {
      transfers: AccountAmount[];
      tokenTransfers: TokenAmount[];
    } = {
      transfers: [],
      tokenTransfers: [],
    };
    CryptoParser.parseCryptoTransfers(
      {
        transfers: {
          accountAmounts: [
            {
              accountID: { shardNum: 0, realmNum: 0, accountNum: 1 },
              amount: -100,
            },
            {
              accountID: { shardNum: 0, realmNum: 0, accountNum: 2 },
              amount: 100,
            },
          ],
        },
        tokenTransfers: [
          {
            token: { shardNum: 0, realmNum: 0, tokenNum: 9 },
            transfers: [
              {
                accountID: { shardNum: 0, realmNum: 0, accountNum: 1 },
                amount: -5,
              },
              {
                accountID: { shardNum: 0, realmNum: 0, accountNum: 2 },
                amount: 5,
              },
            ],
          },
        ],
      },
      result,
    );
    expect(result.transfers.length).toBe(2);
    expect(result.tokenTransfers.length).toBe(2);
  });
});
