import { HCS21BaseClient } from '../src/hcs-21/base-client';
import { HCS21ValidationError } from '../src/hcs-21/errors';

describe('HCS-21 Base Client', () => {
  const baseClient = new HCS21BaseClient({ network: 'testnet' });

  it('builds a declaration with registry and package topic metadata', () => {
    const declaration = baseClient.buildDeclaration({
      op: 'register',
      registry: 'npm',
      t_id: '0.0.123456',
      name: 'Standards SDK',
      description: 'SDK for Hedera standards',
      author: 'Kantorcodes',
      tags: ['sdk', 'demo'],
      metadata: 'hcs://1/0.0.12345/1',
    });

    expect(declaration).toEqual({
      p: 'hcs-21',
      op: 'register',
      registry: 'npm',
      t_id: '0.0.123456',
      n: 'Standards SDK',
      d: 'SDK for Hedera standards',
      a: 'Kantorcodes',
      tags: ['sdk', 'demo'],
      metadata: 'hcs://1/0.0.12345/1',
    });
  });

  it('rejects payloads that exceed the 1KB limit', () => {
    expect(() =>
      baseClient.buildDeclaration({
        op: 'register',
        registry: 'npm',
        t_id: '0.0.123456',
        name: 'Big Package',
        description: 'x'.repeat(2000),
        author: 'Example',
      }),
    ).toThrow(HCS21ValidationError);
  });

  it('rejects invalid metadata pointers', () => {
    expect(() =>
      baseClient.buildDeclaration({
        op: 'register',
        registry: 'npm',
        t_id: '0.0.123456',
        name: 'Broken Metadata',
        description: 'Desc',
        author: 'Example',
        metadata: 'not-a-hrl',
      }),
    ).toThrow(HCS21ValidationError);
  });
});
