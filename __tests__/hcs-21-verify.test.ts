import { PrivateKey } from '@hashgraph/sdk';
import {
  canonicalize,
  verifyArtifactDigest,
  verifyDeclarationSignature,
  verifyManifestSignature,
} from '../src/hcs-21/verify';
import { AdapterDeclaration } from '../src/hcs-21/types';

describe('hcs-21 verification helpers', () => {
  it('verifies declaration signatures over canonical payloads', () => {
    const key = PrivateKey.generateED25519();
    const declaration: AdapterDeclaration = {
      p: 'hcs-21',
      op: 'register',
      adapter_id: 'npm/example@1.0.0',
      entity: 'agent',
      package: {
        registry: 'npm',
        name: 'example',
        version: '1.0.0',
        integrity: 'sha384-demo',
      },
      manifest: 'hcs://1/0.0.1234',
      config: { type: 'flora', account: '0.0.5' },
      state_model: 'hcs-21.generic@1',
      signature: '',
    };

    const { signature, ...unsigned } = declaration;
    const payload = canonicalize(unsigned);
    const sigBytes = key.sign(Buffer.from(payload, 'utf8'));
    const signed: AdapterDeclaration = {
      ...declaration,
      signature: Buffer.from(sigBytes).toString('base64'),
    };

    expect(verifyDeclarationSignature(signed, key.publicKey.toString())).toBe(
      true,
    );

    // Simulate a different payer scenario: still validates because caller provides publisher key explicitly.
    expect(
      verifyDeclarationSignature(
        { ...signed, adapter_id: 'npm/example@2.0.0' },
        key.publicKey.toString(),
      ),
    ).toBe(false);

    expect(
      verifyDeclarationSignature(
        { ...signed, signature: undefined },
        key.publicKey.toString(),
      ),
    ).toBe(false);
  });

  it('verifies manifest signatures', () => {
    const key = PrivateKey.generateED25519();
    const manifest = { meta: { spec_version: '1.0' }, adapter: { id: 'demo' } };
    const sigBytes = key.sign(Buffer.from(canonicalize(manifest), 'utf8'));
    const signature = Buffer.from(sigBytes).toString('base64');

    expect(
      verifyManifestSignature(manifest, signature, key.publicKey.toString()),
    ).toBe(true);

    expect(
      verifyManifestSignature(
        { ...manifest, adapter: { id: 'tampered' } },
        signature,
        key.publicKey.toString(),
      ),
    ).toBe(false);

    expect(verifyManifestSignature(manifest, signature, 'not-a-key')).toBe(
      false,
    );
  });

  it('verifies SHA-384 digests', () => {
    const buffer = Buffer.from('hello world', 'utf8');
    const base64 = Buffer.from('hello world').toString('base64'); // not sha; ensure false
    const expectedHex =
      'fdbd8e75a67f29f701a4e040385e2e23986303ea10239211af907fcbb83578b3e417cb71ce646efd0819dd8c088de1bd';

    expect(verifyArtifactDigest(buffer, expectedHex)).toBe(true);
    expect(verifyArtifactDigest(buffer, `sha384-${expectedHex}`)).toBe(true);
    expect(verifyArtifactDigest(buffer, base64)).toBe(false);
  });
});
