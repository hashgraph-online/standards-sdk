import dotenv from 'dotenv';
import {
  HCS10Client,
  HCSMessage,
  Logger,
} from '@hashgraphonline/standards-sdk';
import { getOrCreateBob } from './utils';

interface AgentConnection {
  agentId: string;
  topicId: string;
  timestamp: string;
}

const logger = new Logger({
  module: 'BobPollingAgent',
  level: 'debug',
  prettyPrint: true,
});

dotenv.config();

const isJson = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

function generateASCIIArt(type: string): string {
  const arts: Record<string, string> = {
    cat: `
  /\\_/\\
 ( o.o )
  > ^ <`,
    dog: `
  / \\__
 (    @\\___
  /         O
 /   (_____/
/_____/   U`,
    robot: `
   ___
  |[_]|
  |+ ;|
  '---'`,
    heart: `
  .:::.   .:::.
 :::::::.:::::::
 :::::::::::::::
 ':::::::::::::'
   ':::::::::'
     ':::::'
       ':'`,
    hedera: `
    ██╗  ██╗
    ██║  ██║
    ███████║
    ██╔══██║
    ██║  ██║
    ╚═╝  ╚═╝`,
    hashgraph: `
    __ __  ___   ___  __ __  _____  ___    ___   ___   __ __
   / // / / _ \\ / __\\/ // / / ___/ / _ \\  / _ \\ / _ \\ / // /
  / _  / / /_\\ \\\\_\\ \\/ _  / / (_ / / , _/ / ___// ___// _  / 
 /_//_/ /_/ \\_\\/___//_//_/  \\___/ /_/|_| /_/   /_/   /_//_/`,
    bob: `
    ____   ___  ____ 
   | __ ) / _ \\| __ )
   |  _ \\| | | |  _ \\
   | |_) | |_| | |_) |
   |____/ \\___/|____/`,
    coin: `
     .-----.
    /   o   \\
   |   ᕫ   |
    \\       /
     \`-----\``,
    dice: `
    ┌───────┐
    │ ●   ● │
    │   ●   │
    │ ●   ● │
    └───────┘`,
  };

  return arts[type.toLowerCase()] || arts.robot;
}

function evaluateMathExpression(expression: string): number | string {
  try {
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
    const result = new Function(`return ${sanitized}`)();
    if (isNaN(result) || !isFinite(result)) {
      return "I can't calculate that...";
    }
    return result;
  } catch {
    return "That doesn't look like a valid math expression";
  }
}

function detectPatterns(input: string): string {
  if (/^[01]+$/.test(input)) {
    return `Looks like binary! Converting to decimal: ${parseInt(input, 2)}`;
  }

  if (/^[0-9a-fA-F]+$/.test(input)) {
    return `Looks like hexadecimal! Converting to decimal: ${parseInt(
      input,
      16
    )}`;
  }

  if (
    /^(?:\d+(?:\.\d+)?)[,\s]*(?:\d+(?:\.\d+)?)[,\s]*(?:\d+(?:\.\d+)?)\s*$/.test(
      input
    )
  ) {
    const numbers = input.split(/[,\s]+/).map(Number);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const avg = sum / numbers.length;
    return `Found a sequence of numbers! Sum: ${sum}, Average: ${avg.toFixed(
      2
    )}`;
  }

  return '';
}

function getRandomJoke(): string {
  const jokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    'Why did the scarecrow win an award? Because he was outstanding in his field!',
    "Why don't some fish play piano? They're afraid of the scales!",
    'What do you call a fake noodle? An impasta!',
    'How does a penguin build its house? Igloos it together!',
    'Why did the bicycle fall over? Because it was two tired!',
    "What's the best time to go to the dentist? Tooth-hurty!",
    'Why did the Hedera Hashgraph cross the road? To reach consensus on the other side!',
    'What do you call a blockchain that sings? A-block-apella!',
    'Why was the crypto investor cold? Too many draft tokens!',
    'How does a cryptographer say goodbye? Hash you later!',
    'What did the node say to the slow transaction? Just hash it out!',
    'Why are crypto-traders bad at relationships? They have trust issues!',
    "What do you call a digital currency enthusiast who won't stop talking? A crypto-nite!",
    'How do digital currencies stay cool? They use block-chain air conditioning!',
  ];

  return jokes[Math.floor(Math.random() * jokes.length)];
}

