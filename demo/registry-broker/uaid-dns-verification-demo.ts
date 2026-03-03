import 'dotenv/config';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  type VerificationDnsStatusResponse,
} from '../../src/services/registry-broker';
import { authenticateWithDemoLedger } from '../utils/registry-auth';

const defaultBaseURL = 'https://hol.org/registry/api/v1';

interface DemoConfig {
  baseUrl: string;
  uaid: string;
  persist: boolean;
}

const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const resolveArgValue = (prefix: string): string | undefined => {
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  if (!hit) {
    return undefined;
  }
  const value = hit.slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
};

const resolveConfig = (): DemoConfig => {
  const baseUrl =
    resolveArgValue('--base-url=') ??
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ??
    defaultBaseURL;
  const uaid =
    resolveArgValue('--uaid=') ?? process.env.UAID_DNS_DEMO_UAID?.trim() ?? '';
  const persist = parseBoolean(
    resolveArgValue('--persist=') ?? process.env.UAID_DNS_DEMO_PERSIST,
    true,
  );

  if (!uaid) {
    throw new Error(
      'Missing UAID. Pass --uaid=<uaid> or set UAID_DNS_DEMO_UAID.',
    );
  }

  return {
    baseUrl,
    uaid,
    persist,
  };
};

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    const body =
      typeof error.body === 'object' &&
      error.body &&
      'error' in error.body &&
      typeof error.body.error === 'string'
        ? error.body.error
        : JSON.stringify(error.body);
    return `Registry broker error ${error.status} (${error.statusText}): ${body}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const printResult = (
  label: string,
  result: VerificationDnsStatusResponse,
): void => {
  console.log(`\n=== ${label} ===`);
  console.log(`uaid: ${result.uaid}`);
  console.log(`verified: ${result.verified}`);
  console.log(`source: ${result.source ?? 'n/a'}`);
  console.log(`persisted: ${result.persisted ?? false}`);
  console.log(`profileId: ${result.profileId}`);
  console.log(`checkedAt: ${result.checkedAt}`);
  if (result.nativeId) {
    console.log(`nativeId: ${result.nativeId}`);
  }
  if (result.dnsName) {
    console.log(`dnsName: ${result.dnsName}`);
  }
  if (result.error) {
    console.log(`error.code: ${result.error.code}`);
    console.log(`error.message: ${result.error.message}`);
  }
};

const run = async (): Promise<void> => {
  const config = resolveConfig();
  const client = new RegistryBrokerClient({
    baseUrl: config.baseUrl,
  });

  const auth = await authenticateWithDemoLedger(client, {
    label: 'uaid-dns-verification-demo',
  });
  console.log(
    `Authenticated as ${auth.accountId} on ${auth.networkCanonical}.`,
  );
  console.log(`Broker base URL: ${config.baseUrl}`);
  console.log(`Target UAID: ${config.uaid}`);

  const verify = await client.verifyUaidDnsTxt({
    uaid: config.uaid,
    persist: config.persist,
  });
  printResult('Live DNS Verification', verify);

  const statusStored = await client.getVerificationDnsStatus(config.uaid, {
    refresh: false,
    persist: false,
  });
  printResult('Status (Stored First)', statusStored);

  const statusLive = await client.getVerificationDnsStatus(config.uaid, {
    refresh: true,
    persist: false,
  });
  printResult('Status (Live Refresh)', statusLive);
};

run().catch(error => {
  console.error('UAID DNS demo failed:', describeError(error));
  process.exit(1);
});
