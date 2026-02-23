import { afterAll, describe, expect, it } from '@jest/globals';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { loadSkillFiles } from '../../../demo/registry-broker/skill-registry-utils';

const tempRoots: string[] = [];

const createTempSkillDir = async (name: string): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'skill-registry-utils-'));
  tempRoots.push(root);
  const skillDir = path.join(root, name);
  await mkdir(skillDir, { recursive: true });
  return skillDir;
};

afterAll(async () => {
  await Promise.all(
    tempRoots.map(root =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('loadSkillFiles', () => {
  it('synthesizes skill.json from SKILL.md frontmatter when missing', async () => {
    const skillDir = await createTempSkillDir('zyfai-sdk-1.0.6');
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: zyfai
description: Yield automation for wallet balances.
---

# Zyfai
`,
      'utf8',
    );

    const files = await loadSkillFiles(skillDir, {});
    const skillJsonFile = files.find(file => file.name === 'skill.json');
    const parsed = skillJsonFile
      ? (JSON.parse(
          Buffer.from(skillJsonFile.base64, 'base64').toString('utf8'),
        ) as Record<string, unknown>)
      : null;

    expect(skillJsonFile).toBeDefined();
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe('zyfai');
    expect(parsed?.version).toBe('1.0.6');
    expect(parsed?.description).toBe('Yield automation for wallet balances.');
    expect(parsed?.license).toBe('UNLICENSED');
    expect(parsed?.author).toBe('Unknown');
  });

  it('applies overrides to synthesized skill.json', async () => {
    const skillDir = await createTempSkillDir('override-test-0.0.1');
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: original-name
description: Original description.
---

# Original
`,
      'utf8',
    );

    const files = await loadSkillFiles(skillDir, {
      name: 'custom-name',
      version: '2.3.4',
    });
    const skillJsonFile = files.find(file => file.name === 'skill.json');
    const parsed = skillJsonFile
      ? (JSON.parse(
          Buffer.from(skillJsonFile.base64, 'base64').toString('utf8'),
        ) as Record<string, unknown>)
      : null;

    expect(parsed?.name).toBe('custom-name');
    expect(parsed?.version).toBe('2.3.4');
    expect(parsed?.description).toBe('Original description.');
  });

  it('preserves colon-containing frontmatter values when synthesizing skill.json', async () => {
    const skillDir = await createTempSkillDir('colon-frontmatter-0.1.0');
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: colon-frontmatter
description: A tool for https://example.com integration
---

# Colon Frontmatter
`,
      'utf8',
    );

    const files = await loadSkillFiles(skillDir, {});
    const skillJsonFile = files.find(file => file.name === 'skill.json');
    const parsed = skillJsonFile
      ? (JSON.parse(
          Buffer.from(skillJsonFile.base64, 'base64').toString('utf8'),
        ) as Record<string, unknown>)
      : null;

    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe('colon-frontmatter');
    expect(parsed?.description).toBe(
      'A tool for https://example.com integration',
    );
  });
});
