# Hashgraph Online Standards SDK

| ![](https://github.com/hashgraph-online/standards-sdk/raw/main/Hashgraph-Online.png) | A lightweight SDK providing reference implementations for Hashgraph Consensus Standards (HCS) created by Hashgraph Online.<br><br>This SDK is built and maintained by [Hashgraph Online](https://hol.org), a consortium of leading Hedera Organizations within the Hedera ecosystem.<br><br>[📚 Standards SDK Documentation](https://hol.org/docs/libraries/standards-sdk/)<br>[📖 HCS Standards Documentation](https://hol.org/docs/standards) |
| :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |

> **JSR Edition**: This is the JSR-compatible version of the Standards SDK with core registry client functionality. For the full SDK with all features (chat, credits, encryption, HCS-10 agents, inscriptions), install from npm: `npm install @hashgraphonline/standards-sdk`

## Quick Start

```typescript
// Deno / JSR
import { RegistryClient } from "jsr:@hol-org/standards-sdk";

const client = new RegistryClient();

// Search for agents
const results = await client.search({ q: "weather" });
console.log(results);

// Resolve an agent by UAID
const agent = await client.resolve("hcs10://0.0.123456/my-agent");
console.log(agent);

// Get registry stats
const stats = await client.stats();
console.log(stats);
```

### npm Installation (Full SDK)

```bash
npm install @hol-org/standards-sdk
# Legacy scope:
# npm install @hashgraphonline/standards-sdk
```

For the standalone Registry Broker client with a smaller footprint:

```bash
npm install @hol-org/rb-client
```

## Documentation

For complete documentation, examples, and API references, visit:

- [Standards SDK Documentation](https://hol.org/docs/libraries/standards-sdk/)

## API (JSR Edition)

### `RegistryClient`

The main client for interacting with the Universal Agentic Registry.

```typescript
const client = new RegistryClient({
  baseUrl: "https://hol.org/registry/api/v1", // optional
  headers: { "Authorization": "Bearer ..." }, // optional
});
```

### Methods

- **`search(params)`** - Search the registry for agents
- **`resolve(uaid)`** - Resolve an agent by its Universal Agent Identifier
- **`stats()`** - Get registry statistics

### Types

- `SearchParams` - Search query parameters
- `SearchResponse` - Search results with hits and pagination
- `AgentProfile` - Full agent profile data
- `RegistryStats` - Registry statistics

## Supported Standards

- **HCS-1**: File Storage
- **HCS-2**: Registry and Indexing Standard
- **HCS-3**: Recursive File Loading
- **HCS-7**: Smart Hashinals
- **HCS-10**: Trustless Peer-to-Peer Communication for Agents and AI
- **HCS-11**: Decentralized Profile and Identity Standard
- **HCS-20**: Auditable Points

## 🏆 Score HOL Points

Contribute to this SDK and score [HOL Points](https://hol.org/points)! 

- 🔧 **Fix bugs** or improve documentation
- ✨ **Add new features** or examples
- 📝 **Submit pull requests** to score points

Points can be used across the HOL ecosystem. [Learn more →](https://hol.org/points)

## Resources

- [Universal Agentic Registry](https://hol.org/registry)
- [HCS Standards Documentation](https://hol.org/docs/standards)
- [Hedera Documentation](https://docs.hedera.com)
- [Telegram Community](https://t.me/hashinals)
- [GitHub](https://github.com/hashgraph-online/standards-sdk)

## License

Apache-2.0
