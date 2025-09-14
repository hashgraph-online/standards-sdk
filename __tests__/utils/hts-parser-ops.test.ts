import { HTSParser } from '../../src/utils/parsers/hts-parser';
import type { proto } from '@hashgraph/proto';

describe('HTSParser - additional token ops', () => {
  const mkTxn = (body: Partial<proto.ITransactionBody>) =>
    ({ _transactionBody: body } as any);

  test('freeze and unfreeze', () => {
    const freeze = HTSParser.parseHTSTransaction(
      mkTxn({ tokenFreeze: { token: { shardNum: 0, realmNum: 0, tokenNum: 1 }, account: { shardNum: 0, realmNum: 0, accountNum: 2 } } as any }),
    );
    expect(freeze.type).toBe('TOKENFREEZE');
    expect(freeze.tokenFreeze).toMatchObject({ tokenId: '0.0.1', accountId: '0.0.2' });

    const unfreeze = HTSParser.parseHTSTransaction(
      mkTxn({ tokenUnfreeze: { token: { shardNum: 0, realmNum: 0, tokenNum: 3 }, account: { shardNum: 0, realmNum: 0, accountNum: 4 } } as any }),
    );
    expect(unfreeze.type).toBe('TOKENUNFREEZE');
    expect(unfreeze.tokenUnfreeze).toMatchObject({ tokenId: '0.0.3', accountId: '0.0.4' });
  });

  test('grant and revoke kyc', () => {
    const grant = HTSParser.parseHTSTransaction(
      mkTxn({ tokenGrantKyc: { token: { shardNum: 0, realmNum: 0, tokenNum: 5 }, account: { shardNum: 0, realmNum: 0, accountNum: 6 } } as any }),
    );
    expect(grant.type).toBe('TOKENGRANTKYC');

    const revoke = HTSParser.parseHTSTransaction(
      mkTxn({ tokenRevokeKyc: { token: { shardNum: 0, realmNum: 0, tokenNum: 7 }, account: { shardNum: 0, realmNum: 0, accountNum: 8 } } as any }),
    );
    expect(revoke.type).toBe('TOKENREVOKEKYC');
  });

  test('pause and unpause', () => {
    const pause = HTSParser.parseHTSTransaction(
      mkTxn({ tokenPause: { token: { shardNum: 0, realmNum: 0, tokenNum: 9 } } as any }),
    );
    expect(pause.type).toBe('TOKENPAUSE');
    expect(pause.tokenPause).toMatchObject({ tokenId: '0.0.9' });

    const unpause = HTSParser.parseHTSTransaction(
      mkTxn({ tokenUnpause: { token: { shardNum: 0, realmNum: 0, tokenNum: 10 } } as any }),
    );
    expect(unpause.type).toBe('TOKENUNPAUSE');
    expect(unpause.tokenUnpause).toMatchObject({ tokenId: '0.0.10' });
  });

  test('wipe and delete', () => {
    const wipe = HTSParser.parseHTSTransaction(
      mkTxn({ tokenWipe: { token: { shardNum: 0, realmNum: 0, tokenNum: 11 }, account: { shardNum: 0, realmNum: 0, accountNum: 12 }, serialNumbers: [1,2], amount: 0 } as any }),
    );
    expect(wipe.type).toBe('TOKENWIPEACCOUNT');
    expect(wipe.tokenWipeAccount).toMatchObject({ tokenId: '0.0.11', accountId: '0.0.12', serialNumbers: ['1','2'] });

    const deletion = HTSParser.parseHTSTransaction(
      mkTxn({ tokenDeletion: { token: { shardNum: 0, realmNum: 0, tokenNum: 13 } } as any }),
    );
    expect(deletion.type).toBe('TOKENDELETE');
    expect(deletion.tokenDelete).toMatchObject({ tokenId: '0.0.13' });
  });
});

