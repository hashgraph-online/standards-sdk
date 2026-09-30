import type { Hcs25SignalAdapter } from './types';
import {
  createAcpSignalAdapter,
  type Hcs25AcpSignalAdapterOptions,
} from './acp';
import {
  createAgentverseInsightsSignalAdapter,
  type Hcs25AgentverseSignalAdapterOptions,
} from './agentverse';
import {
  createAvailabilitySignalAdapter,
  type Hcs25AvailabilitySignalAdapterOptions,
} from './availability';
import {
  createConnectivitySignalAdapter,
  type Hcs25ConnectivitySignalAdapterOptions,
} from './connectivity';
import {
  createErc8004SignalAdapter,
  type Hcs25Erc8004SignalAdapterOptions,
} from './erc8004';
import {
  createEthosSignalAdapter,
  type Hcs25EthosSignalAdapterOptions,
} from './ethos';
import {
  createChatbotArenaSignalAdapter,
  createHuggingFaceSignalAdapter,
  createOpenLlmSignalAdapter,
  createOpenRouterEvalsSignalAdapter,
  type Hcs25ChatbotArenaSignalAdapterOptions,
  type Hcs25HuggingFaceSignalAdapterOptions,
  type Hcs25OpenLlmSignalAdapterOptions,
  type Hcs25OpenRouterEvalsSignalAdapterOptions,
} from './model-evals';
import {
  createOssPopularitySignalAdapter,
  type Hcs25OssPopularitySignalAdapterOptions,
} from './oss-popularity';
import {
  createOutputVerificationSignalAdapter,
  type Hcs25OutputVerificationSignalAdapterOptions,
} from './output-verification';
import {
  createSimpleEvalsSignalAdapter,
  type Hcs25SimpleEvalsSignalAdapterOptions,
} from './simple-evals';
import {
  createX402SignalAdapter,
  type Hcs25X402SignalAdapterOptions,
} from './x402';

type Enable<TOptions> = true | TOptions;

type OmitRequired<TOptions, TKey extends keyof TOptions> = Enable<
  Omit<TOptions, TKey> & Partial<Pick<TOptions, TKey>>
>;

/**
 * Per-family configuration for {@link createHcs25SignalAdapters}. Each key
 * accepts `true` (enable with defaults) or an options object; keys omitted
 * entirely are disabled. `x402` scans on-chain usage by default (viem);
 * `openrouterEvals`, `chatbotArena`, and `openLlm` ship with the
 * production-shaped sources. Families still requiring configuration:
 * `acp`, `erc8004`, `outputVerification`, `simpleEvals` — pass the options
 * object.
 */
export interface Hcs25SignalAdaptersOptions {
  availability?: Enable<Hcs25AvailabilitySignalAdapterOptions>;
  connectivity?: Enable<Hcs25ConnectivitySignalAdapterOptions>;
  ethos?: Enable<Hcs25EthosSignalAdapterOptions>;
  ossPopularity?: Enable<Hcs25OssPopularitySignalAdapterOptions>;
  agentverse?: Enable<Hcs25AgentverseSignalAdapterOptions>;
  huggingFace?: Enable<Hcs25HuggingFaceSignalAdapterOptions>;
  x402?: Enable<Hcs25X402SignalAdapterOptions>;
  acp?: Hcs25AcpSignalAdapterOptions;
  erc8004?: Hcs25Erc8004SignalAdapterOptions;
  openrouterEvals?: Enable<Hcs25OpenRouterEvalsSignalAdapterOptions>;
  chatbotArena?: Enable<Hcs25ChatbotArenaSignalAdapterOptions>;
  openLlm?: Enable<Hcs25OpenLlmSignalAdapterOptions>;
  outputVerification?: Hcs25OutputVerificationSignalAdapterOptions;
  /**
   * Simple-evals adapters per subject family. `a2a` covers A2A/HTTP
   * subjects, `agentverse` is the same schema scoped to AgentVerse/uAgent
   * registries, and `nanda` writes the `nandaSimple*` fields.
   */
  simpleEvals?: {
    a2a?: OmitRequired<Hcs25SimpleEvalsSignalAdapterOptions, 'family'>;
    agentverse?: OmitRequired<Hcs25SimpleEvalsSignalAdapterOptions, 'family'>;
    nanda?: OmitRequired<Hcs25SimpleEvalsSignalAdapterOptions, 'family'>;
  };
}

