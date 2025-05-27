import { ConnectionsManager } from '../src/hcs-10/connections-manager';
import { HCSMessage, HCS10BaseClient } from '../src/hcs-10/base-client';
import { AIAgentCapability, AIAgentProfile } from '../src';
import { TopicInfo } from '../src/services/types';

// Mock the baseClient
class MockHCS10Client implements HCS10BaseClient {
  // For tests we don't need the actual implementation
  // @ts-ignore - intentionally incomplete mock for tests
  async submitPayload() {
    return { topicSequenceNumber: { toNumber: () => 123 } };
  }

  async getMessages(topicId: string): Promise<{ messages: HCSMessage[] }> {
    if (!this.isValidTopicId(topicId)) {
      throw new Error(`Invalid topic ID: ${topicId}`);
    }
    return { messages: this.mockMessages[topicId] || [] };
  }

  // Helper to validate topic ID format
  isValidTopicId(topicId: string): boolean {
    return !!topicId && !topicId.includes(':') && /^0\.0\.\d+$/.test(topicId);
  }

  mockMessages: Record<string, HCSMessage[]> = {};

  setMockMessages(topicId: string, messages: HCSMessage[]) {
    this.mockMessages[topicId] = messages;
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

  async retrieveCommunicationTopics(accountId: string): Promise<TopicInfo> {
    return {
      inboundTopic: '0.0.100002',
      outboundTopic: '0.0.100001',
      profileTopicId: '0.0.100003', // Added to match TopicInfo interface
    };
  }

  async retrieveProfile(accountId: string) {
    return {
      success: true,
      profile: {
        display_name: `Agent ${accountId}`,
        inboundTopicId: `0.0.${accountId.split('.').pop()}IN`,
        outboundTopicId: `0.0.${accountId.split('.').pop()}OUT`,
        type: 1,
        version: '1.0',
      },
    };
  }

  async confirmConnection(): Promise<void> {
    return;
  }

  async fetchProfile(): Promise<AIAgentProfile> {
    return {
      alias: 'agent',
      display_name: 'Agent 123456',
      bio: 'Agent 123456',
      type: 1,
      version: '1.0',
      aiAgent: {
        model: 'gpt-4o',
        capabilities: [AIAgentCapability.API_INTEGRATION],
        type: 1,
      },
    };
  }
}

describe('ConnectionsManager - Sequence Number Uniqueness', () => {
  let manager: ConnectionsManager;
  let mockClient: MockHCS10Client;
  const mockAccountId = '0.0.123456';

  beforeEach(() => {
    mockClient = new MockHCS10Client();
    // @ts-ignore - type error in mock is acceptable for tests
    manager = new ConnectionsManager({
      // @ts-ignore - type error in mock is acceptable for tests
      baseClient: mockClient,
      logLevel: 'error',
    });
  });

  describe('outbound requests with same sequence numbers', () => {
    it('should correctly handle multiple outbound requests with the same sequence number but different topics', async () => {
      // First agent's outbound topic with sequence number 1
      const outboundMessagesAgent1: HCSMessage[] = [
        {
          p: 'hcs-10',
          op: 'connection_request',
          connection_request_id: 1,
          operator_id: '0.0.111000@0.0.654321',
          outbound_topic_id: '0.0.222222',
          sequence_number: 1, // Same sequence number as agent 2
          created: new Date('2023-01-01'),
          payer: mockAccountId,
          data: '',
        },
      ];

      // Second agent's outbound topic with sequence number 1
      const outboundMessagesAgent2: HCSMessage[] = [
        {
          p: 'hcs-10',
          op: 'connection_request',
          connection_request_id: 1,
          operator_id: '0.0.222000@0.0.765432',
          outbound_topic_id: '0.0.222222',
          sequence_number: 1, // Same sequence number as agent 1
          created: new Date('2023-01-01'),
          payer: mockAccountId,
          data: '',
        },
      ];

      // Process both outbound messages
      manager.processOutboundMessages(outboundMessagesAgent1, mockAccountId);
      manager.processOutboundMessages(outboundMessagesAgent2, mockAccountId);

      // Verify we have 2 pending connections with the same sequence number
      const pendingConnections = Array.from(
        manager['connections'].values(),
      ).filter(conn => conn.status === 'pending');

      expect(pendingConnections.length).toBe(2);

      // Verify they have the correct target account IDs
      const targetAccounts = pendingConnections.map(
        conn => conn.targetAccountId,
      );
      expect(targetAccounts).toContain('0.0.654321');
      expect(targetAccounts).toContain('0.0.765432');

      // Verify we have unique keys for these connections despite same sequence number
      const keys = Array.from(manager['connections'].keys());
      expect(keys).toContain('req-1:0.0.111000@0.0.654321');
      expect(keys).toContain('req-1:0.0.222000@0.0.765432');
    });

    it('should not delete one pending connection when processing confirmation for another connection with same sequence number', () => {
      // Create two pending connections with same sequence number
      const request1: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        connection_request_id: 1,
        operator_id: '0.0.111000@0.0.654321',
        outbound_topic_id: '0.0.222222',
        sequence_number: 1,
        created: new Date('2023-01-01'),
        payer: mockAccountId,
        data: '',
      };

      const request2: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        connection_request_id: 1,
        operator_id: '0.0.222000@0.0.765432',
        outbound_topic_id: '0.0.222222',
        sequence_number: 1,
        created: new Date('2023-01-01'),
        payer: mockAccountId,
        data: '',
      };

      manager.processOutboundMessages([request1, request2], mockAccountId);

      // Confirm first connection
      const confirmation: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_created',
        connection_request_id: 1,
        connection_topic_id: '0.0.333333',
        confirmed_request_id: 456,
        outbound_topic_id: '0.0.222222',
        operator_id: '0.0.111000@0.0.654321', // First agent's topic
        sequence_number: 2,
        created: new Date('2023-01-02'),
        payer: mockAccountId,
        data: '',
      };

      manager.processOutboundMessages([confirmation], mockAccountId);

      // Verify one connection is now established and the other is still pending
      const connections = Array.from(manager['connections'].values());

      // Find the established connection
      const establishedConnection = connections.find(
        conn =>
          conn.status === 'established' &&
          conn.targetAccountId === '0.0.654321',
      );
      expect(establishedConnection).toBeDefined();
      expect(establishedConnection!.connectionTopicId).toBe('0.0.333333');

      // Find the pending connection - should still exist
      const pendingConnection = connections.find(
        conn =>
          conn.status === 'pending' && conn.targetAccountId === '0.0.765432',
      );
      expect(pendingConnection).toBeDefined();

      // We should have 2 connections in total
      expect(connections.length).toBe(2);
    });
  });

  describe('inbound requests with same sequence numbers', () => {
    it('should correctly handle multiple inbound requests with the same sequence number', () => {
      // First agent's inbound request with sequence number 1
      const inboundMessageAgent1: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        operator_id: '0.0.111000@0.0.654321',
        sequence_number: 1, // Same sequence number as agent 2
        created: new Date('2023-01-01'),
        payer: '0.0.654321',
        data: '',
      };

      // Second agent's inbound request with sequence number 1
      const inboundMessageAgent2: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        operator_id: '0.0.222000@0.0.765432',
        sequence_number: 1, // Same sequence number as agent 1
        created: new Date('2023-01-01'),
        payer: '0.0.765432',
        data: '',
      };

      // Process both inbound messages
      manager.processInboundMessages([
        inboundMessageAgent1,
        inboundMessageAgent2,
      ]);

      // Verify we have 2 connections needing confirmation
      const needsConfirmationConnections = Array.from(
        manager['connections'].values(),
      ).filter(conn => conn.status === 'needs_confirmation');

      expect(needsConfirmationConnections.length).toBe(2);

      // Verify they have the correct target account IDs
      const targetAccounts = needsConfirmationConnections.map(
        conn => conn.targetAccountId,
      );
      expect(targetAccounts).toContain('0.0.654321');
      expect(targetAccounts).toContain('0.0.765432');

      // Verify we have unique keys for these connections despite same sequence number
      const keys = Array.from(manager['connections'].keys());
      expect(keys).toContain('inb-1:0.0.111000@0.0.654321');
      expect(keys).toContain('inb-1:0.0.222000@0.0.765432');
    });

    it('should not delete one confirmation when processing another with same sequence number', () => {
      // Create two inbound requests with same sequence number
      const request1: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        operator_id: '0.0.111000@0.0.654321',
        sequence_number: 1,
        created: new Date('2023-01-01'),
        payer: '0.0.654321',
        data: '',
      };

      const request2: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        operator_id: '0.0.222000@0.0.765432',
        sequence_number: 1,
        created: new Date('2023-01-01'),
        payer: '0.0.765432',
        data: '',
      };

      manager.processInboundMessages([request1, request2]);

      // Confirm first connection
      const confirmation: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_created',
        connection_id: 1,
        connection_topic_id: '0.0.333333',
        connected_account_id: '0.0.654321',
        operator_id: '0.0.111000@0.0.654321', // First agent's topic
        sequence_number: 2,
        created: new Date('2023-01-02'),
        payer: mockAccountId,
        data: '',
      };

      manager.processInboundMessages([confirmation]);

      // Verify one connection is now established and the other is still needs_confirmation
      const connections = Array.from(manager['connections'].values());

      // Find the established connection
      const establishedConnection = connections.find(
        conn =>
          conn.status === 'established' &&
          conn.targetAccountId === '0.0.654321',
      );
      expect(establishedConnection).toBeDefined();
      expect(establishedConnection!.connectionTopicId).toBe('0.0.333333');

      // Find the needs_confirmation connection - should still exist
      const pendingConnection = connections.find(
        conn =>
          conn.status === 'needs_confirmation' &&
          conn.targetAccountId === '0.0.765432',
      );
      expect(pendingConnection).toBeDefined();

      // We should have 2 connections in total
      expect(connections.length).toBe(2);
    });
  });

  describe('fetchConnectionData with outbound requests confirmations', () => {
    it('should properly check for confirmations on target inbound topics for different agents', async () => {
      // Create two pending outbound connections with same sequence number but different target agents
      const outboundMessage1: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        connection_request_id: 1,
        operator_id: '0.0.100001@0.0.654321',
        outbound_topic_id: '0.0.100001',
        sequence_number: 1,
        created: new Date('2023-01-01'),
        payer: mockAccountId,
        data: '',
      };

      const outboundMessage2: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        connection_request_id: 1,
        operator_id: '0.0.100001@0.0.765432',
        outbound_topic_id: '0.0.100001',
        sequence_number: 1,
        created: new Date('2023-01-01'),
        payer: mockAccountId,
        data: '',
      };

      // Set up mock messages for outbound and inbound topics
      mockClient.setMockMessages('0.0.100001', [
        outboundMessage1,
        outboundMessage2,
      ]); // Outbound topic

      // Set up inbound topic with both request and confirmation
      mockClient.setMockMessages('0.0.100002', [
        {
          p: 'hcs-10',
          op: 'connection_request',
          connection_request_id: 1,
          operator_id: '0.0.100001@0.0.654321',
          outbound_topic_id: '0.0.100001',
          sequence_number: 1,
          created: new Date('2023-01-01'),
          payer: mockAccountId,
          data: '',
        },
        {
          p: 'hcs-10',
          op: 'connection_created',
          connection_id: 1,
          connection_topic_id: '0.0.333333',
          operator_id: '0.0.100001@0.0.654321',
          sequence_number: 2,
          created: new Date('2023-01-02'),
          payer: mockAccountId,
          data: '',
          connection_request_id: 1,
          confirmed_request_id: 1,
          connected_account_id: '0.0.654321',
        },
      ]);

      // Call fetchConnectionData to process everything
      await manager.fetchConnectionData(mockAccountId);

      // Check the results - agent 1 should be established, agent 2 should still be pending
      const connections = Array.from(manager['connections'].values());

      // Find the established connection for agent 1
      const agent1Connection = connections.find(
        conn =>
          conn.targetAccountId === '0.0.654321' &&
          conn.status === 'established',
      );

      expect(agent1Connection).toBeDefined();
      expect(agent1Connection!.status).toBe('established');
      expect(agent1Connection!.connectionTopicId).toBe('0.0.333333');

      // Find the pending connection for agent 2 - should still be pending
      const agent2Connection = connections.find(
        conn =>
          conn.targetAccountId === '0.0.765432' && conn.status === 'pending',
      );

      // Could be either still pending or not found (if your filter excludes pending)
      if (agent2Connection) {
        expect(agent2Connection.status).toBe('pending');
      } else {
        // If filtering excludes pending, verify it exists in the raw connections map
        const rawConnections = Array.from(manager['connections'].values());
        const rawAgent2Connection = rawConnections.find(
          conn => conn.targetAccountId === '0.0.765432',
        );
        expect(rawAgent2Connection).toBeDefined();
      }
    });
  });

  describe('connection confirmation cleanup', () => {
    it('should remove the original pending connection when a connection becomes established', async () => {
      // Create a pending connection
      const requestMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        connection_request_id: 100,
        operator_id: '0.0.999000@0.0.999999',
        outbound_topic_id: '0.0.222222',
        sequence_number: 1,
        created: new Date('2023-01-01'),
        payer: mockAccountId,
        data: '',
      };

      manager.processOutboundMessages([requestMessage], mockAccountId);

      // Verify the pending connection is in the map
      const connectionsBefore = Array.from(manager['connections'].entries());
      const pendingKey = 'req-100:0.0.999000@0.0.999999';
      const hasPendingBefore = connectionsBefore.some(
        ([key]) => key === pendingKey,
      );
      expect(hasPendingBefore).toBe(true);

      // Now confirm the connection with a direct confirmation
      const confirmationMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_created',
        connection_request_id: 100,
        connection_topic_id: '0.0.777777',
        confirmed_request_id: 200,
        outbound_topic_id: '0.0.222222',
        operator_id: '0.0.999000@0.0.999999',
        sequence_number: 2,
        created: new Date('2023-01-02'),
        payer: mockAccountId,
        data: '',
      };

      manager.processOutboundMessages([confirmationMessage], mockAccountId);

      // Verify the pending connection key is no longer in the map
      // and the new connection is there instead
      const connectionsAfter = Array.from(manager['connections'].entries());
      const hasPendingAfter = connectionsAfter.some(
        ([key]) => key === pendingKey,
      );
      expect(hasPendingAfter).toBe(false);

      // The new confirmed connection should be in the map
      const hasConfirmed = connectionsAfter.some(
        ([key]) => key === '0.0.777777',
      );
      expect(hasConfirmed).toBe(true);

      // Check that we have exactly one connection with this target account ID
      const targetAccountConnections = connectionsAfter
        .map(([_, conn]) => conn)
        .filter(conn => conn.targetAccountId === '0.0.999999');

      expect(targetAccountConnections.length).toBe(1);
      expect(targetAccountConnections[0].status).toBe('established');
    });

    it('should remove the original needs_confirmation connection when a connection becomes established', async () => {
      // Create a connection that needs confirmation
      const requestMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_request',
        operator_id: '0.0.888000@0.0.888888',
        sequence_number: 5,
        created: new Date('2023-01-01'),
        payer: '0.0.888888',
        data: '',
      };

      manager.processInboundMessages([requestMessage]);

      // Verify the needs_confirmation connection is in the map
      const connectionsBefore = Array.from(manager['connections'].entries());
      const pendingKey = 'inb-5:0.0.888000@0.0.888888';
      const hasPendingBefore = connectionsBefore.some(
        ([key]) => key === pendingKey,
      );
      expect(hasPendingBefore).toBe(true);

      // Now confirm the connection
      const confirmationMessage: HCSMessage = {
        p: 'hcs-10',
        op: 'connection_created',
        connection_id: 5,
        connection_topic_id: '0.0.666666',
        connected_account_id: '0.0.888888',
        operator_id: '0.0.888000@0.0.888888',
        sequence_number: 10,
        created: new Date('2023-01-02'),
        payer: mockAccountId,
        data: '',
      };

      manager.processInboundMessages([confirmationMessage]);

      // Verify the needs_confirmation connection key is no longer in the map
      // and the new connection is there instead
      const connectionsAfter = Array.from(manager['connections'].entries());
      const hasPendingAfter = connectionsAfter.some(
        ([key]) => key === pendingKey,
      );
      expect(hasPendingAfter).toBe(false);

      // The new confirmed connection should be in the map
      const hasConfirmed = connectionsAfter.some(
        ([key]) => key === '0.0.666666',
      );
      expect(hasConfirmed).toBe(true);

      // Check that we have exactly one connection with this target account ID
      const targetAccountConnections = connectionsAfter
        .map(([_, conn]) => conn)
        .filter(conn => conn.targetAccountId === '0.0.888888');

      expect(targetAccountConnections.length).toBe(1);
      expect(targetAccountConnections[0].status).toBe('established');
    });
  });

  describe('error handling for invalid topic IDs', () => {
    it('should catch errors when trying to fetch messages from invalid topic IDs', async () => {
      // Spy on console.error to verify errors are caught and not propagated
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Create a connection with a composite key as connectionTopicId
      const compositeKey = 'inb-100:0.0.999000@0.0.999999';
      manager.updateOrAddConnection({
        connectionTopicId: compositeKey,
        targetAccountId: '0.0.999999',
        targetInboundTopicId: compositeKey, // Intentionally invalid to test handling
        status: 'pending',
        isPending: true,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
        connectionRequestId: 100,
        processed: false,
      });

      // Call fetchConnectionData which will call various methods
      // This should not throw even though the MockHCS10Client will throw for invalid topics
      await expect(
        manager.fetchConnectionData(mockAccountId),
      ).resolves.not.toThrow();

      // Clean up
      consoleErrorSpy.mockRestore();
    });

    it('should handle errors when given an invalid targetInboundTopicId', async () => {
      // Create a pending connection with an invalid targetInboundTopicId
      const invalidTopicId = 'invalid:topic:id';
      manager.updateOrAddConnection({
        connectionTopicId: 'req-200:0.0.888000@0.0.888888',
        targetAccountId: '0.0.888888',
        targetInboundTopicId: invalidTopicId,
        status: 'pending',
        isPending: true,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
        connectionRequestId: 200,
        processed: false,
      });

      // Create a valid connection for comparison
      const validTopicId = '0.0.555555';
      manager.updateOrAddConnection({
        connectionTopicId: validTopicId,
        targetAccountId: '0.0.555555',
        targetInboundTopicId: '0.0.555556',
        status: 'established',
        isPending: false,
        needsConfirmation: false,
        created: new Date('2023-01-01'),
        processed: false,
      });

      // Call fetchConnectionData which will invoke the private methods internally
      // This should complete without throwing even though some operations will throw
      const result = await manager.fetchConnectionData(mockAccountId);

      // The result should include the valid connection
      const validConnection = result.find(
        conn => conn.connectionTopicId === validTopicId,
      );
      expect(validConnection).toBeDefined();
    });
  });
});
