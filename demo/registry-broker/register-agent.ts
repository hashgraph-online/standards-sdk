import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
  isPendingRegisterAgentResponse,
  isPartialRegisterAgentResponse,
  type AgentRegistrationRequest,
  type AgentRegistrationRequestMetadata,
  type RegisterAgentResponse,
  type AdditionalRegistryCatalogResponse,
  type RegistrationProgressRecord,
} from '../../src/services/registry-broker';
import {
  AIAgentCapability,
  AIAgentType,
  MCPServerCapability,
  ProfileType,
  type HCS11Profile,
} from '../../src/hcs-11/types';
import { waitForAgentAvailability } from '../utils/registry-broker';

export type DemoProfileMode = 'ai' | 'mcp';

export interface RegisteredAgent {
  uaid: string;
  agentId: string;
  alias: string;
  registry: string;
  protocol: 'a2a' | 'mcp' | 'xmtp';
  profile: HCS11Profile;
  endpoint?: string;
  metadata: AgentRegistrationRequestMetadata;
  additionalRegistries:
    | RegisterAgentResponse['additionalRegistries']
    | undefined;
  additionalRegistryCredits?:
    | RegisterAgentResponse['additionalRegistryCredits']
    | undefined;
  additionalRegistryCostPerRegistry?: number;
  registrationResponse: RegisterAgentResponse;
  updateResponse?: RegisterAgentResponse;
  registrationProgress?: RegistrationProgressRecord;
  updateProgress?: RegistrationProgressRecord;
}

export interface RegisterAgentOptions {
  registry?: string;
  metadata?: AgentRegistrationRequestMetadata;
  communicationProtocol?: 'a2a' | 'mcp' | 'xmtp' | 'xmpt';
  additionalRegistries?: string[];
  updateAdditionalRegistries?: string[];
  skipAdditionalRegistryUpdate?: boolean;
  ledgerAccountId?: string;
  ledgerPrivateKey?: string;
}

const parseRegistryListFromEnv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map(entry => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
};

const parseAdditionalRegistriesFromEnv = (): string[] => {
  const extras = new Set<string>(
    parseRegistryListFromEnv(
      process.env.REGISTRY_BROKER_DEMO_ADDITIONAL_REGISTRIES,
    ),
  );
  const enableErc8004 =
    process.env.REGISTRY_BROKER_DEMO_ENABLE_ERC8004 === '1' ||
    process.env.REGISTRY_BROKER_ENABLE_ERC8004 === '1';
  const enableSolana =
    process.env.REGISTRY_BROKER_DEMO_ENABLE_SOLANA === '1' ||
    process.env.REGISTRY_BROKER_ENABLE_SOLANA === '1';
  if (enableErc8004) {
    extras.add('erc-8004');
  }
  if (enableSolana) {
    extras.add('erc-8004-solana');
  }
  return Array.from(extras);
};

const parseUpdateRegistriesFromEnv = (): string[] => {
  if (process.env.REGISTRY_BROKER_DEMO_SKIP_UPDATE === '1') {
    return [];
  }
  const explicit = parseRegistryListFromEnv(
    process.env.REGISTRY_BROKER_DEMO_UPDATE_REGISTRIES,
  );
  if (explicit.length > 0) {
    return explicit;
  }
  const enableErc8004After =
    process.env.REGISTRY_BROKER_DEMO_ENABLE_ERC8004_AFTER === '0'
      ? false
      : true;
  return enableErc8004After ? ['erc-8004'] : [];
};

const normaliseSelectionValue = (value: string): string =>
  value.trim().toLowerCase();

const collectSelectionMatches = (
  selection: string,
  catalog: AdditionalRegistryCatalogResponse,
): string[] => {
  const normalized = normaliseSelectionValue(selection);
  if (!normalized) {
    return [];
  }
  const matches: string[] = [];
  for (const descriptor of catalog.registries) {
    const descriptorId = descriptor.id.toLowerCase();
    if (normalized === descriptorId) {
      descriptor.networks.forEach(network => matches.push(network.key));
      continue;
    }
    for (const network of descriptor.networks) {
      const keyLower = network.key.toLowerCase();
      const networkIdLower = network.networkId.toLowerCase();
      const labelLower = network.label.toLowerCase();
      const nameLower = network.name.toLowerCase();
      if (
        normalized === keyLower ||
        normalized === networkIdLower ||
        normalized === labelLower ||
        normalized === nameLower ||
        normalized === `${descriptorId}:${networkIdLower}`
      ) {
        matches.push(network.key);
      }
    }
  }
  return Array.from(new Set(matches));
};

