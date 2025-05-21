import dotenv from 'dotenv';
import { OpenAI } from 'openai';
// @ts-ignore
import { HCS10Client, HCSMessage, Logger, ConnectionsManager } from '../../src';
import {
  extractAllText,
  getOrCreateBob,
  monitorTopics,
  stripAnsiCodes,
} from './utils.js';
import { Hbar, TransferTransaction } from '@hashgraph/sdk';

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

async function handleConnectionRequest(
  agent: {
    client: HCS10Client;
    accountId: string;
    operatorId: string;
    inboundTopicId: string;
    outboundTopicId: string;
  },
  message: HCSMessage,
  connectionManager: ConnectionsManager
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

  // Look for any existing connection for this sequence number
  let existingConnection;
  for (const conn of connectionManager.getAllConnections()) {
    if (conn.inboundRequestId === message.sequence_number) {
      existingConnection = conn;
      break;
    }
  }

  if (existingConnection) {
    // Make sure we have a valid topic ID, not a reference key
    if (
      existingConnection.connectionTopicId.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)
    ) {
      logger.warn(
        `Connection already exists for request #${message.sequence_number} from ${requesterOperatorId}. Topic: ${existingConnection.connectionTopicId}`
      );
      return existingConnection.connectionTopicId;
    } else {
      logger.warn(
        `Connection exists for request #${message.sequence_number} but has invalid topic ID format: ${existingConnection.connectionTopicId}`
      );
    }
  }

  try {
    const { connectionTopicId, confirmedConnectionSequenceNumber } =
      await agent.client.handleConnectionRequest(
        agent.inboundTopicId,
        requesterAccountId,
        message.sequence_number
      );

    await connectionManager.fetchConnectionData(agent.accountId);

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

/**
 * Creates a small transfer transaction that requires approval from both accounts
 */
function createApprovalTransaction(
  senderAccountId: string,
  bobAccountId: string,
  amount: number
): TransferTransaction {
  return new TransferTransaction()
    .addHbarTransfer(senderAccountId, Hbar.fromTinybars(-amount / 2))
    .addHbarTransfer(bobAccountId, Hbar.fromTinybars(-amount / 2))
    .addHbarTransfer('0.0.800', Hbar.fromTinybars(amount));
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
    lowerContent.startsWith('transact:') ||
    lowerContent.startsWith('transfer:')
  ) {
    const commandParts = messageContent
      .substring(messageContent.indexOf(':') + 1)
      .trim()
      .split(' ');

    let amount = 10000000;
    if (commandParts.length > 0 && !isNaN(Number(commandParts[0]))) {
      const specifiedAmount = Number(commandParts[0]);
      amount = Math.floor(specifiedAmount * 100000000);
    }

    if (amount < 1000000 || amount > 10000000000) {
      response = `⚠️ Please specify an amount between 0.01 and 10 HBAR for the transaction.`;
    } else {
      try {
        const senderAccountId =
          extractAccountId(message.operator_id || '') || '';
        if (!senderAccountId) {
          response = `⚠️ Couldn't determine your account ID from the message.`;
        } else {
          const transaction = createApprovalTransaction(
            senderAccountId,
            agent.accountId,
            amount
          );

          const description = `Transfer ${
            amount / 100000000
          } HBAR to treasury (both signatures required)`;

          await agent.client.sendTransaction(
            connectionTopicId,
            transaction,
            description,
            {
              scheduleMemo: `Bob & ${senderAccountId} transaction for ${
                amount / 100000000
              } HBAR`,
              expirationTime: 3600,
              operationMemo: `This transaction requires approval from ${senderAccountId} and Bob. Sign with ScheduleSignTransaction().setScheduleId(SCHEDULE_ID).execute(client)`,
            }
          );

          return;
        }
      } catch (error) {
        logger.error(`Error creating transaction: ${error}`);
        response = `⚠️ Sorry, I encountered an error creating the transaction: ${error}`;
      }
    }
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

HEDERA FEATURES:
- transact: [amount] - Create a scheduled transaction that requires approval from both of us (amount in HBAR)

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
    const responseWithReference = message.sequence_number
      ? `[Reply to #${message.sequence_number}] ${response}`
      : response;

    await agent.client.sendMessage(
      connectionTopicId,
      responseWithReference,
      `Bob response to message #${message.sequence_number}`
    );
  } catch (error) {
    logger.error(
      `Failed to send response to topic ${connectionTopicId}: ${error}`
    );
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

    const agentData = {
      client: bob.client,
      accountId: bob.accountId,
      operatorId: `${bob.inboundTopicId}@${bob.accountId}`,
      inboundTopicId: bob.inboundTopicId,
      outboundTopicId: bob.outboundTopicId,
    };

    logger.info('===== BOB POLLING AGENT DETAILS =====');
    logger.info(`Account ID: ${agentData.accountId}`);
    logger.info(`Operator ID: ${agentData.operatorId}`);
    logger.info(`Inbound Topic: ${agentData.inboundTopicId}`);
    logger.info(`Outbound Topic: ${agentData.outboundTopicId}`);
    logger.info('=====================================');

    await monitorTopics(
      logger,
      handleConnectionRequest,
      handleStandardMessage,
      agentData
    );
  } catch (error) {
    logger.error(`Error in main function: ${error}`);
  }
}

main();
