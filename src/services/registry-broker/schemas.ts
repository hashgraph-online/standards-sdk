import { z } from 'zod';
import { AIAgentCapability, AIAgentType } from '../../hcs-11/types';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const capabilitySchema = z.nativeEnum(AIAgentCapability);
const capabilityValueSchema = z.union([capabilitySchema, z.string()]);
const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

const agentProfileSchema = z
  .object({
    version: z.string(),
    type: z.number(),
    display_name: z.string(),
    alias: z.string().optional(),
    bio: z.string().optional(),
    socials: z.array(jsonValueSchema).optional(),
    aiAgent: z
      .object({
        type: z.nativeEnum(AIAgentType),
        creator: z.string().optional(),
        model: z.string().optional(),
        capabilities: z.array(capabilitySchema).optional(),
      })
      .optional(),
    uaid: z.string().optional(),
  })
  .catchall(jsonValueSchema);

const searchHitSchema = z.object({
  id: z.string(),
  uaid: z.string(),
  registry: z.string(),
  name: z.string(),
  description: z.string().optional(),
  capabilities: z.array(capabilityValueSchema),
  endpoints: z
    .union([z.record(jsonValueSchema), z.array(z.string())])
    .optional(),
  metadata: z.record(jsonValueSchema).optional(),
  profile: agentProfileSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastSeen: z.string().optional(),
  lastIndexed: z.string().optional(),
});

export const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const statsResponseSchema = z.object({
  totalAgents: z.number(),
  registries: z.record(z.number()),
  capabilities: z.record(z.number()),
  lastUpdate: z.string(),
  status: z.string(),
});

export const registriesResponseSchema = z.object({
  registries: z.array(z.string()),
});

export const popularResponseSchema = z.object({
  searches: z.array(z.string()),
});

export const resolveResponseSchema = z.object({
  agent: searchHitSchema,
});

export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
  uaid: z.string().nullable().optional(),
  agent: z.object({
    name: z.string(),
    description: z.string().optional(),
    capabilities: z.record(jsonValueSchema).nullable().optional(),
    skills: z.array(z.string()).optional(),
  }),
});

export const sendMessageResponseSchema = z.object({
  sessionId: z.string(),
  uaid: z.string().nullable().optional(),
  message: z.string(),
  timestamp: z.string(),
  content: z.string().optional(),
});

export const ledgerChallengeResponseSchema = z.object({
  challengeId: z.string(),
  message: z.string(),
  expiresAt: z.string(),
});

const ledgerApiKeySummarySchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  prefix: z.string(),
  lastFour: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable().optional(),
  ownerType: z.literal('ledger'),
  ledgerAccountId: z.string().optional(),
  ledgerNetwork: z.enum(['mainnet', 'testnet']).optional(),
});

export const ledgerVerifyResponseSchema = z.object({
  key: z.string(),
  apiKey: ledgerApiKeySummarySchema,
  accountId: z.string(),
  network: z.enum(['mainnet', 'testnet']),
});

export const protocolsResponseSchema = z.object({
  protocols: z.array(z.string()),
});

export const detectProtocolResponseSchema = z.object({
  protocol: z.string().nullable(),
});

export const registrySearchByNamespaceSchema = z.object({
  hits: z.array(searchHitSchema),
  total: z.number(),
  page: z.number().optional(),
  limit: z.number().optional(),
});

const vectorSearchFilterSchema = z
  .object({
    capabilities: z.array(z.string()).optional(),
    type: z.string().optional(),
    registry: z.string().optional(),
    protocols: z.array(z.string()).optional(),
  })
  .strict();

