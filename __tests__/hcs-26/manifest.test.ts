import { hcs26SkillManifestSchema } from '../../src/hcs-26/types';

const baseManifest = {
  name: 'Example Skill',
  description: 'Example',
  version: '1.0.0',
  license: 'Apache-2.0',
  author: 'Example',
} as const;

describe('HCS-26 manifest', () => {
  test('rejects when SKILL.md is missing', () => {
    const parsed = hcs26SkillManifestSchema.safeParse({
      ...baseManifest,
      files: [
        {
          path: 'scripts/run.ts',
          hrl: 'hcs://1/0.0.1234',
          sha256:
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          mime: 'text/plain',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  test('accepts when SKILL.md is present at root', () => {
    const parsed = hcs26SkillManifestSchema.safeParse({
      ...baseManifest,
      files: [
        {
          path: 'SKILL.md',
          hrl: 'hcs://1/0.0.1234',
          sha256:
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          mime: 'text/markdown',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
