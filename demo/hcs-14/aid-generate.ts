import {
  AID_DNS_WEB_PROFILE_ID,
  HCS14Client,
  createUaid,
  isUaidProfileResolverAdapter,
} from '../../src/hcs-14';

async function main(): Promise<void> {
  const hcs14 = new HCS14Client();
  const input = {
    registry: 'example',
    name: 'Sample Agent',
    version: '1.0.0',
    protocol: 'a2a',
    nativeId: 'example.com',
    skills: [0, 17],
  } as const;

  const aid = await createUaid(input);
  const uaidProfileResolvers = hcs14
    .filterAdapters({
      capability: 'uaid-profile-resolver',
    })
    .map(record => record.adapter)
    .filter(isUaidProfileResolverAdapter)
    .map(adapter => adapter.profile);

  const bestEffortProfile = await hcs14.resolveUaidProfile(aid);
  const aidDnsWebProfile = await hcs14.resolveUaidProfile(aid, {
    profileId: AID_DNS_WEB_PROFILE_ID,
  });

  process.stdout.write(
    JSON.stringify(
      {
        input,
        aid,
        adapters: {
          uaidProfileResolvers,
        },
        resolved: {
          bestEffort: bestEffortProfile,
          aidDnsWeb: aidDnsWebProfile,
        },
      },
      null,
      2,
    ) + '\n',
  );
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
