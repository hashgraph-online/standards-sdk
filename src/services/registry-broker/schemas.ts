import { z } from 'zod';
import { adapterDeclarationSchema } from '../../hcs-21/types';

export enum AIAgentType {
  MANUAL = 0,
  AUTONOMOUS = 1,
}

export enum AIAgentCapability {
  TEXT_GENERATION = 0,
  IMAGE_GENERATION = 1,
  AUDIO_GENERATION = 2,
  VIDEO_GENERATION = 3,
  CODE_GENERATION = 4,
  LANGUAGE_TRANSLATION = 5,
  SUMMARIZATION_EXTRACTION = 6,
  KNOWLEDGE_RETRIEVAL = 7,
  DATA_INTEGRATION = 8,
  MARKET_INTELLIGENCE = 9,
  TRANSACTION_ANALYTICS = 10,
  SMART_CONTRACT_AUDIT = 11,
  GOVERNANCE_FACILITATION = 12,
  SECURITY_MONITORING = 13,
  COMPLIANCE_ANALYSIS = 14,
  FRAUD_DETECTION = 15,
  MULTI_AGENT_COORDINATION = 16,
  API_INTEGRATION = 17,
  WORKFLOW_AUTOMATION = 18,
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const capabilitySchema = z.nativeEnum(AIAgentCapability);
const capabilityValueSchema = z.union([z.number(), z.string()]);
const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
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
        capabilities: z
          .array(z.union([capabilitySchema, z.number()]))
          .optional(),
      })
      .optional(),
    uaid: z.string().optional(),
  })
  .catchall(jsonValueSchema);

const cipherEnvelopeRecipientSchema = z.object({
  uaid: z.string().optional(),
  ledgerAccountId: z.string().optional(),
  userId: z.string().optional(),
  email: z.string().optional(),
  encryptedShare: z.string(),
});

const cipherEnvelopeSchema = z.object({
  algorithm: z.string(),
  ciphertext: z.string(),
  nonce: z.string(),
  associatedData: z.string().optional(),
  keyLocator: z
    .object({
      sessionId: z.string().optional(),
      revision: z.number().optional(),
    })
    .optional(),
  recipients: z.array(cipherEnvelopeRecipientSchema),
});

const peerSummarySchema = z.object({
  keyType: z.string(),
  publicKey: z.string(),
  uaid: z.string().optional(),
  ledgerAccountId: z.string().optional(),
  userId: z.string().optional(),
  email: z.string().optional(),
});

const handshakeParticipantSchema = z.object({
  role: z.enum(['requester', 'responder']),
  uaid: z.string().optional(),
  userId: z.string().optional(),
  ledgerAccountId: z.string().optional(),
  keyType: z.string(),
  longTermPublicKey: z.string().optional(),
  ephemeralPublicKey: z.string(),
  signature: z.string().optional(),
  metadata: z.record(jsonValueSchema).optional(),
  submittedAt: z.string(),
});

const encryptionHandshakeRecordSchema = z.object({
  sessionId: z.string(),
  algorithm: z.string(),
  createdAt: z.string(),
  expiresAt: z.number(),
  status: z.enum(['pending', 'complete']),
  requester: handshakeParticipantSchema.optional(),
  responder: handshakeParticipantSchema.optional(),
});

const sessionEncryptionSummarySchema = z.object({
  enabled: z.boolean(),
  algorithm: z.string(),
  requireCiphertext: z.boolean(),
  requester: peerSummarySchema.nullable().optional(),
  responder: peerSummarySchema.nullable().optional(),
  handshake: encryptionHandshakeRecordSchema.nullable().optional(),
});

const chatHistoryEntrySchema = z.object({
  messageId: z.string(),
  role: z.enum(['user', 'agent']),
  content: z.string(),
  timestamp: z.string(),
  cipherEnvelope: cipherEnvelopeSchema.optional(),
  metadata: z.record(jsonValueSchema).optional(),
});

