import { z } from 'zod';

/**
 * Stored-field schema for OpenRouter category benchmark signals, per
 * `metadata.additional`.
 */
export const hcs25OpenRouterEvalFieldsSchema = z
  .object({
    openrouterEvalScore: z.number().nullish(),
    openrouterEvalStatus: z.enum(['ok', 'missing', 'low-coverage']).nullish(),
    openrouterEvalUpdatedAt: z.string().nullish(),
    openrouterEvalSources: z.array(z.string()).nullish(),
    openrouterEvalMetricsCount: z.number().int().min(0).nullish(),
    openrouterEvalCategoryCount: z.number().int().min(0).nullish(),
    openrouterEvalCoverageWeight: z.number().nullish(),
    openrouterEvalCategories: z.array(z.string()).nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for Chatbot Arena (OpenLM) preference signals, per
 * `metadata.additional`.
 */
export const hcs25ChatbotArenaFieldsSchema = z
  .object({
    chatbotArenaEvalScore: z.number().nullish(),
    chatbotArenaEvalElo: z.number().nullish(),
    chatbotArenaEvalVotes: z.number().nullish(),
    chatbotArenaEvalStatus: z.enum(['ok', 'missing']).nullish(),
    chatbotArenaEvalUpdatedAt: z.string().nullish(),
    chatbotArenaEvalSources: z.array(z.string()).nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for Hugging Face model-index and popularity signals,
 * per `metadata.additional`.
 */
export const hcs25HuggingFaceEvalFieldsSchema = z
  .object({
    huggingFaceModelId: z.string().nullish(),
    openrouterHuggingFaceId: z.string().nullish(),
    huggingFaceEvalScore: z.number().nullish(),
    huggingFaceSignalScore: z.number().nullish(),
    huggingFaceEvalMetricsCount: z.number().int().min(0).nullish(),
    huggingFaceDownloads: z.number().nullish(),
    huggingFaceLikes: z.number().nullish(),
    huggingFaceEvalMode: z
      .enum(['model-index', 'popularity', 'mixed', 'missing'])
      .nullish(),
    huggingFaceEvalStatus: z.enum(['ok', 'missing', 'error']).nullish(),
    huggingFaceEvalUpdatedAt: z.string().nullish(),
    huggingFaceEvalSources: z.array(z.string()).nullish(),
  })
  .passthrough();

/**
 * Stored-field schema for Open LLM Leaderboard signals, per
 * `metadata.additional`.
 */
export const hcs25OpenLlmEvalFieldsSchema = z
  .object({
    openLlmEvalScore: z.number().nullish(),
    openLlmEvalMetricsCount: z.number().int().min(0).nullish(),
    openLlmEvalStatus: z.enum(['ok', 'missing', 'error']).nullish(),
    openLlmEvalUpdatedAt: z.string().nullish(),
    openLlmEvalSources: z.array(z.string()).nullish(),
    openrouterHuggingFaceId: z.string().nullish(),
  })
  .passthrough();
