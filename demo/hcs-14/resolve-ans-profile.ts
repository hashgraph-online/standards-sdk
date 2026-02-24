import 'dotenv/config';
import {
  ANS_DNS_WEB_PROFILE_ID,
  AnsDnsWebProfileResolver,
  ResolverRegistry,
} from '../../src/hcs-14';
import type { DidResolutionProfile } from '../../src/hcs-14/resolvers/types';

type AnsProtocol = 'A2A' | 'MCP' | 'HTTP-API';

interface DemoConfig {
  apiBaseUrl: string;
  ssoKey: string;
  protocol: AnsProtocol;
  uaidProto: string;
  limit: number;
  aid: string;
  agentHost?: string;
  agentDisplayName?: string;
  version?: string;
}

interface AnsSearchAgent {
  agentId: string;
  agentHost: string;
  ansName: string;
  agentDisplayName?: string;
  version?: string;
}

interface AnsAgentEndpoint {
  protocol?: string;
  agentUrl?: string;
  metaDataUrl?: string;
}

interface AnsAgentDetails {
  agentId: string;
  agentHost: string;
  ansName: string;
  agentDisplayName?: string;
  version?: string;
  agentStatus?: string;
  endpoints: AnsAgentEndpoint[];
}

interface CandidateFailure {
  agentId: string;
  agentHost: string;
  reason: string;
}

interface ResolutionSuccess {
  uaid: string;
  selectedAgent: AnsAgentDetails;
  profile: DidResolutionProfile;
  failures: CandidateFailure[];
  usedAnsApiCardFallback: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringField(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function optionalEnv(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase();
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return 20;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('ANS_DEMO_LIMIT must be an integer between 1 and 100.');
  }
  return parsed;
}

function parseProtocol(value: string | undefined): AnsProtocol {
  if (!value) {
    return 'A2A';
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'A2A') {
    return 'A2A';
  }
  if (normalized === 'MCP') {
    return 'MCP';
  }
  if (normalized === 'HTTP-API') {
    return 'HTTP-API';
  }
  throw new Error('ANS_DEMO_PROTOCOL must be one of: A2A, MCP, HTTP-API.');
}

function defaultUaidProto(protocol: AnsProtocol): string {
  if (protocol === 'A2A') {
    return 'a2a';
  }
  if (protocol === 'MCP') {
    return 'mcp';
  }
  return 'http-api';
}

function resolveSsoKey(): string {
  const apiKey = optionalEnv(process.env.GODADDY_API_KEY);
  const apiSecret = optionalEnv(process.env.GODADDY_API_SECRET);
  if (apiKey && apiSecret) {
    return `${apiKey}:${apiSecret}`;
  }
  throw new Error(
    'GODADDY_API_KEY and GODADDY_API_SECRET are required in environment.',
  );
}

function loadConfig(): DemoConfig {
  const protocol = parseProtocol(process.env.ANS_DEMO_PROTOCOL);
  const uaidProto =
    optionalEnv(process.env.ANS_DEMO_UAID_PROTO) ?? defaultUaidProto(protocol);

  return {
    apiBaseUrl:
      optionalEnv(process.env.ANS_DEMO_BASE_URL) ?? 'https://api.godaddy.com',
    ssoKey: resolveSsoKey(),
    protocol,
    uaidProto,
    limit: parseLimit(process.env.ANS_DEMO_LIMIT),
    aid: optionalEnv(process.env.ANS_DEMO_AID) ?? 'QmAnsApiDemoAid123',
    agentHost: optionalEnv(process.env.ANS_DEMO_AGENT_HOST),
    agentDisplayName: optionalEnv(process.env.ANS_DEMO_AGENT_DISPLAY_NAME),
    version: optionalEnv(process.env.ANS_DEMO_VERSION),
  };
}

async function requestAnsJson(url: URL, ssoKey: string): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (ssoKey) {
    headers.authorization = `sso-key ${ssoKey}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'manual',
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    throw new Error(
      `ANS API redirected (${response.status}) to ${location ?? 'an auth login'}; verify GODADDY_API_KEY/GODADDY_API_SECRET and GoDaddy API access for the selected environment.`,
    );
  }

  if (!response.ok) {
    const body = await response.text();
    const snippet = body.slice(0, 500);
    throw new Error(
      `ANS API request failed (${response.status}) for ${url.pathname}: ${snippet}`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const body = await response.text();
    const snippet = body.slice(0, 500);
    throw new Error(
      `ANS API returned non-JSON content (${contentType}) for ${url.pathname}: ${snippet}`,
    );
  }

  const payload: unknown = await response.json();
  return payload;
}

async function requestPublicJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Agent Card request failed (${response.status}) at ${url}`);
  }

  const payload: unknown = await response.json();
  return payload;
}

