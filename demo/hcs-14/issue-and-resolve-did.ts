import 'dotenv/config';
import { HCS14Client } from '../../src/hcs-14';
import { Client } from '@hashgraph/sdk';

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) throw new Error(`${name} is required in environment`);
  return value.trim();
}

async function main() {
  const networkEnv = required('HEDERA_NETWORK', process.env.HEDERA_NETWORK || 'testnet');
  const network = (networkEnv === 'mainnet' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet';
  const accountId = required('HEDERA_ACCOUNT_ID', process.env.HEDERA_ACCOUNT_ID);
  const privateKeyStr = required('HEDERA_PRIVATE_KEY', process.env.HEDERA_PRIVATE_KEY);

  const hcs14 = new HCS14Client({ network, operatorId: accountId, privateKey: privateKeyStr });

  const client = Client.forName(network);
  client.setOperator(accountId, privateKeyStr);
  const { did, uaid, parsed } = await hcs14.createDidWithUaid({ issue: { method: 'hedera', client }, proto: 'hcs-10' });
  const resolved = await hcs14.getResolverRegistry().resolveUaid(uaid);

  const output = {
    did,
    uaid,
    uaidParsed: parsed,
    resolvedId: resolved?.id || null,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().then(() => process.exit(0)).catch(err => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
