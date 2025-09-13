import { createUaid } from '../../src/hcs-14';

async function main(): Promise<void> {
  const input = {
    registry: 'example',
    name: 'Sample Agent',
    version: '1.0.0',
    protocol: 'a2a',
    nativeId: 'example.com',
    skills: [0, 17],
  } as const;

  const did = await createUaid(input);
  process.stdout.write(JSON.stringify({ input, aid: did }, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
