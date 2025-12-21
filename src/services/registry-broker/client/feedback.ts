import type { RegistryBrokerClient } from './base-client';
import type {
  AgentFeedbackEligibilityRequest,
  AgentFeedbackEligibilityResponse,
  AgentFeedbackQuery,
  AgentFeedbackResponse,
  AgentFeedbackSubmissionRequest,
  AgentFeedbackSubmissionResponse,
} from '../types';

export interface RegistryBrokerFeedbackClient {
  getAgentFeedback: (
    uaid: string,
    options?: AgentFeedbackQuery,
  ) => Promise<AgentFeedbackResponse>;
  checkAgentFeedbackEligibility: (
    uaid: string,
    payload: AgentFeedbackEligibilityRequest,
  ) => Promise<AgentFeedbackEligibilityResponse>;
  submitAgentFeedback: (
    uaid: string,
    payload: AgentFeedbackSubmissionRequest,
  ) => Promise<AgentFeedbackSubmissionResponse>;
}

export const createFeedbackClient = (
  client: RegistryBrokerClient,
): RegistryBrokerFeedbackClient => {
  return {
    getAgentFeedback: (uaid, options) => client.getAgentFeedback(uaid, options),
    checkAgentFeedbackEligibility: (uaid, payload) =>
      client.checkAgentFeedbackEligibility(uaid, payload),
    submitAgentFeedback: (uaid, payload) =>
      client.submitAgentFeedback(uaid, payload),
  };
};
