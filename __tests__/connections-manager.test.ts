import { ConnectionsManager } from '../src/hcs-10/connections-manager';
import { HCSMessage, HCS10BaseClient } from '../src/hcs-10/base-client';

// Mock the baseClient
class MockHCS10Client extends HCS10BaseClient {
  constructor() {
    super({
      network: 'testnet',
      logLevel: 'error'
    });
  }

  // For tests we don't need the actual implementation
  // @ts-ignore - intentionally incomplete mock for tests
  async submitPayload() {
    return { topicSequenceNumber: { toNumber: () => 123 } };
  }

  getAccountAndSigner() {
    return { accountId: '0.0.123456', signer: null };
  }

  public extractTopicFromOperatorId(operatorId: string): string {
    if (!operatorId || !operatorId.includes('@')) {
      return '';
    }
    const parts = operatorId.split('@');
    return parts[0] || '';
  }

  public extractAccountFromOperatorId(operatorId: string): string {
    if (!operatorId || !operatorId.includes('@')) {
      return '';
    }
    const parts = operatorId.split('@');
    return parts[1] || '';
  }
}

describe('ConnectionsManager', () => {
  let manager: ConnectionsManager;
  let mockClient: MockHCS10Client;
  const mockAccountId = '0.0.123456';

  beforeEach(() => {
    mockClient = new MockHCS10Client();
    // @ts-ignore - type error in mock is acceptable for tests
    manager = new ConnectionsManager({
      baseClient: mockClient,
      logLevel: 'error'
    });
  });

  describe('processOutboundMessages', () => {
    it('should process connection requests and create pending connections', () => {
      const outboundMessages: HCSMessage[] = [
        {
          p: 'hcs-10',
          op: 'connection_request',
          connection_request_id: 1001,
          operator_id: '0.0.789101@0.0.654321',
          outbound_topic_id: '0.0.111111',
          sequence_number: 123,
          created: new Date('2023-01-01'),
          m: 'Connection request',
          payer: mockAccountId,
          data: '',
        },
      ];

      const connections = manager.processOutboundMessages(
        outboundMessages,
        mockAccountId
      );

      expect(connections).toHaveLength(1);
      expect(connections[0].isPending).toBe(true);
      expect(connections[0].status).toBe('pending');
      expect(connections[0].connectionTopicId).toBe('req-1001:0.0.789101@0.0.654321');
      expect(connections[0].connectionRequestId).toBe(1001);
      expect(connections[0].targetAccountId).toBe('0.0.654321');
    });

    it('should process connection confirmations and update pending connections', () => {
      // First add a pending connection
      const requestMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        connection_request_id: 1001,
        operator_id: '0.0.789101@0.0.654321',
        outbound_topic_id: '0.0.111111',
        sequence_number: 123,
        created: new Date('2023-01-01'),
        payer: mockAccountId,
        data: '',
      };

      manager.processOutboundMessages([requestMessage], mockAccountId);

      // Now process the confirmation
      const confirmationMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_created',
        connection_request_id: 1001,
        connection_topic_id: '0.0.222222',
        confirmed_request_id: 456,
        outbound_topic_id: '0.0.111111',
        operator_id: '0.0.789101@0.0.123456',
        sequence_number: 456,
        created: new Date('2023-01-02'),
        payer: mockAccountId,
        data: '',
      };

      const connections = manager.processOutboundMessages(
        [confirmationMessage],
        mockAccountId
      );

      // The pending connection should be replaced with an established one
      expect(connections).toHaveLength(1);
      expect(connections[0].isPending).toBe(false);
      expect(connections[0].status).toBe('established');
      expect(connections[0].connectionTopicId).toBe('0.0.222222');
      expect(connections[0].connectionRequestId).toBe(1001);
      expect(connections[0].confirmedRequestId).toBe(456);
    });

    it('should process connection closed messages', () => {
      // Set up an established connection first
      const connectionTopicId = '0.0.222222';
      manager.updateOrAddConnection({
        connectionTopicId,
        targetAccountId: '0.0.654321',
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
      });

      // Now process a close message
      const closeMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'close_connection',
        connection_topic_id: connectionTopicId,
        operator_id: '0.0.789101@0.0.123456',
        reason: 'Conversation completed',
        sequence_number: 789,
        created: new Date('2023-01-03'),
        payer: mockAccountId,
        data: '',
      };

      const connections = manager.processOutboundMessages(
        [closeMessage],
        mockAccountId
      );

      expect(connections).toHaveLength(1);
      expect(connections[0].status).toBe('closed');
      expect(connections[0].closedReason).toBe('Conversation completed');
    });
  });

  describe('processInboundMessages', () => {
    it('should process incoming connection requests that need confirmation', () => {
      const inboundMessages: HCSMessage[] = [
        {
          p: 'hcs-10',
          op: 'connection_request',
          operator_id: '0.0.789101@0.0.654321',
          sequence_number: 123,
          created: new Date('2023-01-01'),
          payer: '0.0.654321',
          data: '',
        },
      ];

      const connections = manager.processInboundMessages(
        inboundMessages,
        mockAccountId
      );

      expect(connections).toHaveLength(1);
      expect(connections[0].needsConfirmation).toBe(true);
      expect(connections[0].isPending).toBe(false);
      expect(connections[0].status).toBe('needs_confirmation');
      expect(connections[0].connectionTopicId).toBe('inb-123:0.0.789101@0.0.654321');
      expect(connections[0].inboundRequestId).toBe(123);
      expect(connections[0].targetAccountId).toBe('0.0.654321');
    });

    it('should process connection confirmations on the inbound topic', () => {
      // First add a needs confirmation connection
      const requestMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        operator_id: '0.0.789101@0.0.654321',
        sequence_number: 123,
        created: new Date('2023-01-01'),
        payer: '0.0.654321',
        data: '',
      };

      manager.processInboundMessages([requestMessage], mockAccountId);

      // Now process the confirmation
      const confirmationMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_created',
        connection_id: 123,
        connection_topic_id: '0.0.222222',
        connected_account_id: '0.0.654321',
        operator_id: '0.0.789101@0.0.123456',
        sequence_number: 456,
        created: new Date('2023-01-02'),
        payer: mockAccountId,
        data: '',
      };

      const connections = manager.processInboundMessages(
        [confirmationMessage],
        mockAccountId
      );

      // The needs confirmation connection should be replaced with an established one
      expect(connections).toHaveLength(1);
      expect(connections[0].needsConfirmation).toBe(false);
      expect(connections[0].isPending).toBe(false);
      expect(connections[0].status).toBe('established');
      expect(connections[0].connectionTopicId).toBe('0.0.222222');
      expect(connections[0].inboundRequestId).toBe(123);
    });
  });

  describe('processConnectionMessages', () => {
    it('should update lastActivity based on most recent message', () => {
      const connectionTopicId = '0.0.222222';
      manager.updateOrAddConnection({
        connectionTopicId,
        targetAccountId: '0.0.654321',
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
      });

      const messages: HCSMessage[] = [
        {
          p: 'hcs-10',
          op: 'message',
          data: 'Message 1',
          sequence_number: 123,
          created: new Date('2023-01-02'),
          payer: mockAccountId,
        },
        {
          p: 'hcs-10',
          op: 'message',
          data: 'Message 2',
          sequence_number: 124,
          created: new Date('2023-01-03'),
          payer: mockAccountId,
        },
      ];

      const connection = manager.processConnectionMessages(
        connectionTopicId,
        messages
      );

      expect(connection).toBeDefined();
      expect(connection?.lastActivity).toEqual(new Date('2023-01-03'));
    });

    it('should mark a connection as closed when a close_connection message is received', () => {
      const connectionTopicId = '0.0.222222';
      manager.updateOrAddConnection({
        connectionTopicId,
        targetAccountId: '0.0.654321',
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
      });

      const messages: HCSMessage[] = [
        {
          p: 'hcs-10',
          op: 'close_connection',
          reason: 'Conversation ended',
          sequence_number: 125,
          created: new Date('2023-01-04'),
          payer: mockAccountId,
          data: '',
        },
      ];

      const connection = manager.processConnectionMessages(
        connectionTopicId,
        messages
      );

      expect(connection).toBeDefined();
      expect(connection?.status).toBe('closed');
      expect(connection?.closedReason).toBe('Conversation ended');
      expect(connection?.closeMethod).toBe('explicit');
    });
  });

  describe('profile management', () => {
    it('should update connections with profile information', () => {
      // Set up a connection
      const connectionTopicId = '0.0.222222';
      const targetAccountId = '0.0.654321';
      manager.updateOrAddConnection({
        connectionTopicId,
        targetAccountId,
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
      });

      // Add profile info
      const profile = {
        display_name: 'Test Agent',
        inboundTopicId: '0.0.111111',
        outboundTopicId: '0.0.333333',
        bio: 'Test agent for unit tests',
        type: 1,
        version: "1.0",
        aiAgent: {
          type: 0,
          capabilities: [],
          model: "test-model"
        }
      };

      manager.addProfileInfo(targetAccountId, profile);

      // Get the connection
      const connection = manager.getConnectionByTopicId(connectionTopicId);

      expect(connection).toBeDefined();
      expect(connection?.targetAgentName).toBe('Test Agent');
      expect(connection?.targetInboundTopicId).toBe('0.0.111111');
      expect(connection?.targetOutboundTopicId).toBe('0.0.333333');
      expect(connection?.profileInfo).toEqual(profile);
    });
  });

  describe('connection retrieval methods', () => {
    beforeEach(() => {
      // Set up some test connections
      manager.updateOrAddConnection({
        connectionTopicId: '0.0.222222',
        targetAccountId: '0.0.654321',
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
        connectionRequestId: 1001,
      });

      manager.updateOrAddConnection({
        connectionTopicId: 'pending_1002',
        targetAccountId: '0.0.765432',
        status: 'pending',
        isPending: true,
        needsConfirmation: false,
        created: new Date('2023-01-02'),
        connectionRequestId: 1002,
      });

      manager.updateOrAddConnection({
        connectionTopicId: 'needsConfirm_123',
        targetAccountId: '0.0.876543',
        status: 'needs_confirmation',
        isPending: false,
        needsConfirmation: true,
        created: new Date('2023-01-03'),
        inboundRequestId: 123,
      });
    });

    it('should retrieve all connections', () => {
      const connections = manager.getAllConnections();
      expect(connections).toHaveLength(3);
    });

    it('should retrieve only active connections', () => {
      const connections = manager.getActiveConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].connectionTopicId).toBe('0.0.222222');
    });

    it('should retrieve connections needing confirmation', () => {
      const connections = manager.getConnectionsNeedingConfirmation();
      expect(connections).toHaveLength(1);
      expect(connections[0].connectionTopicId).toBe('needsConfirm_123');
    });

    it('should get a connection by topic ID', () => {
      const connection = manager.getConnectionByTopicId('0.0.222222');
      expect(connection).toBeDefined();
      expect(connection?.targetAccountId).toBe('0.0.654321');
    });



    it('should get a connection by account ID', () => {
      const connection = manager.getConnectionByAccountId('0.0.654321');
      expect(connection).toBeDefined();
      expect(connection?.connectionTopicId).toBe('0.0.222222');
    });
  });

  describe('multiple connections with same account', () => {
    it('should properly handle multiple active connections with the same account ID', () => {
      const commonAccountId = '0.0.654321';

      // Set up two established connections with the same account ID but different topic IDs
      const connectionTopicId1 = '0.0.111111';
      const connectionTopicId2 = '0.0.222222';

      manager.updateOrAddConnection({
        connectionTopicId: connectionTopicId1,
        targetAccountId: commonAccountId,
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
        connectionRequestId: 1001,
      });

      manager.updateOrAddConnection({
        connectionTopicId: connectionTopicId2,
        targetAccountId: commonAccountId,
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-02'),
        connectionRequestId: 1002,
      });

      // Get all connections - should have both
      const allConnections = manager.getAllConnections();
      expect(allConnections.length).toBe(2);

      // Get by account ID - should return one of them (first match)
      const singleConnection = manager.getConnectionByAccountId(commonAccountId);
      expect(singleConnection).toBeDefined();

      // Get all for this account - should have both
      const accountConnections = manager.getConnectionsByAccountId(commonAccountId);
      expect(accountConnections.length).toBe(2);

      // Verify we can get each specifically by topic ID
      const conn1 = manager.getConnectionByTopicId(connectionTopicId1);
      const conn2 = manager.getConnectionByTopicId(connectionTopicId2);

      expect(conn1).toBeDefined();
      expect(conn2).toBeDefined();
      expect(conn1?.connectionRequestId).toBe(1001);
      expect(conn2?.connectionRequestId).toBe(1002);
    });
  });
});