const resolveAdditionalRegistrySelections = (
  selections: string[],
  catalog: AdditionalRegistryCatalogResponse,
): { resolved: string[]; missing: string[] } => {
  const resolvedKeys = new Set<string>();
  const missing: string[] = [];
  for (const entry of selections) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const matches = collectSelectionMatches(trimmed, catalog);
    if (matches.length === 0) {
      missing.push(trimmed);
      continue;
    }
    matches.forEach(key => resolvedKeys.add(key));
  }
  return { resolved: Array.from(resolvedKeys), missing };
};

const cloneProfile = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const DEFAULT_REGISTRY = 'hashgraph-online';
const DEFAULT_AI_MODEL = 'sdk-demo-model';
const DEFAULT_MCP_VERSION = '2024.10';

const buildAiProfile = (alias: string, endpoint: string): HCS11Profile => {
  return {
    version: '1.0',
    type: ProfileType.AI_AGENT,
    display_name: alias,
    alias,
    bio: `Demo AI agent ${alias} registered via the standards-sdk demo`,
    properties: {
      tags: ['demo', 'sdk', 'registry-broker'],
      agentFactsUrl: `${endpoint.replace(/\/$/, '')}/.well-known/agent.json`,
    },
    socials: [
      {
        platform: 'x',
        handle: 'hashgraphonline',
      },
    ],
    aiAgent: {
      type: AIAgentType.MANUAL,
      model: DEFAULT_AI_MODEL,
      capabilities: [
        AIAgentCapability.TEXT_GENERATION,
        AIAgentCapability.CODE_GENERATION,
        AIAgentCapability.WORKFLOW_AUTOMATION,
      ],
      creator: 'standards-sdk demo',
    },
  } satisfies HCS11Profile;
};

const buildMcpProfile = (alias: string, endpoint: string): HCS11Profile => {
  return {
    version: '1.0',
    type: ProfileType.MCP_SERVER,
    display_name: alias,
    alias,
    bio: `Demo MCP server ${alias} registered via the standards-sdk demo`,
    properties: {
      tags: ['demo', 'sdk', 'registry-broker'],
    },
    socials: [
      {
        platform: 'github',
        handle: 'hashgraphonline',
      },
    ],
    mcpServer: {
      version: DEFAULT_MCP_VERSION,
      description: `Demo MCP server for ${alias}`,
      connectionInfo: {
        url: endpoint,
        transport: 'sse',
      },
      services: [
        MCPServerCapability.RESOURCE_PROVIDER,
        MCPServerCapability.TOOL_PROVIDER,
        MCPServerCapability.API_INTEGRATION,
      ],
      maintainer: 'Hashgraph Online Demo',
      docs: 'https://docs.hashgraphonline.com/registry-broker',
    },
  } satisfies HCS11Profile;
};