export const vectorSearchRequestSchema = z
  .object({
    query: z.string(),
    filter: vectorSearchFilterSchema.optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

const vectorSearchHitSchema = z.object({
  agent: searchHitSchema,
  score: z.number().optional(),
  highlights: z.record(z.array(z.string())).optional(),
});

export const vectorSearchResponseSchema = z.object({
  hits: z.array(vectorSearchHitSchema),
  total: z.number(),
  took: z.number(),
  credits_used: z.number().optional(),
});

export const websocketStatsResponseSchema = z.object({
  clients: z.number(),
  stats: z
    .object({
      totalClients: z.number().optional(),
      clientsByRegistry: z.record(z.number()).optional(),
      clientsByEventType: z.record(z.number()).optional(),
    })
    .passthrough(),
});

const durationStatsSchema = z.object({
  p50: z.number(),
  p90: z.number(),
  p95: z.number(),
  p99: z.number(),
});

export const metricsSummaryResponseSchema = z.object({
  http: z.object({
    requestsTotal: z.number(),
    activeConnections: z.number(),
    requestDuration: durationStatsSchema,
  }),
  search: z.object({
    queriesTotal: z.number(),
    queryDuration: durationStatsSchema,
  }),
  indexing: z.object({ agentsTotal: z.number(), crawlErrors: z.number() }),
  registration: z.object({
    total: z.number(),
    failures: z.number(),
    duration: durationStatsSchema,
  }),
  cache: z.object({ hits: z.number(), misses: z.number(), hitRate: z.number() }),
  websocket: z.object({ connections: z.number() }),
});

export const uaidValidationResponseSchema = z.object({
  uaid: z.string(),
  valid: z.boolean(),
  formats: z.array(z.string()),
});

export const uaidBroadcastResultSchema = z.object({
  uaid: z.string(),
  success: z.boolean(),
  response: jsonValueSchema.optional(),
  error: z.string().optional(),
});

export const uaidBroadcastResponseSchema = z.object({
  results: z.array(uaidBroadcastResultSchema),
});

const adapterConnectionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  protocol: z.string(),
  endpoint: z.string(),
  status: z.enum(['connected', 'disconnected', 'error']),
  metadata: z.record(jsonPrimitiveSchema).optional(),
  createdAt: z.string(),
});

export const uaidConnectionStatusSchema = z.object({
  connected: z.boolean(),
  connection: adapterConnectionSchema.optional(),
  adapter: z.string().optional(),
  agentId: z.string().optional(),
});

export const dashboardStatsResponseSchema = z.object({
  operatorId: z.string().optional(),
  adapters: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
        status: z.string(),
        agentCount: z.number(),
        lastDiscovery: z.string(),
        registryType: z.string(),
        health: z.string(),
      }),
    )
    .optional(),
  totalAgents: z.number().optional(),
  elasticsearchDocumentCount: z.number().optional(),
  agentsByAdapter: z.record(z.number()).optional(),
  agentsByRegistry: z.record(z.number()).optional(),
  systemInfo: z
    .object({
      uptime: z.number().optional(),
      version: z.string().optional(),
      network: z.string().optional(),
    })
    .optional(),
});

const registrationAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  endpoint: z.string().optional(),
  capabilities: z.array(capabilityValueSchema),
  registry: z.string().optional(),
  protocol: z.string().optional(),
  profile: agentProfileSchema.optional(),
  nativeId: z.string().optional(),
  metadata: z.record(jsonValueSchema).optional(),
});

const registrationProfileInfoSchema = z.object({
  tId: z.string(),
  sizeBytes: z.number().optional(),
});

const hcs10RegistrySchema = z
  .object({
    status: z.string(),
    uaid: z.string().optional(),
    transactionId: z.string().optional(),
    consensusTimestamp: z.string().optional(),
    registryTopicId: z.string().optional(),
    topicSequenceNumber: z.number().optional(),
    payloadHash: z.string().optional(),
    profileReference: z.string().optional(),
    tId: z.string().optional(),
    profileSizeBytes: z.number().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const registerAgentResponseSchema = z.object({
  success: z.literal(true),
  status: z.enum(['created', 'duplicate']).optional(),
  uaid: z.string(),
  agentId: z.string(),
  message: z.string(),
  agent: registrationAgentSchema,
  openConvAI: z
    .object({
      compatible: z.boolean(),
      hcs11Profile: agentProfileSchema.optional(),
      bridgeEndpoint: z.string().optional(),
    })
    .optional(),
  profile: registrationProfileInfoSchema.optional(),
  hcs10Registry: hcs10RegistrySchema.optional(),
});

export const registrationQuoteResponseSchema = z.object({
  accountId: z.string().nullable().optional(),
  registry: z.string().optional(),
  protocol: z.string().optional(),
  requiredCredits: z.number(),
  availableCredits: z.number().nullable().optional(),
  shortfallCredits: z.number().nullable().optional(),
  creditsPerHbar: z.number().nullable().optional(),
  estimatedHbar: z.number().nullable().optional(),
});

export const creditPurchaseResponseSchema = z.object({
  success: z.boolean().optional(),
  purchaser: z.string(),
  credits: z.number(),
  hbarAmount: z.number(),
  transactionId: z.string(),
  consensusTimestamp: z.string().nullable().optional(),
});

export const adaptersResponseSchema = z.object({
  adapters: z.array(z.string()),
});

const metadataFacetOptionSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  label: z.string(),
});

const searchFacetSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  type: z.enum(['string', 'boolean', 'number']),
  adapters: z.array(z.string()).optional(),
  options: z.array(metadataFacetOptionSchema).optional(),
});

export const searchFacetsResponseSchema = z.object({
  facets: z.array(searchFacetSchema),
});