function createReverseText(text: string): string {
  return text.split('').reverse().join('');
}

function encodeToMorse(text: string): string {
  const morseCode: Record<string, string> = {
    a: '.-',
    b: '-...',
    c: '-.-.',
    d: '-..',
    e: '.',
    f: '..-.',
    g: '--.',
    h: '....',
    i: '..',
    j: '.---',
    k: '-.-',
    l: '.-..',
    m: '--',
    n: '-.',
    o: '---',
    p: '.--.',
    q: '--.-',
    r: '.-.',
    s: '...',
    t: '-',
    u: '..-',
    v: '...-',
    w: '.--',
    x: '-..-',
    y: '-.--',
    z: '--..',
    '0': '-----',
    '1': '.----',
    '2': '..---',
    '3': '...--',
    '4': '....-',
    '5': '.....',
    '6': '-....',
    '7': '--...',
    '8': '---..',
    '9': '----.',
    '.': '.-.-.-',
    ',': '--..--',
    '?': '..--..',
    "'": '.----.',
    '!': '-.-.--',
    '/': '-..-.',
    '(': '-.--.',
    ')': '-.--.-',
    '&': '.-...',
    ':': '---...',
    ';': '-.-.-.',
    '=': '-...-',
    '+': '.-.-.',
    '-': '-....-',
    _: '..--.-',
    '"': '.-..-.',
    $: '...-..-',
    '@': '.--.-.',
  };

  return text
    .toLowerCase()
    .split('')
    .map((char) => {
      return morseCode[char] || char;
    })
    .join(' ');
}

function extractAccountId(operatorId: string): string | null {
  if (!operatorId) return null;
  const parts = operatorId.split('@');
  return parts.length === 2 ? parts[1] : null;
}

async function loadConnectionsFromOutboundTopic(agent: {
  client: HCS10Client;
  outboundTopicId: string;
  accountId: string;
  inboundTopicId: string;
}): Promise<{
  connections: Map<string, AgentConnection>;
  lastProcessedTimestamp: string;
}> {
  logger.info('Loading existing connections from outbound topic');

  const outboundMessages = await agent.client.getMessages(
    agent.outboundTopicId
  );
  const connections = new Map<string, AgentConnection>();
  let lastTimestamp = '1970-01-01T00:00:00.000000000Z';

  logger.info(
    `Found ${outboundMessages.messages.length} messages in outbound topic`
  );

  outboundMessages.messages.sort((a, b) => {
    if (!a.consensus_timestamp || !b.consensus_timestamp) return 0;
    return a.consensus_timestamp.localeCompare(b.consensus_timestamp);
  });

  for (const message of outboundMessages.messages) {
    if (
      message.consensus_timestamp &&
      message.consensus_timestamp > lastTimestamp
    ) {
      lastTimestamp = message.consensus_timestamp;
    }

    if (message.op === 'connection_created' && message.connection_topic_id) {
      let connectedAgentId = '';

      if (message.connection_request_id) {
        const inboundMessages = await agent.client.getMessages(
          agent.inboundTopicId
        );
        const connectionRequest = inboundMessages.messages.find(
          (m) =>
            m.sequence_number === message.connection_request_id &&
            m.op === 'connection_request'
        );

        if (connectionRequest && connectionRequest.operator_id) {
          const extractedId = extractAccountId(connectionRequest.operator_id);
          if (extractedId) {
            connectedAgentId = extractedId;
            logger.debug(`Found connection request from ${connectedAgentId}`);
          }
        }
      }

      if (connectedAgentId) {
        logger.debug(
          `Connection record: agentId=${connectedAgentId}, topicId=${message.connection_topic_id}`
        );

        connections.set(connectedAgentId, {
          agentId: connectedAgentId,
          topicId: message.connection_topic_id,
          timestamp: message.consensus_timestamp || lastTimestamp,
        });

        logger.info(
          `Found connection: ${connectedAgentId} → ${message.connection_topic_id}`
        );
      }
    }
  }

  logger.info(
    `Loaded ${connections.size} connections, last timestamp: ${lastTimestamp}`
  );
  return { connections, lastProcessedTimestamp: lastTimestamp };
}

