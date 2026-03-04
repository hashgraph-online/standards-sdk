# Hashgraph Online Standards SDK

| ![](./Hashgraph-Online.png) | A lightweight SDK providing reference implementations for Hashgraph Consensus Standards (HCS) created by Hashgraph Online.<br><br>This SDK is built and maintained by [Hashgraph Online](https://hol.org), a consortium of leading Hedera Organizations within the Hedera ecosystem.<br><br>[📚 Standards SDK Documentation](https://hol.org/docs/libraries/standards-sdk/)<br>[📖 HCS Standards Documentation](https://hol.org/docs/standards) |
| :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |

## Quick Start

```bash
npm install @hol-org/standards-sdk
# Legacy scope:
# npm install @hashgraphonline/standards-sdk
```

For the standalone Registry Broker client with a smaller footprint:

```bash
npm install @hol-org/rb-client
```

HOL-scoped distributions are published in parallel:

- `@hol-org/rb-client`: registry broker client only
- `@hol-org/standards-sdk`: full SDK under the HOL scope

### Optional dependencies for `@hol-org/rb-client`

The client ships with zero network transports bundled. Install these peers when you need the related features:

- `axios` + `x402-axios` + `x402` for X402 credit purchases and payments
- `viem` for EVM-based ledger authentication
- `@hashgraph/sdk` for Hedera ledger authentication

Core agent search/chat flows only require a `fetch` implementation.

## Documentation

For complete documentation, examples, and API references, visit:

- [Standards SDK Documentation](https://hol.org/docs/libraries/standards-sdk/)

### Registry Broker skill verification (DNS TXT domain proof)

The `RegistryBrokerClient` supports version-scoped skill verification plus DNS TXT domain proof:

```typescript
import { RegistryBrokerClient } from '@hashgraphonline/standards-sdk';

const client = new RegistryBrokerClient({
  apiKey: process.env.REGISTRY_BROKER_API_KEY,
});

await client.requestSkillVerification({
  name: 'demo-skill',
  version: '1.0.0',
  tier: 'basic', // or 'express'
});

const challenge = await client.createSkillDomainProofChallenge({
  name: 'demo-skill',
  version: '1.0.0',
  domain: 'example.com',
});

const challengeToken = challenge.txtRecordValue.replace(/^hol-skill-verification=/, '');

await client.verifySkillDomainProof({
  name: 'demo-skill',
  version: '1.0.0',
  domain: 'example.com',
  challengeToken,
});
```

Runnable demo: `pnpm -C standards-sdk tsx demo/registry-broker/skill-domain-proof-demo.ts --skill-name=<name> --base-url=<broker-api-url>`.

### Registry Broker UAID DNS verification (HCS-14 DNS TXT profile)

The `RegistryBrokerClient` can verify and persist `_uaid.<nativeId>` TXT proof for an agent UAID:

```typescript
import { RegistryBrokerClient } from '@hashgraphonline/standards-sdk';

const client = new RegistryBrokerClient({
  baseUrl: 'https://hol.org/registry/api/v1',
});

const verify = await client.verifyUaidDnsTxt({
  uaid: 'uaid:aid:...;uid=...;proto=a2a;nativeId=agent.hol.org',
  persist: true,
});

const status = await client.getVerificationDnsStatus(
  'uaid:aid:...;uid=...;proto=a2a;nativeId=agent.hol.org',
  { refresh: true, persist: false },
);
```

Runnable demo: `pnpm -C standards-sdk run demo:registry-broker-uaid-dns -- --uaid=<uaid> --base-url=<broker-api-url>`.

## Interactive CLI and Demos

Launch the bundled CLI to explore registry broker demos, inspect required env vars, and run helper scripts:

```bash
pnpm run cli
```

The CLI surfaces:

- Guided registry broker demos (OpenRouter, chat history, ledger auth) plus the HCS-10 agent flows.
- A map of required env vars so you can bootstrap Hedera credentials and adapters quickly.
- Links back to the docs plus the demo scripts you can run manually (`demo/registry-broker`, `demo/hcs-10`).

See [cli/standards-cli/README.md](cli/standards-cli/README.md) for advanced and non-interactive commands.

## Supported Standards

| Standard | Description |
| :--- | :--- |
| `HCS-1` | File Storage |
| `HCS-2` | Registry and Indexing Standard |
| `HCS-3` | Recursive File Loading |
| `HCS-7` | Smart Hashinals |
| `HCS-10` | Trustless Peer-to-Peer Communication for Agents and AI |
| `HCS-11` | Decentralized Profile and Identity Standard |
| `HCS-20` | Auditable Points |

## Running Demos

The SDK includes demo implementations that showcase registry broker flows (discovery, chat, ledger auth, OpenRouter) and HCS-10 agent communication. Follow these steps to run them:

1. Clone the repository

   ```bash
   git clone https://github.com/hashgraph-online/standards-sdk.git
   cd standards-sdk
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Set up environment variables

   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your Hedera credentials:

   ```
   HEDERA_ACCOUNT_ID=0.0.12345
   HEDERA_PRIVATE_KEY=your_private_key_here
   HEDERA_NETWORK=testnet
   REGISTRY_URL=https://moonscape.tech
   ```

   The CLI can also auto-persist agent state in `.env` if a demo is interrupted. See `.env.example` for generated state fields.

5. Start a demo (or use `pnpm run cli` for an interactive launcher):

   ```bash
   npm run demo:registry-broker
   ```

   ```bash
   npm run demo:hcs-10
   ```

Each demo directory contains README instructions plus you can review `demo/registry-broker` and `demo/hcs-10` for fine-grained scripts covering OpenRouter, history snapshots, ledger authentication, and fee flows.
### Demo Descriptions

#### Inscribe Demo

The inscribe demo (`demo/inscribe-demo.ts`) showcases different file inscription capabilities:

- Text inscription using buffers
- URL-based inscriptions
- File buffer inscriptions
- Creating Hashinal NFTs from URLs
- Creating Hashinal NFTs from buffers
- Creating Hashinal NFTs from text content

Each inscription demonstrates different options and metadata capabilities.

#### HCS-10 AI Agent Communication Demo

The HCS-10 demo (`demo/hcs-10/index.ts`) demonstrates trustless peer-to-peer communication between AI agents:

- Agent creation and registration (Alice and Bob)
- Agent metadata and profile management
- Connection establishment between agents
- Sending and retrieving small messages
- Sending and retrieving large messages with recursive storage
- Message data processing
- **Resumable agent creation**: If agent creation is interrupted, the SDK automatically resumes from where it left off using state saved in environment variables

The demo automatically handles agent funding, topic creation, and registration with the global registry. Agent creation progress is tracked in real-time and saved to the `.env` file, allowing recovery from any interruption.

## Contributing

Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before contributing to this project.

For bugs and feature requests, please use the [issue templates](https://github.com/hashgraph-online/standards-sdk/issues/new/choose).

## Security

For security concerns, please refer to our [Security Policy](SECURITY.md).

## Maintainers

See [MAINTAINERS.md](MAINTAINERS.md) for a list of project maintainers.

## Resources

- [HCS Standards Documentation](https://hol.org/docs/standards)
- [Hedera Documentation](https://docs.hedera.com)
- [Telegram Community](https://t.me/hashinals)

### 📝 Blog Tutorials

- [Building a Decentralized Registry with Go & HCS-2](https://hol.org/blog/building-decentralized-registry-go-hedara)
- [Universal Agent Discovery with MCP](https://hol.org/blog/universal-agent-discovery-mcp)
- [Creating Reactive Service Agents](https://hol.org/blog/creating-reactive-service-agents)
- [End-to-End Encrypted Agent Communication](https://hol.org/blog/end-to-end-encrypted-agent-communication)
- [Building Monetized Agents with x402](https://hol.org/blog/building-monetized-agents-x402)
- [Bridging AgentVerse Communication](https://hol.org/blog/bridging-agentverse-communication)
- [Discovering NANDA Agents with Registry Broker](https://hol.org/blog/discovering-nanda-agents-registry-broker)
- [ERC-8004: Trustless Agent Registry](https://hol.org/blog/erc-8004-trustless-agent-registry)

## License

Apache-2.0
