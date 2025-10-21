import { z } from 'zod';

export const pollStatusSchema = z.enum([
  'inactive',
  'active',
  'paused',
  'closed',
  'cancelled',
]);
export type PollStatus = z.infer<typeof pollStatusSchema>;

export const pollOptionSchema = z.object({
  schema: z.literal('hcs-9'),
  id: z.number().int().nonnegative(),
  title: z.string().min(1, 'Option title must not be empty'),
  description: z.string().max(4096).optional(),
});
export type PollOption = z.infer<typeof pollOptionSchema>;

export const accountListPermissionSchema = z.object({
  schema: z.literal('hcs-9:account-list'),
  accounts: z.array(z.string().min(3)).min(1),
});

export const allowAllPermissionSchema = z.object({
  schema: z.literal('hcs-9:allow-all'),
});

export const allowAuthorPermissionSchema = z.object({
  schema: z.literal('hcs-9:allow-author'),
});

export const permissionsModuleSchema = z.discriminatedUnion('schema', [
  accountListPermissionSchema,
  allowAllPermissionSchema,
  allowAuthorPermissionSchema,
]);
export type PermissionsModule = z.infer<typeof permissionsModuleSchema>;

export const equalWeightAllocationSchema = z.object({
  schema: z.literal('hcs-9:equal-weight'),
  weight: z.number().positive().default(1),
});

export const fixedWeightAllocationSchema = z.object({
  schema: z.literal('hcs-9:fixed-weight'),
  allocations: z
    .array(
      z.object({
        accountId: z.string().min(3),
        weight: z.number().nonnegative(),
      }),
    )
    .min(1),
  defaultWeight: z.number().nonnegative().optional(),
});

export const allocationModuleSchema = z.discriminatedUnion('schema', [
  equalWeightAllocationSchema,
  fixedWeightAllocationSchema,
]);
export type AllocationModule = z.infer<typeof allocationModuleSchema>;

export const voteRuleSchema = z.object({
  name: z.enum(['allowVoteChanges', 'allowMultipleChoice', 'allowAbstain']),
});
export type VoteRule = z.infer<typeof voteRuleSchema>;

export const votingRulesSchema = z.object({
  schema: z.literal('hcs-9'),
  allocations: z.array(allocationModuleSchema).optional(),
  permissions: z.array(permissionsModuleSchema).optional(),
  rules: z.array(voteRuleSchema).optional(),
});
export type VotingRulesModule = z.infer<typeof votingRulesSchema>;

export const manageRulesSchema = z.object({
  schema: z.literal('hcs-9'),
  permissions: z.array(permissionsModuleSchema).optional(),
});
export type ManageRulesModule = z.infer<typeof manageRulesSchema>;

export const updateSettingsSchema = z.object({
  title: z.boolean().optional(),
  description: z.boolean().optional(),
  startDate: z.boolean().optional(),
  endDate: z.boolean().optional(),
  status: z.boolean().optional(),
  options: z.boolean().optional(),
  customParameters: z.boolean().optional(),
});

export const updateRulesSchema = z.object({
  schema: z.literal('hcs-9'),
  permissions: z.array(permissionsModuleSchema).optional(),
  updateSettings: updateSettingsSchema.optional(),
});
export type UpdateRulesModule = z.infer<typeof updateRulesSchema>;

export const endDateConditionSchema = z.object({
  schema: z.literal('hcs-9:end-date'),
  endDate: z.string().regex(/^[0-9]+$/, 'endDate must be a unix timestamp string'),
});

export const totalVotesConditionSchema = z.object({
  schema: z.literal('hcs-9:total-votes'),
  threshold: z.number().positive(),
});

export const endConditionModuleSchema = z.discriminatedUnion('schema', [
  endDateConditionSchema,
  totalVotesConditionSchema,
]);
export type EndConditionModule = z.infer<typeof endConditionModuleSchema>;

export const pollMetadataSchema = z.object({
  schema: z.literal('hcs-9'),
  title: z.string().min(1, 'Poll title must not be empty'),
  description: z.string().max(8192).optional(),
  author: z.string().min(3),
  votingRules: votingRulesSchema,
  permissionsRules: z.array(permissionsModuleSchema).optional(),
  manageRules: manageRulesSchema.optional(),
  updateRules: updateRulesSchema.optional(),
  options: z.array(pollOptionSchema).min(1),
  status: pollStatusSchema,
  startDate: z.string().regex(/^[0-9]+$/).optional(),
  endConditionRules: z.array(endConditionModuleSchema).optional(),
  customParameters: z.record(z.string(), z.unknown()).optional(),
});
export type PollMetadata = z.infer<typeof pollMetadataSchema>;

export const voteEntrySchema = z.object({
  accountId: z.string().min(3),
  optionId: z.number().int().nonnegative(),
  weight: z.number().positive(),
});
export type VoteEntry = z.infer<typeof voteEntrySchema>;

export function parsePollMetadata(input: unknown): PollMetadata {
  return pollMetadataSchema.parse(input);
}

export function parseVoteEntries(input: unknown): VoteEntry[] {
  return z.array(voteEntrySchema).min(1).parse(input);
}

export interface PollResults {
  totalWeight: number;
  optionWeight: Map<number, number>;
  voterWeight: Map<string, Map<number, number>>;
}

export const DEFAULT_VOTE_WEIGHT = 1;