const metadataFacetSchema = z
  .record(
    z.union([
      z.array(jsonValueSchema),
      z.record(jsonValueSchema),
      jsonValueSchema,
    ]),
  )
  .optional();

const searchHitSchema = z
  .object({
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
    metadataFacet: metadataFacetSchema,
    profile: agentProfileSchema.optional(),
    protocols: z.array(z.string()).optional(),
    adapter: z.string().optional(),
    originalId: z.string().optional(),
    communicationSupported: z.boolean().optional(),
    routingSupported: z.boolean().optional(),
    available: z.boolean().optional(),
    availabilityStatus: z.string().optional(),
    availabilityCheckedAt: z.string().optional(),
    availabilitySource: z.string().optional(),
    availabilityLatencyMs: z.number().optional(),
    availabilityScore: z.number().optional(),
    capabilityLabels: z.array(z.string()).optional(),
    capabilityTokens: z.array(z.string()).optional(),
    image: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    lastSeen: z.string().optional(),
    lastIndexed: z.string().optional(),
  })
  .passthrough();

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

const agentFeedbackSummarySchema = z.object({
  averageScore: z.number(),
  totalFeedbacks: z.number(),
  registry: z.string().optional(),
  network: z.string().optional(),
  updatedAt: z.string().optional(),
});

const agentFeedbackEntrySchema = z.object({
  registry: z.string(),
  network: z.string().optional(),
  agentId: z.number(),
  client: z.string(),
  score: z.number(),
  tag1: z.string().nullable().optional(),
  tag2: z.string().nullable().optional(),
  revoked: z.boolean(),
  feedbackIndex: z.number().nullable().optional(),
  fileUri: z.string().nullable().optional(),
  fileHash: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

export const agentFeedbackResponseSchema = z.object({
  uaid: z.string(),
  summary: agentFeedbackSummarySchema,
  entries: z.array(agentFeedbackEntrySchema),
});

export const agentFeedbackEligibilityResponseSchema = z.object({
  uaid: z.string(),
  sessionId: z.string(),
  eligible: z.boolean(),
  messageCount: z.number(),
  minimumMessages: z.number(),
  reason: z.string().optional(),
  onchain: z
    .object({
      eligible: z.boolean(),
      reason: z.string().optional(),
      estimatedCredits: z.number().optional(),
      usdEstimate: z.number().optional(),
      nativeFeeEstimate: z.number().optional(),
    })
    .optional(),
});

export const agentFeedbackSubmissionResponseSchema = z.object({
  uaid: z.string(),
  registry: z.string(),
  network: z.string().optional(),
  agentId: z.number(),
  score: z.number(),
  tag1: z.string().nullable().optional(),
  tag2: z.string().nullable().optional(),
  fileUri: z.string().nullable().optional(),
  fileHash: z.string().nullable().optional(),
  feedbackIndex: z.number().nullable().optional(),
  transactionHash: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  submittedAt: z.string(),
});

export const agentFeedbackIndexResponseSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  items: z.array(
    z.object({
      uaid: z.string(),
      registry: z.string(),
      network: z.string().optional(),
      agentId: z.number().nullable().optional(),
      summary: agentFeedbackSummarySchema.nullable(),
      trustScore: z.number().nullable().optional(),
    }),
  ),
});

export const agentFeedbackEntriesIndexResponseSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  items: z.array(
    z.object({
      uaid: z.string(),
      entry: agentFeedbackEntrySchema,
    }),
  ),
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
  history: z.array(chatHistoryEntrySchema).optional().default([]),
  historyTtlSeconds: z.number().nullable().optional(),
  encryption: sessionEncryptionSummarySchema.nullable().optional(),
});

export const sendMessageResponseSchema = z.object({
  sessionId: z.string(),
  uaid: z.string().nullable().optional(),
  message: z.string(),
  timestamp: z.string(),
  rawResponse: jsonValueSchema.optional(),
  content: z.string().optional(),
  ops: z.array(z.record(jsonValueSchema)).optional(),
  history: z.array(chatHistoryEntrySchema).optional(),
  historyTtlSeconds: z.number().nullable().optional(),
  encrypted: z.boolean().optional(),
});

