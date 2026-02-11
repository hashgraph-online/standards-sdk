import { z } from 'zod';
import type { NetworkType } from '../utils/types';

export type HCS26Network = NetworkType;

export const HCS26_PROTOCOL = 'hcs-26' as const;

export const hcs26TopicTypeEnumSchema = z.union([
  z.literal(0), // discovery
  z.literal(1), // version
  z.literal(2), // reputation (optional)
]);

export type Hcs26TopicTypeEnum = z.infer<typeof hcs26TopicTypeEnumSchema>;

export const hcs26OperationEnumSchema = z.union([
  z.literal(0), // register
  z.literal(1), // update
  z.literal(2), // delete
  z.literal(3), // migrate
]);

export type Hcs26OperationEnum = z.infer<typeof hcs26OperationEnumSchema>;

const topicIdSchema = z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/);
const hcs1HrlSchema = z.string().regex(/^hcs:\/\/1\/[0-9]+\.[0-9]+\.[0-9]+$/);

const decentralizedAssetUriSchema = z
  .string()
  .regex(
    /^(hcs:\/\/1\/[0-9]+\.[0-9]+\.[0-9]+|ipfs:\/\/\S+|ar:\/\/\S+|ord:\/\/\S+)$/,
  );

const semverSchema = z
  .string()
  .regex(
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );

function validateNormalizedRelativePath(pathRaw: string): void {
  const path = pathRaw.trim();
  if (!path) {
    throw new Error('Path must be non-empty');
  }
  if (path.startsWith('/')) {
    throw new Error('Path must be relative');
  }
  if (path.includes('\\')) {
    throw new Error('Path must use "/" separators');
  }
  const segments = path.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error(
        'Path must be normalized (no ".", "..", or empty segments)',
      );
    }
  }
}

const hcs1HrlOptionalSchema = z
  .string()
  .regex(/^hcs:\/\/1\/[0-9]+\.[0-9]+\.[0-9]+$/)
  .optional();

const discoveryMetadataAuthorSchema = z.union([
  z.string().min(1),
  z
    .object({
      name: z.string().min(1),
      contact: z.string().min(1).optional(),
      url: z.string().url().optional(),
    })
    .passthrough(),
]);

export const hcs26DiscoveryMetadataSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    author: discoveryMetadataAuthorSchema,
    license: z.string().min(1),
    tags: z
      .array(
        z.union([
          z.number().int().positive(),
          z
            .string()
            .regex(/^(0|[1-9]\d*)$/)
            .transform(value => Number.parseInt(value, 10)),
        ]),
      )
      .optional(),
    homepage: z.string().url().optional(),
    icon: z.union([z.string().url(), decentralizedAssetUriSchema]).optional(),
    icon_hcs1: hcs1HrlOptionalSchema,
    languages: z.array(z.string().min(1)).optional(),
    capabilities: z.array(z.string().min(1)).optional(),
    repo: z.string().url().optional(),
    commit: z
      .string()
      .regex(/^[0-9a-f]{7,64}$/i, 'commit must be a git commit SHA')
      .optional(),
  })
  .passthrough();

export const hcs26DiscoveryMetadataPatchSchema = hcs26DiscoveryMetadataSchema
  .partial()
  .passthrough();

export const hcs26DiscoveryRegisterSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('register'),
    t_id: topicIdSchema,
    account_id: z.string().min(1),
    metadata: z.union([hcs26DiscoveryMetadataSchema, hcs1HrlSchema]),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26DiscoveryRegister = z.infer<
  typeof hcs26DiscoveryRegisterSchema
>;

export const hcs26DiscoveryRegisterLegacySchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('register'),
    version_registry: topicIdSchema,
    publisher: z.string().min(1),
    metadata: z.union([hcs26DiscoveryMetadataSchema, hcs1HrlSchema]),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26DiscoveryRegisterLegacy = z.infer<
  typeof hcs26DiscoveryRegisterLegacySchema
>;

export const hcs26DiscoveryUpdateSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('update'),
    uid: z.string().min(1),
    account_id: z.string().min(1).optional(),
    metadata: z
      .union([hcs26DiscoveryMetadataPatchSchema, hcs1HrlSchema])
      .optional(),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26DiscoveryUpdate = z.infer<typeof hcs26DiscoveryUpdateSchema>;

export const hcs26DiscoveryUpdateLegacySchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('update'),
    uid: z.string().min(1),
    publisher: z.string().min(1).optional(),
    metadata: z
      .union([hcs26DiscoveryMetadataPatchSchema, hcs1HrlSchema])
      .optional(),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26DiscoveryUpdateLegacy = z.infer<
  typeof hcs26DiscoveryUpdateLegacySchema
