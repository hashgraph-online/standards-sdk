import 'dotenv/config';
import { resolveDID } from '@hiero-did-sdk/resolver';

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) throw new Error(`${name} is required in environment`);
  return value.trim();
}

async function main(): Promise<void> {
  const did = required('HCS14_DID', process.env.HCS14_DID);
  const doc = await resolveDID(did);
  const output = {
    did,
    resolvedId: doc.id,
    verificationMethodCount: doc.verificationMethod.length,
    serviceCount: Array.isArray(doc.service) ? doc.service.length : 0,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => { process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1); });
