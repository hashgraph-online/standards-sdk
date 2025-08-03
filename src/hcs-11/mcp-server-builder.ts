import {
  MCPServerConfig,
  MCPServerDetails,
  MCPServerConnectionInfo,
  MCPServerVerification,
  MCPServerHost,
  MCPServerResource,
  MCPServerTool,
  MCPServerCapability,
  SocialPlatform,
  VerificationType,
  SocialLink,
} from './types';
import { Logger , ILogger } from '../utils/logger';
import { NetworkType } from '../utils/types';

/**
 * MCPServerBuilder is a builder class for creating MCP server configurations.
 * It provides a fluent interface for setting various properties of the MCP server.
 *
 * Example usage:
 * ```typescript
 * const mcpBuilder = new MCPServerBuilder();
 * mcpBuilder.setName('My MCP Server');
 * mcpBuilder.setServerDescription('This is my MCP server for AI integration');
 * mcpBuilder.setVersion('2024-06-01');
 * mcpBuilder.setConnectionInfo('https://mcp.example.com', 'sse');
 * mcpBuilder.setServices([MCPServerCapability.TOOL_PROVIDER, MCPServerCapability.API_INTEGRATION]);
 * mcpBuilder.setNetworkType('mainnet');
 * mcpBuilder.addVerificationDNS('example.com', 'mcp-verify');
 * const serverConfig = mcpBuilder.build();
 * ```
 */
export class MCPServerBuilder {
  private config: Partial<MCPServerConfig> = {
    mcpServer: {} as MCPServerDetails,
  };
  private socials: SocialLink[] = [];
  private logger: ILogger;

  constructor() {
    this.logger = Logger.getInstance({
      module: 'MCPServerBuilder',
    });
  }

  /**
   * Sets the display name of the MCP server
   *
   * @param name The display name for the MCP server profile
   */
  setName(name: string): this {
    this.config.name = name;
    return this;
  }

  /**
   * Sets the alias for the MCP server
   *
   * @param alias Alternative identifier for the MCP server
   */
  setAlias(alias: string): this {
    this.config.alias = alias;
    return this;
  }

  /**
   * Sets the bio/description for the MCP server profile
   *
   * @param bio Brief description or biography for the MCP server
   */
  setBio(bio: string): this {
    this.config.bio = bio;
    return this;
  }

  /**
   * @deprecated Use setBio instead
   */
  setDescription(description: string): this {
    return this.setBio(description);
  }

