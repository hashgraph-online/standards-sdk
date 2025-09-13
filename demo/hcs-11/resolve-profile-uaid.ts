import 'dotenv/config';
import { HCS11Client, HCS11Profile } from '../../src/hcs-11';
import { HCS14Client } from '../../src/hcs-14';
import { resolveDID } from '@hiero-did-sdk/resolver';

function assertNetwork(value: string | undefined): 'mainnet' | 'testnet' {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

async function main(): Promise<void> {
  const network = assertNetwork(process.env.HEDERA_NETWORK);
  const accountId = process.env.HEDERA_ACCOUNT_ID || '';
  const privateKey = process.env.HEDERA_PRIVATE_KEY || '';
  if (!accountId || !privateKey) throw new Error('Missing Hedera credentials');

  const client = new HCS11Client({
    network,
    auth: { operatorId: accountId, privateKey },
  });
  const fetched = await client.fetchProfileByAccountId(accountId, network);
  if (!fetched.success || !fetched.profile) {
    throw new Error(`Fetch failed: ${fetched.error || 'unknown'}`);
  }
  const profile = fetched.profile as HCS11Profile;
  const uaid = profile.uaid;
  if (!uaid) throw new Error('Profile does not contain uaid');
  const hcs14 = new HCS14Client();
  const doc = await hcs14.getResolverRegistry().resolveUaid(uaid);
  const did = doc?.id || '';
  const resolved = did ? await resolveDID(did) : null;
  const output = { uaid, did, resolved };
  console.log(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
