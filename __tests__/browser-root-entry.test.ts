import * as browserRootEntry from '../src/browser-root';

describe('browser root entry', () => {
  it('exports browser-safe registry broker symbols used by webpack consumers', () => {
    expect(browserRootEntry.Logger).toBeDefined();
    expect(browserRootEntry.RegistryBrokerClient).toBeDefined();
    expect(browserRootEntry.registerAgent).toBeDefined();
    expect(browserRootEntry.getRegistrationQuote).toBeDefined();
    expect(browserRootEntry.resolveUaid).toBeDefined();
  });
});
