import {
  AllocationModule,
  DEFAULT_VOTE_WEIGHT,
  PollMetadata,
  PollResults,
  PollStatus,
  VoteEntry,
  VotingRulesModule,
  UpdateRulesModule,
  PermissionsModule,
} from './types';

export class PollRuleEvaluator {
  constructor(private readonly metadata: PollMetadata) {}

  public getVoteWeight(accountId: string): number {
    const rules = this.metadata.votingRules;
    const weight = this.evaluateAllocations(rules, accountId);
    return weight > 0 ? weight : DEFAULT_VOTE_WEIGHT;
  }

  public canVote(accountId: string): boolean {
    if (!this.isGloballyPermitted(accountId)) {
      return false;
    }
    return this.isPermissionGranted(
      this.metadata.votingRules.permissions,
      accountId,
      true,
    );
  }

  public canManage(accountId: string): boolean {
    if (!this.isGloballyPermitted(accountId)) {
      return false;
    }
    return this.isPermissionGranted(
      this.metadata.manageRules?.permissions,
      accountId,
      false,
    );
  }

  public canUpdate(accountId: string): boolean {
    if (!this.isGloballyPermitted(accountId)) {
      return false;
    }
    return this.isPermissionGranted(
      this.metadata.updateRules?.permissions,
      accountId,
      false,
    );
  }

  public allowVoteChanges(): boolean {
    return Boolean(
      this.metadata.votingRules.rules?.some(
        (rule) => rule.name === 'allowVoteChanges',
      ),
    );
  }

  public allowMultipleChoice(): boolean {
    return Boolean(
      this.metadata.votingRules.rules?.some(
        (rule) => rule.name === 'allowMultipleChoice',
      ),
    );
  }

  public allowAbstain(): boolean {
    return Boolean(
      this.metadata.votingRules.rules?.some((rule) => rule.name === 'allowAbstain'),
    );
  }

  public canUpdateField(field: keyof NonNullable<UpdateRulesModule['updateSettings']>): boolean {
    const settings = this.metadata.updateRules?.updateSettings;
    if (!settings) {
      return false;
    }
    return Boolean(settings[field]);
  }

  private evaluateAllocations(rules: VotingRulesModule, accountId: string): number {
    if (!rules.allocations || rules.allocations.length === 0) {
      return DEFAULT_VOTE_WEIGHT;
    }

    let weight = 0;
    for (const module of rules.allocations) {
      weight += this.resolveAllocationWeight(module, accountId);
    }
    return weight;
  }

  private resolveAllocationWeight(
    module: AllocationModule,
    accountId: string,
  ): number {
    switch (module.schema) {
      case 'hcs-9:equal-weight':
        return module.weight;
      case 'hcs-9:fixed-weight': {
        const matched = module.allocations.find(
          (entry) => entry.accountId === accountId,
        );
        if (matched) {
          return matched.weight;
        }
        return module.defaultWeight ?? 0;
      }
      default:
        return 0;
    }
  }

  private isGloballyPermitted(accountId: string): boolean {
    if (!this.metadata.permissionsRules || this.metadata.permissionsRules.length === 0) {
      return true;
    }
    return this.isPermissionGranted(
      this.metadata.permissionsRules,
      accountId,
      true,
    );
  }

  private isPermissionGranted(
    modules: PermissionsModule[] | undefined,
    accountId: string,
    defaultValue: boolean,
  ): boolean {
    if (!modules || modules.length === 0) {
      return defaultValue;
    }

    for (const module of modules) {
      switch (module.schema) {
        case 'hcs-9:allow-all':
          return true;
        case 'hcs-9:allow-author':
          if (accountId === this.metadata.author) {
            return true;
          }
          break;
        case 'hcs-9:account-list':
          if (module.accounts.includes(accountId)) {
            return true;
          }
          break;
        default:
          break;
      }
    }
    return false;
  }
}

export function applyVotes(
  existing: PollResults,
  entries: VoteEntry[],
): PollResults {
  const optionTotals = new Map(existing.optionWeight);
  const voterTotals = new Map(existing.voterWeight);
  let totalWeight = existing.totalWeight;

  for (const entry of entries) {
    const optionWeight = optionTotals.get(entry.optionId) ?? 0;
    optionTotals.set(entry.optionId, optionWeight + entry.weight);

    const voterMap = new Map(voterTotals.get(entry.accountId) ?? []);
    const voterWeight = voterMap.get(entry.optionId) ?? 0;
    voterMap.set(entry.optionId, voterWeight + entry.weight);
    voterTotals.set(entry.accountId, voterMap);

    totalWeight += entry.weight;
  }

  return { optionWeight: optionTotals, voterWeight: voterTotals, totalWeight };
}

export function cloneResults(): PollResults {
  return {
    optionWeight: new Map(),
    voterWeight: new Map(),
    totalWeight: 0,
  };
}

export function enforceStatusTransition(
  current: PollStatus,
  action: string,
): PollStatus {
  switch (action) {
    case 'open':
      if (current === 'inactive' || current === 'paused') {
        return 'active';
      }
      return current;
    case 'pause':
      if (current === 'active') {
        return 'paused';
      }
      return current;
    case 'close':
      if (current === 'active' || current === 'paused') {
        return 'closed';
      }
      return current;
    case 'cancel':
      if (current !== 'cancelled') {
        return 'cancelled';
      }
      return current;
    default:
      return current;
  }
}

export function isTerminalStatus(status: PollStatus): boolean {
  return status === 'closed' || status === 'cancelled';
}
