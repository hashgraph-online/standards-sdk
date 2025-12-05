import { z } from 'zod';

export const HCS21_PROTOCOL = 'hcs-21';
export const HCS21_MAX_MESSAGE_BYTES = 1024;
export const HCS21_SAFE_MESSAGE_BYTES = 1000;
export const HCS21ManifestPointerPattern =
  /^(?:hcs:\/\/1\/0\.0\.\d+(?:\/\d+)?|ipfs:\/\/[a-zA-Z0-9]+|ar:\/\/[a-zA-Z0-9]+|oci:\/\/.+|https?:\/\/.+)$/;
export const HCS21TopicIdPattern = /^0\.0\.\d+$/;
export const HCS21MetadataPointerPattern =
  /^(?:0\.0\.\d+|hcs:\/\/1\/0\.0\.\d+(?:\/\d+)?|ipfs:\/\/[a-zA-Z0-9]+|ar:\/\/[a-zA-Z0-9]+|oci:\/\/.+|https?:\/\/.+)$/;

export type HCS21Operation = 'register' | 'update' | 'delete';

export interface AdapterPackage {
  registry: string;
  name: string;
  version: string;
  integrity: string;
}

export interface AdapterConfigContext {
  type: string;
  account?: string;
  threshold?: string;
  ctopic?: string;
  ttopic?: string;
  stopic?: string;
  [key: string]: unknown;
}

export interface AdapterDeclaration {
  p: typeof HCS21_PROTOCOL;
  op: HCS21Operation;
  adapter_id: string;
  entity: string;
  package: AdapterPackage;
  manifest: string;
  manifest_sequence?: number;
  config: AdapterConfigContext;
  state_model?: string;
  signature?: string;
}

export interface AdapterDeclarationEnvelope {
  declaration: AdapterDeclaration;
  consensusTimestamp?: string;
  sequenceNumber: number;
  payer?: string;
}

export enum HCS21TopicType {
  ADAPTER_REGISTRY = 0,
  REGISTRY_OF_REGISTRIES = 1,
}

export interface ManifestPointer {
  pointer: string;
  topicId: string;
  sequenceNumber: number;
  manifestSequence?: number;
  jobId?: string;
  transactionId?: string;
}

export const adapterPackageSchema = z.object({
  registry: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  integrity: z.string().min(1),
});

export const adapterConfigContextSchema = z
  .object({
    type: z.string().min(1),
    account: z.string().min(1).optional(),
    threshold: z.string().min(1).optional(),
    ctopic: z.string().min(1).optional(),
    ttopic: z.string().min(1).optional(),
    stopic: z.string().min(1).optional(),
  })
  .catchall(z.unknown());

export const adapterDeclarationSchema = z.object({
  p: z.literal(HCS21_PROTOCOL),
  op: z.enum(['register', 'update', 'delete']),
  adapter_id: z.string().min(1),
  entity: z.string().min(1),
  package: adapterPackageSchema,
  manifest: z
    .string()
    .regex(
      HCS21ManifestPointerPattern,
      'manifest must be a resolvable URI (hcs://1/<topicId>[/sequence], ipfs://, ar://, oci://, https://)',
    ),
  manifest_sequence: z.number().int().positive().optional(),
  config: adapterConfigContextSchema,
  state_model: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
});

export const adapterManifestSchema = z.object({
  meta: z.object({
    spec_version: z.string().min(1),
    adapter_version: z.string().min(1),
    minimum_flora_version: z.string().min(1).optional(),
    generated: z.string().min(1),
  }),
  adapter: z.object({
    name: z.string().min(1),
    id: z.string().min(1),
    maintainers: z
      .array(
        z.object({
          name: z.string().min(1),
          contact: z.string().min(1),
        }),
      )
      .min(1),
    license: z.string().min(1),
  }),
  package: z.object({
    registry: z.string().min(1),
    dist_tag: z.string().min(1).optional(),
    artifacts: z
      .array(
        z.object({
          url: z.string().min(1),
          digest: z.string().min(1),
          signature: z.string().min(1).optional(),
        }),
      )
      .min(1),
  }),
  runtime: z.object({
    platforms: z.array(z.string().min(1)).min(1),
    primary: z.string().min(1),
    entry: z.string().min(1),
    dependencies: z.array(z.string().min(1)).optional(),
    env: z.array(z.string().min(1)).optional(),
  }),
  capabilities: z.object({
    discovery: z.boolean(),
    communication: z.boolean(),
    protocols: z.array(z.string().min(1)),
  }),
  consensus: z.object({
    state_model: z.string().min(1).optional(),
    profile_uri: z.string().min(1).optional(),
    entity_schema: z.string().min(1).optional(),
    required_fields: z.array(z.string().min(1)),
    hashing: z.literal('sha384'),
  }),
});

export const registryMetadataSchema = z.object({
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  operator: z.object({
    account: z.string().min(1),
    name: z.string().optional(),
    contact: z.string().optional(),
  }),
  entityTypes: z.array(z.string().min(1)),
  categories: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
  links: z.record(z.string().min(1)).optional(),
});

export const metadataDocumentSchema = z.union([
  adapterManifestSchema,
  registryMetadataSchema,
]);

export type AdapterDeclarationValidation = z.infer<
  typeof adapterDeclarationSchema
>;
export type AdapterManifest = z.infer<typeof adapterManifestSchema>;
export type RegistryMetadataRecord = z.infer<typeof registryMetadataSchema>;
export type HCS21MetadataDocument = AdapterManifest | RegistryMetadataRecord;
