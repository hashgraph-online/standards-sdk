import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '../../src/utils/logger';
import { RegistryBrokerClient } from '../../src/services/registry-broker';
import { authenticateWithDemoLedger } from '../utils/registry-auth';

const logger = Logger.getInstance({ module: 'skill-domain-proof-demo' });

const DEFAULT_BASE_URL = 'https://hol.org/registry/api/v1';
const DOMAIN_PROOF_PREFIX = 'hol-skill-verification=';

interface ParsedArgs {
  baseUrl: string;
  skillName: string;
  skillVersion?: string;
  domain?: string;
  waitForDnsSeconds: number;
  autoDns: boolean;
}

interface CloudflareDnsRecord {
  id: string;
}

const resolveArgValue = (prefix: string): string | undefined => {
  const arg = process.argv.find(entry => entry.startsWith(prefix));
  if (!arg) {
    return undefined;
  }
  const value = arg.slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
};

const parseBoolean = (value: string | undefined): boolean | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return null;
};

const parseArgs = (): ParsedArgs => {
  const baseUrl =
    resolveArgValue('--base-url=') ??
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ??
    DEFAULT_BASE_URL;
  const skillName =
    resolveArgValue('--skill-name=') ??
    resolveArgValue('--name=') ??
    process.env.SKILL_NAME?.trim() ??
    '';
  const skillVersion =
    resolveArgValue('--skill-version=') ??
    resolveArgValue('--version=') ??
    process.env.SKILL_VERSION?.trim() ??
    undefined;
  const domain =
    resolveArgValue('--domain=') ??
    process.env.SKILL_DOMAIN_PROOF_DOMAIN?.trim() ??
    undefined;
  const waitForDnsSecondsRaw =
    resolveArgValue('--wait-dns-seconds=') ??
    process.env.SKILL_DOMAIN_PROOF_WAIT_DNS_SECONDS?.trim() ??
    '180';
  const waitForDnsSeconds = Number.parseInt(waitForDnsSecondsRaw, 10);
  const autoDnsFlag = parseBoolean(
    resolveArgValue('--auto-dns=') ?? process.env.SKILL_DOMAIN_PROOF_AUTO_DNS,
  );
  const autoDns = autoDnsFlag ?? true;

  if (!skillName.trim()) {
    throw new Error(
      'Missing skill name. Pass --skill-name=<name> (or set SKILL_NAME).',
    );
  }

  return {
    baseUrl,
    skillName: skillName.trim(),
    skillVersion: skillVersion?.trim() || undefined,
    domain: domain?.trim() || undefined,
    waitForDnsSeconds:
      Number.isFinite(waitForDnsSeconds) && waitForDnsSeconds > 0
        ? waitForDnsSeconds
        : 180,
    autoDns,
  };
};

const resolveCloudflareContext = (): {
  apiToken: string;
  zoneId: string;
} | null => {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? '';
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() ?? '';
  if (!apiToken || !zoneId) {
    return null;
  }
  return { apiToken, zoneId };
};

const cloudflareRequest = async <T>(
  context: { apiToken: string; zoneId: string },
  path: string,
  init: RequestInit,
): Promise<T> => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${context.apiToken}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json()) as {
    success?: boolean;
    result?: T;
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || payload.success === false || !payload.result) {
    const errorMessage =
      payload.errors
        ?.map(entry => entry.message)
        .filter(Boolean)
        .join('; ') || `Cloudflare API request failed (${response.status})`;
    throw new Error(errorMessage);
  }
  return payload.result;
};

