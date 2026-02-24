import {
  AID_DNS_WEB_PROFILE_ID,
  AidDnsWebProfileResolver,
  ResolverRegistry,
  UAID_DNS_WEB_PROFILE_ID,
  UaidDnsWebProfileResolver,
} from '../../src/hcs-14';
import {
  closeDnsServer,
  createTxtLookup,
  startDnsTxtServer,
} from './dns-txt-server';

const DEMO_NATIVE_ID = 'uaid.local';
const DEMO_UID = 'support-agent-v1';
const DEMO_AID = 'QmUaidDnsDemoAid123';
const DEMO_PROTOCOL = 'a2a';
const DEMO_REGISTRY = 'example';
const DEMO_UAID = `uaid:aid:${DEMO_AID};uid=${DEMO_UID};registry=${DEMO_REGISTRY};proto=${DEMO_PROTOCOL};nativeId=${DEMO_NATIVE_ID}`;
const DEMO_UAID_DNS_NAME = `_uaid.${DEMO_NATIVE_ID}`;
const DEMO_AID_DNS_NAME = `_agent.${DEMO_NATIVE_ID}`;
const DEMO_UAID_TXT_RECORD = `target=aid; id=${DEMO_AID}; uid=${DEMO_UID}; registry=${DEMO_REGISTRY}; proto=${DEMO_PROTOCOL}; nativeId=${DEMO_NATIVE_ID}`;
const DEMO_AID_TXT_RECORD = `v=aid1; p=${DEMO_PROTOCOL}; u=https://${DEMO_NATIVE_ID}/${DEMO_PROTOCOL}`;

async function main(): Promise<void> {
  const { socket: dnsSocket, port: dnsPort } = await startDnsTxtServer({
    [DEMO_UAID_DNS_NAME]: [DEMO_UAID_TXT_RECORD],
    [DEMO_AID_DNS_NAME]: [DEMO_AID_TXT_RECORD],
  });

  try {
    const dnsLookup = createTxtLookup(dnsPort);
    const registry = new ResolverRegistry();
    registry.registerAdapter(new UaidDnsWebProfileResolver({ dnsLookup }));
    registry.registerAdapter(new AidDnsWebProfileResolver({ dnsLookup }));

    const profile = await registry.resolveUaidProfile(DEMO_UAID, {
      profileId: UAID_DNS_WEB_PROFILE_ID,
    });
    if (!profile) {
      throw new Error('UAID DNS/Web profile resolver returned no profile.');
    }
    if (profile.error || profile.metadata?.resolved === false) {
      const errorCode = profile.error?.code ?? 'unknown error';
      throw new Error(`UAID DNS/Web profile resolution failed: ${errorCode}.`);
    }

    const selectedFollowupProfile = profile.metadata?.selectedFollowupProfile;
    if (selectedFollowupProfile !== AID_DNS_WEB_PROFILE_ID) {
      throw new Error(
        `Expected follow-up profile ${AID_DNS_WEB_PROFILE_ID}, received ${selectedFollowupProfile ?? 'none'}.`,
      );
    }

    const output = {
      uaid: DEMO_UAID,
      runtime: {
        dnsPort,
        records: {
          [DEMO_UAID_DNS_NAME]: DEMO_UAID_TXT_RECORD,
          [DEMO_AID_DNS_NAME]: DEMO_AID_TXT_RECORD,
        },
      },
      resolvedProfile: profile,
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } finally {
    await closeDnsServer(dnsSocket);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