function isAnsCardPayload(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  const ansName = readStringField(payload, 'ansName');
  if (!ansName) {
    return false;
  }
  return isRecord(payload['endpoints']);
}

function sanitizeEndpointKey(
  protocol: string | undefined,
  index: number,
): string {
  const rawProtocol = protocol?.trim().toLowerCase() ?? 'endpoint';
  const cleaned = rawProtocol.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!cleaned) {
    return `endpoint-${index + 1}`;
  }
  return `${cleaned}-${index + 1}`;
}

function synthesizeAnsCardFromApiDetails(
  details: AnsAgentDetails,
): Record<string, unknown> | null {
  const endpoints: Record<string, { url: string }> = {};
  for (let index = 0; index < details.endpoints.length; index += 1) {
    const endpoint = details.endpoints[index];
    const agentUrl = endpoint.agentUrl?.trim();
    if (!agentUrl) {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(agentUrl);
    } catch {
      continue;
    }
    const key = sanitizeEndpointKey(endpoint.protocol, index);
    endpoints[key] = { url: parsed.toString() };
  }

  if (Object.keys(endpoints).length === 0) {
    return null;
  }

  return {
    ansName: details.ansName,
    endpoints,
  };
}

interface AnsCardPayloadResult {
  payload: unknown;
  usedAnsApiCardFallback: boolean;
}

async function resolveAnsCardPayload(
  url: string,
  details: AnsAgentDetails,
): Promise<AnsCardPayloadResult> {
  const fallbackCard = synthesizeAnsCardFromApiDetails(details);
  let urlHost: string | undefined;
  try {
    urlHost = normalizeHost(new URL(url).hostname);
  } catch {
    urlHost = undefined;
  }

  const fallbackEligible =
    !!fallbackCard && urlHost === normalizeHost(details.agentHost);

  try {
    const payload = await requestPublicJson(url);
    if (isAnsCardPayload(payload)) {
      return {
        payload,
        usedAnsApiCardFallback: false,
      };
    }
    if (!fallbackEligible) {
      throw new Error(
        'Agent Card payload is missing ansName/endpoints and no compatible fallback is available.',
      );
    }
  } catch (error) {
    if (!fallbackEligible) {
      throw error;
    }
  }

  return {
    payload: fallbackCard,
    usedAnsApiCardFallback: true,
  };
}

function parseSearchAgents(payload: unknown): AnsSearchAgent[] {
  if (!isRecord(payload)) {
    return [];
  }

  const rawAgents = payload['agents'];
  if (!Array.isArray(rawAgents)) {
    return [];
  }

  const agents: AnsSearchAgent[] = [];
  for (const rawAgent of rawAgents) {
    if (!isRecord(rawAgent)) {
      continue;
    }

    const agentId = readStringField(rawAgent, 'agentId');
    const agentHost = readStringField(rawAgent, 'agentHost');
    const ansName = readStringField(rawAgent, 'ansName');

    if (!agentId || !agentHost || !ansName) {
      continue;
    }

    agents.push({
      agentId,
      agentHost,
      ansName,
      agentDisplayName: readStringField(rawAgent, 'agentDisplayName'),
      version: readStringField(rawAgent, 'version'),
    });
  }

  return agents;
}

function parseAgentEndpoints(value: unknown): AnsAgentEndpoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const endpoints: AnsAgentEndpoint[] = [];
  for (const rawEndpoint of value) {
    if (!isRecord(rawEndpoint)) {
      continue;
    }

    endpoints.push({
      protocol: readStringField(rawEndpoint, 'protocol'),
      agentUrl: readStringField(rawEndpoint, 'agentUrl'),
      metaDataUrl: readStringField(rawEndpoint, 'metaDataUrl'),
    });
  }

  return endpoints;
}

function parseAgentDetails(payload: unknown): AnsAgentDetails | null {
  if (!isRecord(payload)) {
    return null;
  }

  const agentId = readStringField(payload, 'agentId');
  const agentHost = readStringField(payload, 'agentHost');
  const ansName = readStringField(payload, 'ansName');

  if (!agentId || !agentHost || !ansName) {
    return null;
  }

  return {
    agentId,
    agentHost,
    ansName,
    agentDisplayName: readStringField(payload, 'agentDisplayName'),
    version: readStringField(payload, 'version'),
    agentStatus: readStringField(payload, 'agentStatus'),
    endpoints: parseAgentEndpoints(payload['endpoints']),
  };
}

