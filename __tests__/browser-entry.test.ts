import * as browserEntry from '@hashgraphonline/standards-sdk/browser';

describe('browser entry', () => {
  it('exports browser-safe SDK symbols used by the app', () => {
    expect(browserEntry.Logger).toBeDefined();
    expect(browserEntry.HCS11Client).toBeDefined();
    expect(browserEntry.BrowserHCSClient).toBeDefined();
    expect(browserEntry.PersonBuilder).toBeDefined();
    expect(browserEntry.BlockLoader).toBeDefined();
    expect(browserEntry.inscribeWithSigner).toBeDefined();
    expect(browserEntry.ProfileType).toBeDefined();
  });
});