const logAdditionalRegistryResults = (
  response: RegisterAgentResponse,
  progress?: RegistrationProgressRecord,
): void => {
  const progressEntries = progress
    ? Object.values(progress.additionalRegistries)
    : undefined;

  if (progressEntries && progressEntries.length > 0) {
    console.log('  Additional registry results:');
    progressEntries.forEach(entry => {
      const detailParts: string[] = [];
      if (entry.agentId) {
        detailParts.push(`agentId: ${entry.agentId}`);
      }
      if (entry.agentUri) {
        detailParts.push(`uri: ${entry.agentUri}`);
      }
      if (typeof entry.credits === 'number') {
        detailParts.push(`credits: ${entry.credits}`);
      }
      if (entry.error) {
        detailParts.push(`error: ${entry.error}`);
      }
      const detail =
        detailParts.length > 0 ? ` (${detailParts.join('; ')})` : '';
      console.log(`    ${entry.registryKey}: ${entry.status}${detail}`);
    });
    return;
  }

  if (
    !response.additionalRegistries ||
    response.additionalRegistries.length === 0
  ) {
    console.log('  Additional registry results: none requested.');
    return;
  }

  console.log('  Additional registry results:');
  response.additionalRegistries.forEach(entry => {
    const detailParts: string[] = [];
    const agentIdDisplay =
      typeof entry.agentIdFull === 'string' && entry.agentIdFull.length > 0
        ? entry.agentIdFull
        : entry.agentId !== undefined
          ? String(entry.agentId)
          : null;
    if (agentIdDisplay) {
      detailParts.push(`agentId: ${agentIdDisplay}`);
    }
    if (entry.agentUri) {
      detailParts.push(`uri: ${entry.agentUri}`);
    }
    if (entry.error) {
      detailParts.push(`error: ${entry.error}`);
    }
    const detail = detailParts.length > 0 ? ` (${detailParts.join('; ')})` : '';
    console.log(`    ${entry.registry}: ${entry.status}${detail}`);
  });
};

const logCreditSummary = (response: RegisterAgentResponse): void => {
  if (!response.credits) {
    return;
  }
  console.log(
    `  Credits charged → base: ${response.credits.base}, additional: ${response.credits.additional}, total: ${response.credits.total}`,
  );
};

const defaultAdditionalRegistries = parseAdditionalRegistriesFromEnv();
const defaultUpdateAdditionalRegistries = parseUpdateRegistriesFromEnv();
const DEFAULT_ERC8004_CHAIN_ID = 11155111;
const erc8004ConfirmationDelayMs = Number(
  process.env.REGISTRY_BROKER_DEMO_ERC8004_CONFIRM_DELAY_MS ?? '4000',
);

type Agent0SdkModule = typeof import('agent0-sdk/dist/core/sdk.js');
type Agent0SdkCtor = Agent0SdkModule['SDK'];

let agent0SdkCtor: Agent0SdkCtor | null = null;

const loadAgent0Sdk = async (): Promise<Agent0SdkCtor> => {
  if (agent0SdkCtor) {
    return agent0SdkCtor;
  }
  const module = await import('agent0-sdk/dist/core/sdk.js');
  agent0SdkCtor = module.SDK;
  return agent0SdkCtor;
};