  /**
   * Sets the version of the MCP server
   *
   * @param version The MCP server version (e.g., "2024-06-01")
   */
  setVersion(version: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }
    this.config.mcpServer.version = version;
    return this;
  }

  /**
   * Sets the connection information for the MCP server
   *
   * @param url Base URL for the MCP server (e.g., "https://mcp.example.com")
   * @param transport Transport type ("stdio" or "sse")
   */
  setConnectionInfo(url: string, transport: 'stdio' | 'sse'): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    const connectionInfo: MCPServerConnectionInfo = {
      url,
      transport,
    };

    this.config.mcpServer.connectionInfo = connectionInfo;
    return this;
  }

  /**
   * Sets the detailed description for the MCP server capabilities
   *
   * @param description Detailed description of server functionality
   */
  setServerDescription(description: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }
    this.config.mcpServer.description = description;
    return this;
  }

  /**
   * Sets the services/capabilities provided by the MCP server
   *
   * @param services Array of service types offered by this MCP server
   */
  setServices(services: MCPServerCapability[]): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }
    this.config.mcpServer.services = services;
    return this;
  }

  /**
   * Sets the minimum host version requirements
   *
   * @param minVersion Minimum host version required (e.g., "2024-11-05")
   */
  setHostRequirements(minVersion?: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    const hostInfo: MCPServerHost = {
      minVersion,
    };

    this.config.mcpServer.host = hostInfo;
    return this;
  }

  /**
   * Sets the MCP capabilities supported by the server
   *
   * @param capabilities Array of capability strings (e.g., ["resources.get", "tools.invoke"])
   */
  setCapabilities(capabilities: string[]): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }
    this.config.mcpServer.capabilities = capabilities;
    return this;
  }

  /**
   * Adds a resource that the MCP server exposes
   *
   * @param name Resource name identifier (e.g., "hcs_topics")
   * @param description Human-readable description of the resource
   */
  addResource(name: string, description: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    if (!this.config.mcpServer.resources) {
      this.config.mcpServer.resources = [];
    }

    const resource: MCPServerResource = {
      name,
      description,
    };

    this.config.mcpServer.resources.push(resource);
    return this;
  }

  /**
   * Sets all resources the MCP server exposes (replaces existing resources)
   *
   * @param resources Array of resource objects with name and description
   */
  setResources(resources: MCPServerResource[]): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    this.config.mcpServer.resources = resources;
    return this;
  }

  /**
   * Adds a tool that the MCP server provides
   *
   * @param name Tool name identifier (e.g., "topic_submit")
   * @param description Human-readable description of what the tool does
   */
  addTool(name: string, description: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    if (!this.config.mcpServer.tools) {
      this.config.mcpServer.tools = [];
    }

    const tool: MCPServerTool = {
      name,
      description,
    };

    this.config.mcpServer.tools.push(tool);
    return this;
  }

  /**
   * Sets all tools the MCP server provides (replaces existing tools)
   *
   * @param tools Array of tool objects with name and description
   */
  setTools(tools: MCPServerTool[]): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    this.config.mcpServer.tools = tools;
    return this;
  }

  /**
   * Sets information about who maintains the MCP server
   *
   * @param maintainer Organization or entity maintaining this MCP server
   */
  setMaintainer(maintainer: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }
    this.config.mcpServer.maintainer = maintainer;
    return this;
  }

  /**
   * Sets the URL to the source code repository
   *
   * @param repository URL to source code repository
   */
  setRepository(repository: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }
    this.config.mcpServer.repository = repository;
    return this;
  }

  /**
   * Sets the URL to the server documentation
   *
   * @param docs URL to server documentation
   */
  setDocs(docs: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }
    this.config.mcpServer.docs = docs;
    return this;
  }

  /**
   * Sets the verification information for the MCP server
   *
   * @param verification Complete verification object
   */
  setVerification(verification: MCPServerVerification): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    this.config.mcpServer.verification = verification;
    return this;
  }

  /**
   * Adds DNS-based verification of endpoint ownership
   *
   * For DNS verification, the MCP server owner must add a DNS TXT record to their domain with:
   * - Name: By default, `_hedera` or a custom name specified in `dnsField` (automatically prefixed with `_`)
   * - Value: Equal to their Hedera account ID (e.g., `0.0.12345678`)
   *
   * Example DNS record:
   * ```
   * _hedera.example.com. 3600 IN TXT "0.0.12345678"
   * ```
   *
   * @param domain The fully qualified domain name to check (e.g., "example.com")
   * @param dnsField Optional custom DNS TXT record name (defaults to "hedera")
   */
  addVerificationDNS(domain: string, dnsField?: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    const verification: MCPServerVerification = {
      type: VerificationType.DNS,
      value: domain,
      dns_field: dnsField,
    };

    this.config.mcpServer.verification = verification;
    return this;
  }

  /**
   * Adds signature-based verification of endpoint ownership
   *
   * For signature verification:
   * 1. The message to be signed must be the server URL exactly as it appears in the connectionInfo.url field
   * 2. The signature must be created using the ED25519 key associated with the Hedera account
   * 3. The signature must be encoded as a hexadecimal string with no `0x` prefix
   *
   * @param signature Hex-encoded ED25519 signature of the server URL
   */
  addVerificationSignature(signature: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    const verification: MCPServerVerification = {
      type: VerificationType.SIGNATURE,
      value: signature,
    };

    this.config.mcpServer.verification = verification;
    return this;
  }

  /**
   * Adds challenge-based verification of endpoint ownership
   *
   * For challenge verification:
   * 1. The MCP server must expose an endpoint that responds to HTTP GET requests
   * 2. The endpoint path defaults to "/hedera-verification" or can be customized with challengePath
   * 3. The server must respond with a JSON object containing:
   *    ```json
   *    {
   *      "accountId": "0.0.12345678",
   *      "timestamp": 1620000000000,
   *      "signature": "a1b2c3d4e5f6..."
   *    }
   *    ```
   * 4. The signature must be an ED25519 signature of the UTF-8 encoded string `{accountId}:{timestamp}`
   *
   * @param challengePath Optional custom challenge endpoint path (defaults to "hedera-verification")
   */
  addVerificationChallenge(challengePath?: string): this {
    if (!this.config.mcpServer) {
      this.config.mcpServer = {} as MCPServerDetails;
    }

    const verification: MCPServerVerification = {
      type: VerificationType.CHALLENGE,
      value: '',
      challenge_path: challengePath,
    };

    this.config.mcpServer.verification = verification;
    return this;
  }

  /**
   * Adds a social media link to the profile
   *
   * @param platform Social media platform (e.g., "twitter", "github")
   * @param handle Username on the platform (e.g., "@username", "username")
   */
  addSocial(platform: SocialPlatform, handle: string): this {
    const existingSocial = this.socials.find(s => s.platform === platform);

    if (!existingSocial) {
      const socialLink: SocialLink = {
        platform,
        handle,
      };

      this.socials.push(socialLink);
    } else {
      existingSocial.handle = handle;
    }

    return this;
  }

  /**
   * Sets all social media links for the profile (replaces existing links)
   *
   * @param socials Array of social media links
   */
  setSocials(socials: SocialLink[]): this {
    this.socials = socials;
    return this;
  }

  /**
   * Sets the profile picture for the MCP server
   *
   * @param pfpBuffer Buffer containing the profile picture data
   * @param pfpFileName Filename for the profile picture including extension
   */
  setProfilePicture(pfpBuffer: Buffer, pfpFileName: string): this {
    this.config.pfpBuffer = pfpBuffer;
    this.config.pfpFileName = pfpFileName;
    return this;
  }

  /**
   * Sets a reference to an existing profile picture
   *
   * @param pfpTopicId Topic ID containing the profile picture (for reuse)
   */
  setExistingProfilePicture(pfpTopicId: string): this {
    this.config.existingPfpTopicId = pfpTopicId;
    return this;
  }

  /**
   * Sets the network type (mainnet or testnet)
   *
   * @param network Network type ("mainnet" or "testnet")
   */
  setNetworkType(network: NetworkType): this {
    this.config.network = network;
    return this;
  }

  /**
   * Sets an existing account to use for the MCP server
   *
   * @param accountId Hedera account ID (e.g., "0.0.12345678")
   * @param privateKey ED25519 private key as a string
   */
  setExistingAccount(accountId: string, privateKey: string): this {
    this.config.existingAccount = {
      accountId,
      privateKey,
    };
    return this;
  }

  /**
   * Builds and validates the MCP server configuration
   *
   * @returns Complete MCPServerConfig object ready for use
   * @throws Error if required fields are missing
   */
  build(): MCPServerConfig {
    if (!this.config.name) {
      throw new Error('MCP server name is required');
    }

    if (!this.config.network) {
      throw new Error('Network type is required');
    }

    if (!this.config.mcpServer) {
      throw new Error('MCP server details are required');
    }

    if (!this.config.mcpServer.version) {
      throw new Error('MCP server version is required');
    }

    if (!this.config.mcpServer.connectionInfo) {
      throw new Error('MCP server connection info is required');
    }

    if (
      !this.config.mcpServer.services ||
      this.config.mcpServer.services.length === 0
    ) {
      throw new Error('At least one MCP service type is required');
    }

    if (!this.config.mcpServer.description) {
      throw new Error('MCP server description is required');
    }

    if (!this.config.bio) {
      this.logger.warn('No bio provided for MCP server profile');
    }

    if (!this.config.pfpBuffer && !this.config.existingPfpTopicId) {
      this.logger.warn('No profile picture provided or referenced');
    }

    // Include social links in the final configuration
    if (this.socials.length > 0) {
      return {
        ...(this.config as MCPServerConfig),
        socials: this.socials,
      };
    }

    return this.config as MCPServerConfig;
  }
}