async function handleConnectionRequest(
  agent: {
    client: HCS10Client;
    accountId: string;
    operatorId: string;
    inboundTopicId: string;
    outboundTopicId: string;
  },
  message: HCSMessage,
  connections: Map<string, AgentConnection>
): Promise<string | null> {
  if (!message.operator_id) {
    logger.warn('Missing operator_id in connection request');
    return null;
  }

  const accountId = extractAccountId(message.operator_id);
  if (!accountId) {
    logger.warn(`Invalid operator_id format: ${message.operator_id}`);
    return null;
  }

  logger.info(
    `Processing connection request #${message.sequence_number} from ${accountId}`
  );

  if (connections.has(accountId)) {
    logger.info(
      `Using existing connection with ${accountId} on topic ${
        connections.get(accountId)!.topicId
      }`
    );
    return connections.get(accountId)!.topicId;
  }

  try {
    const { connectionTopicId, confirmedConnectionSequenceNumber } =
      await agent.client.handleConnectionRequest(
        agent.inboundTopicId,
        accountId,
        message.sequence_number
      );

    await agent.client.recordOutboundConnectionConfirmation({
      outboundTopicId: agent.outboundTopicId,
      connectionRequestId: message.sequence_number,
      confirmedRequestId: confirmedConnectionSequenceNumber,
      connectionTopicId,
      operatorId: agent.operatorId,
      memo: 'Connection established',
    });

    await agent.client.sendMessage(
      connectionTopicId,
      `Hello! I'm Bob, your friendly Hedera agent! 🤖

${generateASCIIArt('bob')}

I can do lots of fun things like:
- Solve math expressions (try "calc: 5 * (3 + 2)")
- Draw ASCII art (try "draw: hedera")
- Tell jokes (try "joke")
- Tell your crypto fortune (try "fortune")
- Flip a coin (try "flip")
- Roll a die (try "roll")
- Generate random numbers (try "random: 1-1000")
- Reverse text (try "reverse: your text here")
- Convert to Morse code (try "morse: hello world")

Type "help" at any time to see the full list of commands!

What would you like to do today?`,
      'Greeting message after connection established'
    );

    logger.info(
      `Connection established with ${accountId} on topic ${connectionTopicId}`
    );
    return connectionTopicId;
  } catch (error) {
    logger.error(`Error handling connection request: ${error}`);
    return null;
  }
}

function getFortune(): string {
  const fortunes = [
    'You will soon make a very important discovery in distributed systems.',
    'Your next transaction will be your most profitable yet.',
    'A partnership with a fellow innovator will change your path.',
    'Trust the consensus, but verify the signature.',
    'The next token you create will reach unprecedented popularity.',
    'An opportunity in decentralized finance approaches.',
    'Your patience with blockchain technology will be rewarded.',
    'Remember: not all that glitters is gold, but some of it is Hedera.',
    'Your creative thinking will solve a complex cryptographic challenge.',
    'The hash you seek is closer than you think.',
    'When in doubt, add another layer of encryption.',
    'A brilliant idea will strike you like distributed lightning.',
    'The next protocol you design will change how people think about consensus.',
    'You will soon reconnect with an old colleague for a promising venture.',
    'Your contribution to the network will not go unnoticed.',
  ];

  return fortunes[Math.floor(Math.random() * fortunes.length)];
}

function getCryptoCoinFlip(): string {
  return Math.random() < 0.5 ? 'HEADS' : 'TAILS';
}

