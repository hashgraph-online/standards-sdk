import { z } from 'zod';

export const HCS21_PROTOCOL = 'hcs-21';
export const HCS21_MAX_MESSAGE_BYTES = 1024;

export const HCS21_REGISTRY_NAMESPACES = [
  'npm',
  'pypi',
  'oci',
  'composer',
  'packagist',
  'cargo',
  'nuget',
  'maven',
  'rubygems',
  'helm',
  'go',
] as const;

export type PackageRegistryNamespace =
  (typeof HCS21_REGISTRY_NAMESPACES)[number];
export type HCS21Operation = 'register' | 'update';

export const HCS21MetadataPointerPattern = /^hcs:\/\/1\/0\.0\.\d+\/\d+$/;

export interface PackageDeclaration {
  p: typeof HCS21_PROTOCOL;
  op: HCS21Operation;
  registry: PackageRegistryNamespace;
  t_id: string;
  n: string;
  d: string;
  a: string;
  tags?: string[];
  metadata?: string;
}

export interface PackageArtifact {
  type: string;
  url: string;
  digest?: string;
  signature?: string;
  [key: string]: unknown;
}

export interface PackageMetadataRecord {
  schema: string;
  t_id?: string;
  description?: string;
  maintainers?: string[];
  website?: string;
  docs?: string;
  source?: string;
  support?: string;
  tags?: string[];
  artifacts?: PackageArtifact[];
  capabilities?: string[];
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface PackageMetadataPointer {
  pointer: string;
  topicId: string;
  sequenceNumber: number;
  jobId?: string;
  transactionId?: string;
}

export interface PackageDeclarationEnvelope {
  declaration: PackageDeclaration;
  consensusTimestamp?: string;
  sequenceNumber: number;
  payer?: string;
}

export enum HCS21TopicType {
  REGISTRY = 0,
}

export const packageDeclarationSchema = z.object({
  p: z.literal(HCS21_PROTOCOL),
  op: z.enum(['register', 'update']),
  registry: z.enum(HCS21_REGISTRY_NAMESPACES),
  t_id: z.string().min(1),
  n: z.string().min(1),
  d: z.string().min(1),
  a: z.string().min(1),
  tags: z.array(z.string().min(1)).max(16).optional(),
  metadata: z
    .string()
    .regex(
      HCS21MetadataPointerPattern,
      'metadata must be an HCS-1 HRL (hcs://1/<topicId>/<sequence>)',
    )
    .optional(),
});

export type PackageDeclarationValidation = z.infer<
  typeof packageDeclarationSchema
>;
