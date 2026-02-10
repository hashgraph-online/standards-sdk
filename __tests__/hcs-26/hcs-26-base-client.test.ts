import { describe, it, expect, jest } from '@jest/globals';
import { HCS26BaseClient } from '../../src/hcs-26/base-client';

type ResolverMock = {
  resolveDiscoveryRecord: jest.Mock;
  getLatestVersionRegister: jest.Mock;
  resolveManifest: jest.Mock;
  verifyVersionRegisterMatchesManifest: jest.Mock;
};

type ClientWithResolver = {
  resolver: ResolverMock;
};

describe('HCS-26 base client', () => {
  it('resolveSkill returns discovery, latest version, manifest, and verification status when enabled', async () => {
    const verificationProvider = {
      getSkillVerificationStatus: jest.fn().mockResolvedValue({
        name: 'PDF Processing',
        verified: true,
        previouslyVerified: false,
      }),
    };

    const client = new HCS26BaseClient({
      network: 'testnet',
      verificationProvider,
    });

    const holder = client as unknown as ClientWithResolver;
    holder.resolver = {
      resolveDiscoveryRecord: jest.fn().mockResolvedValue({
        p: 'hcs-26',
        op: 'register',
        t_id: '0.0.123456',
        account_id: '0.0.78910',
        metadata: {
          name: 'PDF Processing',
          description: 'Extract and clean PDF text',
          author: 'Example Labs',
          license: 'Apache-2.0',
          tags: [60101],
        },
        sequence_number: 42,
      }),
      getLatestVersionRegister: jest.fn().mockResolvedValue({
        p: 'hcs-26',
        op: 'register',
        skill_uid: 42,
        version: '1.0.0',
        t_id: '0.0.33333',
        status: 'active',
        sequence_number: 7,
      }),
      resolveManifest: jest.fn().mockResolvedValue({
        manifest: {
          name: 'PDF Processing',
          description: 'Extract and clean PDF text',
          version: '1.0.0',
          license: 'Apache-2.0',
          author: 'Example Labs',
          files: [
            {
              path: 'SKILL.md',
              hrl: 'hcs://1/0.0.44444',
              sha256: 'abc',
              mime: 'text/markdown',
            },
          ],
        },
        raw: {},
        sha256Hex: 'deadbeef',
      }),
      verifyVersionRegisterMatchesManifest: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    const result = await client.resolveSkill({
      directoryTopicId: '0.0.999',
      skillUid: 42,
      includeVerification: true,
    });

    expect(result).not.toBeNull();
    expect(result?.discovery.t_id).toBe('0.0.123456');
    expect(result?.latestVersion.version).toBe('1.0.0');
    expect(result?.manifest.name).toBe('PDF Processing');
    expect(result?.verification?.verified).toBe(true);
    expect(
      verificationProvider.getSkillVerificationStatus,
    ).toHaveBeenCalledWith({
      name: 'PDF Processing',
    });
  });

  it('resolveSkill does not call verification provider when includeVerification is false', async () => {
    const verificationProvider = {
      getSkillVerificationStatus: jest.fn().mockResolvedValue(null),
    };

    const client = new HCS26BaseClient({
      network: 'testnet',
      verificationProvider,
    });

    const holder = client as unknown as ClientWithResolver;
    holder.resolver = {
      resolveDiscoveryRecord: jest.fn().mockResolvedValue({
        p: 'hcs-26',
        op: 'register',
        t_id: '0.0.123456',
        account_id: '0.0.78910',
        metadata: {
          name: 'PDF Processing',
          description: 'Extract and clean PDF text',
          author: 'Example Labs',
          license: 'Apache-2.0',
        },
        sequence_number: 42,
      }),
      getLatestVersionRegister: jest.fn().mockResolvedValue({
        p: 'hcs-26',
        op: 'register',
        skill_uid: 42,
        version: '1.0.0',
        t_id: '0.0.33333',
        status: 'active',
        sequence_number: 7,
      }),
      resolveManifest: jest.fn().mockResolvedValue({
        manifest: {
          name: 'PDF Processing',
          description: 'Extract and clean PDF text',
          version: '1.0.0',
          license: 'Apache-2.0',
          author: 'Example Labs',
          files: [
            {
              path: 'SKILL.md',
              hrl: 'hcs://1/0.0.44444',
              sha256: 'abc',
              mime: 'text/markdown',
            },
          ],
        },
        raw: {},
        sha256Hex: 'deadbeef',
      }),
      verifyVersionRegisterMatchesManifest: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    const result = await client.resolveSkill({
      directoryTopicId: '0.0.999',
      skillUid: 42,
      includeVerification: false,
    });

    expect(result).not.toBeNull();
    expect(result?.verification).toBeUndefined();
    expect(
      verificationProvider.getSkillVerificationStatus,
    ).not.toHaveBeenCalled();
  });
});
