import { HTSParser } from '../../src/utils/parsers/hts-parser';
import type { Transaction } from '@hashgraph/sdk';

describe('HTSParser branches', () => {
  test('freeze/unfreeze/grantKyc/revokeKyc/pause/unpause/delete', () => {
    expect(
      HTSParser.parseTokenFreeze({ token: { shardNum: 0, realmNum: 0, tokenNum: 1 }, account: { shardNum: 0, realmNum: 0, accountNum: 2 } })?.tokenId,
    ).toBe('0.0.1');
    expect(
      HTSParser.parseTokenUnfreeze({ token: { shardNum: 0, realmNum: 0, tokenNum: 1 }, account: { shardNum: 0, realmNum: 0, accountNum: 2 } })?.accountId,
    ).toBe('0.0.2');
    expect(
      HTSParser.parseTokenGrantKyc({ token: { shardNum: 0, realmNum: 0, tokenNum: 3 }, account: { shardNum: 0, realmNum: 0, accountNum: 4 } })?.tokenId,
    ).toBe('0.0.3');
    expect(
      HTSParser.parseTokenRevokeKyc({ token: { shardNum: 0, realmNum: 0, tokenNum: 3 }, account: { shardNum: 0, realmNum: 0, accountNum: 4 } })?.accountId,
    ).toBe('0.0.4');
    expect(
      HTSParser.parseTokenPause({ token: { shardNum: 0, realmNum: 0, tokenNum: 5 } })?.tokenId,
    ).toBe('0.0.5');
    expect(
      HTSParser.parseTokenUnpause({ token: { shardNum: 0, realmNum: 0, tokenNum: 6 } })?.tokenId,
    ).toBe('0.0.6');
    expect(
      HTSParser.parseTokenDelete({ token: { shardNum: 0, realmNum: 0, tokenNum: 7 } })?.tokenId,
    ).toBe('0.0.7');
  });

  test('mint metadata and burn serialNumbers branches', () => {
    const m = HTSParser.parseTokenMint({ token: { shardNum: 0, realmNum: 0, tokenNum: 9 }, amount: 1, metadata: [new Uint8Array([1,2,3])] });
    expect(m?.metadata?.[0]).toBe(Buffer.from([1,2,3]).toString('base64'));

    const b = HTSParser.parseTokenBurn({ token: { shardNum: 0, realmNum: 0, tokenNum: 9 }, amount: 0, serialNumbers: [1,2] });
    expect(b?.serialNumbers).toEqual([1,2]);
  });

  test('extractTokenCreationFromTransaction internal fields', () => {
    const fakeTx = {
      _tokenName: 'T',
      _tokenSymbol: 'TOK',
      _initialSupply: 100,
      _decimals: 2,
      _treasuryAccountId: { toString: () => '0.0.100' },
      _maxSupply: 1000,
      _tokenType: 'FUNGIBLE_COMMON',
      _supplyType: 'FINITE',
      _tokenMemo: 'memo',
      _adminKey: { toString: () => 'k1' },
      _kycKey: { toString: () => 'k2' },
      _freezeKey: { toString: () => 'k3' },
      _wipeKey: { toString: () => 'k4' },
      _supplyKey: { toString: () => 'k5' },
      _feeScheduleKey: { toString: () => 'k6' },
      _pauseKey: { toString: () => 'k7' },
      _metadataKey: { toString: () => 'k8' },
      _autoRenewAccountId: { toString: () => '0.0.200' },
      _autoRenewPeriod: { toString: () => '10' },
      _expirationTime: { toString: () => '20' },
      _customFees: [
        { fixedFee: { amount: 1, denominatingTokenId: { toString: () => '0.0.9' } }, allCollectorsAreExempt: true, feeCollectorAccountId: { toString: () => '0.0.5' } },
      ],
    } as unknown as Transaction;

    const r = HTSParser.extractTokenCreationFromTransaction(fakeTx)!;
    expect(r.tokenName).toBe('T');
    expect(r.tokenSymbol).toBe('TOK');
    expect(r.treasuryAccountId).toBe('0.0.100');
    expect(r.maxSupply).toBe('1000');
    expect(r.memo).toBe('memo');
    expect(r.autoRenewAccount).toBe('0.0.200');
    expect(r.autoRenewPeriod).toBe('10');
    expect(r.expiry).toBe('20');
    expect(r.customFees?.[0].feeType).toBe('FIXED_FEE');
  });

  test('extractTokenAirdropFromTransaction internal list', () => {
    const fakeTx = {
      _tokenAirdrops: [
        {
          tokenId: { toString: () => '0.0.9' },
          transfers: [
            { accountId: { toString: () => '0.0.1' }, amount: { toString: () => '5' }, serialNumbers: [{ toString: () => '1' }] },
          ],
        },
      ],
    } as unknown as Transaction;
    const out = HTSParser.extractTokenAirdropFromTransaction(fakeTx);
    expect(out?.tokenTransfers[0].tokenId).toBe('0.0.9');
    expect(out?.tokenTransfers[0].transfers[0].serialNumbers).toEqual(['1']);
  });

  test('parseFromTransactionObject maps tokenDeletion path from _transactionBody', () => {
    const fakeTx = {
      _transactionBody: {
        tokenDeletion: { token: { shardNum: 0, realmNum: 0, tokenNum: 1 } },
      },
    } as unknown as Transaction;
    const r = HTSParser.parseFromTransactionObject(fakeTx);
    expect((r as any).tokenDelete.tokenId).toBe('0.0.1');
  });
});