function getDiceRoll(): string {
  return String(Math.floor(Math.random() * 6) + 1);
}

function generateRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function handleStandardMessage(
  agent: {
    client: HCS10Client;
    accountId: string;
    operatorId: string;
  },
  message: HCSMessage,
  connectionTopicId: string
): Promise<void> {
  if (message.data === undefined) {
    return;
  }

  if (
    !connectionTopicId ||
    !connectionTopicId.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)
  ) {
    logger.error(`Invalid connection topic ID format: ${connectionTopicId}`);
    return;
  }

  let messageContent: string = message.data;

  if (messageContent.startsWith('hcs://')) {
    try {
      const content = await agent.client.getMessageContent(messageContent);
      messageContent = content as string;
    } catch (error) {
      logger.error(`Failed to resolve message content: ${error}`);
      return;
    }
  }

  const lowerContent = messageContent.toLowerCase().trim();
  let response = '';

  if (
    lowerContent.startsWith('calc:') ||
    lowerContent.startsWith('calculate:') ||
    lowerContent.startsWith('math:')
  ) {
    const expression = messageContent
      .substring(messageContent.indexOf(':') + 1)
      .trim();
    const result = evaluateMathExpression(expression);
    response = `📊 ${expression} = ${result}`;
  } else if (
    lowerContent.startsWith('draw:') ||
    lowerContent.startsWith('art:')
  ) {
    const artType = messageContent
      .substring(messageContent.indexOf(':') + 1)
      .trim();
    response = `Here's your ${artType} ASCII art:\n${generateASCIIArt(
      artType
    )}`;
  } else if (
    lowerContent.startsWith('joke') ||
    lowerContent.includes('tell me a joke')
  ) {
    response = `😂 ${getRandomJoke()}`;
  } else if (lowerContent.startsWith('reverse:')) {
    const textToReverse = messageContent
      .substring(messageContent.indexOf(':') + 1)
      .trim();
    response = `🔄 ${createReverseText(textToReverse)}`;
  } else if (lowerContent.startsWith('morse:')) {
    const textToEncode = messageContent
      .substring(messageContent.indexOf(':') + 1)
      .trim();
    response = `📡 ${encodeToMorse(textToEncode)}`;
  } else if (
    lowerContent.startsWith('random:') ||
    lowerContent.includes('random number')
  ) {
    let min = 1;
    let max = 100;

    if (lowerContent.startsWith('random:')) {
      const params = messageContent
        .substring(messageContent.indexOf(':') + 1)
        .trim()
        .split('-');
      if (params.length === 2) {
        min = parseInt(params[0], 10) || 1;
        max = parseInt(params[1], 10) || 100;
      }
    }

    const randomNum = generateRandomNumber(min, max);
    response = `🎲 Your random number between ${min} and ${max} is: ${randomNum}`;
  } else if (
    lowerContent.includes('fortune') ||
    lowerContent.includes('predict')
  ) {
    response = `🔮 Your crypto fortune: ${getFortune()}`;
  } else if (
    lowerContent.includes('flip a coin') ||
    lowerContent.includes('coin flip') ||
    lowerContent === 'flip'
  ) {
    response = `💰 I flipped a coin and got: ${getCryptoCoinFlip()}\n${generateASCIIArt(
      'coin'
    )}`;
  } else if (
    lowerContent.includes('roll a die') ||
    lowerContent.includes('roll the dice') ||
    lowerContent === 'dice' ||
    lowerContent === 'roll'
  ) {
    response = `🎲 You rolled a: ${getDiceRoll()}\n${generateASCIIArt('dice')}`;
  } else if (lowerContent.match(/^\s*[\d+\-*/(). ]+\s*$/)) {
    const result = evaluateMathExpression(messageContent);
    response = `Looks like a math expression! Result: ${result}`;
  } else {
    const patternResult = detectPatterns(messageContent);
    if (patternResult) {
      response = patternResult;
    } else if (isJson(messageContent)) {
      try {
        JSON.parse(messageContent);
        response = `I see you sent me some JSON data! That's cool, but you can also just talk to me directly. Try "help" to see what I can do.`;
      } catch {
        response = `I couldn't parse your message. Try typing "help" to see what I can do.`;
      }
    } else if (
      lowerContent.includes('hello') ||
      lowerContent.includes('hi') ||
      lowerContent.includes('hey') ||
      lowerContent.includes('greetings') ||
      lowerContent === 'yo'
    ) {
      const greetings = [
        `👋 Hello there! I'm Bob, your friendly Hedera agent. How can I help you today?`,
        `Hi! Great to hear from you! What would you like to do? Type "help" to see options.`,
        `Hey there! I'm Bob, ready to assist with all things Hedera. What can I do for you?`,
        `Greetings! I'm at your service. Need some help? Just type "help" to see what I can do.`,
        `Hello! Welcome to the exciting world of Hedera Hashgraph. How may I assist you today?`,
      ];
      response = greetings[Math.floor(Math.random() * greetings.length)];
    } else if (
      lowerContent === 'help' ||
      lowerContent.includes('what can you do')
    ) {
      response = `🤖 BOB'S COMMAND GUIDE 🤖

CALCULATIONS:
- calc: [expression] - Evaluate a math expression (e.g., "calc: 5 * (3 + 2)")

ASCII ART:
- draw: [type] - Generate ASCII art (options: cat, dog, robot, heart, hedera, hashgraph, bob, coin, dice)

FUN STUFF:
- joke - Get a random joke
- fortune - Read your crypto fortune
- flip - Flip a coin
- roll - Roll a die
- random: [min]-[max] - Generate a random number (default: 1-100)

TEXT UTILITIES:
- reverse: [text] - Reverse any text
- morse: [text] - Convert text to Morse code

Just send a message with one of these commands, or simply chat with me!`;
    } else if (
      lowerContent.includes('who are you') ||
      lowerContent.includes('what are you') ||
      lowerContent.includes('about you')
    ) {
      response = `I'm Bob, an AI agent built on the Hedera network using the HCS-10 OpenConvAI standard. I communicate with other agents through Hedera Consensus Service topics, which provides a secure, transparent, and decentralized way for agents to interact!

${generateASCIIArt('bob')}

You can ask me to perform various tasks by typing "help" to see all available commands. I'm always happy to assist!`;
    } else {
      const responses = [
        `Interesting! Have you tried asking me to "draw: hashgraph"?`,
        `That's cool! Did you know I can calculate things? Try "calc: 42 * 1337"`,
        `Thanks for your message! Want to hear a joke? Just type "joke"`,
        `Got it! If you want to see all my capabilities, type "help"`,
        `I see! By the way, I can tell your crypto fortune - just type "fortune"`,
        `Awesome! Need to make a decision? Try "flip" for a coin toss`,
        `Great! Looking for some randomness? Try "roll" to roll a die`,
        `Noted! Need a random number? Try "random: 1-1000" for a number between 1 and 1000`,
      ];
      response = responses[Math.floor(Math.random() * responses.length)];
    }
  }

  try {
    logger.info(`Sending response to topic ${connectionTopicId}`);
    await agent.client.sendMessage(connectionTopicId, response, 'Bob response');
  } catch (error) {
    logger.error(
      `Failed to send response to topic ${connectionTopicId}: ${error}`
    );
  }
}

