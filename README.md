# Hashgraph Online Standards SDK

A lightweight SDK providing reference implementations for Hashgraph Consensus Standards (HCS) created by Hashgraph Online.

## Quick Start

```bash
npm install @hashgraphonline/standards-sdk
```

## Documentation

For complete documentation, examples, and API references, visit:

- [Standards SDK Documentation](https://hashgraphonline.com/docs/libraries/standards-sdk/)

## Supported Standards

- **HCS-3**: Recursion for Inscribed Files
- **HCS-7**: Dynamic, Programmable, and 100% on-graph assets
- **HCS-10**: Trustless, peer to peer communication for AI Agents
- **HCS-11**: Profile Standard

## Running Demos

The SDK includes demo implementations that showcase various features. Follow these steps to run them:

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
   API_KEY=your_api_key_here
   HEDERA_ACCOUNT_ID=0.0.12345
   HEDERA_PRIVATE_KEY=your_private_key_here
   HEDERA_NETWORK=testnet
   REGISTRY_URL=https://moonscape.tech
   ```

5. Run the demos:

   ```bash
   # Run the inscribe demo
   npm run demo:inscribe
   ```

   ```bash
   # Run the HCS-10 AI agent communication demo
   npm run demo:hcs-10
   ```

   ```bash
   # Run the HCS-10 polling demo
   npm run demo:polling-agent
   ```

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

The demo automatically handles agent funding, topic creation, and registration with the global registry.

## Contributing

Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before contributing to this project.

For bugs and feature requests, please use the [issue templates](https://github.com/hashgraph-online/standards-sdk/issues/new/choose).

## Security

For security concerns, please refer to our [Security Policy](SECURITY.md).

## Maintainers

See [MAINTAINERS.md](MAINTAINERS.md) for a list of project maintainers.

## Resources

- [HCS Standards Documentation](https://hcs-improvement-proposals.pages.dev/docs/standards)
- [Hedera Documentation](https://docs.hedera.com)
- [Telegram Community](https://t.me/hashinals)

## License

Apache-2.0
