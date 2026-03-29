import {
  AIAgentCapability,
  AgentBuilder,
  HCS11Client,
  RegistryBrokerClient,
  getRegistrationQuote,
  registerAgent,
  resolveUaid,
  updateAgent,
  waitForRegistrationCompletion,
} from '../../src';

describe('Package Root Exports', () => {
  test('should export the broker and HCS-11 symbols used by downstream ESM consumers', () => {
    expect(AgentBuilder).toBeDefined();
    expect(HCS11Client).toBeDefined();
    expect(RegistryBrokerClient).toBeDefined();
    expect(registerAgent).toBeDefined();
    expect(getRegistrationQuote).toBeDefined();
    expect(updateAgent).toBeDefined();
    expect(resolveUaid).toBeDefined();
    expect(waitForRegistrationCompletion).toBeDefined();
    expect(AIAgentCapability).toBeDefined();

    expect(typeof AgentBuilder).toBe('function');
    expect(typeof HCS11Client).toBe('function');
    expect(typeof RegistryBrokerClient).toBe('function');
    expect(typeof registerAgent).toBe('function');
    expect(typeof getRegistrationQuote).toBe('function');
    expect(typeof updateAgent).toBe('function');
    expect(typeof resolveUaid).toBe('function');
    expect(typeof waitForRegistrationCompletion).toBe('function');
  });
});