function optionsOf<TOptions>(
  value: Enable<TOptions> | undefined,
): TOptions | undefined {
  if (value === undefined) {
    return undefined;
  }
  return (value === true ? {} : value) as TOptions;
}

/**
 * Builds the catalog of signal adapters for enabled families. Adapters are
 * returned in a deterministic order; feed them to
 * {@link collectHcs25Signals} (or {@link collectAndScoreTrustScore} for the
 * full collect → score pipeline).
 */
export function createHcs25SignalAdapters(
  options: Hcs25SignalAdaptersOptions,
): Hcs25SignalAdapter[] {
  const adapters: Hcs25SignalAdapter[] = [];

  const availability = optionsOf(options.availability);
  if (availability) {
    adapters.push(createAvailabilitySignalAdapter(availability));
  }
  const connectivity = optionsOf(options.connectivity);
  if (connectivity) {
    adapters.push(createConnectivitySignalAdapter(connectivity));
  }
  const ethos = optionsOf(options.ethos);
  if (ethos) {
    adapters.push(createEthosSignalAdapter(ethos));
  }
  const ossPopularity = optionsOf(options.ossPopularity);
  if (ossPopularity) {
    adapters.push(createOssPopularitySignalAdapter(ossPopularity));
  }
  const agentverse = optionsOf(options.agentverse);
  if (agentverse) {
    adapters.push(createAgentverseInsightsSignalAdapter(agentverse));
  }
  const huggingFace = optionsOf(options.huggingFace);
  if (huggingFace) {
    adapters.push(createHuggingFaceSignalAdapter(huggingFace));
  }

  const x402 = optionsOf(options.x402);
  if (x402) {
    adapters.push(createX402SignalAdapter(x402));
  }
  if (options.acp) {
    adapters.push(createAcpSignalAdapter(options.acp));
  }
  if (options.erc8004) {
    adapters.push(createErc8004SignalAdapter(options.erc8004));
  }
  const openrouterEvals = optionsOf(options.openrouterEvals);
  if (openrouterEvals) {
    adapters.push(createOpenRouterEvalsSignalAdapter(openrouterEvals));
  }
  const chatbotArena = optionsOf(options.chatbotArena);
  if (chatbotArena) {
    adapters.push(createChatbotArenaSignalAdapter(chatbotArena));
  }
  const openLlm = optionsOf(options.openLlm);
  if (openLlm) {
    adapters.push(createOpenLlmSignalAdapter(openLlm));
  }
  if (options.outputVerification) {
    adapters.push(
      createOutputVerificationSignalAdapter(options.outputVerification),
    );
  }

  if (options.simpleEvals) {
    const a2a = optionsOf(options.simpleEvals.a2a);
    if (a2a) {
      adapters.push(
        createSimpleEvalsSignalAdapter({
          family: 'a2a',
          excludeRegistries: ['nanda', 'agentverse', 'uagent'],
          ...a2a,
        }),
      );
    }
    const agentverseEvals = optionsOf(options.simpleEvals.agentverse);
    if (agentverseEvals) {
      adapters.push(
        createSimpleEvalsSignalAdapter({
          family: 'a2a',
          adapterId: 'agentverse-simple-evals',
          includeRegistries: ['agentverse', 'uagent'],
          ...agentverseEvals,
        }),
      );
    }
    const nanda = optionsOf(options.simpleEvals.nanda);
    if (nanda) {
      adapters.push(
        createSimpleEvalsSignalAdapter({
          family: 'nanda',
          includeRegistries: ['nanda'],
          ...nanda,
        }),
      );
    }
  }

  return adapters;
}
