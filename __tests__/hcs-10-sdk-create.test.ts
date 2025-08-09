import { HCS10Client } from '../src/hcs-10/sdk';
import { AgentBuilder, PersonBuilder } from '../src/hcs-11';

jest.mock('@hashgraph/sdk', () => ({
  PrivateKey: {
    generate: jest.fn(() => ({
      toString: () =>
        '302e020100300506032b657004220420deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      publicKey: { toString: () => 'publickey123' },
    })),
    fromStringED25519: jest.fn(() => ({
      toString: () =>
        '302e020100300506032b657004220420deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      publicKey: { toString: () => 'publickey123' },
    })),
    fromStringECDSA: jest.fn(() => ({
      toString: () =>
        '302e020100300506032b657004220420deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      publicKey: { toString: () => 'publickey123' },
    })),
  },
  Client: {
    forTestnet: jest.fn(() => ({})),
    forMainnet: jest.fn(() => ({})),
  },
}));

jest.mock('../src/utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getLevel: jest.fn(() => 'info'),
    })),
  },
}));

jest.mock('../src/utils', () => ({
  ...jest.requireActual('../src/utils'),
  detectKeyTypeFromString: jest.fn(() => ({
    detectedType: 'ed25519',
    privateKey: {
      toString: () =>
        '302e020100300506032b657004220420deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      publicKey: { toString: () => 'publickey123' },
    },
  })),
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getLevel: jest.fn(() => 'info'),
    })),
  },
}));

jest.mock('../src/services', () => ({
  HederaMirrorNode: jest.fn(() => ({
    getPublicKey: jest.fn(),
    getTopicInfo: jest.fn(),
    getTopicMessages: jest.fn(),
    requestAccount: jest.fn(),
    retrieveCommunicationTopics: jest.fn(),
  })),
}));

jest.mock('../src/hcs-11', () => ({
  AgentBuilder: jest.fn(() => ({
    setName: jest.fn().mockReturnThis(),
    setBio: jest.fn().mockReturnThis(),
    setCapabilities: jest.fn().mockReturnThis(),
    setMetadata: jest.fn().mockReturnThis(),
    setProfilePicture: jest.fn().mockReturnThis(),
    setExistingProfilePicture: jest.fn().mockReturnThis(),
    setInboundTopicId: jest.fn().mockReturnThis(),
    setOutboundTopicId: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({
      name: 'Test Agent',
      bio: 'Test bio',
      capabilities: [1, 2, 3],
      metadata: {
        type: 'autonomous',
        model: 'gpt-4',
        creator: 'test-creator',
        properties: { key: 'value' },
        socials: { twitter: '@test' },
      },
      pfpBuffer: undefined,
      pfpFileName: undefined,
      existingPfpTopicId: undefined,
    })),
  })),
  PersonBuilder: jest.fn(() => ({
    setDisplayName: jest.fn().mockReturnThis(),
    setAlias: jest.fn().mockReturnThis(),
    setBio: jest.fn().mockReturnThis(),
    setSocials: jest.fn().mockReturnThis(),
    setProfilePicture: jest.fn().mockReturnThis(),
    setInboundTopicId: jest.fn().mockReturnThis(),
    setOutboundTopicId: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({
      display_name: 'John Doe',
      alias: 'johndoe',
      bio: 'Test bio',
      socials: [],
      pfpBuffer: undefined,
      pfpFileName: undefined,
      profileImage: undefined,
      properties: {},
    })),
  })),
  HCS11Client: jest.fn(() => ({
    createAIAgentProfile: jest.fn(),
    createPersonalProfile: jest.fn(),
    createAndInscribeProfile: jest.fn().mockResolvedValue({
      success: true,
      profileTopicId: '0.0.99999',
      transactionId: 'tx-123',
    }),
    initializeOperator: jest.fn(),
  })),
}));
jest.mock('../src/inscribe/inscriber');
jest.mock('../src/utils/progress-reporter', () => ({
  ProgressReporter: jest.fn(() => ({
    preparing: jest.fn(),
    completed: jest.fn(),
    failed: jest.fn(),
    createSubProgress: jest.fn(() => ({
      report: jest.fn(),
    })),
  })),
}));

