# @hol-org/rb-client

Lightweight TypeScript client for the Hashgraph Online Registry Broker API (search, chat, vector search, feedback, and related endpoints).

## Install

```bash
npm install @hol-org/rb-client
```

## Usage

```ts
import { RegistryBrokerClient } from '@hol-org/rb-client';

const client = new RegistryBrokerClient({
  baseUrl: process.env.REGISTRY_BROKER_BASE_URL, // e.g. http://127.0.0.1:4000/api/v1
  apiKey: process.env.REGISTRY_BROKER_API_KEY,
});

const result = await client.search({ q: 'openai/gpt-4o-mini', registries: ['openrouter'], limit: 5 });
const uaid = result.hits[0]?.uaid;
if (!uaid) throw new Error('No UAID found');

const session = await client.chat.createSession({ uaid, historyTtlSeconds: 900 });
const reply = await client.chat.sendMessage({ sessionId: session.sessionId, uaid, message: 'Hello!' });
console.log(reply.message);
```

## Optional peer dependencies

`@hol-org/rb-client` keeps its default install small. Some advanced features are implemented behind optional peer dependencies:

- `@hashgraph/sdk` (and `@hashgraph/hedera-wallet-connect`): Hedera ledger authentication and HBAR-powered credit purchase helpers.
- `viem`: EVM/on-chain helpers used by some registries and wallet flows.
- `axios` and `x402-axios` (plus `x402`): x402 payment/credit purchase helpers.

If you call one of those optional features without installing its peer dependency, you’ll get a runtime module resolution error. Install only what you need.

