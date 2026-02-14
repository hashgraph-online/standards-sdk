import {
  buildHcs26TopicMemo,
  buildHcs26TransactionMemo,
  parseHcs26TopicMemo,
  parseHcs26TransactionMemo,
} from '../../src/hcs-26/memos';
import {
  hcs26DiscoveryDeleteSchema,
  hcs26DiscoveryRegisterSchema,
  hcs26DiscoveryRegisterLegacySchema,
  hcs26DiscoveryUpdateSchema,
  hcs26DiscoveryUpdateLegacySchema,
  hcs26VersionDeleteSchema,
  hcs26VersionRegisterSchema,
  hcs26VersionRegisterLegacySchema,
  hcs26VersionUpdateSchema,
} from '../../src/hcs-26/types';

describe('HCS-26 memos', () => {
  test('builds and parses topic memos', () => {
    expect(buildHcs26TopicMemo({ topicType: 0 })).toBe('hcs-26:0:86400:0');
    expect(buildHcs26TopicMemo({ topicType: 1, ttlSeconds: 60 })).toBe(
      'hcs-26:0:60:1',
    );
    expect(buildHcs26TopicMemo({ topicType: 2, indexed: false })).toBe(
      'hcs-26:1:86400:2',
    );

    expect(parseHcs26TopicMemo('hcs-26:0:86400:0')).toEqual({
      protocol: 'hcs-26',
      indexed: true,
      ttlSeconds: 86400,
      topicType: 0,
    });
    expect(parseHcs26TopicMemo('hcs-26:1:10:2')?.indexed).toBe(false);
    expect(parseHcs26TopicMemo('nope')).toBeNull();
  });

  test('builds and parses transaction memos', () => {
    expect(buildHcs26TransactionMemo({ operation: 0, topicType: 0 })).toBe(
      'hcs-26:op:0:0',
    );
    expect(buildHcs26TransactionMemo({ operation: 2, topicType: 1 })).toBe(
      'hcs-26:op:2:1',
    );

    expect(parseHcs26TransactionMemo('hcs-26:op:0:0')).toEqual({
      protocol: 'hcs-26',
      operation: 0,
      topicType: 0,
    });
    expect(parseHcs26TransactionMemo('hcs-26:op:3:2')?.topicType).toBe(2);
    expect(parseHcs26TransactionMemo('hcs-26:op:99:2')).toBeNull();
  });
});

describe('HCS-26 schemas', () => {
  test('accepts discovery register/update/delete examples', () => {
    expect(
      hcs26DiscoveryRegisterSchema.parse({
        p: 'hcs-26',
        op: 'register',
        t_id: '0.0.123456',
        account_id: '0.0.78910',
        metadata: {
          name: 'PDF Processing',
          description: 'Extract and clean PDF text',
          author: 'Example Labs',
          license: 'Apache-2.0',
          tags: [60101, 60201, 90101],
          languages: ['python'],
          homepage: 'https://example.com/skills/pdf-processing',
        },
        m: 'optional memo',
      }).op,
    ).toBe('register');

    expect(
      hcs26DiscoveryUpdateSchema.parse({
        p: 'hcs-26',
        op: 'update',
        uid: '42',
        account_id: '0.0.78910',
        metadata: {
          name: 'PDF Processing',
          description: 'Extract and clean PDF text',
          author: 'Example Labs',
          license: 'Apache-2.0',
          tags: [1403, 60101, 60201, 90101],
        },
        m: 'update tags',
      }).uid,
    ).toBe('42');

    expect(
      hcs26DiscoveryRegisterLegacySchema.parse({
        p: 'hcs-26',
        op: 'register',
        version_registry: '0.0.123456',
        publisher: '0.0.78910',
        metadata: {
          name: 'PDF Processing',
          description: 'Extract and clean PDF text',
          author: 'Example Labs',
          license: 'Apache-2.0',
          tags: [60101, 60201, 90101],
          languages: ['python'],
          homepage: 'https://example.com/skills/pdf-processing',
        },
        m: 'optional memo',
      }).op,
    ).toBe('register');

    expect(
      hcs26DiscoveryUpdateLegacySchema.parse({
        p: 'hcs-26',
        op: 'update',
        uid: '42',
        publisher: '0.0.78910',
        metadata: {
          tags: [1403, 60101, 60201, 90101],
        },
        m: 'update tags',
      }).uid,
    ).toBe('42');

    expect(
      hcs26DiscoveryDeleteSchema.parse({
        p: 'hcs-26',
        op: 'delete',
        uid: '42',
        m: 'remove skill',
      }).op,
    ).toBe('delete');
  });

  test('accepts version register/update/delete examples', () => {
    expect(
      hcs26VersionRegisterSchema.parse({
        p: 'hcs-26',
        op: 'register',
        skill_uid: 42,
        version: '1.0.0',
        t_id: '0.0.33333',
        checksum:
          'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'active',
        m: 'initial release',
      }).version,
    ).toBe('1.0.0');

    expect(
      hcs26VersionRegisterLegacySchema.parse({
        p: 'hcs-26',
        op: 'register',
        skill_uid: 42,
        version: '1.0.0',
        manifest_hcs1: 'hcs://1/0.0.33333',
        checksum:
          'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'active',
        m: 'initial release',
      }).version,
    ).toBe('1.0.0');

    expect(
      hcs26VersionUpdateSchema.parse({
        p: 'hcs-26',
        op: 'update',
        uid: '7',
        status: 'deprecated',
        m: 'superseded by 1.1.0',
      }).status,
    ).toBe('deprecated');

    expect(
      hcs26VersionDeleteSchema.parse({
        p: 'hcs-26',
        op: 'delete',
        uid: '7',
        m: 'remove version',
      }).uid,
    ).toBe('7');
  });
});