>;

export const hcs26DiscoveryDeleteSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('delete'),
    uid: z.string().min(1),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26DiscoveryDelete = z.infer<typeof hcs26DiscoveryDeleteSchema>;

export const hcs26DiscoveryMigrateSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('migrate'),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26DiscoveryMigrate = z.infer<typeof hcs26DiscoveryMigrateSchema>;

const checksumSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const hcs26VersionRegisterSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('register'),
    skill_uid: z.number().int().positive(),
    version: semverSchema,
    t_id: topicIdSchema,
    checksum: checksumSchema.optional(),
    status: z.enum(['active', 'deprecated', 'yanked']).optional(),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26VersionRegister = z.infer<typeof hcs26VersionRegisterSchema>;

export const hcs26VersionRegisterLegacySchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('register'),
    skill_uid: z.number().int().positive(),
    version: semverSchema,
    manifest_hcs1: hcs1HrlSchema,
    checksum: checksumSchema.optional(),
    status: z.enum(['active', 'deprecated', 'yanked']).optional(),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26VersionRegisterLegacy = z.infer<
  typeof hcs26VersionRegisterLegacySchema
>;

export const hcs26VersionUpdateSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('update'),
    uid: z.string().min(1),
    status: z.enum(['active', 'deprecated', 'yanked']).optional(),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26VersionUpdate = z.infer<typeof hcs26VersionUpdateSchema>;

export const hcs26VersionDeleteSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('delete'),
    uid: z.string().min(1),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26VersionDelete = z.infer<typeof hcs26VersionDeleteSchema>;

export const hcs26VersionMigrateSchema = z
  .object({
    p: z.literal(HCS26_PROTOCOL),
    op: z.literal('migrate'),
    m: z.string().max(500).optional(),
    sequence_number: z.number().int().optional(),
  })
  .passthrough();

export type Hcs26VersionMigrate = z.infer<typeof hcs26VersionMigrateSchema>;

export const hcs26ManifestFileSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .superRefine((value, ctx) => {
        try {
          validateNormalizedRelativePath(value);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        }
      }),
    hrl: hcs1HrlSchema,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mime: z.string().min(1),
  })
  .passthrough();

export type Hcs26ManifestFile = z.infer<typeof hcs26ManifestFileSchema>;

export const hcs26SkillManifestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    version: semverSchema,
    license: z.string().min(1),
    author: discoveryMetadataAuthorSchema,
    tags: z
      .array(
        z.union([
          z.number().int().positive(),
          z
            .string()
            .regex(/^(0|[1-9]\d*)$/)
            .transform(value => Number.parseInt(value, 10)),
        ]),
      )
      .optional(),
    homepage: z.string().url().optional(),
    languages: z.array(z.string().min(1)).optional(),
    repo: z.string().url().optional(),
    commit: z
      .string()
      .regex(/^[0-9a-f]{7,64}$/i, 'commit must be a git commit SHA')
      .optional(),
    entrypoints: z
      .array(
        z
          .object({
            path: z.string().min(1),
            language: z.string().min(1),
            args: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
    files: z.array(hcs26ManifestFileSchema).min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const hasSkillMd = value.files.some(file => file.path === 'SKILL.md');
    if (!hasSkillMd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'SKILL.md must be present in the manifest files list with path "SKILL.md".',
        path: ['files'],
      });
    }
  });

export type Hcs26SkillManifest = z.infer<typeof hcs26SkillManifestSchema>;

export const hcs26DiscoveryMessageSchema = z.union([
  hcs26DiscoveryRegisterSchema,
  hcs26DiscoveryRegisterLegacySchema,
  hcs26DiscoveryUpdateSchema,
  hcs26DiscoveryUpdateLegacySchema,
  hcs26DiscoveryDeleteSchema,
  hcs26DiscoveryMigrateSchema,
]);

export type Hcs26DiscoveryMessage = z.infer<typeof hcs26DiscoveryMessageSchema>;

export const hcs26VersionMessageSchema = z.union([
  hcs26VersionRegisterSchema,
  hcs26VersionRegisterLegacySchema,
  hcs26VersionUpdateSchema,
  hcs26VersionDeleteSchema,
  hcs26VersionMigrateSchema,
]);

export type Hcs26VersionMessage = z.infer<typeof hcs26VersionMessageSchema>;
