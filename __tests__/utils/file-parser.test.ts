import { FileParser } from '../../src/utils/parsers/file-parser';
import { proto } from '@hashgraph/proto';
import { Long } from '@hashgraph/sdk';

describe('FileParser', () => {
  test('parseFileCreate encodes contents and keys', () => {
    const keys: proto.IKeyList = {
      keys: [{ ed25519: Uint8Array.from([1, 2]) }],
    };
    const body: proto.IFileCreateTransactionBody = {
      expirationTime: { seconds: Long.fromValue(100), nanos: 1 },
      keys,
      contents: Buffer.from('abc'),
      memo: 'm',
    };
    const res = FileParser.parseFileCreate(body)!;
    expect(res.expirationTime).toMatch(/^100\./);
    expect(res.keys).toContain('ED25519');
    expect(res.contents).toBe(Buffer.from('abc').toString('base64'));
    expect(res.memo).toBe('m');
  });

  test('parseFileAppend and parseFileUpdate', () => {
    const append: proto.IFileAppendTransactionBody = {
      fileID: { shardNum: 0, realmNum: 0, fileNum: 7 },
      contents: Buffer.from('data'),
    };
    const a = FileParser.parseFileAppend(append)!;
    expect(a.fileId).toBe('0.0.7');
    expect(a.contents).toBe(Buffer.from('data').toString('base64'));

    const update: proto.IFileUpdateTransactionBody = {
      fileID: { shardNum: 0, realmNum: 0, fileNum: 8 },
      expirationTime: { seconds: Long.fromValue(200), nanos: 0 },
      keys: { keys: [{ ECDSASecp256k1: Uint8Array.from([3]) }] },
      memo: { value: 'mm' },
      contents: Uint8Array.from([1, 2, 3]),
    };
    const u = FileParser.parseFileUpdate(update)!;
    expect(u.fileId).toBe('0.0.8');
    expect(u.expirationTime).toMatch(/^200\./);
    expect(u.keys).toContain('ECDSA_secp256k1');
    expect(u.memo).toBe('mm');
    expect(typeof u.contents).toBe('string');
  });

  test('parseFileDelete', () => {
    const body: proto.IFileDeleteTransactionBody = {
      fileID: { shardNum: 0, realmNum: 0, fileNum: 9 },
    };
    const d = FileParser.parseFileDelete(body)!;
    expect(d.fileId).toBe('0.0.9');
  });
});
