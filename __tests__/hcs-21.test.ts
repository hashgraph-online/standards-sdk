import { HCS21BaseClient } from '../src/hcs-21/base-client';
import { HCS21ValidationError } from '../src/hcs-21/errors';

describe('HCS-21 Base Client', () => {
  const baseClient = new HCS21BaseClient({ network: 'testnet' });

  it('builds a declaration with registry and package coordinates', () => {
    const declaration = baseClient.buildDeclaration({
      op: 'register',
      registry: 'npm',
      pkg: '@hashgraphonline/standards-sdk@1.0.0',
      name: 'Standards SDK',
      kind: 'web2',
      metadata: 'hcs://1/0.0.12345/1',
    });

    expect(declaration).toEqual({
      p: 'hcs-21',
      op: 'register',
      registry: 'npm',
      pkg: '@hashgraphonline/standards-sdk@1.0.0',
      name: 'Standards SDK',
      kind: 'web2',
      metadata: 'hcs://1/0.0.12345/1',
    });
  });

  it('rejects payloads that exceed the 1KB limit', () => {
    expect(() =>
      baseClient.buildDeclaration({
        op: 'register',
        registry: 'npm',
        pkg: 'a'.repeat(2000),
        name: 'Big Adapter',
        kind: 'web2',
      }),
    ).toThrow(HCS21ValidationError);
  });

  it('rejects invalid metadata pointers', () => {
    expect(() =>
      baseClient.buildDeclaration({
        op: 'register',
        registry: 'npm',
        pkg: '@hashgraphonline/standards-sdk@1.0.0',
        name: 'Broken Metadata',
        kind: 'web3',
        metadata: 'not-a-hrl',
      }),
    ).toThrow(HCS21ValidationError);
  });
});
