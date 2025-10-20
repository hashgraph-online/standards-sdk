import {
  PollRuleEvaluator,
  applyVotes,
  cloneResults,
  enforceStatusTransition,
  isTerminalStatus,
  pollMetadataSchema,
  pollOptionSchema,
} from '../hcs-9';
import {
  AnyHcs8Message,
  Hcs8ManageMessage,
  Hcs8RegisterMessage,
  Hcs8UpdateMessage,
  Hcs8VoteMessage,
  PollError,
  PollOperationRecord,
  PollState,
} from './types';

export class PollStateMachine {
  private readonly state: PollState;
  private evaluator?: PollRuleEvaluator;

  constructor() {
    this.state = {
      status: 'inactive',
      results: cloneResults(),
      operations: [],
      errors: [],
    };
  }

  public getState(): PollState {
    return this.state;
  }

  public apply(message: AnyHcs8Message, timestamp: string): void {
    switch (message.op) {
      case 'register':
        this.applyRegister(message, timestamp);
        break;
      case 'manage':
        this.applyManage(message, timestamp);
        break;
      case 'update':
        this.applyUpdate(message, timestamp);
        break;
      case 'vote':
        this.applyVote(message, timestamp);
        break;
      default:
        this.recordError(message.op, 'Unsupported operation', timestamp);
        break;
    }
  }

  private applyRegister(message: Hcs8RegisterMessage, timestamp: string): void {
    if (this.state.metadata) {
      this.recordError('register', 'Register operation already processed', timestamp);
      return;
    }

    const metadata = pollMetadataSchema.parse(message.d.metadata);
    this.state.metadata = metadata;
    this.state.status = metadata.status;
    this.state.createdTimestamp = timestamp;
    this.state.updatedTimestamp = timestamp;
    this.evaluator = new PollRuleEvaluator(metadata);
    this.state.results = cloneResults();
    this.recordOperation('register', metadata.author, message.m, timestamp);
  }

  private applyManage(message: Hcs8ManageMessage, timestamp: string): void {
    if (!this.ensureReady(message.op, timestamp)) {
      return;
    }
    if (!this.evaluator?.canManage(message.d.accountId)) {
      this.recordError(message.op, 'Account not permitted to manage poll', timestamp);
      return;
    }
    const nextStatus = enforceStatusTransition(this.state.status, message.d.action);
    if (nextStatus === this.state.status) {
      this.recordError(message.op, 'No status change occurred', timestamp);
      return;
    }
    this.state.status = nextStatus;
    this.state.updatedTimestamp = timestamp;
    this.recordOperation(message.op, message.d.accountId, message.m, timestamp);
  }

  private applyUpdate(message: Hcs8UpdateMessage, timestamp: string): void {
    if (!this.ensureReady(message.op, timestamp)) {
      return;
    }
    if (!this.evaluator?.canUpdate(message.d.accountId)) {
      this.recordError(message.op, 'Account not permitted to update poll', timestamp);
      return;
    }
    if (!message.d.change || Object.keys(message.d.change).length === 0) {
      this.recordError(message.op, 'No update fields specified', timestamp);
      return;
    }

    const nextMetadata = { ...this.state.metadata! };
    for (const [field, value] of Object.entries(message.d.change)) {
      switch (field) {
        case 'title':
        case 'description':
        case 'startDate':
        case 'endDate':
        case 'status':
        case 'customParameters':
          if (!this.evaluator?.canUpdateField(field)) {
            this.recordError(message.op, `Updates to ${field} are not permitted`, timestamp);
            return;
          }
          (nextMetadata as Record<string, unknown>)[field] = value;
          break;
        case 'options':
          if (!this.evaluator?.canUpdateField('options')) {
            this.recordError(message.op, 'Updates to options are not permitted', timestamp);
            return;
          }
          if (!Array.isArray(value)) {
            this.recordError(message.op, 'Updated options must be an array', timestamp);
            return;
          }
          (nextMetadata as Record<string, unknown>).options = value.map((option) =>
            pollOptionSchema.parse(option),
          );
          break;
        default:
          this.recordError(message.op, `Unsupported update field: ${field}`, timestamp);
          return;
      }
    }

    const validated = pollMetadataSchema.parse(nextMetadata);
    this.state.metadata = validated;
    this.state.status = validated.status;
    this.state.updatedTimestamp = timestamp;
    this.evaluator = new PollRuleEvaluator(validated);
    this.recordOperation(message.op, message.d.accountId, message.m, timestamp);
  }

