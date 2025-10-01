import dotenv from 'dotenv';
import { HCS10Client, AgentBuilder, PersonBuilder, Logger } from '../../src';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  ensureAgentHasEnoughHbar,
  monitorIncomingRequests,
  ENV_FILE_PATH,
  updateEnvFile,
} from './utils';
import { AIAgentCapability, InboundTopicType } from '../../src';

dotenv.config();

const logger = new Logger({
  module: 'HCS10CreateMethodTest',
  level: 'debug',
  prettyPrint: true,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logToFile = process.env.LOG_TO_FILE === 'true';
let logFileHandle: fs.WriteStream | null = null;

if (logToFile) {
  const logFilePath = path.join(__dirname, 'create-method-test.log');
  logFileHandle = fs.createWriteStream(logFilePath, { flags: 'a' });
  logger.info(`Logging output to: ${logFilePath}`);
}

function logToFileAndConsole(
  message: string,
  level: 'info' | 'error' | 'warn' = 'info',
) {
  if (logFileHandle) {
    const timestamp = new Date().toISOString();
    logFileHandle.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
  }
  logger[level](message);
}

async function createAliceWithCreateMethod(baseClient: HCS10Client): Promise<{
  accountId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
  client: HCS10Client;
} | null> {
  try {
    logToFileAndConsole('=== Creating Alice Agent using create() method ===');

    const randomSuffix = Math.random().toString(36).substring(2, 8);

    const existingAccountId = process.env.ALICE_CREATE_ACCOUNT_ID;
    const existingPrivateKey = process.env.ALICE_CREATE_PRIVATE_KEY;
    const existingInbound = process.env.ALICE_CREATE_INBOUND_TOPIC_ID;
    const existingOutbound = process.env.ALICE_CREATE_OUTBOUND_TOPIC_ID;
    const existingProfile = process.env.ALICE_CREATE_PROFILE_TOPIC_ID;

    if (
      existingAccountId &&
      existingPrivateKey &&
      existingInbound &&
      existingOutbound &&
      existingProfile
    ) {
      logToFileAndConsole(`Found existing Alice data, reusing...`);
      const client = new HCS10Client({
        network: 'testnet',
        operatorId: existingAccountId,
        operatorPrivateKey: existingPrivateKey,
        guardedRegistryBaseUrl: process.env.REGISTRY_URL,
        prettyPrint: true,
        logLevel: 'debug',
      });

      return {
        accountId: existingAccountId,
        inboundTopicId: existingInbound,
        outboundTopicId: existingOutbound,
        profileTopicId: existingProfile,
        client,
      };
    }

    const alicePfpPath = path.join(__dirname, 'assets', 'alice-icon.svg');
    let pfpBuffer: Buffer | undefined;
    if (fs.existsSync(alicePfpPath)) {
      pfpBuffer = fs.readFileSync(alicePfpPath);
      logToFileAndConsole('Alice profile picture loaded');
    } else {
      logToFileAndConsole(
        'Alice profile picture not found, proceeding without it',
        'warn',
      );
    }

    const aliceBuilder = new AgentBuilder()
      .setName('Alice Test Agent')
      .setAlias(`alice-create-test-${randomSuffix}`)
      .setBio(
        'Test agent created using the new create() method for data processing and analysis',
      )
      .setCapabilities([
        AIAgentCapability.KNOWLEDGE_RETRIEVAL,
        AIAgentCapability.DATA_INTEGRATION,
      ])
      .setType('manual')
      .setModel('test-model-create-2024')
      .addSocial('linkedin', `@alice-create-${randomSuffix}`)
      .addProperty('name', 'Alice Test Agent')
      .addProperty(
        'description',
        'Test agent created using the new create() method',
      )
      .addProperty('version', '1.0.0')
      .addProperty('permissions', ['read_network', 'write_data'])
      .setNetwork('testnet')
      .setInboundTopicType(InboundTopicType.PUBLIC);

    if (pfpBuffer) {
      aliceBuilder.setProfilePicture(
        pfpBuffer,
        `alice-create-${randomSuffix}-icon.svg`,
      );
    }

    logToFileAndConsole(
      'Alice AgentBuilder configured, calling create() method...',
    );

    const result = await baseClient.create(aliceBuilder, {
      ttl: 120,
      updateAccountMemo: true,
      progressCallback: async progressData => {
        logToFileAndConsole(
          `[Alice Create Progress] ${progressData.stage}: ${progressData.message} (${progressData.progressPercent || 0}%)`,
        );

        const envUpdates: Record<string, string> = {};

        if (progressData.details) {
          if (progressData.details.account?.accountId) {
            envUpdates['ALICE_CREATE_ACCOUNT_ID'] =
              progressData.details.account.accountId;
          }
          if (progressData.details.account?.privateKey) {
            envUpdates['ALICE_CREATE_PRIVATE_KEY'] =
              progressData.details.account.privateKey;
          }
          if (progressData.details.inboundTopicId) {
            envUpdates['ALICE_CREATE_INBOUND_TOPIC_ID'] =
              progressData.details.inboundTopicId;
          }
          if (progressData.details.outboundTopicId) {
            envUpdates['ALICE_CREATE_OUTBOUND_TOPIC_ID'] =
              progressData.details.outboundTopicId;
          }
          if (progressData.details.profileTopicId) {
            envUpdates['ALICE_CREATE_PROFILE_TOPIC_ID'] =
              progressData.details.profileTopicId;
          }
        }

        if (Object.keys(envUpdates).length > 0) {
          await updateEnvFile(ENV_FILE_PATH, envUpdates);
        }
      },
    });

    if (!result) {
      throw new Error('Alice creation failed - no result returned');
    }

    logToFileAndConsole('Alice created successfully using create() method!');

    let accountId, inboundTopicId, outboundTopicId, profileTopicId, privateKey;

    if ('metadata' in result && result.metadata) {
      const metadata = result.metadata;
      accountId = metadata.accountId;
      inboundTopicId = metadata.inboundTopicId;
      outboundTopicId = metadata.outboundTopicId;
      profileTopicId = metadata.profileTopicId;
      privateKey = metadata.privateKey;
    } else {
      accountId = process.env.HEDERA_ACCOUNT_ID!;
      inboundTopicId = result.inboundTopicId;
      outboundTopicId = result.outboundTopicId;
      profileTopicId = result.profileTopicId;
      privateKey = process.env.HEDERA_PRIVATE_KEY!;
    }

    if (!accountId || !inboundTopicId || !outboundTopicId || !profileTopicId) {
      throw new Error('Missing required fields in result');
    }

    logToFileAndConsole(`Alice Account ID: ${accountId}`);
    logToFileAndConsole(`Alice Inbound Topic: ${inboundTopicId}`);
    logToFileAndConsole(`Alice Outbound Topic: ${outboundTopicId}`);
    logToFileAndConsole(`Alice Profile Topic: ${profileTopicId}`);

    const aliceClient = new HCS10Client({
      network: 'testnet',
      operatorId: accountId,
      operatorPrivateKey: privateKey,
      guardedRegistryBaseUrl: process.env.REGISTRY_URL,
      prettyPrint: true,
      logLevel: 'debug',
    });

    return {
      accountId,
      inboundTopicId,
      outboundTopicId,
      profileTopicId,
      client: aliceClient,
    };
  } catch (error) {
    logToFileAndConsole(`Error creating Alice agent: ${error}`, 'error');
    return null;
  }
}

async function createCharlieWithCreateMethod(baseClient: HCS10Client): Promise<{
  accountId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
  client: HCS10Client;
} | null> {
  try {
    logToFileAndConsole(
      '=== Creating Charlie Person using create() method ===',
    );

    const randomSuffix = Math.random().toString(36).substring(2, 8);

    const existingAccountId = process.env.CHARLIE_CREATE_ACCOUNT_ID;
    const existingPrivateKey = process.env.CHARLIE_CREATE_PRIVATE_KEY;
    const existingInbound = process.env.CHARLIE_CREATE_INBOUND_TOPIC_ID;
    const existingOutbound = process.env.CHARLIE_CREATE_OUTBOUND_TOPIC_ID;
    const existingProfile = process.env.CHARLIE_CREATE_PROFILE_TOPIC_ID;

    if (
      existingAccountId &&
      existingPrivateKey &&
      existingInbound &&
      existingOutbound &&
      existingProfile
    ) {
      logToFileAndConsole(`Found existing Charlie data, reusing...`);
      const client = new HCS10Client({
        network: 'testnet',
        operatorId: existingAccountId,
        operatorPrivateKey: existingPrivateKey,
        guardedRegistryBaseUrl: process.env.REGISTRY_URL,
        prettyPrint: true,
        logLevel: 'debug',
      });

      return {
        accountId: existingAccountId,
        inboundTopicId: existingInbound,
        outboundTopicId: existingOutbound,
        profileTopicId: existingProfile,
        client,
      };
    }

    const charlieBuilder = new PersonBuilder()
      .setName('Charlie Test Person')
      .setAlias(`charlie-create-test-${randomSuffix}`)
      .setBio(
        'Test person created using the new create() method for testing interactions',
      )
      .addSocial('twitter', `@charlie-create-${randomSuffix}`)
      .addProperty('name', 'Charlie Test Person')
      .addProperty(
        'description',
        'Test person created using the new create() method',
      )
      .addProperty('version', '1.0.0')
      .addProperty('type', 'person');

    logToFileAndConsole(
      'Charlie PersonBuilder configured, calling create() method...',
    );

    const result = await baseClient.create(charlieBuilder, {
      ttl: 120,
      updateAccountMemo: true,
      progressCallback: async progressData => {
        logToFileAndConsole(
          `[Charlie Create Progress] ${progressData.stage}: ${progressData.message} (${progressData.progressPercent || 0}%)`,
        );

        const envUpdates: Record<string, string> = {};

        if (progressData.details) {
          if (progressData.details.account?.accountId) {
            envUpdates['CHARLIE_CREATE_ACCOUNT_ID'] =
              progressData.details.account.accountId;
          }
          if (progressData.details.account?.privateKey) {
            envUpdates['CHARLIE_CREATE_PRIVATE_KEY'] =
              progressData.details.account.privateKey;
          }
          if (progressData.details.inboundTopicId) {
            envUpdates['CHARLIE_CREATE_INBOUND_TOPIC_ID'] =
              progressData.details.inboundTopicId;
          }
          if (progressData.details.outboundTopicId) {
            envUpdates['CHARLIE_CREATE_OUTBOUND_TOPIC_ID'] =
              progressData.details.outboundTopicId;
          }
          if (progressData.details.profileTopicId) {
            envUpdates['CHARLIE_CREATE_PROFILE_TOPIC_ID'] =
              progressData.details.profileTopicId;
          }
        }

        if (Object.keys(envUpdates).length > 0) {
          await updateEnvFile(ENV_FILE_PATH, envUpdates);
        }
      },
    });

    if (!result) {
      throw new Error('Charlie creation failed - no result returned');
    }

    logToFileAndConsole('Charlie created successfully using create() method!');

    let accountId, inboundTopicId, outboundTopicId, profileTopicId, privateKey;

    if ('metadata' in result && result.metadata) {
      const metadata = result.metadata;
      accountId = metadata.accountId;
      inboundTopicId = metadata.inboundTopicId;
      outboundTopicId = metadata.outboundTopicId;
      profileTopicId = metadata.profileTopicId;
      privateKey = metadata.privateKey;
    } else {
      accountId = process.env.HEDERA_ACCOUNT_ID!;
      inboundTopicId = result.inboundTopicId;
      outboundTopicId = result.outboundTopicId;
      profileTopicId = result.profileTopicId;
      privateKey = process.env.HEDERA_PRIVATE_KEY!;
    }

    if (!accountId || !inboundTopicId || !outboundTopicId || !profileTopicId) {
      throw new Error('Missing required fields in result');
    }

    logToFileAndConsole(`Charlie Account ID: ${accountId}`);
    logToFileAndConsole(`Charlie Inbound Topic: ${inboundTopicId}`);
    logToFileAndConsole(`Charlie Outbound Topic: ${outboundTopicId}`);
    logToFileAndConsole(`Charlie Profile Topic: ${profileTopicId}`);

    const charlieClient = new HCS10Client({
      network: 'testnet',
      operatorId: accountId,
      operatorPrivateKey: privateKey,
      guardedRegistryBaseUrl: process.env.REGISTRY_URL,
      prettyPrint: true,
      logLevel: 'debug',
    });

    return {
      accountId,
      inboundTopicId,
      outboundTopicId,
      profileTopicId,
      client: charlieClient,
    };
  } catch (error) {
    logToFileAndConsole(`Error creating Charlie person: ${error}`, 'error');
    return null;
  }
}

async function testConnectionBetweenAliceAndCharlie(
  alice: {
    accountId: string;
    inboundTopicId: string;
    outboundTopicId: string;
    client: HCS10Client;
  },
  charlie: {
    accountId: string;
    inboundTopicId: string;
    outboundTopicId: string;
    client: HCS10Client;
  },
) {
  try {
    logToFileAndConsole('=== Testing Connection Between Alice and Charlie ===');

    const baseClient = new HCS10Client({
      network: 'testnet',
      operatorId: process.env.HEDERA_ACCOUNT_ID!,
      operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY!,
      guardedRegistryBaseUrl: process.env.REGISTRY_URL,
      prettyPrint: true,
      logLevel: 'debug',
    });

    await ensureAgentHasEnoughHbar(
      logger,
      baseClient,
      alice.accountId,
      'Alice',
    );
    await ensureAgentHasEnoughHbar(
      logger,
      baseClient,
      charlie.accountId,
      'Charlie',
    );

    logToFileAndConsole(
      'Both accounts funded. Starting connection monitoring for Charlie...',
    );

    const charlieMonitor = monitorIncomingRequests(
      baseClient,
      charlie.client,
      charlie.inboundTopicId,
      logger,
    );

    await new Promise(resolve => setTimeout(resolve, 3000));

    logToFileAndConsole('Alice submitting connection request to Charlie...');

    const connectionResponse = await alice.client.submitConnectionRequest(
      charlie.inboundTopicId,
      'Hello Charlie, I would like to test the new create() method connection flow.',
    );

    const connectionRequestId =
      connectionResponse.topicSequenceNumber?.toNumber();
    if (!connectionRequestId) {
      throw new Error(
        'Connection request failed - no sequence number returned',
      );
    }

    logToFileAndConsole(
      `Connection request submitted with ID: ${connectionRequestId}`,
    );

    logToFileAndConsole('Waiting for connection confirmation...');

    try {
      const confirmation = await alice.client.waitForConnectionConfirmation(
        charlie.inboundTopicId,
        connectionRequestId,
        90,
        3000,
      );

      logToFileAndConsole(
        `Connection confirmed! Topic ID: ${confirmation.connectionTopicId}`,
      );

      logToFileAndConsole('Alice sending test message through connection...');

      const testMessage = {
        type: 'test_message',
        source: 'create_method_test',
        timestamp: new Date().toISOString(),
        message:
          'This is a test message sent through a connection created using the new create() method',
      };

      await alice.client.sendMessage(
        confirmation.connectionTopicId,
        JSON.stringify(testMessage),
        'Test message from create() method integration test',
      );

      logToFileAndConsole('Test message sent successfully!');

      logToFileAndConsole('Charlie retrieving messages...');
      const messages = await charlie.client.getMessages(
        confirmation.connectionTopicId,
      );

      const foundMessage = messages.messages.find(
        msg =>
          msg.op === 'message' &&
          typeof msg.data === 'string' &&
          (msg.data.includes('create_method_test') ||
            msg.data.includes('create() method')),
      );

      if (foundMessage) {
        logToFileAndConsole(
          "Charlie successfully received Alice's test message!",
        );
        return true;
      } else {
        logToFileAndConsole(
          "Charlie did not receive Alice's test message",
          'warn',
        );
        return false;
      }
    } catch (error) {
      logToFileAndConsole(`Connection confirmation failed: ${error}`, 'error');
      return false;
    }
  } catch (error) {
    logToFileAndConsole(`Connection test failed: ${error}`, 'error');
    return false;
  }
}

async function main() {
  const startTime = Date.now();
  let success = false;

  try {
    logToFileAndConsole(
      '=== HCS-10 Create Method Integration Test Started ===',
    );

    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
      throw new Error(
        'HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables must be set',
      );
    }

    if (!process.env.REGISTRY_URL) {
      throw new Error('REGISTRY_URL environment variable must be set');
    }

    const baseClient = new HCS10Client({
      network: 'testnet',
      operatorId: process.env.HEDERA_ACCOUNT_ID!,
      operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY!,
      guardedRegistryBaseUrl: process.env.REGISTRY_URL,
      prettyPrint: true,
      logLevel: 'debug',
    });

    logToFileAndConsole(`Using registry URL: ${process.env.REGISTRY_URL}`);
    logToFileAndConsole(
      `Using operator account: ${process.env.HEDERA_ACCOUNT_ID}`,
    );

    const alice = await createAliceWithCreateMethod(baseClient);
    if (!alice) {
      throw new Error('Failed to create Alice agent');
    }

    logToFileAndConsole('✅ Alice agent created successfully');

    const charlie = await createCharlieWithCreateMethod(baseClient);
    if (!charlie) {
      throw new Error('Failed to create Charlie person');
    }

    logToFileAndConsole('✅ Charlie person created successfully');

    const connectionSuccess = await testConnectionBetweenAliceAndCharlie(
      alice,
      charlie,
    );

    if (connectionSuccess) {
      logToFileAndConsole('✅ Connection test successful');
    } else {
      logToFileAndConsole('❌ Connection test failed', 'error');
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    logToFileAndConsole('=== Test Summary ===');
    logToFileAndConsole(
      `Alice Agent: ${alice.accountId} (Inbound: ${alice.inboundTopicId})`,
    );
    logToFileAndConsole(
      `Charlie Person: ${charlie.accountId} (Inbound: ${charlie.inboundTopicId})`,
    );
    logToFileAndConsole(
      `Connection Test: ${connectionSuccess ? 'PASSED' : 'FAILED'}`,
    );
    logToFileAndConsole(`Total Duration: ${duration} seconds`);

    success = connectionSuccess;
  } catch (error) {
    logToFileAndConsole(`=== Test Failed ===`, 'error');
    logToFileAndConsole(`Error: ${error}`, 'error');
    console.error(error);
  } finally {
    if (logFileHandle) {
      logFileHandle.end();
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    logToFileAndConsole(`Test completed in ${duration} seconds`);

    if (success) {
      logToFileAndConsole('🎉 All tests passed! Exiting with code 0');
      process.exit(0);
    } else {
      logToFileAndConsole('💥 Tests failed! Exiting with code 1', 'error');
      process.exit(1);
    }
  }
}

process.on('SIGINT', () => {
  logToFileAndConsole('Test interrupted by user', 'warn');
  if (logFileHandle) {
    logFileHandle.end();
  }
  process.exit(1);
});

process.on('SIGTERM', () => {
  logToFileAndConsole('Test terminated', 'warn');
  if (logFileHandle) {
    logFileHandle.end();
  }
  process.exit(1);
});

main();