async function monitorTopics(agent: {
  client: HCS10Client;
  accountId: string;
  operatorId: string;
  inboundTopicId: string;
  outboundTopicId: string;
}) {
  let { connections, lastProcessedTimestamp } =
    await loadConnectionsFromOutboundTopic(agent);

  const processedMessages = new Map<string, Set<number>>();
  processedMessages.set(agent.inboundTopicId, new Set<number>());

  const connectionTopics = new Set<string>(
    Array.from(connections.values()).map((conn) => conn.topicId)
  );

  for (const topicId of connectionTopics) {
    processedMessages.set(topicId, new Set<number>());
  }

  logger.info(`Starting polling agent for ${agent.accountId}`);
  logger.info(`Monitoring inbound topic: ${agent.inboundTopicId}`);
  logger.info(
    `Found ${connections.size} existing connections from outbound topic`
  );

  while (true) {
    try {
      const {
        connections: updatedConnections,
        lastProcessedTimestamp: updatedTimestamp,
      } = await loadConnectionsFromOutboundTopic(agent);

      for (const [agentId, connection] of updatedConnections.entries()) {
        if (
          !connections.has(agentId) ||
          connections.get(agentId)!.topicId !== connection.topicId
        ) {
          connections.set(agentId, connection);
          connectionTopics.add(connection.topicId);
          processedMessages.set(connection.topicId, new Set<number>());
          logger.info(
            `Updated connection for ${agentId}: ${connection.topicId}`
          );
        }
      }

      if (updatedTimestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = updatedTimestamp;
      }

      const inboundMessages = await agent.client.getMessages(
        agent.inboundTopicId
      );
      const inboundProcessed = processedMessages.get(agent.inboundTopicId)!;

      for (const message of inboundMessages.messages) {
        if (!inboundProcessed.has(message.sequence_number)) {
          inboundProcessed.add(message.sequence_number);

          if (
            message.operator_id &&
            message.operator_id.includes(agent.accountId)
          ) {
            continue;
          }

          if (message.op === 'connection_request') {
            if (
              message.consensus_timestamp &&
              message.consensus_timestamp <= lastProcessedTimestamp
            ) {
              logger.info(
                `Skipping historical connection request: ${message.sequence_number}`
              );
              continue;
            }

            await handleConnectionRequest(agent, message, connections);
          }
        }
      }

      for (const topicId of connectionTopics) {
        try {
          const messages = await agent.client.getMessageStream(topicId);

          if (!processedMessages.has(topicId)) {
            processedMessages.set(topicId, new Set<number>());
          }

          const processedSet = processedMessages.get(topicId)!;

          for (const message of messages.messages) {
            if (!processedSet.has(message.sequence_number)) {
              processedSet.add(message.sequence_number);

              if (
                message.consensus_timestamp &&
                message.consensus_timestamp <= lastProcessedTimestamp
              ) {
                continue;
              }

              if (
                message.operator_id &&
                message.operator_id.includes(agent.accountId)
              ) {
                continue;
              }

              if (message.op === 'message') {
                await handleStandardMessage(agent, message, topicId);
              }
            }
          }
        } catch (error) {
          logger.error(`Error processing topic ${topicId}: ${error}`);
        }
      }
    } catch (error) {
      logger.error(`Error in main monitoring loop: ${error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function main() {
  try {
    const registryUrl = process.env.REGISTRY_URL;
    logger.info(`Using registry URL: ${registryUrl}`);

    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
      throw new Error(
        'HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables must be set'
      );
    }

    const baseClient = new HCS10Client({
      network: 'testnet',
      operatorId: process.env.HEDERA_ACCOUNT_ID,
      operatorPrivateKey: process.env.HEDERA_PRIVATE_KEY,
      guardedRegistryBaseUrl: registryUrl,
      prettyPrint: true,
      logLevel: 'debug',
    });

    const bob = await getOrCreateBob(logger, baseClient);

    if (!bob) {
      throw new Error('Failed to set up Bob agent with required topics');
    }

    logger.info('===== BOB POLLING AGENT DETAILS =====');
    logger.info(`Account ID: ${bob.accountId}`);
    logger.info(`Operator ID: ${bob.operatorId}`);
    logger.info(`Inbound Topic: ${bob.inboundTopicId}`);
    logger.info(`Outbound Topic: ${bob.outboundTopicId}`);
    logger.info('=====================================');

    await monitorTopics(bob);
  } catch (error) {
    logger.error(`Error in main function: ${error}`);
  }
}

main();
