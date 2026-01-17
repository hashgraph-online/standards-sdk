/**
 * Registry Broker Client
 * Exports the main client and helpers.
 */
export {
  RegistryBrokerClient,
  isPendingRegisterAgentResponse,
  isPartialRegisterAgentResponse,
  isSuccessRegisterAgentResponse,
  type InitializedAgentClient,
  type GenerateEncryptionKeyPairOptions,
} from './client/base-client';

export { RegistryBrokerError, RegistryBrokerParseError } from './client/errors';
