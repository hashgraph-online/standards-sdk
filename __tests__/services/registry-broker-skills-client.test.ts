import { jest } from '@jest/globals';
import { RegistryBrokerClient } from '../../src/services/registry-broker';

function createResponse(payload: {
  status?: number;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: (payload.status ?? 200) >= 200 && (payload.status ?? 200) < 300,
    status: payload.status ?? 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: payload.json ?? (async () => ({})),
    text: async () => JSON.stringify(await (payload.json?.() ?? {})),
  } as unknown as Response;
}

describe('RegistryBrokerClient skill contract methods', () => {
  const fetchImplementation = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchImplementation.mockReset();
  });

  it('parses publisher metadata from skills config', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          enabled: true,
          network: 'testnet',
          publisher: {
            cliPackageUrl: 'https://www.npmjs.com/package/skill-publish',
            cliCommand: 'npx skill-publish',
            actionMarketplaceUrl:
              'https://github.com/marketplace/actions/skill-publish',
            repositoryUrl: 'https://github.com/hashgraph-online/skill-publish',
            guideUrl:
              'https://hol.org/registry/docs#guides/skill-publishing-workflow.md',
            docsUrl: 'https://hol.org/registry/docs',
            submitUrl: 'https://hol.org/registry/skills/submit',
            skillsIndexUrl: 'https://hol.org/registry/skills',
            quickstartCommands: [
              {
                id: 'setup',
                label: 'Authenticate and store your API key',
                description:
                  'Create a broker API key with ledger auth and persist it locally for future publishes.',
                command: 'npx skill-publish setup',
                href: 'https://hol.org/registry/skills/publish',
              },
            ],
            templatePresets: [
              {
                presetId: 'general',
                label: 'General skill',
                description:
                  'Balanced starter for most reusable skill releases with no strong ecosystem assumptions.',
                recommendedFor:
                  'First-time publishers and broad reusable skills',
                command:
                  'npx skill-publish scaffold-repo ./my-skill --preset general --name my-skill',
              },
            ],
          },
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const config = await client.skillsConfig();

    expect(config.publisher?.cliCommand).toBe('npx skill-publish');
    expect(config.publisher?.submitUrl).toBe(
      'https://hol.org/registry/skills/submit',
    );
    expect(config.publisher?.quickstartCommands[0]?.command).toBe(
      'npx skill-publish setup',
    );
    expect(config.publisher?.templatePresets[0]?.presetId).toBe('general');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/config',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('retrieves skill trust-tier status', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          name: 'registry-broker',
          version: '1.2.3',
          published: true,
          verifiedDomain: true,
          trustTier: 'hardened',
          badgeMetric: 'tier',
          checks: {
            repoCommitIntegrity: true,
            manifestIntegrity: true,
            domainProof: true,
          },
          nextSteps: [
            {
              id: 'share',
              label: 'Share the canonical install links',
              description:
                'Copy pinned SKILL.md, manifest, and badge URLs from the registry detail page after each release.',
              href: 'https://hol.org/registry/skills',
              command: null,
            },
          ],
          publisher: {
            cliPackageUrl: 'https://www.npmjs.com/package/skill-publish',
            cliCommand: 'npx skill-publish',
            actionMarketplaceUrl:
              'https://github.com/marketplace/actions/skill-publish',
            repositoryUrl: 'https://github.com/hashgraph-online/skill-publish',
            guideUrl: 'https://hol.org/registry/skills/about',
            docsUrl: 'https://hol.org/registry/docs',
            submitUrl: 'https://hol.org/registry/skills/submit',
            skillsIndexUrl: 'https://hol.org/registry/skills',
            quickstartCommands: [],
            templatePresets: [],
          },
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const status = await client.getSkillStatus({
      name: 'registry-broker',
      version: '1.2.3',
    });

    expect(status.trustTier).toBe('hardened');
    expect(status.checks.domainProof).toBe(true);
    expect(status.badgeMetric).toBe('tier');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/status?name=registry-broker&version=1.2.3',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