export const chatHistorySnapshotResponseSchema = z.object({
  sessionId: z.string(),
  history: z.array(chatHistoryEntrySchema),
  historyTtlSeconds: z.number(),
});

export const chatHistoryCompactionRequestSchema = z
  .object({
    preserveEntries: z.number().int().min(0).optional(),
  })
  .strict();

export const chatHistoryCompactionResponseSchema = z.object({
  sessionId: z.string(),
  history: z.array(chatHistoryEntrySchema),
  summaryEntry: chatHistoryEntrySchema,
  preservedEntries: z.array(chatHistoryEntrySchema),
  historyTtlSeconds: z.number(),
  creditsDebited: z.number(),
  metadata: z.record(jsonValueSchema).optional(),
});

export const sessionEncryptionStatusResponseSchema = z.object({
  sessionId: z.string(),
  encryption: sessionEncryptionSummarySchema.nullable(),
});

export const encryptionHandshakeResponseSchema = z.object({
  sessionId: z.string(),
  handshake: encryptionHandshakeRecordSchema,
});

export const registerEncryptionKeyResponseSchema = z.object({
  id: z.string(),
  keyType: z.string(),
  publicKey: z.string(),
  uaid: z.string().nullable(),
  ledgerAccountId: z.string().nullable(),
  ledgerNetwork: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
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
  ledgerNetwork: z.string().optional(),
  ledgerNetworkCanonical: z.string().optional(),
});

