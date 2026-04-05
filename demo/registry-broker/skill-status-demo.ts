import 'dotenv/config';
import { Logger } from '../../src/utils/logger';
import { RegistryBrokerClient } from '../../src/services/registry-broker';

interface ParsedArgs {
  baseUrl: string;
  name: string;
  version?: string;
}

const logger = Logger.getInstance({ module: 'skill-status-demo' });
const DEFAULT_BASE_URL = 'https://hol.org/registry/api/v1';

const resolveArgValue = (prefix: string): string | undefined => {
  const arg = process.argv.find(entry => entry.startsWith(prefix));
  if (!arg) {
    return undefined;
  }
  const value = arg.slice(prefix.length).trim();
  return value.length > 0 ? value : undefined;
};

const parseArgs = (): ParsedArgs => {
  const baseUrl =
    resolveArgValue('--base-url=') ??
    process.env.REGISTRY_BROKER_BASE_URL?.trim() ??
    DEFAULT_BASE_URL;
  const name =
    resolveArgValue('--skill-name=') ??
    resolveArgValue('--name=') ??
    process.env.SKILL_NAME?.trim() ??
    '';
  const version =
    resolveArgValue('--skill-version=') ??
    resolveArgValue('--version=') ??
    process.env.SKILL_VERSION?.trim() ??
    undefined;

  if (!name.trim()) {
    throw new Error(
      'Missing skill name. Pass --skill-name=<name> or set SKILL_NAME.',
    );
  }

  return {
    baseUrl,
    name: name.trim(),
    version: version?.trim() || undefined,
  };
};

async function main(): Promise<void> {
  const args = parseArgs();
  const client = new RegistryBrokerClient({
    baseUrl: args.baseUrl,
  });

  logger.info(
    `Resolving lifecycle status for ${args.name}${args.version ? `@${args.version}` : ''}`,
  );
  const status = await client.getSkillStatus({
    name: args.name,
    version: args.version,
  });

  const payload = {
    name: status.name,
    version: status.version,
    trustTier: status.trustTier,
    badgeMetric: status.badgeMetric,
    published: status.published,
    verifiedDomain: status.verifiedDomain,
    verificationSignals: status.verificationSignals,
    provenanceSignals: status.provenanceSignals,
    preview: status.preview
      ? {
          repoUrl: status.preview.repoUrl,
          ref: status.preview.ref,
          eventName: status.preview.eventName,
          statusUrl: status.preview.statusUrl,
          expiresAt: status.preview.expiresAt,
        }
      : null,
    nextSteps: status.nextSteps.map(step => ({
      id: step.id,
      label: step.label,
      description: step.description,
      command: step.command ?? null,
      href: step.href ?? null,
    })),
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch(error => {
  logger.error(
    error instanceof Error ? error.message : 'Skill status demo failed',
  );
  process.exitCode = 1;
});
