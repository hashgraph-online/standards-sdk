import { HCSParser } from '../../src/utils/parsers/hcs-parser';
import { proto } from '@hashgraph/proto';
import { Long } from '@hashgraph/sdk';

describe('HCSParser', () => {
  test('parseConsensusCreateTopic with memo, keys and autoRenew', () => {
    const body: proto.IConsensusCreateTopicTransactionBody = {
      memo: 'hello',
      adminKey: { ed25519: Uint8Array.from([1, 2]) },
      submitKey: { ECDSASecp256k1: Uint8Array.from([3, 4]) },
      autoRenewPeriod: { seconds: Long.fromValue(777) },
      autoRenewAccount: { shardNum: 0, realmNum: 0, accountNum: 123 },
    };
    const res = HCSParser.parseConsensusCreateTopic(body)!;
    expect(res.memo).toBe('hello');
    expect(res.adminKey).toContain('ED25519');
    expect(res.submitKey).toContain('ECDSA_secp256k1');
    expect(res.autoRenewPeriod).toBe('777');
    expect(res.autoRenewAccountId).toBe('0.0.123');
  });

  test('parseConsensusSubmitMessage detects utf8 and base64', () => {
    const utf8Body: proto.IConsensusSubmitMessageTransactionBody = {
      topicID: { shardNum: 0, realmNum: 0, topicNum: 5 },
      message: Buffer.from('Hello'),
    };
    const utf8 = HCSParser.parseConsensusSubmitMessage(utf8Body)!;
    expect(utf8.topicId).toBe('0.0.5');
    expect(utf8.messageEncoding).toBe('utf8');
    expect(utf8.message).toBe('Hello');

    const binBody: proto.IConsensusSubmitMessageTransactionBody = {
      topicID: { shardNum: 0, realmNum: 0, topicNum: 7 },
      message: Uint8Array.from([0x00, 0xff, 0x01]),
    };
    const bin = HCSParser.parseConsensusSubmitMessage(binBody)!;
    expect(bin.topicId).toBe('0.0.7');
    expect(bin.messageEncoding).toBe('base64');
    expect(typeof bin.message).toBe('string');
  });

  test('parseConsensusUpdateTopic handles key clears and sets', () => {
    const body: proto.IConsensusUpdateTopicTransactionBody = {
      topicID: { shardNum: 0, realmNum: 0, topicNum: 9 },
      memo: { value: 'm' },
      adminKey: null,
      submitKey: { ed25519: Uint8Array.from([9]) },
      autoRenewPeriod: { seconds: Long.fromValue(5) },
      autoRenewAccount: { shardNum: 0, realmNum: 0, accountNum: 42 },
    };
    const res = HCSParser.parseConsensusUpdateTopic(body)!;
    expect(res.topicId).toBe('0.0.9');
    expect(res.memo).toBe('m');
    expect(res.clearAdminKey).toBe(true);
    expect(res.submitKey).toContain('ED25519');
    expect(res.autoRenewPeriod).toBe('5');
    expect(res.autoRenewAccountId).toBe('0.0.42');
  });

  test('parseConsensusDeleteTopic sets topicId', () => {
    const body: proto.IConsensusDeleteTopicTransactionBody = {
      topicID: { shardNum: 0, realmNum: 0, topicNum: 11 },
    };
    const res = HCSParser.parseConsensusDeleteTopic(body)!;
    expect(res.topicId).toBe('0.0.11');
  });
});
