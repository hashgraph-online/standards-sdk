import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RegistryBrokerClient,
  RegistryBrokerError,
  RegistryBrokerParseError,
  type AgentRegistrationRequest,
  type AgentRegistrationRequestMetadata,
  type RegisterAgentResponse,
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
  protocol: 'a2a' | 'mcp';
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
}

export interface RegisterAgentOptions {
  registry?: string;
  metadata?: AgentRegistrationRequestMetadata;
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
  if (enableErc8004) {
    extras.add('erc-8004');
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
): void => {
  if (
    !response.additionalRegistries ||
    response.additionalRegistries.length === 0
  ) {
    return;
  }

  console.log('  Additional registry results:');
  response.additionalRegistries.forEach(entry => {
    const detailParts: string[] = [];
    if (entry.agentId) {
      detailParts.push(`agentId: ${entry.agentId}`);
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

interface Erc8004VerificationConfig {
  rpcUrl: string;
  chainId: number;
  signer: string;
}

const resolveErc8004VerificationConfig =
  (): Erc8004VerificationConfig | null => {
    const rpcUrl = process.env.ERC8004_RPC_URL?.trim() || '';
    if (!rpcUrl) {
      return null;
    }
    const signer = process.env.ETH_PK?.trim();
    if (!signer) {
      return null;
    }
    const chainIdRaw =
      process.env.ERC8004_CHAIN_ID ??
      process.env.ERC8004_DEFAULT_CHAIN_ID ??
      '';
    const parsedChainId = chainIdRaw ? Number(chainIdRaw) : NaN;
    const chainId = Number.isFinite(parsedChainId)
      ? parsedChainId
      : DEFAULT_ERC8004_CHAIN_ID;
    return {
      rpcUrl,
      signer,
      chainId,
    };
  };

const verifyErc8004Registration = async (agentId: string): Promise<void> => {
  const config = resolveErc8004VerificationConfig();
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
  const sdk = new Agent0Sdk({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    signer: config.signer,
  });

  let attemptError: unknown;
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const summary = await sdk.getAgent(agentId);
      if (summary) {
        console.log('  Confirmed ERC-8004 registration via agent0 SDK.');
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

      const agentRecord = await sdk.loadAgent(agentId);
      console.log('  Loaded ERC-8004 registration via agent0 SDK.');
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
      attemptError = error;
      const delayMs = 5000 * (attempt + 1);
      console.log(
        `  ERC-8004 verification attempt ${attempt + 1}/${maxAttempts} failed: ${describeError(error)}. Retrying in ${delayMs}ms...`,
      );
      await delay(delayMs);
    }
  }

  throw attemptError instanceof Error
    ? attemptError
    : new Error(describeError(attemptError));
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

  const additionalRegistries =
    options.additionalRegistries ?? defaultAdditionalRegistries;
  const updateAdditionalRegistries =
    options.skipAdditionalRegistryUpdate === true
      ? []
      : (options.updateAdditionalRegistries ??
        defaultUpdateAdditionalRegistries);

  const payload: AgentRegistrationRequest = {
    profile:
      mode === 'ai'
        ? buildAiProfile(alias, endpoint)
        : buildMcpProfile(alias, endpoint),
    communicationProtocol: mode === 'ai' ? 'a2a' : 'mcp',
    registry,
    metadata,
  };

  if (mode === 'ai') {
    payload.endpoint = endpoint;
  }

  if (additionalRegistries.length > 0) {
    payload.additionalRegistries = additionalRegistries;
  }

  const response = await client.registerAgent(payload);

  logCreditSummary(response);
  logAdditionalRegistryResults(response);

  const initialAdditionalRegistrySet = new Set(
    (payload.additionalRegistries ?? [])
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const updateTargets = updateAdditionalRegistries
    .map(value => value.trim().toLowerCase())
    .filter(value => value.length > 0)
    .filter(value => !initialAdditionalRegistrySet.has(value));

  let finalResponse = response;
  let updateResponse: RegisterAgentResponse | undefined;

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
        logCreditSummary(updateResponse);
        logAdditionalRegistryResults(updateResponse);
        finalResponse = updateResponse;

        const erc8004Result = updateResponse.additionalRegistries?.find(
          entry => entry.registry === 'erc-8004' && entry.status !== 'error',
        );
        if (erc8004Result?.agentId) {
          await verifyErc8004Registration(erc8004Result.agentId);
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
    updateAdditionalRegistries.length > 0 &&
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
    protocol: payload.communicationProtocol === 'mcp' ? 'mcp' : 'a2a',
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
  };
}