const describeError = (error: unknown): string => {
  if (error instanceof RegistryBrokerError) {
    return `Registry broker error ${error.status} (${error.statusText}): ${JSON.stringify(error.body)}`;
  }
  if (error instanceof RegistryBrokerParseError) {
    return `Registry broker parse error: ${error.message}`;
  }
  if (error instanceof Error) {
    if ('cause' in error && error.cause) {
      return `${error.message}: ${String(error.cause)}`;
    }
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const waitForAdditionalRegistryProcessing = async (
  client: RegistryBrokerClient,
  response: RegisterAgentResponse,
  context: 'registration' | 'update',
  options: { throwOnFailure?: boolean } = {},
): Promise<RegistrationProgressRecord | undefined> => {
  if (!isPendingRegisterAgentResponse(response) || !response.attemptId) {
    return undefined;
  }

  const throwOnFailure = options.throwOnFailure ?? true;
  const seenStatuses = new Set<string>();
  const contextLabel = `${context.slice(0, 1).toUpperCase()}${context.slice(1)}`;

  console.log(
    `  ${contextLabel} additional registries queued (attempt ${response.attemptId}). Polling progress...`,
  );

  const progress = await client.waitForRegistrationCompletion(
    response.attemptId,
    {
      intervalMs: 2_000,
      throwOnFailure: false,
      onProgress: latest => {
        const summary = Object.values(latest.additionalRegistries)
          .map(entry => `${entry.registryKey}:${entry.status}`)
          .join(', ');
        const key = `${latest.status}:${summary}`;
        if (!seenStatuses.has(key)) {
          const summaryText = summary.length > 0 ? ` (${summary})` : '';
          console.log(`    Progress status → ${latest.status}${summaryText}`);
          seenStatuses.add(key);
        }
      },
    },
  );

  console.log(`  ${contextLabel} progress final status: ${progress.status}`);

  if (
    throwOnFailure &&
    (progress.status === 'partial' || progress.status === 'failed')
  ) {
    throw new Error(
      `${contextLabel} additional registries completed with status ${progress.status}`,
    );
  }

  return progress;
};

interface Erc8004VerificationConfig {
  rpcUrl: string;
  chainId: number;
  signer?: string;
  networkId?: string;
  registryKey?: string;
  identityRegistry?: string;
  reputationRegistry?: string;
  validationRegistry?: string;
  subgraphUrl?: string;
}

const formatNetworkEnvKey = (value: string): string =>
  value.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

const resolveNetworkScopedEnvValue = (
  baseKey: string,
  networkId?: string,
): string | undefined => {
  const formatted = networkId ? formatNetworkEnvKey(networkId) : undefined;
  const legacySuffixMap: Record<string, string> = {
    ERC8004_RPC_URL: 'RPC_URL',
    ERC8004_CHAIN_ID: 'CHAIN_ID',
    ERC8004_IDENTITY_REGISTRY: 'IDENTITY_REGISTRY',
    ERC8004_REPUTATION_REGISTRY: 'REPUTATION_REGISTRY',
    ERC8004_VALIDATION_REGISTRY: 'VALIDATION_REGISTRY',
    ERC8004_SUBGRAPH_URL: 'SUBGRAPH_URL',
    ERC8004_SIGNER: 'SIGNER',
    ERC8004_AGENT_WALLET: 'AGENT_WALLET',
    ERC8004_RPC_FALLBACK_URLS: 'RPC_FALLBACK_URLS',
  };

  const lookup = (key: string | undefined): string | undefined => {
    if (!key) {
      return undefined;
    }
    const value = process.env[key]?.trim();
    return value && value.length > 0 ? value : undefined;
  };

  if (formatted) {
    const scopedKey = `${baseKey}__${formatted}`;
    const scopedValue = lookup(scopedKey);
    if (scopedValue) {
      return scopedValue;
    }

    const legacySuffix = legacySuffixMap[baseKey];
    if (legacySuffix) {
      const legacyKey = `ERC8004_${formatted}_${legacySuffix}`;
      const legacyValue = lookup(legacyKey);
      if (legacyValue) {
        return legacyValue;
      }
    }
  }

  return lookup(baseKey);
};

const resolveErc8004VerificationConfig = (
  networkId?: string,
  chainIdOverride?: number,
  registryKey?: string,
): Erc8004VerificationConfig | null => {
  const rpcUrl = resolveNetworkScopedEnvValue('ERC8004_RPC_URL', networkId);
  if (!rpcUrl) {
    return null;
  }
  const scopedSigner = resolveNetworkScopedEnvValue(
    'ERC8004_SIGNER',
    networkId,
  );
  const signerCandidate = scopedSigner ?? process.env.ETH_PK;
  const signer =
    signerCandidate && signerCandidate.trim().length > 0
      ? signerCandidate.trim()
      : undefined;
  const chainIdValue = resolveNetworkScopedEnvValue(
    'ERC8004_CHAIN_ID',
    networkId,
  );
  const parsedChainId =
    chainIdOverride ?? (chainIdValue ? Number(chainIdValue) : undefined);
  const chainId = Number.isFinite(parsedChainId)
    ? Number(parsedChainId)
    : DEFAULT_ERC8004_CHAIN_ID;
  const identityRegistry = resolveNetworkScopedEnvValue(
    'ERC8004_IDENTITY_REGISTRY',
    networkId,
  );
  const reputationRegistry = resolveNetworkScopedEnvValue(
    'ERC8004_REPUTATION_REGISTRY',
    networkId,
  );
  const validationRegistry = resolveNetworkScopedEnvValue(
    'ERC8004_VALIDATION_REGISTRY',
    networkId,
  );
  const subgraphUrl = resolveNetworkScopedEnvValue(
    'ERC8004_SUBGRAPH_URL',
    networkId,
  );
  return {
    rpcUrl,
    chainId,
    networkId,
    registryKey,
    signer,
    identityRegistry: identityRegistry ?? undefined,
    reputationRegistry: reputationRegistry ?? undefined,
    validationRegistry: validationRegistry ?? undefined,
    subgraphUrl: subgraphUrl ?? undefined,
  };
};

const verifyErc8004Registration = async (
  agentId: string,
  network?: { networkId?: string; chainId?: number; registryKey?: string },
): Promise<void> => {
  const config = resolveErc8004VerificationConfig(
    network?.networkId,
    network?.chainId,
    network?.registryKey,
  );
  if (!config) {
    console.log(
      '  Skipping ERC-8004 on-chain verification (missing ERC8004_RPC_URL and signer configuration).',
    );
    return;
  }

  if (erc8004ConfirmationDelayMs > 0) {
    await delay(erc8004ConfirmationDelayMs);
  }

  const Agent0Sdk = await loadAgent0Sdk();
  const registryOverrideEntries: Record<string, string> = {};
  if (config.identityRegistry) {
    registryOverrideEntries.IDENTITY = config.identityRegistry;
  }
  if (config.reputationRegistry) {
    registryOverrideEntries.REPUTATION = config.reputationRegistry;
  }
  if (config.validationRegistry) {
    registryOverrideEntries.VALIDATION = config.validationRegistry;
  }
  const registryOverrides =
    Object.keys(registryOverrideEntries).length > 0
      ? { [config.chainId]: registryOverrideEntries }
      : undefined;
  const sdk = new Agent0Sdk({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    ...(config.signer ? { signer: config.signer } : {}),
    ...(registryOverrides ? { registryOverrides } : {}),
    ...(config.subgraphUrl ? { subgraphUrl: config.subgraphUrl } : {}),
  });

  let attemptError: unknown;
  const maxAttempts = 10;
  const networkLabel =
    config.networkId ?? config.registryKey ?? `chain ${config.chainId}`;

  const handleVerificationFailure = (error: unknown): 'skip' | 'retry' => {
    const message = describeError(error);
    if (
      message.includes('is not on current chain') ||
      message.includes('Subgraph client required')
    ) {
      console.log(
        `  ⚠️  Skipping ERC-8004 verification on ${networkLabel}: ${message}`,
      );
      return 'skip';
    }
    attemptError = error;
    return 'retry';
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const summary = await sdk.getAgent(agentId);
      if (summary) {
        console.log(
          `  Confirmed ERC-8004 registration via agent0 SDK on ${networkLabel}.`,
        );
        console.log(`    Agent ID: ${summary.agentId}`);
        const primaryOwner =
          Array.isArray(summary.owners) && summary.owners.length > 0
            ? summary.owners[0]
            : undefined;
        if (primaryOwner) {
          console.log(`    Owner: ${primaryOwner}`);
        }
        const summaryUri =
          typeof summary.extras?.uri === 'string'
            ? summary.extras.uri
            : undefined;
        if (summaryUri) {
          console.log(`    Registration URI: ${summaryUri}`);
        }
        return;
      }
    } catch (error) {
      const decision = handleVerificationFailure(error);
      if (decision === 'skip') {
        return;
      }
    }

    try {
      const agentRecord = await sdk.loadAgent(agentId);
      console.log(
        `  Loaded ERC-8004 registration via agent0 SDK on ${networkLabel}.`,
      );
      console.log(`    Agent ID: ${agentId}`);
      if (agentRecord.walletAddress) {
        console.log(`    Wallet: ${agentRecord.walletAddress}`);
      }
      const registrationFile = agentRecord.getRegistrationFile();
      if (
        Array.isArray(registrationFile.endpoints) &&
        registrationFile.endpoints.length > 0
      ) {
        const endpointList = registrationFile.endpoints
          .map(endpoint => endpoint.value)
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          );
        if (endpointList.length > 0) {
          console.log(`    Endpoints: ${endpointList.join(', ')}`);
        }
      }
      return;
    } catch (error) {
      const decision = handleVerificationFailure(error);
      if (decision === 'skip') {
        return;
      }
    }

    const delayMs = 5000 * (attempt + 1);
    const message =
      attemptError instanceof Error
        ? describeError(attemptError)
        : 'Unknown verification failure';
    console.log(
      `  ERC-8004 verification attempt ${attempt + 1}/${maxAttempts} failed: ${message}. Retrying in ${delayMs}ms...`,
    );
    await delay(delayMs);
  }

  if (attemptError) {
    console.log(
      `  ⚠️  Unable to verify ERC-8004 registration on ${networkLabel}: ${describeError(attemptError)}.`,
    );
  }
};