async function searchAgents(config: DemoConfig): Promise<AnsSearchAgent[]> {
  const searchUrl = new URL('/v1/agents', config.apiBaseUrl);
  searchUrl.searchParams.set('protocol', config.protocol);
  searchUrl.searchParams.set('limit', String(config.limit));
  searchUrl.searchParams.set('offset', '0');

  if (config.agentHost) {
    searchUrl.searchParams.set('agentHost', config.agentHost);
  }
  if (config.agentDisplayName) {
    searchUrl.searchParams.set('agentDisplayName', config.agentDisplayName);
  }
  if (config.version) {
    searchUrl.searchParams.set('version', config.version);
  }

  const payload = await requestAnsJson(searchUrl, config.ssoKey);
  return parseSearchAgents(payload);
}

async function fetchAgentDetails(
  config: DemoConfig,
  agentId: string,
): Promise<AnsAgentDetails | null> {
  const detailsUrl = new URL(
    `/v1/agents/${encodeURIComponent(agentId)}`,
    config.apiBaseUrl,
  );
  const payload = await requestAnsJson(detailsUrl, config.ssoKey);
  return parseAgentDetails(payload);
}

function buildDemoUaid(
  aid: string,
  ansName: string,
  uaidProto: string,
  nativeId: string,
): string {
  return `uaid:aid:${aid};uid=${ansName};registry=ans;proto=${uaidProto};nativeId=${nativeId}`;
}

function formatFailures(failures: CandidateFailure[]): string {
  if (failures.length === 0) {
    return 'No candidate agents were returned by the search query.';
  }
  return failures
    .map(failure => {
      return `${failure.agentHost} (${failure.agentId}): ${failure.reason}`;
    })
    .join('; ');
}

async function resolveFirstFunctionalAgent(
  config: DemoConfig,
): Promise<ResolutionSuccess> {
  const searchResults = await searchAgents(config);
  if (searchResults.length === 0) {
    throw new Error('ANS search returned no candidate agents.');
  }

  const failures: CandidateFailure[] = [];
  for (const searchAgent of searchResults) {
    const details = await fetchAgentDetails(config, searchAgent.agentId);
    if (!details) {
      failures.push({
        agentId: searchAgent.agentId,
        agentHost: searchAgent.agentHost,
        reason: 'agent details response was malformed',
      });
      continue;
    }

    if (details.agentStatus !== 'ACTIVE') {
      failures.push({
        agentId: details.agentId,
        agentHost: details.agentHost,
        reason: `agent status is ${details.agentStatus ?? 'unknown'}`,
      });
      continue;
    }

    const uaid = buildDemoUaid(
      config.aid,
      details.ansName,
      config.uaidProto,
      details.agentHost,
    );

    let usedAnsApiCardFallback = false;
    const registry = new ResolverRegistry();
    registry.registerAdapter(
      new AnsDnsWebProfileResolver({
        fetchJson: async (url: string) => {
          const result = await resolveAnsCardPayload(url, details);
          if (result.usedAnsApiCardFallback) {
            usedAnsApiCardFallback = true;
          }
          return result.payload;
        },
      }),
    );

    const profile = await registry.resolveUaidProfile(uaid, {
      profileId: ANS_DNS_WEB_PROFILE_ID,
    });

    if (!profile) {
      failures.push({
        agentId: details.agentId,
        agentHost: details.agentHost,
        reason: 'resolver returned null profile',
      });
      continue;
    }

    if (profile.error || profile.metadata?.resolved === false) {
      failures.push({
        agentId: details.agentId,
        agentHost: details.agentHost,
        reason: profile.error?.code ?? 'profile resolution failed',
      });
      continue;
    }

    return {
      uaid,
      selectedAgent: details,
      profile,
      failures,
      usedAnsApiCardFallback,
    };
  }

  throw new Error(
    `No functional ANS agent resolved successfully. ${formatFailures(failures)}`,
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  const resolved = await resolveFirstFunctionalAgent(config);
  const output = {
    uaid: resolved.uaid,
    runtime: {
      apiBaseUrl: config.apiBaseUrl,
      authConfigured: true,
      protocolFilter: config.protocol,
      uaidProto: config.uaidProto,
      search: {
        agentHost: config.agentHost,
        agentDisplayName: config.agentDisplayName,
        version: config.version,
        limit: config.limit,
      },
      usedAnsApiCardFallback: resolved.usedAnsApiCardFallback,
      failedCandidatesBeforeSuccess: resolved.failures,
    },
    selectedAgent: resolved.selectedAgent,
    resolvedProfile: resolved.profile,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    process.stderr.write(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
