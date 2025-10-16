import { z } from 'zod';
import { FloraOperationCode, FloraTopicType } from './types';

export const OpMemoParamsSchema = z.object({
  opCode: z.nativeEnum(FloraOperationCode).optional(),
  topicTypeHint: z.nativeEnum(FloraTopicType).optional(),
});

export const FloraMemberSchema = z.object({
  accountId: z.string(),
  publicKey: z.string().optional(),
  weight: z.number().optional(),
});

export const FloraProfileSchema = z.object({
  version: z.string(),
  type: z.literal(3),
  display_name: z.string().min(1),
  members: z.array(FloraMemberSchema).min(1),
  threshold: z.number().min(1),
  topics: z.object({
    communication: z.string(),
    transaction: z.string(),
    state: z.string(),
  }),
  inboundTopicId: z.string(),
  outboundTopicId: z.string(),
  alias: z.string().optional(),
  bio: z.string().optional(),
  socials: z
    .array(
      z.object({
        platform: z.string(),
        handle: z.string(),
      }),
    )
    .optional(),
  profileImage: z.string().optional(),
  properties: z.record(z.any()).optional(),
  policies: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type FloraProfileInput = z.infer<typeof FloraProfileSchema>;
