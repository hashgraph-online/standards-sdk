import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('connections-manager module imports', () => {
  test('uses direct service type import to prevent circular initialization', () => {
    const filePath = resolve(
      __dirname,
      '../../src/hcs-10/connections-manager.ts',
    );
    const source = readFileSync(filePath, 'utf8');
    const match = source.match(
      /import\s+\{\s*HCSMessageWithCommonFields\s*\}\s+from\s+'([^']+)'/,
    );

    expect(match?.[1]).toBe('../services/types');
  });
});