const upsertCloudflareTxtRecord = async (params: {
  context: { apiToken: string; zoneId: string };
  recordName: string;
  recordValue: string;
  ttl?: number;
}): Promise<void> => {
  const { context, recordName, recordValue } = params;
  const ttl = params.ttl ?? 120;

  const existing = await cloudflareRequest<Array<CloudflareDnsRecord>>(
    context,
    `/zones/${encodeURIComponent(context.zoneId)}/dns_records?type=TXT&name=${encodeURIComponent(recordName)}`,
    { method: 'GET' },
  );

  if (existing[0]?.id) {
    await cloudflareRequest<CloudflareDnsRecord>(
      context,
      `/zones/${encodeURIComponent(context.zoneId)}/dns_records/${encodeURIComponent(existing[0].id)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          type: 'TXT',
          name: recordName,
          content: recordValue,
          ttl,
        }),
      },
    );
    logger.info(`• Updated TXT ${recordName}`);
    return;
  }

  await cloudflareRequest<CloudflareDnsRecord>(
    context,
    `/zones/${encodeURIComponent(context.zoneId)}/dns_records`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'TXT',
        name: recordName,
        content: recordValue,
        ttl,
      }),
    },
  );
  logger.info(`• Created TXT ${recordName}`);
};

const extractChallengeToken = (txtRecordValue: string): string => {
  const trimmed = txtRecordValue.trim();
  if (!trimmed) {
    throw new Error('Domain proof challenge returned an empty TXT value.');
  }
  if (trimmed.startsWith(DOMAIN_PROOF_PREFIX)) {
    return trimmed.slice(DOMAIN_PROOF_PREFIX.length);
  }
  return trimmed;
};

const resolveSkillVersion = async (
  client: RegistryBrokerClient,
  skillName: string,
  requestedVersion?: string,
): Promise<string> => {
  if (requestedVersion) {
    return requestedVersion;
  }
  const list = await client.listSkills({
    name: skillName,
    limit: 1,
  });
  const item = list.items[0];
  if (!item?.version) {
    throw new Error(
      `Skill ${skillName} was not found. Provide --skill-version=<version> when the latest lookup is unavailable.`,
    );
  }
  return item.version;
};

const resolveFrontendUrl = (
  baseUrl: string,
  skillName: string,
  skillVersion: string,
): string | null => {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname.includes('/registry/api/v1')) {
      parsed.pathname = `/registry/skills/${encodeURIComponent(skillName)}`;
      parsed.search = `version=${encodeURIComponent(skillVersion)}`;
      parsed.hash = '';
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const client = new RegistryBrokerClient({ baseUrl: args.baseUrl });

  const auth = await authenticateWithDemoLedger(client, {
    label: 'skill-domain-proof-demo',
    mode: 'hedera',
  });

  logger.info(
    `• Authenticated ledger account ${auth.accountId} (${auth.networkCanonical})`,
  );

  const skillVersion = await resolveSkillVersion(
    client,
    args.skillName,
    args.skillVersion,
  );

  const beforeList = await client.listSkills({
    name: args.skillName,
    version: skillVersion,
    limit: 1,
  });
  const before = beforeList.items[0];
  if (!before) {
    throw new Error(`Skill ${args.skillName}@${skillVersion} not found.`);
  }

  const beforeTotal = before.trustScores?.total ?? before.trustScore ?? 0;
  const beforeDomain = before.trustScores?.['verified.domainProof'] ?? 0;
  logger.info(
    `• Before verification: trust.total=${beforeTotal}, verified.domainProof=${beforeDomain}`,
  );

  const challenge = await client.createSkillDomainProofChallenge({
    name: args.skillName,
    version: skillVersion,
    domain: args.domain,
  });
  const challengeToken = extractChallengeToken(challenge.txtRecordValue);

  logger.info(`• Challenge created for ${challenge.domain}`);
  logger.info(`• TXT name: ${challenge.txtRecordName}`);
  logger.info(`• TXT value: ${challenge.txtRecordValue}`);
  logger.info(`• Expires: ${challenge.expiresAt}`);

  const preDnsVerify = await client.verifySkillDomainProof({
    name: args.skillName,
    version: skillVersion,
    domain: challenge.domain,
    challengeToken,
  });
  logger.info(
    `• Pre-DNS verify signal: ok=${preDnsVerify.signal.ok} reason=${preDnsVerify.signal.reason ?? 'n/a'}`,
  );

  const baselineList = await client.listSkills({
    name: args.skillName,
    version: skillVersion,
    limit: 1,
  });
  const baseline = baselineList.items[0];
  if (!baseline) {
    throw new Error('Skill disappeared after pre-DNS verification.');
  }
  const baselineTotal = baseline.trustScores?.total ?? baseline.trustScore ?? 0;
  const baselineDomain = baseline.trustScores?.['verified.domainProof'] ?? 0;
  logger.info(
    `• Baseline after pre-DNS verify: trust.total=${baselineTotal}, verified.domainProof=${baselineDomain}`,
  );

  const cloudflareContext = resolveCloudflareContext();
  if (args.autoDns && cloudflareContext) {
    await upsertCloudflareTxtRecord({
      context: cloudflareContext,
      recordName: challenge.txtRecordName,
      recordValue: challenge.txtRecordValue,
      ttl: 120,
    });
  } else {
    logger.warn(
      '• Automatic DNS update was skipped (missing Cloudflare credentials or --auto-dns=false).',
    );
  }

  const deadline = Date.now() + args.waitForDnsSeconds * 1000;
  let lastVerifyOk = false;
  while (Date.now() < deadline) {
    const verifyResult = await client.verifySkillDomainProof({
      name: args.skillName,
      version: skillVersion,
      domain: challenge.domain,
      challengeToken,
    });

    if (verifyResult.signal.ok) {
      lastVerifyOk = true;
      logger.info('• Domain proof verified');
      break;
    }

    logger.warn(
      `• DNS not ready yet (${verifyResult.signal.reason ?? 'unknown'}). Retrying in 10s...`,
    );
    await delay(10_000);
  }

  if (!lastVerifyOk) {
    throw new Error(
      `Domain proof verification did not succeed within ${args.waitForDnsSeconds}s.`,
    );
  }

  const afterList = await client.listSkills({
    name: args.skillName,
    version: skillVersion,
    limit: 1,
  });
  const after = afterList.items[0];
  if (!after) {
    throw new Error('Skill disappeared after verification.');
  }

  const afterTotal = after.trustScores?.total ?? after.trustScore ?? 0;
  const afterDomain = after.trustScores?.['verified.domainProof'] ?? 0;

  logger.info(
    `• After verification: trust.total=${afterTotal}, verified.domainProof=${afterDomain}`,
  );
  logger.info(
    `• Delta: trust.total=${(afterTotal - baselineTotal).toFixed(2)}, verified.domainProof=${(afterDomain - baselineDomain).toFixed(2)}`,
  );

  const frontendUrl = resolveFrontendUrl(
    args.baseUrl,
    args.skillName,
    skillVersion,
  );
  if (frontendUrl) {
    logger.info(`• Frontend check URL: ${frontendUrl}`);
  }
};

main().catch(error => {
  logger.error(
    error instanceof Error ? error.message : 'Domain proof demo failed',
  );
  process.exitCode = 1;
});
