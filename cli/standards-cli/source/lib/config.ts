import envPaths from 'env-paths';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export type HederaNetwork = 'mainnet' | 'testnet' | 'previewnet';

export interface LedgerCredentials {
	accountId?: string;
	privateKey?: string;
}

export interface RegistryBrokerConfig {
	baseUrl?: string;
	apiKey?: string;
	useLedger?: boolean;
	autoTopUp?: boolean;
	profileMode?: 'ai' | 'mcp';
	historyAutoTopUp?: boolean;
	headersTimeoutMs?: number;
	bodyTimeoutMs?: number;
}

export interface AgentConfig {
	preferCloudflared?: boolean;
	fallbackToLocalTunnel?: boolean;
	defaultPort?: number;
}

export interface StandardsCliConfig {
	schemaVersion: 1;
	sdkRoot?: string;
	hedera?: {
		network?: HederaNetwork;
		defaultAccountId?: string;
		defaultPrivateKey?: string;
		mainnet?: LedgerCredentials;
		testnet?: LedgerCredentials;
		previewnet?: LedgerCredentials;
	};
	registryBroker?: RegistryBrokerConfig;
	openRouter?: {
		apiKey?: string;
		modelId?: string;
	};
	environments?: Record<string, string>;
	agent?: AgentConfig;
}

const DEFAULT_CONFIG: StandardsCliConfig = {
	schemaVersion: 1,
	hedera: {
		network: 'testnet',
	},
	registryBroker: {
		baseUrl: 'https://registry.hashgraphonline.com/api/v1',
		useLedger: true,
		autoTopUp: true,
		historyAutoTopUp: true,
		profileMode: 'ai',
		headersTimeoutMs: 600_000,
		bodyTimeoutMs: 600_000,
	},
	openRouter: {
		modelId: 'anthropic/claude-3.5-sonnet',
	},
	environments: {},
	agent: {
		preferCloudflared: true,
		fallbackToLocalTunnel: true,
		defaultPort: 8787,
	},
};

const paths = envPaths('standards-sdk-cli', {suffix: ''});
export const CONFIG_DIR = paths.config;
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const ensureConfigDir = async () => {
	await mkdir(CONFIG_DIR, {recursive: true});
};

const normaliseNetwork = (network?: string): HederaNetwork | undefined => {
	if (!network) {
		return undefined;
}
	const candidate = network.trim().toLowerCase();
	if (candidate === 'mainnet' || candidate === 'previewnet' || candidate === 'testnet') {
		return candidate;
	}
	return undefined;
};

export const loadConfig = async (): Promise<StandardsCliConfig> => {
	try {
		const raw = await readFile(CONFIG_PATH, 'utf8');
		const parsed = JSON.parse(raw) as Partial<StandardsCliConfig> | undefined;
		if (!parsed || typeof parsed !== 'object') {
			return structuredClone(DEFAULT_CONFIG);
		}
		const draft: StandardsCliConfig = {
			...DEFAULT_CONFIG,
			...parsed,
			hedera: {
				...DEFAULT_CONFIG.hedera,
				...parsed.hedera,
			},
			registryBroker: {
				...DEFAULT_CONFIG.registryBroker,
				...parsed.registryBroker,
			},
			openRouter: {
				...DEFAULT_CONFIG.openRouter,
				...parsed.openRouter,
			},
			environments: {
				...DEFAULT_CONFIG.environments,
				...parsed.environments,
			},
			agent: {
				...DEFAULT_CONFIG.agent,
				...parsed.agent,
			},
		};
		if (draft.hedera) {
			draft.hedera.network = normaliseNetwork(draft.hedera.network) ?? DEFAULT_CONFIG.hedera?.network;
		}
		return draft;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return structuredClone(DEFAULT_CONFIG);
		}
		throw error;
	}
};

export const saveConfig = async (config: StandardsCliConfig): Promise<void> => {
	await ensureConfigDir();
	const payload = JSON.stringify(config, null, 2);
	await writeFile(CONFIG_PATH, `${payload}\n`, 'utf8');
};

export const updateConfig = async (
	updater: (config: StandardsCliConfig) => StandardsCliConfig | void,
): Promise<StandardsCliConfig> => {
	const current = await loadConfig();
	const result = updater(current);
	const next = result && typeof result === 'object' ? result : current;
	await saveConfig(next);
	return next;
};

export const resetConfig = async (): Promise<StandardsCliConfig> => {
	const draft = structuredClone(DEFAULT_CONFIG);
	await saveConfig(draft);
	return draft;
};

export const redactValue = (value: string | undefined, visible = 4): string | undefined => {
	if (!value) {
		return undefined;
}
	if (value.length <= visible * 2) {
		return `${value.slice(0, visible)}…`;
	}
	return `${value.slice(0, visible)}…${value.slice(-visible)}`;
};
