import { PrivateKey } from '@hashgraph/sdk';
import { Hcs8Client } from '../../src/hcs-8';
import { HederaMirrorNode } from '../../src/services/mirror-node';

describe('HCS-8 SDK client selection', () => {
  const originalEnv = { ...process.env };
  const operatorKey = PrivateKey.generateED25519().toString();

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    jest
      .spyOn(HederaMirrorNode.prototype, 'requestAccount')
      .mockResolvedValue({ key: { _type: 'ED25519' } } as any);
    Hcs8Client.__resetProxyAgentForTests();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const createClient = (config: Partial<ConstructorParameters<typeof Hcs8Client>[0]> = {}) =>
    new Hcs8Client({
      network: 'testnet',
      operatorId: '0.0.1001',
      operatorKey,
      silent: true,
      ...config,
    });

  it('uses the native NodeClient when no proxy is present', () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    const client = createClient();
    expect(client.getClient().constructor.name).toBe('NodeClient');
  });

  it('prefers the WebClient when forced via configuration', () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    const client = createClient({ forceWebClient: true });
    expect(client.getClient().constructor.name).toBe('WebClient');
  });

  it('enables the WebClient automatically when a proxy is detected', () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080';

    const client = createClient();
    expect(client.getClient().constructor.name).toBe('WebClient');
    expect(Hcs8Client.__isProxyConfiguredForTests()).toBe(true);
  });

  it('closes the underlying SDK client when requested', () => {
    const client = createClient();
    const sdkClient = client.getClient();
    const closeSpy = jest
      .spyOn(sdkClient, 'close')
      .mockImplementation(() => undefined);

    client.close();

    expect(closeSpy).toHaveBeenCalledTimes(1);

    closeSpy.mockRestore();
    sdkClient.close();
  });
});