export default async function registerDemoAgent(
  client: RegistryBrokerClient,
  alias: string,
  endpoint: string,
  mode: DemoProfileMode,
  options: RegisterAgentOptions = {},
): Promise<RegisteredAgent> {
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const metadata: AgentRegistrationRequestMetadata = {
    provider: 'sdk-demo',
    ...(options.metadata ?? {}),
  };

  const rawAdditionalRegistries =
    options.additionalRegistries ?? defaultAdditionalRegistries;
  const rawUpdateAdditionalRegistries =
    options.skipAdditionalRegistryUpdate === true
      ? []
      : (options.updateAdditionalRegistries ??
        defaultUpdateAdditionalRegistries);
  let additionalRegistryCatalog: AdditionalRegistryCatalogResponse | null =
    null;

  const prepareAdditionalRegistrySelections = async (
    selections: string[],
  ): Promise<{ resolved: string[]; missing: string[] }> => {
    if (selections.length === 0) {
      return { resolved: [], missing: [] };
    }

    const normalisedSelections = selections
      .map(value => value.trim())
      .filter(Boolean);

    if (!additionalRegistryCatalog) {
      try {
        additionalRegistryCatalog = await client.getAdditionalRegistries();
      } catch (error) {
        console.error(
          `  ❌ Failed to load additional registry catalog: ${describeError(error)}`,
        );
        throw error;
      }
    }

    return resolveAdditionalRegistrySelections(
      normalisedSelections,
      additionalRegistryCatalog,
    );
  };

  const resolvedInitialSelections = await prepareAdditionalRegistrySelections(
    rawAdditionalRegistries,
  );
  const resolvedUpdateSelections = await prepareAdditionalRegistrySelections(
    rawUpdateAdditionalRegistries,
  );

  if (resolvedInitialSelections.missing.length > 0) {
    console.log(
      `  Skipping unavailable additional registries: ${resolvedInitialSelections.missing.join(', ')}`,
    );
  }
  if (resolvedUpdateSelections.missing.length > 0) {
    console.log(
      `  Skipping unavailable additional registries during update: ${resolvedUpdateSelections.missing.join(', ')}`,
    );
  }
  if (resolvedInitialSelections.resolved.length > 0) {
    console.log(
      `  Resolved additional registries for registration: ${resolvedInitialSelections.resolved.join(', ')}`,
    );
  }
  if (resolvedUpdateSelections.resolved.length > 0) {
    console.log(
      `  Resolved additional registries for update: ${resolvedUpdateSelections.resolved.join(', ')}`,
    );
  }

  const defaultProtocol = mode === 'ai' ? 'a2a' : 'mcp';
  let communicationProtocol = defaultProtocol;
  const overrideProtocol = options.communicationProtocol?.trim().toLowerCase();
  if (overrideProtocol) {
    communicationProtocol =
      overrideProtocol === 'xmpt' ? 'xmtp' : overrideProtocol;
  }

  const payload: AgentRegistrationRequest = {
    profile:
      mode === 'ai'
        ? buildAiProfile(alias, endpoint)
        : buildMcpProfile(alias, endpoint),
    communicationProtocol,
    registry,
    metadata,
  };

  if (mode === 'ai') {
    payload.endpoint = endpoint;
  }

  if (resolvedInitialSelections.resolved.length > 0) {
    payload.additionalRegistries = resolvedInitialSelections.resolved;
  }

  let response: RegisterAgentResponse | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await client.registerAgent(payload);
      break;
    } catch (error) {
      if (
        error instanceof RegistryBrokerError &&
        error.status >= 500 &&
        error.status < 600
      ) {
        const attemptIndex = attempt + 1;
        console.warn(
          `  Register attempt ${attemptIndex} timed out (${error.status} ${error.statusText ?? ''}). Retrying…`.trim(),
        );
        await delay(4000 * attemptIndex);
        continue;
      }
      throw error;
    }
  }

  if (!response) {
    throw new Error(
      'Registration request did not complete after multiple retries; aborting.',
    );
  }

  logCreditSummary(response);

  const registrationProgress = await waitForAdditionalRegistryProcessing(
    client,
    response,
    'registration',
  );

  if (isPartialRegisterAgentResponse(response)) {
    console.warn(
      '  Warning: additional registries completed with partial failures.',
    );
  }

  logAdditionalRegistryResults(response, registrationProgress);

  const initialAdditionalRegistrySet = new Set(
    (payload.additionalRegistries ?? [])
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const updateTargets = resolvedUpdateSelections.resolved.filter(value => {
    const normalised = value.trim().toLowerCase();
    return (
      normalised.length > 0 && !initialAdditionalRegistrySet.has(normalised)
    );
  });

  let finalResponse = response;
  let updateResponse: RegisterAgentResponse | undefined;
  let updateProgress: RegistrationProgressRecord | undefined;

  if (updateTargets.length > 0) {
    console.log(
      `  Updating ${response.agentId} to publish to additional registries: ${updateTargets.join(', ')}`,
    );
    try {
      await waitForAgentAvailability(client, response.uaid, 60_000);
    } catch (availabilityError) {
      console.log(
        `  Agent not yet discoverable after initial wait: ${describeError(availabilityError)}. Continuing with update retries...`,
      );
    }
    const profileForUpdate = cloneProfile(payload.profile);
    (profileForUpdate as { uaid?: string }).uaid = response.uaid;

    const updatePayload: AgentRegistrationRequest = {
      profile: profileForUpdate,
      communicationProtocol: payload.communicationProtocol,
      registry,
      metadata,
    };
    if (payload.endpoint) {
      updatePayload.endpoint = payload.endpoint;
    }
    updatePayload.additionalRegistries = updateTargets;

    let attemptError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        const backoffMs = 2000 * attempt;
        await delay(backoffMs);
      }
      try {
        updateResponse = await client.updateAgent(response.uaid, updatePayload);

        const pendingUpdateProgress = await waitForAdditionalRegistryProcessing(
          client,
          updateResponse,
          'update',
        );

        if (isPartialRegisterAgentResponse(updateResponse)) {
          console.warn(
            '  Warning: additional registries update completed with partial failures.',
          );
        }

        logCreditSummary(updateResponse);
        logAdditionalRegistryResults(updateResponse, pendingUpdateProgress);
        finalResponse = updateResponse;
        updateProgress = pendingUpdateProgress ?? updateProgress;

        const verificationEntries: Array<{
          registryKey?: string;
          networkId?: string;
          chainId?: number;
          agentIdentifier?: string;
        }> = [];

        if (pendingUpdateProgress) {
          Object.values(pendingUpdateProgress.additionalRegistries).forEach(
            entry => {
              if (
                entry.registryId !== 'erc-8004' ||
                entry.status === 'failed'
              ) {
                return;
              }
              if (
                typeof entry.agentId === 'string' &&
                entry.agentId.length > 0
              ) {
                verificationEntries.push({
                  registryKey: entry.registryKey,
                  networkId: entry.networkId,
                  chainId: entry.chainId,
                  agentIdentifier: entry.agentId,
                });
              } else if (
                typeof entry.agentId === 'number' &&
                Number.isFinite(entry.agentId) &&
                entry.chainId !== undefined
              ) {
                verificationEntries.push({
                  registryKey: entry.registryKey,
                  networkId: entry.networkId,
                  chainId: entry.chainId,
                  agentIdentifier: `${entry.chainId}:${entry.agentId}`,
                });
              }
            },
          );
        } else if (updateResponse.additionalRegistries) {
          updateResponse.additionalRegistries.forEach(entry => {
            if (
              entry.registry !== 'erc-8004' ||
              entry.status === 'error' ||
              entry.status === 'pending'
            ) {
              return;
            }
            if (
              typeof entry.agentIdFull === 'string' &&
              entry.agentIdFull.length > 0
            ) {
              verificationEntries.push({
                registryKey: entry.registryKey ?? undefined,
                networkId: entry.networkId ?? undefined,
                chainId: entry.chainId ?? undefined,
                agentIdentifier: entry.agentIdFull,
              });
              return;
            }
            if (typeof entry.agentId === 'string' && entry.agentId.length > 0) {
              verificationEntries.push({
                registryKey: entry.registryKey ?? undefined,
                networkId: entry.networkId ?? undefined,
                chainId: entry.chainId ?? undefined,
                agentIdentifier: entry.agentId,
              });
              return;
            }
            if (
              typeof entry.agentId === 'number' &&
              Number.isFinite(entry.agentId) &&
              entry.chainId !== undefined
            ) {
              verificationEntries.push({
                registryKey: entry.registryKey ?? undefined,
                networkId: entry.networkId ?? undefined,
                chainId: entry.chainId,
                agentIdentifier: `${entry.chainId}:${entry.agentId}`,
              });
            }
          });
        }

        for (const entry of verificationEntries) {
          if (!entry.agentIdentifier) {
            continue;
          }
          await verifyErc8004Registration(entry.agentIdentifier, {
            networkId: entry.networkId,
            chainId: entry.chainId,
            registryKey: entry.registryKey,
          });
        }
        break;
      } catch (error) {
        if (
          error instanceof RegistryBrokerError &&
          error.status === 402 &&
          options.ledgerAccountId &&
          options.ledgerPrivateKey
        ) {
          const body = (error.body ?? {}) as Record<string, unknown>;
          const rawShortfall =
            body.shortfallCredits ??
            (body.requiredCredits !== undefined &&
            body.availableCredits !== undefined
              ? Number(body.requiredCredits) - Number(body.availableCredits)
              : undefined);
          const shortfallCredits = Number(rawShortfall ?? 0);
          const creditsPerHbar = Number(body.creditsPerHbar ?? 0);
          const estimatedHbar = Number(body.estimatedHbar ?? 0);
          if (shortfallCredits > 0) {
            const paddedCredits = shortfallCredits + 1;
            const resolvedHbarAmount =
              creditsPerHbar > 0
                ? Math.ceil((paddedCredits / creditsPerHbar) * 1e8) / 1e8
                : estimatedHbar > 0
                  ? estimatedHbar
                  : null;
            if (resolvedHbarAmount && resolvedHbarAmount > 0) {
              console.log(
                `  Purchasing credits to cover update shortfall (${shortfallCredits} credits).`,
              );
              await client.purchaseCreditsWithHbar({
                accountId: options.ledgerAccountId,
                privateKey: options.ledgerPrivateKey,
                hbarAmount: resolvedHbarAmount,
                memo: `registry-broker-demo:update:${alias}`,
                metadata: {
                  purpose: 'agent-update',
                  shortfallCredits,
                  requestedCredits: paddedCredits,
                },
              });
              attemptError = null;
              continue;
            }
          }
        }

        attemptError = error;
        console.log(
          `  Update attempt ${attempt + 1} failed: ${describeError(error)}`,
        );
        if (error instanceof RegistryBrokerParseError) {
          console.log('    Parse error details:', error.cause);
        }
      }
    }

    if (!updateResponse) {
      const failure =
        attemptError instanceof Error
          ? attemptError
          : new Error(describeError(attemptError));
      throw failure;
    }
  } else if (
    rawUpdateAdditionalRegistries.length > 0 &&
    options.skipAdditionalRegistryUpdate !== true
  ) {
    console.log(
      '  Additional registry update not required (registries already published).',
    );
  }

  return {
    uaid: response.uaid,
    agentId: response.agentId,
    alias,
    registry,
    protocol: communicationProtocol === 'xmtp' ? 'xmtp' : defaultProtocol,
    profile: payload.profile,
    endpoint: payload.endpoint,
    metadata,
    additionalRegistries: finalResponse.additionalRegistries,
    additionalRegistryCredits: finalResponse.additionalRegistryCredits,
    additionalRegistryCostPerRegistry:
      finalResponse.additionalRegistryCredits?.[0]?.cost?.credits ??
      finalResponse.additionalRegistryCostPerRegistry ??
      undefined,
    registrationResponse: response,
    updateResponse,
    registrationProgress,
    updateProgress,
  };
}
