import { buildHcs16CreateAccountTx, buildHcs16CreateFloraTopicTx, buildHcs16FloraCreatedTx } from '../src/hcs-16/tx';

jest.mock('@hashgraph/sdk', () => ({
  AccountCreateTransaction: class {
    setKey() { return this; }
    setInitialBalance() { return this; }
    setMaxAutomaticTokenAssociations() { return this; }
  },
  TopicCreateTransaction: class {
    setTopicMemo() { return this; }
    setAdminKey() { return this; }
    setSubmitKey() { return this; }
    setFeeScheduleKey() { return this; }
    setCustomFees() { return this; }
    setAutoRenewAccountId() { return this; }
  },
  TopicMessageSubmitTransaction: class {
    private _topicId: any;
    private _message: any;
    setTopicId(id: any) { this._topicId = id; return this; }
    setMessage(m: any) { this._message = m; return this; }
  },
  KeyList: class {},
  PublicKey: class {},
  AccountId: { fromString: (s: string) => ({ toString: () => s }) },
  TokenId: { fromString: (s: string) => ({ toString: () => s }) },
  CustomFixedFee: class { setAmount(){return this;} setFeeCollectorAccountId(){return this;} setDenominatingTokenId(){return this;} },
  Hbar: class { constructor(public amount: number) {} },
}));

