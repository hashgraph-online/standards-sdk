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
          name: 'preview-skill',
          version: '0.1.0',
          published: false,
          verifiedDomain: false,
          trustTier: 'validated',
          badgeMetric: 'tier',
          checks: {
            repoCommitIntegrity: false,
            manifestIntegrity: false,
            domainProof: false,
          },
          verificationSignals: {
            publisherBound: false,
            domainProof: false,
            verifiedDomain: false,
            previewValidated: true,
          },
          provenanceSignals: {
            repoCommitIntegrity: false,
            manifestIntegrity: false,
            canonicalRelease: false,
            previewAvailable: true,
            previewAuthoritative: false,
          },
          nextSteps: [
            {
              kind: 'publish_first_release',
              priority: 100,
              id: 'publish',
              label: 'Publish the first immutable release',
              description:
                'This repo already passes validate-first checks. Publish an immutable release to mint canonical install URLs and a durable registry page.',
              url: 'https://hol.org/registry/skills/submit',
              href: 'https://hol.org/registry/skills/submit',
              command: 'npx skill-publish publish',
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
          preview: {
            previewId: 'preview_demo',
            repoUrl:
              'https://github.com/hashgraph-online/registry-broker-skill',
            repoOwner: 'hashgraph-online',
            repoName: 'registry-broker-skill',
            commitSha: 'abc123',
            ref: 'refs/pull/5/merge',
            eventName: 'pull_request',
            skillDir: '.',
            generatedAt: '2026-04-04T10:00:00.000Z',
            expiresAt: '2026-04-11T10:00:00.000Z',
            statusUrl: 'https://hol.org/registry/skills/preview-skill',
          },
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const status = await client.getSkillStatus({
      name: 'preview-skill',
      version: '0.1.0',
    });

    expect(status.trustTier).toBe('validated');
    expect(status.preview?.repoName).toBe('registry-broker-skill');
    expect(status.preview?.previewId).toBe('preview_demo');
    expect(status.checks.domainProof).toBe(false);
    expect(status.badgeMetric).toBe('tier');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/status?name=preview-skill&version=0.1.0',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uploads a GitHub OIDC skill preview report', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          id: 'preview-1',
          previewId: 'preview_demo',
          source: 'github-oidc',
          generatedAt: '2026-04-04T10:00:00.000Z',
          expiresAt: '2026-04-11T10:00:00.000Z',
          statusUrl: 'https://hol.org/registry/skills/preview-skill',
          authoritative: false,
          report: {
            schema_version: 'skill-preview.v1',
            tool_version: '1.0.0',
            preview_id: 'preview_demo',
            repo_url:
              'https://github.com/hashgraph-online/registry-broker-skill',
            repo_owner: 'hashgraph-online',
            repo_name: 'registry-broker-skill',
            default_branch: 'main',
            commit_sha: 'abc123',
            ref: 'refs/pull/5/merge',
            event_name: 'pull_request',
            workflow_run_url:
              'https://github.com/hashgraph-online/registry-broker-skill/actions/runs/123456789',
            skill_dir: '.',
            name: 'preview-skill',
            version: '0.1.0',
            validation_status: 'passed',
            findings: [],
            package_summary: {
              fileCount: 2,
            },
            suggested_next_steps: [
              {
                id: 'publish',
                label: 'Publish',
                description: 'Publish the validated skill.',
                href: 'https://hol.org/registry/skills/submit',
                command: 'npx skill-publish publish',
              },
            ],
            generated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const preview = await client.uploadSkillPreviewFromGithubOidc({
      token: 'preview-token',
      report: {
        schema_version: 'skill-preview.v1',
        tool_version: '1.0.0',
        preview_id: 'preview_demo',
        repo_url: 'https://github.com/hashgraph-online/registry-broker-skill',
        repo_owner: 'hashgraph-online',
        repo_name: 'registry-broker-skill',
        default_branch: 'main',
        commit_sha: 'abc123',
        ref: 'refs/pull/5/merge',
        event_name: 'pull_request',
        workflow_run_url:
          'https://github.com/hashgraph-online/registry-broker-skill/actions/runs/123456789',
        skill_dir: '.',
        name: 'preview-skill',
        version: '0.1.0',
        validation_status: 'passed',
        findings: [],
        package_summary: {
          fileCount: 2,
        },
        suggested_next_steps: [],
        generated_at: '2026-04-04T10:00:00.000Z',
      },
    });

    expect(preview.id).toBe('preview-1');
    expect(preview.previewId).toBe('preview_demo');
    expect(preview.report.name).toBe('preview-skill');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/preview/github-oidc',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    );
    const request = fetchImplementation.mock.calls.at(-1);
    const headers = request?.[1]?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer preview-token');
  });

  it('retrieves a stored skill preview by name and version', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          found: true,
          authoritative: true,
          statusUrl: 'https://hol.org/registry/skills/preview/preview_demo',
          expiresAt: '2026-04-11T10:00:00.000Z',
          preview: {
            id: 'preview-1',
            previewId: 'preview_demo',
            source: 'github-oidc',
            generatedAt: '2026-04-04T10:00:00.000Z',
            expiresAt: '2026-04-11T10:00:00.000Z',
            statusUrl: 'https://hol.org/registry/skills/preview/preview_demo',
            authoritative: true,
            report: {
              schema_version: 'skill-preview.v1',
              tool_version: '1.0.0',
              preview_id: 'preview_demo',
              repo_url:
                'https://github.com/hashgraph-online/registry-broker-skill',
              repo_owner: 'hashgraph-online',
              repo_name: 'registry-broker-skill',
              default_branch: 'main',
              commit_sha: 'abc123',
              ref: 'refs/pull/5/merge',
              event_name: 'pull_request',
              workflow_run_url:
                'https://github.com/hashgraph-online/registry-broker-skill/actions/runs/123456789',
              skill_dir: '.',
              name: 'preview-skill',
              version: '0.1.0',
              validation_status: 'passed',
              findings: [],
              package_summary: {
                fileCount: 2,
              },
              suggested_next_steps: [],
              generated_at: '2026-04-04T10:00:00.000Z',
            },
          },
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const preview = await client.getSkillPreview({
      name: 'preview-skill',
      version: '0.1.0',
    });

    expect(preview.found).toBe(true);
    expect(preview.authoritative).toBe(true);
    expect(preview.preview?.report.repo_owner).toBe('hashgraph-online');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/preview?name=preview-skill&version=0.1.0',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('supports tier badge lookups for skill lifecycle flows', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          schemaVersion: 1,
          label: 'registry-broker',
          message: 'verified',
          color: 'brightgreen',
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const badge = await client.getSkillBadge({
      name: 'registry-broker',
      metric: 'tier',
    });

    expect(badge.message).toBe('verified');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/badge?name=registry-broker&metric=tier',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('retrieves repo-based skill status and preview metadata', async () => {
    fetchImplementation
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            name: 'preview-skill',
            version: '0.1.0',
            published: false,
            verifiedDomain: false,
            trustTier: 'validated',
            badgeMetric: 'tier',
            checks: {
              repoCommitIntegrity: false,
              manifestIntegrity: false,
              domainProof: false,
            },
            verificationSignals: {
              publisherBound: false,
              domainProof: false,
              verifiedDomain: false,
              previewValidated: true,
            },
            provenanceSignals: {
              repoCommitIntegrity: false,
              manifestIntegrity: false,
              canonicalRelease: false,
              previewAvailable: true,
              previewAuthoritative: false,
            },
            nextSteps: [
              {
                kind: 'publish_first_release',
                priority: 100,
                id: 'publish',
                label: 'Publish the first immutable release',
                description: 'Publish it.',
                url: 'https://hol.org/registry/skills/submit',
                href: 'https://hol.org/registry/skills/submit',
                command: 'npx skill-publish publish',
              },
            ],
            publisher: null,
            preview: {
              previewId: 'preview_demo',
              repoUrl:
                'https://github.com/hashgraph-online/registry-broker-skill',
              repoOwner: 'hashgraph-online',
              repoName: 'registry-broker-skill',
              commitSha: 'abc123',
              ref: 'refs/pull/5/merge',
              eventName: 'pull_request',
              skillDir: '.',
              generatedAt: '2026-04-04T10:00:00.000Z',
              expiresAt: '2026-04-11T10:00:00.000Z',
              statusUrl: 'https://hol.org/registry/skills/preview/preview_demo',
            },
            statusUrl: 'https://hol.org/registry/skills/preview/preview_demo',
          }),
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          json: async () => ({
            found: false,
            authoritative: false,
            preview: null,
            statusUrl: null,
            expiresAt: null,
          }),
        }),
      );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const status = await client.getSkillStatusByRepo({
      repo: 'https://github.com/hashgraph-online/registry-broker-skill',
      skillDir: '.',
      ref: 'refs/pull/5/merge',
    });
    expect(status.preview?.previewId).toBe('preview_demo');

    const preview = await client.getSkillPreviewByRepo({
      repo: 'https://github.com/hashgraph-online/registry-broker-skill',
      skillDir: '.',
    });
    expect(preview.found).toBe(false);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/skills/status/by-repo?repo=https%3A%2F%2Fgithub.com%2Fhashgraph-online%2Fregistry-broker-skill&skillDir=.&ref=refs%2Fpull%2F5%2Fmerge',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/skills/preview/by-repo?repo=https%3A%2F%2Fgithub.com%2Fhashgraph-online%2Fregistry-broker-skill&skillDir=.',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('retrieves anonymous quote preview estimates', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          estimatedCredits: { min: 64, max: 76 },
          estimatedHbar: { min: 0.64, max: 0.76 },
          pricingVersion: 'heuristic-v1',
          assumptions: [
            'Estimate derived from package file count and total bytes.',
          ],
          purchaseUrl: 'https://hol.org/registry/skills/submit',
          publishUrl: 'https://hol.org/registry/skills/submit',
          verificationUrl: 'https://hol.org/registry/skills/submit',
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const quote = await client.quoteSkillPublishPreview({
      fileCount: 4,
      totalBytes: 18_500,
      name: 'preview-skill',
      version: '0.1.0',
      repoUrl: 'https://github.com/hashgraph-online/registry-broker-skill',
      skillDir: '.',
    });

    expect(quote.estimatedCredits.min).toBe(64);
    expect(quote.pricingVersion).toBe('heuristic-v1');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/quote-preview',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          fileCount: 4,
          totalBytes: 18_500,
          name: 'preview-skill',
          version: '0.1.0',
          repoUrl: 'https://github.com/hashgraph-online/registry-broker-skill',
          skillDir: '.',
        }),
      }),
    );
  });

  it('retrieves repo conversion signals for growth-loop routing', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          repoUrl: 'https://github.com/hashgraph-online/registry-broker-skill',
          skillDir: '.',
          trustTier: 'validated',
          actionInstalled: true,
          previewUploaded: true,
          previewId: 'preview_demo',
          lastValidateSuccessAt: '2026-04-04T10:00:00.000Z',
          stalePreviewAgeDays: 1,
          published: false,
          verified: false,
          publishReady: true,
          publishBlockedByMissingAuth: true,
          statusUrl: 'https://hol.org/registry/skills/preview/preview_demo',
          purchaseUrl: 'https://hol.org/registry/skills/submit',
          publishUrl: 'https://github.com/marketplace/actions/skill-publish',
          verificationUrl: 'https://hol.org/registry/skills/submit',
          nextSteps: [
            {
              kind: 'publish_first_release',
              priority: 100,
              id: 'publish',
              label: 'Publish the first immutable release',
              description: 'Publish it.',
              url: 'https://hol.org/registry/skills/submit',
              href: 'https://hol.org/registry/skills/submit',
              command: 'npx skill-publish publish',
            },
          ],
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const signals = await client.getSkillConversionSignalsByRepo({
      repo: 'https://github.com/hashgraph-online/registry-broker-skill',
      skillDir: '.',
      ref: 'refs/heads/main',
    });

    expect(signals.publishReady).toBe(true);
    expect(signals.previewId).toBe('preview_demo');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/conversion-signals/by-repo?repo=https%3A%2F%2Fgithub.com%2Fhashgraph-online%2Fregistry-broker-skill&skillDir=.&ref=refs%2Fheads%2Fmain',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('retrieves skill install metadata for a pinned release', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({
          name: 'registry-broker',
          version: '1.2.3',
          skillRef: 'registry-broker@1.2.3',
          network: 'testnet',
          detailUrl:
            'https://hol.org/registry/skills/registry-broker?version=1.2.3',
          artifacts: {
            skillMd: {
              url: 'https://api.example.com/api/v1/skills/registry-broker%401.2.3/SKILL.md',
              pointer: 'hcs://1/0.0.7000001',
              sha256: 'skill-md-sha',
            },
            manifest: {
              url: 'https://api.example.com/api/v1/skills/registry-broker%401.2.3/manifest',
              pointer: 'hcs://1/0.0.6000101',
              sha256: 'manifest-sha',
            },
          },
          resolvers: {
            pinned: {
              skillRef: 'registry-broker@1.2.3',
              skillMdUrl:
                'https://api.example.com/api/v1/skills/registry-broker%401.2.3/SKILL.md',
              manifestUrl:
                'https://api.example.com/api/v1/skills/registry-broker%401.2.3/manifest',
            },
            latest: {
              skillRef: 'registry-broker@latest',
              skillMdUrl:
                'https://api.example.com/api/v1/skills/registry-broker%40latest/SKILL.md',
              manifestUrl:
                'https://api.example.com/api/v1/skills/registry-broker%40latest/manifest',
            },
          },
          share: {
            canonicalUrl:
              'https://hol.org/registry/skills/registry-broker?version=1.2.3',
            latestUrl: 'https://hol.org/registry/skills/registry-broker',
            markdownLink:
              '[registry-broker on HOL Registry](https://hol.org/registry/skills/registry-broker?version=1.2.3)',
            htmlLink:
              '<a href="https://hol.org/registry/skills/registry-broker?version=1.2.3">registry-broker on HOL Registry</a>',
            badge: {
              apiUrl:
                'https://api.example.com/api/v1/skills/badge?name=registry-broker&metric=version&style=for-the-badge&label=registry-broker',
              imageUrl:
                'https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.example.com%2Fapi%2Fv1%2Fskills%2Fbadge%3Fname%3Dregistry-broker%26metric%3Dversion%26style%3Dfor-the-badge%26label%3Dregistry-broker',
              markdown:
                '[![registry-broker on HOL Registry (Version + Verification)](https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.example.com%2Fapi%2Fv1%2Fskills%2Fbadge%3Fname%3Dregistry-broker%26metric%3Dversion%26style%3Dfor-the-badge%26label%3Dregistry-broker)](https://hol.org/registry/skills/registry-broker?version=1.2.3)',
              html: '<a href="https://hol.org/registry/skills/registry-broker?version=1.2.3"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.example.com%2Fapi%2Fv1%2Fskills%2Fbadge%3Fname%3Dregistry-broker%26metric%3Dversion%26style%3Dfor-the-badge%26label%3Dregistry-broker" alt="registry-broker on HOL Registry (Version + Verification)" /></a>',
            },
          },
          snippets: {
            cli: 'npx @hol-org/registry skills get --name "registry-broker" --version "1.2.3"',
            claude:
              'Skill URL (Claude):\nhttps://api.example.com/api/v1/skills/registry-broker%401.2.3/SKILL.md',
            cursor:
              'Skill URL (Cursor):\nhttps://api.example.com/api/v1/skills/registry-broker%401.2.3/SKILL.md',
            codex:
              'Skill URL (Codex):\nhttps://api.example.com/api/v1/skills/registry-broker%401.2.3/SKILL.md',
            openclaw:
              'skill_url: https://api.example.com/api/v1/skills/registry-broker%401.2.3/SKILL.md\nmanifest_url: https://api.example.com/api/v1/skills/registry-broker%401.2.3/manifest',
          },
        }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const install = await client.getSkillInstall('registry-broker@1.2.3');

    expect(install.skillRef).toBe('registry-broker@1.2.3');
    expect(install.artifacts.manifest.pointer).toBe('hcs://1/0.0.6000101');
    expect(install.resolvers.latest.skillRef).toBe('registry-broker@latest');
    expect(install.share.badge?.markdown).toContain(
      'registry-broker on HOL Registry',
    );
    expect(install.snippets.openclaw).toContain('/manifest');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/registry-broker%401.2.3/install',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('records install copy telemetry for a pinned release', async () => {
    fetchImplementation.mockResolvedValueOnce(
      createResponse({
        json: async () => ({ accepted: true }),
      }),
    );

    const client = new RegistryBrokerClient({
      baseUrl: 'https://api.example.com',
      fetchImplementation,
    });

    const response = await client.recordSkillInstallCopy(
      'registry-broker@1.2.3',
      {
        source: 'detail_install_card',
        installType: 'cli',
      },
    );

    expect(response.accepted).toBe(true);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/skills/registry-broker%401.2.3/telemetry/install-copy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: 'detail_install_card',
          installType: 'cli',
        }),
      }),
    );
  });
});