  private applyVote(message: Hcs8VoteMessage, timestamp: string): void {
    if (!this.ensureReady(message.op, timestamp)) {
      return;
    }
    if (isTerminalStatus(this.state.status) || this.state.status !== 'active') {
      this.recordError(message.op, 'Poll is not open for voting', timestamp);
      return;
    }

    const voter = message.d.accountId;
    if (!this.evaluator?.canVote(voter)) {
      this.recordError(message.op, 'Account not permitted to vote', timestamp);
      return;
    }

    const votes = message.d.votes;
    if (!votes || votes.length === 0) {
      this.recordError(message.op, 'Vote payload contains no entries', timestamp);
      return;
    }

    if (!this.evaluator.allowMultipleChoice() && votes.length > 1) {
      this.recordError(message.op, 'Multiple choices not permitted', timestamp);
      return;
    }

    const availableWeight = this.evaluator.getVoteWeight(voter);
    const totalWeight = votes.reduce((sum, vote) => sum + vote.weight, 0);
    if (totalWeight > availableWeight + Number.EPSILON) {
      this.recordError(message.op, 'Vote weight exceeds allocation', timestamp);
      return;
    }
    if (!this.evaluator.allowAbstain() && totalWeight < availableWeight) {
      this.recordError(message.op, 'Unused vote weight is not permitted', timestamp);
      return;
    }

    for (const vote of votes) {
      if (!this.state.metadata!.options.some((option) => option.id === vote.optionId)) {
        this.recordError(message.op, `Unknown option id ${vote.optionId}`, timestamp);
        return;
      }
    }

    const existingVotes = this.state.results.voterWeight.get(voter);
    if (existingVotes && !this.evaluator.allowVoteChanges()) {
      this.recordError(message.op, 'Vote changes are not permitted', timestamp);
      return;
    }
    if (existingVotes && this.evaluator.allowVoteChanges()) {
      this.removeExistingVotes(voter);
    }

    this.state.results = applyVotes(this.state.results, votes);
    this.state.updatedTimestamp = timestamp;
    this.recordOperation(message.op, voter, message.m, timestamp);
  }

  private removeExistingVotes(accountId: string): void {
    const voterMap = this.state.results.voterWeight.get(accountId);
    if (!voterMap) {
      return;
    }
    for (const [optionId, weight] of voterMap.entries()) {
      const currentWeight = this.state.results.optionWeight.get(optionId) ?? 0;
      const nextWeight = currentWeight - weight;
      if (nextWeight <= 0) {
        this.state.results.optionWeight.delete(optionId);
      } else {
        this.state.results.optionWeight.set(optionId, nextWeight);
      }
      this.state.results.totalWeight = Math.max(0, this.state.results.totalWeight - weight);
    }
    this.state.results.voterWeight.delete(accountId);
  }

  private recordOperation(
    operation: AnyHcs8Message['op'],
    accountId: string | undefined,
    memo: string | undefined,
    timestamp: string,
  ): void {
    const record: PollOperationRecord = {
      operation,
      accountId,
      memo,
      timestamp,
    };
    this.state.operations.push(record);
  }

  private recordError(operation: AnyHcs8Message['op'], reason: string, timestamp: string): void {
    const entry: PollError = { operation, reason, timestamp };
    this.state.errors.push(entry);
  }

  private ensureReady(op: AnyHcs8Message['op'], timestamp: string): boolean {
    if (!this.state.metadata) {
      this.recordError(op, 'Poll has not been registered', timestamp);
      return false;
    }
    if (!this.evaluator) {
      this.evaluator = new PollRuleEvaluator(this.state.metadata);
    }
    return true;
  }
}
