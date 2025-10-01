import 'dotenv/config';
import { HCS14Client } from '../../src/hcs-14';
import { HCS11Client, HCS11Profile } from '../../src/hcs-11';

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) throw new Error(`${name} is required in environment`);
  return value.trim();
}

function asNetwork(value: string | undefined): 'mainnet' | 'testnet' {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

async function main(): Promise<void> {
  const network = asNetwork(process.env.HEDERA_NETWORK);
  const accountId = required('HEDERA_ACCOUNT_ID', process.env.HEDERA_ACCOUNT_ID);
  const privateKey = required('HEDERA_PRIVATE_KEY', process.env.HEDERA_PRIVATE_KEY);

  const hcs11 = new HCS11Client({ network, auth: { operatorId: accountId, privateKey } });
  const fetched = await hcs11.fetchProfileByAccountId(accountId, network);
  if (!fetched.success || !fetched.profile) {
    throw new Error(`Failed to fetch HCS-11 profile for ${accountId}: ${fetched.error || 'unknown error'}`);
  }

  const profile: HCS11Profile = fetched.profile as HCS11Profile;
  if (!profile.uaid) {
    throw new Error('HCS-11 profile does not contain uaid');
  }

  const hcs14 = new HCS14Client();
  const didDoc = await hcs14.getResolverRegistry().resolveUaid(profile.uaid);
  const output = {
    accountId,
    uaid: profile.uaid,
    resolvedId: didDoc?.id || null,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