describe('HCS-16 tx builders', () => {
  it('creates Flora account tx', () => {
    const tx: any = buildHcs16CreateAccountTx({
      keyList: ({} as unknown) as any,
      initialBalanceHbar: 2,
      maxAutomaticTokenAssociations: -1,
    });
    expect(typeof tx.setKey).toBe('function');
  });

  it('creates Flora topic tx', () => {
    const tx: any = buildHcs16CreateFloraTopicTx({ floraAccountId: '0.0.flora', topicType: 2 });
    expect(typeof tx.setTopicMemo).toBe('function');
  });

  it('builds flora_created message', () => {
    const tx: any = buildHcs16FloraCreatedTx({
      topicId: '0.0.comm',
      operatorId: '0.0.op@0.0.flora',
      floraAccountId: '0.0.flora',
      topics: { communication: '0.0.c', transaction: '0.0.t', state: '0.0.s' },
    });
    const payload = JSON.parse(tx._message);
    expect(payload).toMatchObject({ p: 'hcs-16', op: 'flora_created' });
  });
  });

  describe('buildKeyList', () => {
    it('should create a KeyList with proper threshold', async () => {
      const mockKeyList = {
        setThreshold: jest.fn().mockReturnThis(),
        push: jest.fn(),
      };

      (KeyList as jest.MockedClass<typeof KeyList>).mockImplementation(
        () => mockKeyList as any,
      );

      const result = await (manager as any).buildKeyList(mockMembers, 2);

      expect(mockKeyList.setThreshold).toHaveBeenCalledWith(2);
      expect(mockKeyList.push).toHaveBeenCalledTimes(3);
      expect(result).toBe(mockKeyList);
    });
  });

  describe('createTopic method exists', () => {
    it('should be callable without errors', () => {
      expect(typeof (manager as any).createTopic).toBe('function');
    });
  });

  describe('Helper methods', () => {
    it('should have required private methods available', () => {
      const privateMethods = [
        'buildKeyList',
        'createFloraAccount',
        'createFloraTopics',
        'createTopic',
      ];

      privateMethods.forEach(method => {
        expect(typeof (manager as any)[method]).toBe('function');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle KeyList creation errors', async () => {
      (KeyList as jest.MockedClass<typeof KeyList>).mockImplementation(() => {
        throw new Error('KeyList creation failed');
      });

      await expect(
        (manager as any).buildKeyList(mockMembers, 2),
      ).rejects.toThrow('KeyList creation failed');
    });

    it('should handle empty member arrays', async () => {
      const mockKeyList = {
        setThreshold: jest.fn().mockReturnThis(),
        push: jest.fn(),
      };

      (KeyList as jest.MockedClass<typeof KeyList>).mockImplementation(
        () => mockKeyList as any,
      );

      const result = await (manager as any).buildKeyList([], 1);

      expect(mockKeyList.setThreshold).toHaveBeenCalledWith(1);
      expect(mockKeyList.push).not.toHaveBeenCalled();
      expect(result).toBe(mockKeyList);
    });
  });

  describe('Topic Management', () => {
    it('should handle topic creation with proper memo', async () => {
      const mockTopicId = { toString: () => '0.0.8001' } as any;
      const mockTransaction = {
        setTopicMemo: jest.fn().mockReturnThis(),
        setAdminKey: jest.fn().mockReturnThis(),
        setSubmitKey: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          getReceipt: jest.fn().mockResolvedValue({
            topicId: mockTopicId,
          }),
        }),
      };

      (
        TopicCreateTransaction as jest.MockedClass<
          typeof TopicCreateTransaction
        >
      ).mockImplementation(() => mockTransaction as any);

      const mockFloraAccountId = { toString: () => '0.0.9999' } as any;
      const mockAdminKey = { toString: () => 'admin-key' } as any;
      const mockSubmitKey = { toString: () => 'submit-key' } as any;

      const result = await (manager as any).createTopic(
        mockFloraAccountId,
        0,
        mockAdminKey,
        mockSubmitKey,
      );

      expect(mockTransaction.setTopicMemo).toHaveBeenCalledWith(
        'hcs-16:0.0.9999:0',
      );
      expect(mockTransaction.setAdminKey).toHaveBeenCalledWith(mockAdminKey);
      expect(mockTransaction.setSubmitKey).toHaveBeenCalledWith(mockSubmitKey);
      expect(result).toEqual(mockTopicId);
    });
  });

  describe('Flora Profile Creation', () => {
    it('should create Flora profile using HCS-11 inscription', async () => {
      const mockFloraAccountId = { toString: () => '0.0.9999' } as any;
      const mockTopics = {
        communication: { toString: () => '0.0.8001' } as any,
        transaction: { toString: () => '0.0.8002' } as any,
        state: { toString: () => '0.0.8003' } as any,
      };
      const config: FloraConfig = {
        displayName: 'Test Flora',
        members: mockMembers,
        threshold: 2,
        bio: 'Test bio',
        metadata: { test: 'data' },
        policies: {
          proposalThreshold: 2,
          executionDelay: 0,
        },
      };

      const result = await (manager as any).createFloraProfile(
        mockFloraAccountId,
        mockTopics,
        config,
      );

      expect(HCS11Client).toHaveBeenCalledWith({
        network: 'testnet',
        auth: {
          operatorId: '0.0.9999',
          privateKey: 'mockPrivateKey1',
        },
      });

      expect(mockHCS11Client.createAndInscribeProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '1.0',
          type: 3,
          display_name: 'Test Flora',
          bio: 'Test bio',
          members: mockMembers,
          threshold: 2,
          topics: {
            communication: '0.0.8001',
            transaction: '0.0.8002',
            state: '0.0.8003',
          },
          inboundTopicId: '0.0.8001',
          outboundTopicId: '0.0.8002',
          metadata: { test: 'data' },
          policies: {
            proposalThreshold: 2,
            executionDelay: 0,
          },
        }),
        true,
      );

      expect(result).toBe('0.0.12345');
    });

    it('should throw error if inscription fails', async () => {
      mockHCS11Client.createAndInscribeProfile.mockResolvedValueOnce({
        success: false,
        error: 'Inscription failed',
      });

      const mockFloraAccountId = { toString: () => '0.0.9999' } as any;
      const mockTopics = {
        communication: { toString: () => '0.0.8001' } as any,
        transaction: { toString: () => '0.0.8002' } as any,
        state: { toString: () => '0.0.8003' } as any,
      };
      const config: FloraConfig = {
        displayName: 'Test Flora',
        members: mockMembers,
        threshold: 2,
      };

      await expect(
        (manager as any).createFloraProfile(mockFloraAccountId, mockTopics, config),
      ).rejects.toThrow('Failed to inscribe Flora profile: Inscription failed');
    });

    it('should throw error if first member has no private key', async () => {
      const mockFloraAccountId = { toString: () => '0.0.9999' } as any;
      const mockTopics = {
        communication: { toString: () => '0.0.8001' } as any,
        transaction: { toString: () => '0.0.8002' } as any,
        state: { toString: () => '0.0.8003' } as any,
      };
      const membersWithoutPrivateKey = [
        {
          accountId: '0.0.1001',
          publicKey: { toString: () => 'key1' } as any,
          weight: 1,
        },
        ...mockMembers.slice(1),
      ];
      const config: FloraConfig = {
        displayName: 'Test Flora',
        members: membersWithoutPrivateKey,
        threshold: 2,
      };

      await expect(
        (manager as any).createFloraProfile(mockFloraAccountId, mockTopics, config),
      ).rejects.toThrow('First member must have private key to create profile');
    });
  });
});
