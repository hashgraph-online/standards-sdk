import {
  AID_DNS_WEB_PROFILE_ID,
  AidDnsWebProfileResolver,
  ResolverRegistry,
} from '../../src/hcs-14';
import {
  closeDnsServer,
  createTxtLookup,
  startDnsTxtServer,
} from './dns-txt-server';

const DEMO_NATIVE_ID = 'aid.local';
const DEMO_UID = 'support-agent-v1';
const DEMO_AID = 'QmAidDnsDemo123';
const DEMO_PROTOCOL = 'a2a';
const DEMO_UAID = `uaid:aid:${DEMO_AID};uid=${DEMO_UID};registry=example;proto=${DEMO_PROTOCOL};nativeId=${DEMO_NATIVE_ID}`;
const DEMO_DNS_NAME = `_agent.${DEMO_NATIVE_ID}`;
const DEMO_TXT_RECORD = `v=aid1; p=${DEMO_PROTOCOL}; u=https://${DEMO_NATIVE_ID}/${DEMO_PROTOCOL}`;

async function main(): Promise<void> {
  const { socket: dnsSocket, port: dnsPort } = await startDnsTxtServer({
    [DEMO_DNS_NAME]: [DEMO_TXT_RECORD],
  });

  try {
    const registry = new ResolverRegistry();
    registry.registerAdapter(
      new AidDnsWebProfileResolver({
        dnsLookup: createTxtLookup(dnsPort),
      }),
    );

    const profile = await registry.resolveUaidProfile(DEMO_UAID, {
      profileId: AID_DNS_WEB_PROFILE_ID,
    });
    if (!profile) {
      throw new Error('AID DNS/Web profile resolver returned no profile.');
    }
    if (profile.error || profile.metadata?.resolved === false) {
      const errorCode = profile.error?.code ?? 'unknown error';
      throw new Error(`AID DNS/Web profile resolution failed: ${errorCode}.`);
    }

    const output = {
      uaid: DEMO_UAID,
      runtime: {
        dnsPort,
        dnsName: DEMO_DNS_NAME,
        txtRecord: DEMO_TXT_RECORD,
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
