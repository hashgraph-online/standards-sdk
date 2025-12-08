import { HCS21BaseClient } from '../src/hcs-21/base-client';
import { HCS21ValidationError } from '../src/hcs-21/errors';

describe('HCS-21 Base Client', () => {
  const baseClient = new HCS21BaseClient({ network: 'testnet' });

  it('builds an adapter declaration with manifest and Flora bindings', () => {
    const declaration = baseClient.buildDeclaration({
      op: 'register',
      adapterId: 'npm/example-adapter@1.0.0',
      entity: 'agent',
      adapterPackage: {
        registry: 'npm',
        name: 'example-adapter',
        version: '1.0.0',
        integrity: 'sha384-demo',
      },
      manifest: 'hcs://1/0.0.12345',
      config: {
        type: 'flora',
        account: '0.0.5005',
        threshold: '2/3',
        ctopic: '0.0.4001',
        ttopic: '0.0.4002',
        stopic: '0.0.4003',
      },
      stateModel: 'hcs-21.entity-consensus@1',
    });

    expect(declaration).toEqual({
      p: 'hcs-21',
      op: 'register',
      adapter_id: 'npm/example-adapter@1.0.0',
      entity: 'agent',
      package: {
        registry: 'npm',
        name: 'example-adapter',
        version: '1.0.0',
        integrity: 'sha384-demo',
      },
      manifest: 'hcs://1/0.0.12345',
      config: {
        type: 'flora',
        account: '0.0.5005',
        threshold: '2/3',
        ctopic: '0.0.4001',
        ttopic: '0.0.4002',
        stopic: '0.0.4003',
      },
      state_model: 'hcs-21.entity-consensus@1',
      signature: undefined,
    });
  });

  it('builds an adapter declaration with an explicit manifest sequence', () => {
    const declaration = baseClient.buildDeclaration({
      op: 'register',
      adapterId: 'npm/example-adapter@1.0.0',
      entity: 'agent',
      adapterPackage: {
        registry: 'npm',
        name: 'example-adapter',
        version: '1.0.0',
        integrity: 'sha384-demo',
      },
      manifest: 'hcs://1/0.0.12345',
      manifestSequence: 2,
      config: {
        type: 'flora',
        account: '0.0.5005',
        threshold: '2/3',
        ctopic: '0.0.4001',
        ttopic: '0.0.4002',
        stopic: '0.0.4003',
      },
      stateModel: 'hcs-21.entity-consensus@1',
    });

    expect(declaration.manifest_sequence).toBe(2);
  });

  it('rejects payloads that exceed the 1KB limit', () => {
    expect(() =>
      baseClient.buildDeclaration({
        op: 'register',
        adapterId: 'npm/example-adapter@1.0.0',
        entity: 'x'.repeat(1500),
        adapterPackage: {
          registry: 'npm',
          name: 'example-adapter',
          version: '1.0.0',
          integrity: 'sha384-demo',
        },
        manifest: 'hcs://1/0.0.12345',
        config: {
          type: 'flora',
          account: '0.0.5005',
          threshold: '2/3',
          ctopic: '0.0.4001',
          ttopic: '0.0.4002',
          stopic: '0.0.4003',
        },
        stateModel: 'hcs-21.entity-consensus@1',
      }),
    ).toThrow(HCS21ValidationError);
  });

  it('rejects invalid manifest pointers', () => {
    expect(() =>
      baseClient.buildDeclaration({
        op: 'register',
        adapterId: 'npm/example-adapter@1.0.0',
        entity: 'agent',
        adapterPackage: {
          registry: 'npm',
          name: 'example-adapter',
          version: '1.0.0',
          integrity: 'sha384-demo',
        },
        manifest: 'not-a-hrl',
        config: {
          type: 'flora',
          account: '0.0.5005',
          threshold: '2/3',
          ctopic: '0.0.4001',
          ttopic: '0.0.4002',
          stopic: '0.0.4003',
        },
        stateModel: 'hcs-21.entity-consensus@1',
      }),
    ).toThrow(HCS21ValidationError);
  });
});
