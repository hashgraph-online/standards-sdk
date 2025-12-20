import type {
  AgentFeedbackEligibilityRequest,
  AgentFeedbackEligibilityResponse,
  AgentFeedbackQuery,
  AgentFeedbackResponse,
  AgentFeedbackSubmissionRequest,
  AgentFeedbackSubmissionResponse,
  JsonValue,
} from '../types';
import {
  agentFeedbackEligibilityResponseSchema,
  agentFeedbackResponseSchema,
  agentFeedbackSubmissionResponseSchema,
} from '../schemas';
import { RegistryBrokerClient } from './base-client';

declare module './base-client' {
  interface RegistryBrokerClient {
    getAgentFeedback(
      uaid: string,
      options?: AgentFeedbackQuery,
    ): Promise<AgentFeedbackResponse>;
    checkAgentFeedbackEligibility(
      uaid: string,
      payload: AgentFeedbackEligibilityRequest,
    ): Promise<AgentFeedbackEligibilityResponse>;
    submitAgentFeedback(
      uaid: string,
      payload: AgentFeedbackSubmissionRequest,
    ): Promise<AgentFeedbackSubmissionResponse>;
  }
}

RegistryBrokerClient.prototype.getAgentFeedback = async function (
  this: RegistryBrokerClient,
  uaid: string,
  options: AgentFeedbackQuery = {},
): Promise<AgentFeedbackResponse> {
  const normalized = uaid.trim();
  if (!normalized) {
    throw new Error('uaid is required');
  }
  const query =
    options.includeRevoked === true ? '?includeRevoked=true' : '';
  const raw = await this.requestJson<JsonValue>(
    `/agents/${encodeURIComponent(normalized)}/feedback${query}`,
    { method: 'GET' },
  );
  return this.parseWithSchema(
    raw,
    agentFeedbackResponseSchema,
    'agent feedback response',
  );
};

RegistryBrokerClient.prototype.checkAgentFeedbackEligibility = async function (
  this: RegistryBrokerClient,
  uaid: string,
  payload: AgentFeedbackEligibilityRequest,
): Promise<AgentFeedbackEligibilityResponse> {
  const normalized = uaid.trim();
  if (!normalized) {
    throw new Error('uaid is required');
  }
  const raw = await this.requestJson<JsonValue>(
    `/agents/${encodeURIComponent(normalized)}/feedback/eligibility`,
    {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    },
  );
  return this.parseWithSchema(
    raw,
    agentFeedbackEligibilityResponseSchema,
    'agent feedback eligibility response',
  );
};

RegistryBrokerClient.prototype.submitAgentFeedback = async function (
  this: RegistryBrokerClient,
  uaid: string,
  payload: AgentFeedbackSubmissionRequest,
): Promise<AgentFeedbackSubmissionResponse> {
  const normalized = uaid.trim();
  if (!normalized) {
    throw new Error('uaid is required');
  }
  const raw = await this.requestJson<JsonValue>(
    `/agents/${encodeURIComponent(normalized)}/feedback`,
    {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    },
  );
  return this.parseWithSchema(
    raw,
    agentFeedbackSubmissionResponseSchema,
    'agent feedback submission response',
  );
};
