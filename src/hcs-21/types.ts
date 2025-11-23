import { z } from 'zod';

export const HCS21_PROTOCOL = 'hcs-21';
export const HCS21_MAX_MESSAGE_BYTES = 1024;

export type AdapterPackageRegistry = 'npm' | 'pypi';
export type AdapterPlatformKind = 'web2' | 'web3';
export type AdapterOperation = 'register' | 'update';

export const HCS21MetadataPointerPattern = /^hcs:\/\/1\/0\.0\.\d+\/\d+$/;

export interface AdapterDeclaration {
  p: typeof HCS21_PROTOCOL;
  op: AdapterOperation;
  registry: AdapterPackageRegistry;
  pkg: string;
  name: string;
  kind: AdapterPlatformKind;
  metadata?: string;
}

export interface AdapterMetadataRecord {
  name: string;
  pkg: string;
  registry: AdapterPackageRegistry;
  kind: AdapterPlatformKind;
  description?: string;
  website?: string;
  source?: string;
  contact?: string;
  capabilities?: string[];
  tags?: string[];
  [key: string]: unknown;
}

export interface AdapterMetadataPointer {
  pointer: string;
  topicId: string;
  sequenceNumber: number;
  jobId?: string;
  transactionId?: string;
}

export interface AdapterDeclarationEnvelope {
  declaration: AdapterDeclaration;
  consensusTimestamp?: string;
  sequenceNumber: number;
  payer?: string;
}

export enum HCS21TopicType {
  REGISTRY = 0,
}

export const adapterDeclarationSchema = z.object({
  p: z.literal(HCS21_PROTOCOL),
  op: z.enum(['register', 'update']),
  registry: z.enum(['npm', 'pypi']),
  pkg: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['web2', 'web3']),
  metadata: z
    .string()
    .regex(
      HCS21MetadataPointerPattern,
      'metadata must be an HCS-1 HRL (hcs://1/<topicId>/<sequence>)',
    )
    .optional(),
});

export type AdapterDeclarationValidation = z.infer<
  typeof adapterDeclarationSchema
>;