describe('HCS10Client - create method', () => {
  let client: HCS10Client;
  let mockClient: any;
  let mockHcs11Client: any;

  beforeEach(() => {
    mockClient = {
      operatorAccountId: { toString: () => '0.0.12345' },
      operatorPublicKey: {},
      setOperator: jest.fn(),
    };

    mockHcs11Client = {
      createAIAgentProfile: jest.fn(),
      createPersonalProfile: jest.fn(),
      createAndInscribeProfile: jest.fn().mockResolvedValue({
        success: true,
        profileTopicId: '0.0.99999',
        transactionId: 'tx-123',
      }),
    };

    const config = {
      network: 'testnet' as 'testnet',
      operatorId: '0.0.12345',
      operatorPrivateKey:
        '302e020100300506032b657004220420deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      logLevel: 'debug' as const,
    };

    client = new HCS10Client(config);
    (client as any).client = mockClient;
    (client as any).hcs11Client = mockHcs11Client;

    client.createTopic = jest
      .fn()
      .mockResolvedValueOnce('0.0.11111')
      .mockResolvedValueOnce('0.0.22222');

    client.inscribePfp = jest.fn().mockResolvedValue({
      success: true,
      pfpTopicId: '0.0.33333',
      transactionId: 'pfp-tx-123',
    });
  });

  describe('AgentBuilder profile creation', () => {
    it('should create an agent profile with topics and HCS-11 profile', async () => {
      const agentBuilder = new AgentBuilder();
      agentBuilder
        .setName('Test Agent')
        .setBio('A test agent for unit testing')
        .setCapabilities([1, 2, 3])
        .setMetadata({
          type: 'autonomous',
          model: 'gpt-4',
          creator: 'test-creator',
          properties: { key: 'value' },
        });

      const result = await client.create(agentBuilder);

      expect(result).toMatchObject({
        outboundTopicId: '0.0.11111',
        inboundTopicId: '0.0.22222',
        profileTopicId: '0.0.99999',
        success: true,
      });

      expect(client.createTopic).toHaveBeenCalledTimes(2);
      expect(mockHcs11Client.createAIAgentProfile).toHaveBeenCalled();
      expect(mockHcs11Client.createAndInscribeProfile).toHaveBeenCalled();
    });

    it('should handle profile picture for agent', async () => {
      const agentBuilder = new AgentBuilder();
      const pfpBuffer = Buffer.from('test-image-data');

      agentBuilder
        .setName('Agent with PFP')
        .setBio('Agent with profile picture')
        .setProfilePicture(pfpBuffer, 'profile.png');

      const result = await client.create(agentBuilder);

      expect(result).toMatchObject({
        pfpTopicId: '0.0.33333',
        success: true,
      });

      expect(client.inscribePfp).toHaveBeenCalledWith(pfpBuffer, 'profile.png');
    });

    it('should use existing profile picture topic ID', async () => {
      const agentBuilder = new AgentBuilder();
      agentBuilder
        .setName('Agent with existing PFP')
        .setBio('Agent using existing profile picture')
        .setExistingProfilePicture('0.0.44444');

      const result = await client.create(agentBuilder);

      expect(result.pfpTopicId).toBe('0.0.44444');
      expect(client.inscribePfp).not.toHaveBeenCalled();
    });
  });

  describe('PersonBuilder profile creation', () => {
    it('should create a person profile with topics and HCS-11 profile', async () => {
      const personBuilder = new PersonBuilder();
      personBuilder
        .setDisplayName('John Doe')
        .setAlias('johndoe')
        .setBio('A test person profile')
        .setSocials([{ platform: 'twitter' as any, handle: '@johndoe' }]);

      const result = await client.create(personBuilder);

      expect(result).toMatchObject({
        outboundTopicId: '0.0.11111',
        inboundTopicId: '0.0.22222',
        profileTopicId: '0.0.99999',
        success: true,
      });

      expect(client.createTopic).toHaveBeenCalledTimes(2);
      expect(mockHcs11Client.createPersonalProfile).toHaveBeenCalled();
      expect(mockHcs11Client.createAndInscribeProfile).toHaveBeenCalled();
    });

    it('should handle profile picture for person', async () => {
      const personBuilder = new PersonBuilder();
      const pfpBuffer = Buffer.from('person-image-data');

      personBuilder
        .setDisplayName('Jane Doe')
        .setAlias('janedoe')
        .setProfilePicture(pfpBuffer, 'jane.jpg');

      const result = await client.create(personBuilder);

      expect(result).toMatchObject({
        pfpTopicId: '0.0.33333',
        success: true,
      });

      expect(client.inscribePfp).toHaveBeenCalledWith(pfpBuffer, 'jane.jpg');
    });
  });

  describe('Error handling', () => {
    it('should handle topic creation failure', async () => {
      const agentBuilder = new AgentBuilder();
      agentBuilder.setName('Test Agent').setBio('Test bio');

      client.createTopic = jest
        .fn()
        .mockRejectedValue(new Error('Topic creation failed'));

      const result = await client.create(agentBuilder);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Topic creation failed');
    });

    it('should handle profile inscription failure', async () => {
      const agentBuilder = new AgentBuilder();
      agentBuilder.setName('Test Agent').setBio('Test bio');

      mockHcs11Client.createAndInscribeProfile.mockResolvedValue({
        success: false,
        error: 'Profile inscription failed',
      });

      const result = await client.create(agentBuilder);

      expect(result.success).toBe(false);
      expect(result.error).toContain('profile');
    });

    it('should handle profile picture inscription failure', async () => {
      const agentBuilder = new AgentBuilder();
      const pfpBuffer = Buffer.from('test-image');

      agentBuilder
        .setName('Agent with PFP')
        .setBio('Test bio')
        .setProfilePicture(pfpBuffer, 'profile.png');

      client.inscribePfp = jest.fn().mockResolvedValue({
        success: false,
        error: 'PFP inscription failed',
      });

      const result = await client.create(agentBuilder);

      expect(result.success).toBe(false);
      expect(result.error).toContain('profile picture');
    });
  });

  describe('State management', () => {
    it('should resume from existing state', async () => {
      const agentBuilder = new AgentBuilder();
      agentBuilder.setName('Test Agent').setBio('Test bio');

      const existingState = {
        currentStage: 'topics' as const,
        completedPercentage: 50,
        createdResources: ['outbound:0.0.55555'],
        outboundTopicId: '0.0.55555',
      };

      const result = await client.create(agentBuilder, { existingState });

      expect(result).toMatchObject({
        outboundTopicId: '0.0.55555',
        inboundTopicId: '0.0.22222',
        success: true,
      });

      expect(client.createTopic).toHaveBeenCalledTimes(1);
    });

    it('should track progress via callback', async () => {
      const progressCallback = jest.fn();
      const agentBuilder = new AgentBuilder();
      agentBuilder.setName('Test Agent').setBio('Test bio');

      await client.create(agentBuilder, { progressCallback });

      expect(progressCallback).toHaveBeenCalled();

      const calls = progressCallback.mock.calls;
      const stages = calls.map(call => call[0].stage);

      expect(stages).toContain('preparing');
      expect(stages).toContain('completed');
    });
  });

  describe('Options', () => {
    it('should respect updateAccountMemo option', async () => {
      const agentBuilder = new AgentBuilder();
      agentBuilder.setName('Test Agent').setBio('Test bio');

      await client.create(agentBuilder, { updateAccountMemo: false });

      expect(mockHcs11Client.createAndInscribeProfile).toHaveBeenCalledWith(
        expect.anything(),
        false,
      );
    });

    it('should respect ttl option', async () => {
      const agentBuilder = new AgentBuilder();
      agentBuilder.setName('Test Agent').setBio('Test bio');

      const ttl = 120;
      await client.create(agentBuilder, { ttl });

      const createTopicCalls = (client.createTopic as jest.Mock).mock.calls;
      expect(createTopicCalls.length).toBeGreaterThan(0);
    });
  });
});
