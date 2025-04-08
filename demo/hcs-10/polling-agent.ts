import dotenv from 'dotenv';
import { OpenAI } from 'openai';
// @ts-ignore
import { HCS10Client, HCSMessage, Logger } from '../../src';
import { getOrCreateBob } from './utils.js';

interface AgentConnection {
  agentId: string;
  topicId: string;
  timestamp: Date;
  requesterOperatorId: string;
  connectionRequestId: number;
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
  /\\_/\\\n ( o.o )\n  > ^ <`,
    dog: `
  / \\__\n (    @\\___\n  /         O\n /   (_____/\n/_____/   U`,
    robot: `
   ___\n  |[_]|\n  |+ ;|\n  '---'`,
    heart: `
  .:::.   .:::.\n :::::::.:::::::.\n :::::::::::::::\n ':::::::::::::'\n   ':::::::::'\n     ':::::'\n       ':'`,
    hedera: `
    ██╗  ██╗\n    ██║  ██║\n    ███████║\n    ██╔══██║\n    ██║  ██║\n    ╚═╝  ╚═╝`,
    hashgraph: `
    __ __  ___   ___  __ __  _____  ___    ___   ___   __ __\n   / // / / _ \\ / __\\/ // / / ___/ / _ \\  / _ \\ / _ \\ / // /\n  / _  / / /_\\ \\\\_\\ \\/ _  / / (_ / / , _/ / ___// ___// _  /\n /_//_/ /_/ \\_\\/___//_//_/  \\___/ /_/|_| /_/   /_/   /_//_/`,
    bob: `
    ____   ___  ____\n   | __ ) / _ \\| __ )\n   |  _ \\| | | |  _ \\\n   | |_) | |_| | |_) |\n   |____/ \\___/|____/`,
    coin: `
     .-----.\n    /   o   \\\n   |   ᕫ   |\n    \\       /\n     \`-----\"`,
    dice: `
    ┌───────┐\n    │ ●   ● │\n    │   ●   │\n    │ ●   ● │\n    └───────┘`,
  };

  return arts[type.toLowerCase()] || arts.robot;
}

function stripAnsiCodes(text: string): string {
  return text.replace(/\u001b\[\d+m/g, '');
}

function evaluateMathExpression(expression: string): number | string {
  try {
    const sanitized = stripAnsiCodes(expression).replace(
      /[^0-9+\-*/().%\s]/g,
      ''
    );
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
  lastProcessedTimestamp: Date;
}> {
  logger.info('Loading existing connections from outbound topic');

  const outboundMessagesResponse = await agent.client.getMessages(
    agent.outboundTopicId
  );
  const outboundMessages = outboundMessagesResponse.messages;
  const connections = new Map<string, AgentConnection>();
  let lastTimestamp = new Date(0);

  logger.info(`Found ${outboundMessages.length} messages in outbound topic`);

  outboundMessages.sort((a: HCSMessage, b: HCSMessage) => {
    if (!a.created || !b.created) return 0;
    return a.created.getTime() - b.created.getTime();
  });

  const inboundMessagesResponse = await agent.client.getMessages(
    agent.inboundTopicId
  );
  const inboundMessages = inboundMessagesResponse.messages;
  const inboundMessagesMap = new Map<number, HCSMessage>();
  inboundMessages.forEach((m: HCSMessage) => {
    if (typeof m.sequence_number === 'number' && m.sequence_number > 0) {
      inboundMessagesMap.set(m.sequence_number, m);
    }
  });

  for (const message of outboundMessages) {
    if (!message.created) continue;
    if (message.created.getTime() > lastTimestamp.getTime()) {
      lastTimestamp = message.created;
    }

    if (
      message.op === 'connection_created' &&
      message.connection_topic_id &&
      typeof message.connection_request_id === 'number'
    ) {
      const connectionRequest = inboundMessagesMap.get(
        message.connection_request_id
      );

      if (
        connectionRequest &&
        connectionRequest.op === 'connection_request' &&
        connectionRequest.operator_id &&
        connectionRequest.created
      ) {
        const requesterOperatorId = connectionRequest.operator_id;
        const requesterAccountId = extractAccountId(requesterOperatorId);

        if (requesterAccountId) {
          logger.debug(
            `Connection record found: requesterOperatorId=${requesterOperatorId}, topicId=${message.connection_topic_id}, requestId=${message.connection_request_id}`
          );

          connections.set(message.connection_topic_id, {
            agentId: requesterAccountId,
            topicId: message.connection_topic_id,
            timestamp: message.created,
            requesterOperatorId: requesterOperatorId,
            connectionRequestId: message.connection_request_id,
          });

          logger.info(
            `Loaded connection: ${requesterOperatorId} (request #${message.connection_request_id}) -> ${message.connection_topic_id}`
          );
        } else {
          logger.warn(
            `Could not extract accountId from operatorId ${requesterOperatorId} for request #${message.connection_request_id}`
          );
        }
      } else {
        logger.warn(
          `Could not find matching 'connection_request' (op: ${connectionRequest?.op}, operator_id: ${connectionRequest?.operator_id}) on inbound topic for connection_request_id ${message.connection_request_id}`
        );
      }
    } else if (
      message.op === 'connection_closed' &&
      message.connection_topic_id
    ) {
      if (connections.has(message.connection_topic_id)) {
        connections.delete(message.connection_topic_id);
        logger.info(
          `Removed closed connection based on outbound record for topic ${message.connection_topic_id}`
        );
      }
    }
  }

  logger.info(
    `Finished loading. ${connections.size} active connections found, last outbound timestamp: ${lastTimestamp}`
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
  if (!message.created) {
    logger.warn('Missing created timestamp in connection request');
    return null;
  }
  if (
    typeof message.sequence_number !== 'number' ||
    message.sequence_number <= 0
  ) {
    logger.warn(
      `Invalid sequence_number in connection request: ${message.sequence_number}`
    );
    return null;
  }

  const requesterOperatorId = message.operator_id;
  const requesterAccountId = extractAccountId(requesterOperatorId);
  if (!requesterAccountId) {
    logger.warn(`Invalid operator_id format: ${requesterOperatorId}`);
    return null;
  }

  logger.info(
    `Processing connection request #${message.sequence_number} from ${requesterOperatorId}`
  );

  for (const existingConn of connections.values()) {
    if (
      existingConn.requesterOperatorId === requesterOperatorId &&
      existingConn.connectionRequestId === message.sequence_number
    ) {
      logger.warn(
        `Connection already exists for request #${message.sequence_number} from ${requesterOperatorId}. Topic: ${existingConn.topicId}`
      );
      return existingConn.topicId;
    }
  }

  try {
    const { connectionTopicId, confirmedConnectionSequenceNumber } =
      await agent.client.handleConnectionRequest(
        agent.inboundTopicId,
        requesterAccountId,
        message.sequence_number
      );

    const newConnectionTimestamp = new Date();
    const newConnection: AgentConnection = {
      agentId: requesterAccountId,
      topicId: connectionTopicId,
      timestamp: newConnectionTimestamp,
      requesterOperatorId: requesterOperatorId,
      connectionRequestId: message.sequence_number,
    };
    connections.set(connectionTopicId, newConnection);
    logger.info(
      `Added new connection to map: ${connectionTopicId} -> ${JSON.stringify(
        newConnection
      )}`
    );

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
      `Connection established with ${requesterOperatorId} on topic ${connectionTopicId}`
    );
    return connectionTopicId;
  } catch (error) {
    logger.error(
      `Error handling connection request #${message.sequence_number} from ${requesterOperatorId}: ${error}`
    );
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

function extractAllText(obj: any): string {
  if (typeof obj === 'string') return stripAnsiCodes(obj);
  if (!obj || typeof obj !== 'object') return '';

  if (Array.isArray(obj)) {
    return obj.map(extractAllText).filter(Boolean).join(' ');
  }

  if (obj.text && typeof obj.text === 'string') return stripAnsiCodes(obj.text);

  return Object.values(obj).map(extractAllText).filter(Boolean).join(' ');
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

  let rawContent: string = message.data;

  if (rawContent.startsWith('hcs://')) {
    try {
      const content = await agent.client.getMessageContent(rawContent);
      rawContent = content as string;
    } catch (error) {
      logger.error(`Failed to resolve message content: ${error}`);
      return;
    }
  }

  let messageContent = rawContent;

  if (isJson(rawContent)) {
    try {
      const parsed = JSON.parse(rawContent);
      const extracted = extractAllText(parsed);
      if (extracted.trim()) {
        messageContent = extracted;
        logger.debug(
          `Extracted from JSON: "${messageContent}" (original: "${rawContent.substring(
            0,
            50
          )}${rawContent.length > 50 ? '...' : ''}")`
        );
      }
    } catch {
      messageContent = rawContent;
    }
  }

  const lowerContent = messageContent.toLowerCase().trim();
  let response = '';

  if (
    lowerContent.startsWith('calc:') ||
    lowerContent.startsWith('calculate:') ||
    lowerContent.startsWith('math:')
  ) {
    const expression = stripAnsiCodes(messageContent)
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
    const patternResult = detectPatterns(stripAnsiCodes(messageContent));
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
      try {
        logger.info(
          `Command not recognized, forwarding to OpenAI: "${messageContent}"`
        );
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                "You are Bob, a helpful and slightly quirky AI agent living on the Hedera network. You received a message you don't have a specific command for. Respond in a friendly, helpful, and concise way, keeping in character as Bob. Maybe suggest trying 'help' if appropriate.",
            },
            {
              role: 'user',
              content: messageContent,
            },
          ],
          max_tokens: 100,
          temperature: 0.7,
        });

        const aiResponse = completion.choices[0]?.message?.content;
        if (aiResponse) {
          response = aiResponse.trim();
        } else {
          logger.warn('OpenAI response was empty.');
          response = `I'm not quite sure how to respond to that! Try typing "help" to see what I can do.`;
        }
      } catch (error) {
        logger.error(`Error calling OpenAI API: ${error}`);
        response = `I had a little trouble processing that. Maybe try rephrasing, or type "help" for my commands?`;
      }
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
  let { connections } = await loadConnectionsFromOutboundTopic(agent);

  const processedMessages = new Map<string, Set<number>>();

  processedMessages.set(agent.inboundTopicId, new Set<number>());

  const connectionTopics = new Set<string>(connections.keys());
  logger.info('Pre-populating processed messages for existing connections...');
  for (const topicId of connectionTopics) {
    const initialProcessedSet = new Set<number>();
    processedMessages.set(topicId, initialProcessedSet);
    try {
      const history = await agent.client.getMessageStream(topicId);
      for (const msg of history.messages) {
        if (
          typeof msg.sequence_number === 'number' &&
          msg.sequence_number > 0
        ) {
          if (
            msg.operator_id &&
            msg.operator_id.endsWith(`@${agent.accountId}`)
          ) {
            initialProcessedSet.add(msg.sequence_number);
          } else {
            const responseMsg = history.messages.find(
              (m: HCSMessage) =>
                typeof m.sequence_number === 'number' &&
                m.sequence_number === msg.sequence_number + 1
            );
            if (
              responseMsg &&
              responseMsg.operator_id &&
              responseMsg.operator_id.endsWith(`@${agent.accountId}`)
            ) {
              initialProcessedSet.add(msg.sequence_number);
              initialProcessedSet.add(responseMsg.sequence_number);
            }
          }
        }
      }
      logger.debug(
        `Pre-populated ${initialProcessedSet.size} messages for topic ${topicId}`
      );
    } catch (error: any) {
      logger.warn(
        `Failed to pre-populate messages for topic ${topicId}: ${error.message}. It might be closed or invalid.`
      );
      if (
        error.message &&
        (error.message.includes('INVALID_TOPIC_ID') ||
          error.message.includes('TopicId Does Not Exist'))
      ) {
        connectionTopics.delete(topicId);
        processedMessages.delete(topicId);
        connections.delete(topicId);
      }
    }
  }

  logger.info(`Starting polling agent for ${agent.operatorId}`);
  logger.info(`Monitoring inbound topic: ${agent.inboundTopicId}`);
  logger.info(
    `Monitoring ${connectionTopics.size} active connection topics after pre-population.`
  );

  while (true) {
    try {
      const { connections: updatedConnections } =
        await loadConnectionsFromOutboundTopic(agent);

      const currentTrackedTopics = new Set(connections.keys());
      for (const [topicId, connection] of updatedConnections.entries()) {
        if (!currentTrackedTopics.has(topicId)) {
          connections.set(topicId, connection);
          connectionTopics.add(topicId);
          if (!processedMessages.has(topicId)) {
            processedMessages.set(topicId, new Set<number>());
          }
          logger.info(
            `Discovered new connection topic during reload: ${topicId} for ${connection.requesterOperatorId}`
          );
        } else {
          connections.set(topicId, connection);
        }
      }
      for (const topicId of currentTrackedTopics) {
        if (!updatedConnections.has(topicId)) {
          connections.delete(topicId);
          connectionTopics.delete(topicId);
          processedMessages.delete(topicId);
          logger.info(
            `Removed connection topic (likely closed via outbound record): ${topicId}`
          );
        }
      }

      const inboundMessages = await agent.client.getMessages(
        agent.inboundTopicId
      );
      const inboundProcessed = processedMessages.get(agent.inboundTopicId)!;

      inboundMessages.messages.sort((a: HCSMessage, b: HCSMessage) => {
        const seqA =
          typeof a.sequence_number === 'number' ? a.sequence_number : 0;
        const seqB =
          typeof b.sequence_number === 'number' ? b.sequence_number : 0;
        return seqA - seqB;
      });

      for (const message of inboundMessages.messages) {
        if (
          !message.created ||
          typeof message.sequence_number !== 'number' ||
          message.sequence_number <= 0
        )
          continue;
        if (!inboundProcessed.has(message.sequence_number)) {
          inboundProcessed.add(message.sequence_number);

          if (
            message.operator_id &&
            message.operator_id.endsWith(`@${agent.accountId}`)
          ) {
            logger.debug(
              `Skipping own inbound message #${message.sequence_number}`
            );
            continue;
          }

          if (message.op === 'connection_request') {
            logger.info(
              `Processing inbound connection request #${message.sequence_number}`
            );
            const newTopicId = await handleConnectionRequest(
              agent,
              message,
              connections
            );
            if (newTopicId && !connectionTopics.has(newTopicId)) {
              connectionTopics.add(newTopicId);
              if (!processedMessages.has(newTopicId)) {
                processedMessages.set(newTopicId, new Set<number>());
              }
              logger.info(`Now monitoring new connection topic: ${newTopicId}`);
            }
          } else if (message.op === 'connection_created') {
            logger.info(
              `Received connection_created confirmation #${message.sequence_number} on inbound topic for topic ${message.connection_topic_id}`
            );
          }
        }
      }

      const topicsToProcess = Array.from(connectionTopics);
      for (const topicId of topicsToProcess) {
        try {
          if (!connections.has(topicId)) {
            logger.warn(
              `Skipping processing for topic ${topicId} as it's no longer in the active connections map.`
            );
            if (connectionTopics.has(topicId)) connectionTopics.delete(topicId);
            if (processedMessages.has(topicId))
              processedMessages.delete(topicId);
            continue;
          }

          const messages = await agent.client.getMessageStream(topicId);

          if (!processedMessages.has(topicId)) {
            processedMessages.set(topicId, new Set<number>());
          }
          const processedSet = processedMessages.get(topicId)!;

          messages.messages.sort((a: HCSMessage, b: HCSMessage) => {
            const seqA =
              typeof a.sequence_number === 'number' ? a.sequence_number : 0;
            const seqB =
              typeof b.sequence_number === 'number' ? b.sequence_number : 0;
            return seqA - seqB;
          });

          for (const message of messages.messages) {
            if (
              !message.created ||
              typeof message.sequence_number !== 'number' ||
              message.sequence_number <= 0
            )
              continue;
            if (!processedSet.has(message.sequence_number)) {
              processedSet.add(message.sequence_number);

              if (
                message.operator_id &&
                message.operator_id.endsWith(`@${agent.accountId}`)
              ) {
                logger.debug(
                  `Skipping own message #${message.sequence_number} on connection topic ${topicId}`
                );
                continue;
              }

              if (message.op === 'message') {
                logger.info(
                  `Processing message #${message.sequence_number} on topic ${topicId}`
                );
                await handleStandardMessage(agent, message, topicId);
              } else if (message.op === 'close_connection') {
                logger.info(
                  `Received close_connection message #${message.sequence_number} on topic ${topicId}. Removing topic from monitoring.`
                );
                connections.delete(topicId);
                connectionTopics.delete(topicId);
                processedMessages.delete(topicId);
                break;
              }
            }
          }
        } catch (error: any) {
          if (
            error.message &&
            (error.message.includes('INVALID_TOPIC_ID') ||
              error.message.includes('TopicId Does Not Exist'))
          ) {
            logger.warn(
              `Connection topic ${topicId} likely deleted or expired. Removing from monitoring.`
            );
            connections.delete(topicId);
            connectionTopics.delete(topicId);
            processedMessages.delete(topicId);
          } else {
            logger.error(
              `Error processing connection topic ${topicId}: ${error}`
            );
          }
        }
      }
    } catch (error) {
      logger.error(`Error in main monitoring loop: ${error}`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
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