export const ledgerVerifyResponseSchema = z.object({
  key: z.string(),
  apiKey: ledgerApiKeySummarySchema,
  accountId: z.string(),
  network: z.string(),
  networkCanonical: z.string().optional(),
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

const capabilityFilterValueSchema = z.union([z.string(), z.number()]);

const vectorSearchFilterSchema = z
  .object({
    capabilities: z.array(capabilityFilterValueSchema).optional(),
    type: z.enum(['ai-agents', 'mcp-servers']).optional(),
    registry: z.string().optional(),
    protocols: z.array(z.string()).optional(),
    adapter: z.array(z.string()).optional(),
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
  totalAvailable: z.number().optional(),
  visible: z.number().optional(),
  limited: z.boolean().optional(),
  credits_used: z.number().optional(),
});

const vectorStatusSchema = z.object({
  enabled: z.boolean(),
  healthy: z.boolean(),
  mode: z.enum(['disabled', 'initializing', 'healthy', 'degraded', 'error']),
  lastUpdated: z.string(),
  details: z.record(z.any()).optional(),
  lastError: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
});

export const searchStatusResponseSchema = z.object({
  storageMode: z.string(),
  vectorStatus: vectorStatusSchema,
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
  cache: z.object({
    hits: z.number(),
    misses: z.number(),
    hitRate: z.number(),
  }),
  websocket: z.object({ connections: z.number() }),
});

export const uaidValidationResponseSchema = z.object({
  uaid: z.string(),
  valid: z.boolean(),
  formats: z.array(z.string()),
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
  tId: z.string().nullable(),
  sizeBytes: z.number().optional(),
});

const profileRegistrySchema = z
  .object({
    topicId: z.string().optional(),
    sequenceNumber: z.number().optional(),
    profileReference: z.string().optional(),
    profileTopicId: z.string().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const additionalRegistryResultSchema = z.object({
  registry: z.string(),
  status: z.enum([
    'created',
    'duplicate',
    'skipped',
    'error',
    'updated',
    'pending',
  ]),
  agentId: z.string().nullable().optional(),
  agentUri: z.string().nullable().optional(),
  error: z.string().optional(),
  metadata: z.record(jsonValueSchema).optional(),
  registryKey: z.string().optional(),
  networkId: z.string().optional(),
  networkName: z.string().optional(),
  chainId: z.number().optional(),
  estimatedCredits: z.number().nullable().optional(),
  gasEstimateCredits: z.number().nullable().optional(),
  gasEstimateUsd: z.number().nullable().optional(),
  gasPriceGwei: z.number().nullable().optional(),
  gasLimit: z.number().nullable().optional(),
  creditMode: z.enum(['fixed', 'gas']).nullable().optional(),
  minCredits: z.number().nullable().optional(),
  consumedCredits: z.number().nullable().optional(),
  cost: z
    .object({
      credits: z.number(),
      usd: z.number(),
      eth: z.number(),
      gasUsedWei: z.string(),
      effectiveGasPriceWei: z.string().nullable().optional(),
      transactions: z
        .array(
          z.object({
            hash: z.string(),
            gasUsedWei: z.string(),
            effectiveGasPriceWei: z.string().nullable().optional(),
            costWei: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const registrationCreditsSchema = z.object({
  base: z.number(),
  additional: z.number(),
  total: z.number(),
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

const additionalRegistryNetworkSchema = z
  .object({
    key: z.string(),
    registryId: z.string().optional(),
    networkId: z.string().optional(),
    name: z.string().optional(),
    chainId: z.number().optional(),
    label: z.string().optional(),
    estimatedCredits: z.number().nullable().optional(),
    baseCredits: z.number().nullable().optional(),
    gasPortionCredits: z.number().nullable().optional(),
    gasPortionUsd: z.number().nullable().optional(),
    gasEstimateCredits: z.number().nullable().optional(),
    gasEstimateUsd: z.number().nullable().optional(),
    gasPriceGwei: z.number().nullable().optional(),
    gasLimit: z.number().nullable().optional(),
    minCredits: z.number().nullable().optional(),
    creditMode: z.string().nullable().optional(),
  })
  .passthrough();

const additionalRegistryDescriptorSchema = z.object({
  id: z.string(),
  label: z.string(),
  networks: z.array(additionalRegistryNetworkSchema),
});

export const additionalRegistryCatalogResponseSchema = z.object({
  registries: z.array(additionalRegistryDescriptorSchema),
});

const registerAgentSuccessResponse = z.object({
  success: z.literal(true),
  status: z.enum(['created', 'duplicate', 'updated']).optional(),
  uaid: z.string(),
  agentId: z.string(),
  message: z.string().optional(),
  registry: z.string().optional(),
  attemptId: z.string().nullable().optional(),
  agent: registrationAgentSchema,
  openConvAI: z
    .object({
      compatible: z.boolean(),
      hcs11Profile: agentProfileSchema.optional(),
      bridgeEndpoint: z.string().optional(),
    })
    .optional(),
  profile: registrationProfileInfoSchema.optional(),
  profileRegistry: profileRegistrySchema.nullable().optional(),
  hcs10Registry: hcs10RegistrySchema.nullable().optional(),
  credits: registrationCreditsSchema.optional(),
  additionalRegistries: z.array(additionalRegistryResultSchema).optional(),
  additionalRegistryCredits: z.array(additionalRegistryResultSchema).optional(),
  additionalRegistryCostPerRegistry: z.number().optional(),
  additionalRegistrySecrets: z
    .record(z.string(), z.record(jsonValueSchema))
    .optional(),
});

const registerAgentPendingResponse = z.object({
  success: z.literal(true),
  status: z.literal('pending'),
  message: z.string(),
  uaid: z.string(),
  agentId: z.string(),
  registry: z.string().optional(),
  attemptId: z.string().nullable(),
  agent: registrationAgentSchema,
  openConvAI: z
    .object({
      compatible: z.boolean(),
      hcs11Profile: agentProfileSchema.optional(),
      bridgeEndpoint: z.string().optional(),
    })
    .optional(),
  profile: registrationProfileInfoSchema.optional(),
  profileRegistry: profileRegistrySchema.nullable().optional(),
  hcs10Registry: hcs10RegistrySchema.nullable().optional(),
  credits: registrationCreditsSchema,
  additionalRegistries: z.array(additionalRegistryResultSchema),
  additionalRegistryCredits: z.array(additionalRegistryResultSchema).optional(),
  additionalRegistryCostPerRegistry: z.number().optional(),
  additionalRegistrySecrets: z
    .record(z.string(), z.record(jsonValueSchema))
    .optional(),
});

const registerAgentPartialResponse = z.object({
  success: z.literal(false),
  status: z.literal('partial'),
  message: z.string(),
  uaid: z.string(),
  agentId: z.string(),
  registry: z.string().optional(),
  attemptId: z.string().nullable().optional(),
  agent: registrationAgentSchema,
  openConvAI: z
    .object({
      compatible: z.boolean(),
      hcs11Profile: agentProfileSchema.optional(),
      bridgeEndpoint: z.string().optional(),
    })
    .optional(),
  profile: registrationProfileInfoSchema.optional(),
  profileRegistry: profileRegistrySchema.nullable().optional(),
  hcs10Registry: hcs10RegistrySchema.nullable().optional(),
  credits: registrationCreditsSchema.optional(),
  additionalRegistries: z.array(additionalRegistryResultSchema).optional(),
  additionalRegistryCredits: z.array(additionalRegistryResultSchema).optional(),
  additionalRegistryCostPerRegistry: z.number().optional(),
  additionalRegistrySecrets: z
    .record(z.string(), z.record(jsonValueSchema))
    .optional(),
  errors: z
    .array(
      z.object({
        registry: z.string(),
        registryKey: z.string().nullable().optional(),
        error: z.string(),
      }),
    )
    .min(1),
});

export const registerAgentSuccessResponseSchema = registerAgentSuccessResponse;
export const registerAgentPendingResponseSchema = registerAgentPendingResponse;
export const registerAgentPartialResponseSchema = registerAgentPartialResponse;
export const registerAgentResponseSchema = z.union([
  registerAgentSuccessResponse,
  registerAgentPendingResponse,
  registerAgentPartialResponse,
]);

const registrationProgressAdditionalEntry = z.object({
  registryId: z.string(),
  registryKey: z.string(),
  networkId: z.string().optional(),
  networkName: z.string().optional(),
  chainId: z.number().optional(),
  label: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  error: z.string().optional(),
  credits: z.number().nullable().optional(),
  agentId: z.string().nullable().optional(),
  agentUri: z.string().nullable().optional(),
  metadata: z.record(jsonValueSchema).optional(),
  lastUpdated: z.string(),
});

const registrationProgressRecord = z.object({
  attemptId: z.string(),
  mode: z.enum(['register', 'update']),
  status: z.enum(['pending', 'partial', 'completed', 'failed']),
  uaid: z.string().optional(),
  agentId: z.string().optional(),
  registryNamespace: z.string(),
  accountId: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  primary: z.object({
    status: z.enum(['pending', 'completed', 'failed']),
    finishedAt: z.string().optional(),
    error: z.string().optional(),
  }),
  additionalRegistries: z.record(
    z.string(),
    registrationProgressAdditionalEntry,
  ),
  errors: z.array(z.string()).optional(),
});

export const registrationProgressResponseSchema = z.object({
  progress: registrationProgressRecord,
});

export const registrationProgressAdditionalEntrySchema =
  registrationProgressAdditionalEntry;
export const registrationProgressRecordSchema = registrationProgressRecord;

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

const x402SettlementSchema = z
  .object({
    success: z.boolean().optional(),
    transaction: z.string().optional(),
    network: z.string().optional(),
    payer: z.string().optional(),
    errorReason: z.string().optional(),
  })
  .strict();

export const x402CreditPurchaseResponseSchema = z.object({
  success: z.boolean(),
  accountId: z.string(),
  creditedCredits: z.number(),
  usdAmount: z.number(),
  balance: z.number(),
  payment: z
    .object({
      payer: z.string().optional(),
      requirement: z.record(jsonValueSchema).optional(),
      settlement: x402SettlementSchema.optional(),
    })
    .optional(),
});

export const x402MinimumsResponseSchema = z.object({
  minimums: z
    .record(
      z.object({
        network: z.string().optional(),
        gasLimit: z.number().optional(),
        gasPriceWei: z.string().optional(),
        gasUsd: z.number().optional(),
        minUsd: z.number().optional(),
        ethUsd: z.number().optional(),
        fetchedAt: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .optional(),
  creditUnitUsd: z.number().optional(),
});

export const adaptersResponseSchema = z.object({
  adapters: z.array(z.string()),
});

export const adapterRegistryCategorySchema = z.object({
  id: z.number().int(),
  network: z.string(),
  type: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  topicId: z.string(),
  versionTopicId: z.string(),
  registryTransactionId: z.string().nullable().optional(),
  versionTransactionId: z.string().nullable().optional(),
  metadataPointer: z.string().nullable().optional(),
  metadataSequence: z.number().int().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: jsonValueSchema.optional().nullable(),
});

export const adapterRegistryCategoriesResponseSchema = z.object({
  categories: z.array(adapterRegistryCategorySchema),
});

export const adapterRegistryAdapterSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    network: z.string().optional(),
    categoryId: z.union([z.string(), z.number()]).nullable().optional(),
    operation: z.string().optional(),
    adapterId: z.string(),
    adapterName: z.string(),
    entity: z.string(),
    manifestPointer: z.string().nullable().optional(),
    manifestSequence: z.number().int().nullable().optional(),
    packageRegistry: z.string().nullable().optional(),
    packageName: z.string().nullable().optional(),
    packageVersion: z.string().nullable().optional(),
    packageIntegrity: z.string().nullable().optional(),
    stateModel: z.string().nullable().optional(),
    config: jsonValueSchema.nullable().optional(),
    signature: z.string().nullable().optional(),
    manifest: jsonValueSchema.nullable().optional(),
    keywords: z.array(z.string()).optional(),
    searchText: z.string().nullable().optional(),
    creditAccountId: z.string().nullable().optional(),
    registeredByUserId: z.string().nullable().optional(),
    registeredByEmail: z.string().nullable().optional(),
    totalCostHbar: z.number().nullable().optional(),
    totalCostCredits: z.number().nullable().optional(),
    consensusTimestamp: z.string().nullable().optional(),
    sequenceNumber: z.number().int().nullable().optional(),
    payerAccountId: z.string().nullable().optional(),
    mirrorNodePayload: jsonValueSchema.nullable().optional(),
    versionTopicId: z.string().nullable().optional(),
    declarationTopicId: z.string().nullable().optional(),
    categoryEntrySequence: z.number().int().nullable().optional(),
    categoryEntryTransactionId: z.string().nullable().optional(),
    versionPointerSequence: z.number().int().nullable().optional(),
    versionPointerTransactionId: z.string().nullable().optional(),
    transactionId: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    category: adapterRegistryCategorySchema.optional(),
  })
  .passthrough();

export const adapterRegistryAdaptersResponseSchema = z.object({
  network: z.string(),
  adapters: z.array(adapterRegistryAdapterSchema),
});

export const adapterRegistryCreateCategoryResponseSchema = z.object({
  category: adapterRegistryCategorySchema,
});

export const adapterRegistrySubmitAdapterResponseSchema = z.object({
  adapter: z.record(jsonValueSchema),
  declaration: adapterDeclarationSchema,
  transactionId: z.string().optional().nullable(),
  category: adapterRegistryCategorySchema,
});

export const adapterRegistrySubmitAdapterAcceptedResponseSchema = z
  .object({
    submissionId: z.string(),
    status: z.string().optional(),
    network: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const adapterRegistrySubmissionStatusResponseSchema = z.object({
  submission: z
    .object({
      id: z.string(),
      network: z.string(),
      status: z.enum(['pending', 'running', 'completed', 'failed']),
      adapterId: z.string(),
      categorySlug: z.string().nullable().optional(),
      creditAccountId: z.string().nullable().optional(),
      registeredByUserId: z.string().nullable().optional(),
      registeredByEmail: z.string().nullable().optional(),
      requestPayload: jsonValueSchema.optional(),
      resultPayload: jsonValueSchema.nullable().optional(),
      error: z.string().nullable().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      startedAt: z.string().nullable().optional(),
      completedAt: z.string().nullable().optional(),
    })
    .passthrough(),
});

export const adapterChatProfileSchema = z.object({
  supportsChat: z.boolean(),
  delivery: z.string().optional(),
  transport: z.string().optional(),
  streaming: z.boolean().optional(),
  requiresAuth: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const adapterCapabilitiesSchema = z.object({
  discovery: z.boolean(),
  routing: z.boolean(),
  communication: z.boolean(),
  translation: z.boolean(),
  protocols: z.array(z.string()),
});

export const adapterDescriptorSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  author: z.string(),
  description: z.string(),
  supportedProtocols: z.array(z.string()),
  registryType: z.enum(['web2', 'web3', 'hybrid']),
  chatProfile: adapterChatProfileSchema.optional(),
  capabilities: adapterCapabilitiesSchema,
  enabled: z.boolean(),
  priority: z.number(),
  status: z.enum(['running', 'stopped']),
});

export const adapterDetailsResponseSchema = z.object({
  adapters: z.array(adapterDescriptorSchema),
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

// ----------------------------------------------------------------------------
// Verification + owner registration (Moltbook/OpenClaw)
// ----------------------------------------------------------------------------

const verificationExistingOwnershipSchema = z
  .object({
    ownerType: z.string(),
    ownerId: z.string(),
    ownerHandle: z.string().optional(),
    verifiedAt: z.string().optional(),
    method: z.string().optional(),
  })
  .passthrough();

export const verificationChallengeResponseSchema = z
  .object({
    challengeId: z.string(),
    code: z.string(),
    expiresAt: z.string(),
    expectedHandle: z.string(),
    instructions: z.string(),
    existingOwnership: verificationExistingOwnershipSchema.optional(),
  })
  .passthrough();

export const verificationChallengeDetailsResponseSchema = z
  .object({
    challengeId: z.string(),
    uaid: z.string(),
    code: z.string(),
    expiresAt: z.string(),
    status: z.string(),
    message: z.string().optional(),
  })
  .passthrough();

export const verificationVerifyResponseSchema = z
  .object({
    verified: z.boolean(),
    uaid: z.string(),
    ownerType: z.string(),
    ownerId: z.string(),
    ownerHandle: z.string().optional(),
    method: z.string().optional(),
    verificationPostUrl: z.string().optional(),
  })
  .passthrough();

export const verificationOwnershipResponseSchema = z
  .object({
    uaid: z.string(),
    ownerType: z.string(),
    ownerId: z.string(),
    ownerHandle: z.string().optional(),
    chain: z.string(),
    verifiedAt: z.string(),
    method: z.string(),
  })
  .passthrough();

export const verificationStatusResponseSchema = z
  .object({
    uaid: z.string(),
    verified: z.boolean(),
    chain: z.string().nullable(),
  })
  .passthrough();

export const verificationVerifySenderResponseSchema = z
  .object({
    verified: z.boolean(),
    uaid: z.string(),
    ownerType: z.string(),
    ownerId: z.string(),
  })
  .passthrough();

export const registerStatusResponseSchema = z
  .object({
    registered: z.boolean(),
    agent: jsonValueSchema.optional(),
  })
  .passthrough();

export const moltbookOwnerRegistrationUpdateResponseSchema = z
  .object({
    ok: z.boolean(),
    uaid: z.string(),
    registered: z.boolean(),
    registeredAt: z.string().optional(),
    agent: jsonValueSchema.optional(),
    warning: z.string().optional(),
  })
  .passthrough();

const skillRegistryFileRoleSchema = z.union([
  z.literal('skill-md'),
  z.literal('skill-json'),
  z.literal('file'),
]);

export const skillRegistryFileDescriptorSchema = z
  .object({
    name: z.string(),
    mimeType: z.string(),
    role: skillRegistryFileRoleSchema,
    topicId: z.string().optional(),
    hrl: z.string().optional(),
    packageSequenceNumber: z.number().int().optional(),
  })
  .passthrough();

export const skillRegistryPublishSummarySchema = z
  .object({
    jobId: z.string(),
    network: z.union([z.literal('mainnet'), z.literal('testnet')]),
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    createdAt: z.string(),
    directoryTopicId: z.string(),
    directorySequenceNumber: z.number().int().optional(),
    packageTopicId: z.string(),
    skillJsonHrl: z.string(),
    files: z.array(skillRegistryFileDescriptorSchema).optional(),
  })
  .passthrough();

export const skillRegistryListResponseSchema = z
  .object({
    items: z.array(skillRegistryPublishSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .passthrough();

export const skillRegistryQuoteFileBreakdownSchema = z
  .object({
    name: z.string(),
    mimeType: z.string(),
    estimatedCostHbar: z.number(),
  })
  .passthrough();

export const skillRegistryQuoteResponseSchema = z
  .object({
    quoteId: z.string(),
    name: z.string(),
    version: z.string(),
    directoryTopicId: z.string(),
    estimatedCostHbar: z.number(),
    credits: z.number(),
    usdCents: z.number(),
    expiresAt: z.string(),
    files: z.array(skillRegistryQuoteFileBreakdownSchema),
  })
  .passthrough();

const skillRegistryJobStatusSchema = z.union([
  z.literal('pending'),
  z.literal('in_progress'),
  z.literal('completed'),
  z.literal('failed'),
]);

export const skillRegistryPublishResponseSchema = z
  .object({
    jobId: z.string(),
    status: skillRegistryJobStatusSchema,
    credits: z.number().nullable().optional(),
    usdCents: z.number().nullable().optional(),
    quoteId: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    network: z.union([z.literal('mainnet'), z.literal('testnet')]),
  })
  .passthrough();

export const skillRegistryJobStatusResponseSchema = z
  .object({
    jobId: z.string(),
    status: skillRegistryJobStatusSchema,
    network: z.union([z.literal('mainnet'), z.literal('testnet')]),
    name: z.string(),
    version: z.string(),
    directoryTopicId: z.string(),
    directorySequenceNumber: z.number().int().nullable().optional(),
    packageTopicId: z.string().nullable().optional(),
    skillJsonHrl: z.string().nullable().optional(),
    files: z.array(skillRegistryFileDescriptorSchema).nullable().optional(),
    quoteCredits: z.number().nullable().optional(),
    quoteUsdCents: z.number().nullable().optional(),
    reservationId: z.string().nullable().optional(),
    totalCostHbar: z.number().nullable().optional(),
    totalCostCredits: z.number().nullable().optional(),
    failureReason: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export const skillRegistryConfigResponseSchema = z
  .object({
    enabled: z.boolean(),
    directoryTopicId: z.string().nullable().optional(),
    maxFiles: z.number().int().nullable().optional(),
    maxTotalSizeBytes: z.number().int().nullable().optional(),
    allowedMimeTypes: z.array(z.string()).nullable().optional(),
    network: z
      .union([z.literal('mainnet'), z.literal('testnet')])
      .nullable()
      .optional(),
  })
  .passthrough();

export const skillRegistryOwnershipResponseSchema = z
  .object({
    name: z.string(),
    exists: z.boolean(),
    isOwner: z.boolean(),
  })
  .passthrough();
