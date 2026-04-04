export {
  RegistryBrokerClient,
  isPendingRegisterAgentResponse,
  isPartialRegisterAgentResponse,
  isSuccessRegisterAgentResponse,
  type InitializedAgentClient,
  type GenerateEncryptionKeyPairOptions,
} from './client/base-client';

export { RegistryBrokerError, RegistryBrokerParseError } from './client/errors';
export {
  closeUaidConnection,
  dashboardStats,
  getRegistrationProgress,
  getRegistrationQuote,
  getUaidConnectionStatus,
  registerAgent,
  resolveUaid,
  updateAgent,
  validateUaid,
  waitForRegistrationCompletion,
} from './client/agents';
