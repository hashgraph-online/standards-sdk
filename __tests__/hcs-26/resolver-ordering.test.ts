import { describe, expect, it, jest } from '@jest/globals';
import { Hcs26SkillRegistryResolver } from '../../src/hcs-26/resolver';

type MirrorNodeMock = {
  getTopicMessages: jest.Mock<
    Promise<Array<Record<string, unknown>>>,
    [string, Record<string, unknown>]
  >;
};

type ResolverWithMirror = Hcs26SkillRegistryResolver & {
  mirrorNode: MirrorNodeMock;
};

const discoveryMetadata = {
  name: 'Skill',
  description: 'Initial description',
  author: 'Example',
  license: 'Apache-2.0',
};

function makeResolver(
  messages: Array<Record<string, unknown>>,
): Hcs26SkillRegistryResolver {
  const resolver = new Hcs26SkillRegistryResolver({ network: 'testnet' });
  const withMirror = resolver as unknown as ResolverWithMirror;
  withMirror.mirrorNode = {
    getTopicMessages: jest.fn().mockResolvedValue(messages),
  };
  return resolver;
}

describe('HCS-26 resolver ordering', () => {
  it('ignores discovery deletes and updates older than register sequence', async () => {
    const resolver = makeResolver([
      {
        p: 'hcs-26',
        op: 'delete',
        uid: '100',
        sequence_number: 90,
      },
      {
        p: 'hcs-26',
        op: 'update',
        uid: '100',
        metadata: { description: 'Old update should be ignored' },
        sequence_number: 95,
      },
      {
        p: 'hcs-26',
        op: 'update',
        uid: '100',
        metadata: { description: 'Fresh update should apply' },
        sequence_number: 120,
      },
    ]);

    jest.spyOn(resolver, 'getDiscoveryRegister').mockResolvedValue({
      p: 'hcs-26',
      op: 'register',
      t_id: '0.0.999',
      account_id: '0.0.1234',
      metadata: discoveryMetadata,
      sequence_number: 100,
    });

    const resolved = await resolver.resolveDiscoveryRecord({
      directoryTopicId: '0.0.777',
      skillUid: 100,
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.metadata.description).toBe('Fresh update should apply');
  });

  it('applies discovery delete when message sequence is newer than register', async () => {
    const resolver = makeResolver([
      {
        p: 'hcs-26',
        op: 'delete',
        uid: '100',
        sequence_number: 130,
      },
    ]);

    jest.spyOn(resolver, 'getDiscoveryRegister').mockResolvedValue({
      p: 'hcs-26',
      op: 'register',
      t_id: '0.0.999',
      account_id: '0.0.1234',
      metadata: discoveryMetadata,
      sequence_number: 100,
    });

    const resolved = await resolver.resolveDiscoveryRecord({
      directoryTopicId: '0.0.777',
      skillUid: 100,
    });

    expect(resolved).toBeNull();
  });

  it('filters pre-register version delete/update but applies newer update', async () => {
    const resolver = makeResolver([
      {
        p: 'hcs-26',
        op: 'delete',
        uid: '100',
        sequence_number: 80,
      },
      {
        p: 'hcs-26',
        op: 'update',
        uid: '100',
        status: 'yanked',
        sequence_number: 90,
      },
      {
        p: 'hcs-26',
        op: 'register',
        skill_uid: 42,
        version: '1.0.0',
        t_id: '0.0.888',
        sequence_number: 100,
      },
      {
        p: 'hcs-26',
        op: 'update',
        uid: '100',
        status: 'deprecated',
        sequence_number: 120,
      },
    ]);

    const entries = await resolver.listVersionRegisters({
      versionRegistryTopicId: '0.0.888',
      skillUid: 42,
      limit: 50,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe('1.0.0');
    expect(entries[0].status).toBe('deprecated');
  });
});
