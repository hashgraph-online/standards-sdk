import 'dotenv/config';
import {
  AID_DNS_WEB_PROFILE_ID,
  HCS14Client,
  UAID_DID_RESOLUTION_PROFILE_ID,
  UAID_DNS_WEB_PROFILE_ID,
  isUaidProfileResolverAdapter,
} from '../../src/hcs-14';
import { HCS11Client } from '../../src/hcs-11';

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim())
    throw new Error(`${name} is required in environment`);
  return value.trim();
}

function asNetwork(value: string | undefined): 'mainnet' | 'testnet' {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

async function main(): Promise<void> {
  const network = asNetwork(process.env.HEDERA_NETWORK);
  const accountId = required(
    'HEDERA_ACCOUNT_ID',
    process.env.HEDERA_ACCOUNT_ID,
  );
  const privateKey = required(
    'HEDERA_PRIVATE_KEY',
    process.env.HEDERA_PRIVATE_KEY,
  );

  const hcs11 = new HCS11Client({
    network,
    auth: { operatorId: accountId, privateKey },
  });
  const fetched = await hcs11.fetchProfileByAccountId(accountId, network);
  if (!fetched.success || !fetched.profile) {
    throw new Error(
      `Failed to fetch HCS-11 profile for ${accountId}: ${fetched.error || 'unknown error'}`,
    );
  }

  const profile = fetched.profile;
  if (!profile.uaid) {
    throw new Error('HCS-11 profile does not contain uaid');
  }

  const hcs14 = new HCS14Client();
  const didProfileResolverIds = hcs14
    .filterAdapters({
      capability: 'did-profile-resolver',
    })
    .map(record => record.adapter.meta?.id || 'unknown');
  const uaidProfileResolverIds = hcs14
    .filterAdapters({
      capability: 'uaid-profile-resolver',
    })
    .map(record => record.adapter)
    .filter(isUaidProfileResolverAdapter)
    .map(adapter => adapter.profile);

  const bestEffortUaidProfile = await hcs14.resolveUaidProfile(profile.uaid);
  const didResolutionUaidProfile = await hcs14.resolveUaidProfile(
    profile.uaid,
    {
      profileId: UAID_DID_RESOLUTION_PROFILE_ID,
    },
  );
  const uaidDnsWebProfile = await hcs14.resolveUaidProfile(profile.uaid, {
    profileId: UAID_DNS_WEB_PROFILE_ID,
  });
  const aidDnsWebProfile = await hcs14.resolveUaidProfile(profile.uaid, {
    profileId: AID_DNS_WEB_PROFILE_ID,
  });
  const derivedDid =
    bestEffortUaidProfile?.did ?? `did:hedera:${network}:${accountId}`;
  const didProfile = await hcs14.resolveDidProfile(derivedDid);

  const output = {
    accountId,
    uaid: profile.uaid,
    adapters: {
      didProfileResolverIds,
      uaidProfileResolverIds,
    },
    resolved: {
      derivedDid,
      didProfile,
      bestEffortUaidProfile,
      didResolutionUaidProfile,
      uaidDnsWebProfile,
      aidDnsWebProfile,
    },
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
