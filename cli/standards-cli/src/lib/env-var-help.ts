export interface EnvVarHelp {
	name: string;
	description: string;
	exampleFormat: string;
	howToObtain: string;
	required: boolean;
	category: 'hedera' | 'registry-broker' | 'integration' | 'other';
}

export const ENV_VAR_HELP: Record<string, EnvVarHelp> = {
	HEDERA_ACCOUNT_ID: {
		name: 'HEDERA_ACCOUNT_ID',
		description: 'Your Hedera testnet account identifier',
		exampleFormat: '0.0.12345',
		howToObtain: `1. Create a testnet account using HashPack wallet (https://www.hashpack.app/)
2. Or use Hedera Portal (https://portal.hedera.com/register)
3. Fund your testnet account from the faucet
4. Copy your account ID (format: 0.0.xxxxx)`,
		required: true,
		category: 'hedera',
	},

	HEDERA_PRIVATE_KEY: {
		name: 'HEDERA_PRIVATE_KEY',
		description: 'Your Hedera account private key (DER or hex format)',
		exampleFormat: '302e020100300506032b657004220420...',
		howToObtain: `1. Export private key from your wallet (HashPack, Blade, etc.)
2. IMPORTANT: Never share this key or commit it to version control
3. Store in .env file (never in code)
4. Use testnet keys only for demos`,
		required: true,
		category: 'hedera',
	},

	REGISTRY_BROKER_BASE_URL: {
		name: 'REGISTRY_BROKER_BASE_URL',
		description: 'Base URL for the Hashgraph Online registry broker API',
		exampleFormat: 'https://registry-broker.hashgraph.online',
		howToObtain: `1. Use the public instance: https://registry-broker.hashgraph.online
2. Or run your own broker locally
3. Set this in your .env file`,
		required: true,
		category: 'registry-broker',
	},

	REGISTRY_BROKER_API_KEY: {
		name: 'REGISTRY_BROKER_API_KEY',
		description: 'API key for authenticated registry broker access',
		exampleFormat: 'your-api-key-here',
		howToObtain: `1. Register at https://registry-broker.hashgraph.online
2. Generate an API key from your dashboard
3. Store securely in .env file`,
		required: false,
		category: 'registry-broker',
	},

	OPENROUTER_API_KEY: {
		name: 'OPENROUTER_API_KEY',
		description: 'API key for OpenRouter AI service integration',
		exampleFormat: 'sk-or-v1-...',
		howToObtain: `1. Sign up at https://openrouter.ai/
2. Create an API key in your dashboard
3. Add credits to your account
4. Store key in .env file`,
		required: false,
		category: 'integration',
	},

	HEDERA_OPERATOR_ID: {
		name: 'HEDERA_OPERATOR_ID',
		description: 'Alternative name for HEDERA_ACCOUNT_ID (same value)',
		exampleFormat: '0.0.12345',
		howToObtain: 'Use the same value as HEDERA_ACCOUNT_ID',
		required: false,
		category: 'hedera',
	},

	HEDERA_OPERATOR_KEY: {
		name: 'HEDERA_OPERATOR_KEY',
		description: 'Alternative name for HEDERA_PRIVATE_KEY (same value)',
		exampleFormat: '302e020100300506032b657004220420...',
		howToObtain: 'Use the same value as HEDERA_PRIVATE_KEY',
		required: false,
		category: 'hedera',
	},

	HEDERA_NETWORK: {
		name: 'HEDERA_NETWORK',
		description: 'Hedera network to connect to',
		exampleFormat: 'testnet',
		howToObtain: `1. Use "testnet" for demos and testing
2. Use "mainnet" for production (requires real HBAR)
3. Defaults to "testnet" if not specified`,
		required: false,
		category: 'hedera',
	},
};

export function getEnvVarHelp(envVarName: string): EnvVarHelp | undefined {
	return ENV_VAR_HELP[envVarName];
}

export function getMissingEnvHelp(missingVars: string[]): Array<EnvVarHelp> {
	return missingVars.map(varName => getEnvVarHelp(varName)).filter((help): help is EnvVarHelp => help !== undefined);
}

export function formatEnvVarHelp(help: EnvVarHelp): string {
	return `${help.name}
  ${help.description}
  Example: ${help.exampleFormat}

  How to obtain:
  ${help.howToObtain.split('\n').map(line => `  ${line}`).join('\n')}`;
}
