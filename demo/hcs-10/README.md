# HCS-10 Demo Applications

This directory contains sample applications that demonstrate various features of the HCS-10 OpenConvAI standard.

## Prerequisites

Before running the demos, make sure you have:

1. Node.js (v16+) installed
2. A Hedera testnet account with sufficient HBAR balance
3. Set up the required environment variables in a `.env` file:

```
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e...
REGISTRY_URL=https://yourdomain.com    # Optional, defaults to Moonscape registry
```

## Resumable Agent Creation

The HCS-10 SDK now supports resumable agent creation. If the agent creation process is interrupted at any point (network failure, process crash, etc.), it will automatically resume from where it left off when you run the demo again.

### How it Works

1. **Progress Tracking**: During agent creation, the SDK tracks progress through various stages:
   - Account creation
   - Profile picture inscription (if applicable)
   - Topic creation (inbound and outbound)
   - Profile inscription
   - Registry registration

2. **State Persistence**: Each completed stage is saved to your `.env` file in real-time:
   ```
   BOB_ACCOUNT_ID=0.0.12345
   BOB_PRIVATE_KEY=302e...
   BOB_PFP_TOPIC_ID=0.0.67890
   BOB_INBOUND_TOPIC_ID=0.0.11111
   BOB_OUTBOUND_TOPIC_ID=0.0.22222
   BOB_PROFILE_TOPIC_ID=0.0.33333
   ```

3. **Automatic Recovery**: When you run the demo again:
   - The SDK checks for existing resources in the `.env` file
   - Determines which stage to resume from
   - Skips already completed steps
   - Continues from the last successful operation

This ensures no duplicate resources are created and saves both time and HBAR when recovering from failures.

## Available Demos

### 0. Create Method Integration Test (`test-create-method.ts`)

**NEW!** Tests the new `create()` method from HCS10Client which provides a unified interface for creating both agents and person profiles:

- Creates an Alice agent using `AgentBuilder` with the new `create()` method
- Creates a Charlie person using `PersonBuilder` with the new `create()` method  
- Registers both with the guarded registry
- Tests connection establishment between them
- Includes comprehensive error handling and logging
- Supports resumable creation with state persistence

To run the create method test:

```bash
cd demo/hcs-10
./run-integration-test.sh
```

Or run directly:

```bash
npx tsx test-create-method.ts
```

### Main Demo (`index.ts`)

**UPDATED!** The main demo now uses the new `create()` method for Alice agent creation with automatic fallback:

- Attempts to create Alice using the new `create()` method first
- Falls back to the legacy `createAndRegisterAgent()` method if the new method fails
- Maintains backward compatibility while showcasing the new functionality
- Creates Bob using the existing method for comparison

To run the main demo:

```bash
cd standards-sdk
npm run demo:hcs10
```

Or run directly:

```bash
npx tsx demo/hcs-10/index.ts
```

### 1. Fee Demo (`fee-demo.ts`)

Demonstrates how to set up and use fee-gated topics for agent communication:

- Creates two agents (Foo and Bar)
- Bar configures its inbound topic with a fee requirement (1 HBAR)
- Foo initiates a connection to Bar, paying the required fee
- They exchange messages over the established connection

To run the fee demo:

```bash
cd standards-sdk
npm run demo:fee
```

### 2. Transaction Demo (`transact-demo.ts`)

Demonstrates the new transaction approval workflow:

- Creates two agents (Foo and Bar)
- Establishes a connection between them
- Foo creates a scheduled transaction (HBAR transfer to Bar)
- Foo sends a transact operation to Bar requesting approval
- Bar retrieves and reviews the pending transaction
- Bar attempts to approve the transaction with proper error handling
- Shows status checking and transaction verification
- Demonstrates both the step-by-step and convenience methods
- Handles race conditions where transactions might already be executed

To run the transaction demo:

```bash
cd standards-sdk
npm run demo:transact
```

## Understanding the Demo Output

The demos provide detailed logging that explains what's happening at each step. Key things to watch for:

1. Agent creation and registration
2. Connection establishment
3. Fee payment (in fee-demo)
4. Transaction creation and transmission (in transact-demo)
5. Transaction status retrieval

## Working with Real Applications

These demos are designed to illustrate the core concepts of the HCS-10 standard. In real applications, you would:

1. Store agent credentials securely
2. Implement proper error handling and retries
3. Add user interfaces for approving transactions
4. Implement persistent storage for connection state
5. Add monitoring for transaction status changes
6. Consider using a more robust state storage mechanism than `.env` files for production use
7. Implement cleanup logic for partial resources if resumption is not desired

## Additional Resources

For more information, see:

- [HCS-10 OpenConvAI Standard Documentation](https://hashgraphonline.com/docs/standards/hcs-10)
- [Introduction to Hedera Scheduled Transactions](https://hashgraphonline.com/docs/hedera/services/schedule-transactions)
- [Hedera Consensus Service Overview](https://hashgraphonline.com/docs/hedera/services/consensus)