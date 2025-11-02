import path from 'node:path';
import {existsSync} from 'node:fs';
import dotenv from 'dotenv';
import type {DemoDefinition} from './demos.js';
import type {HederaNetwork, LedgerCredentials, StandardsCliConfig} from './config.js';
import {CLI_ROOT} from './paths.js';

const NETWORK_LABELS: Record<string, string> = {
	mainnet: 'MAINNET',
	testnet: 'TESTNET',
	previewnet: 'PREVIEWNET',
};

let envLoadedFor: string | null = null;

const ensureDotEnvLoaded = (sdkRoot: string): void => {
	if (envLoadedFor === sdkRoot) {
		return;
	}
	const candidates = ['.env.local', '.env'];
	for (const filename of candidates) {
		const fullPath = path.join(sdkRoot, filename);
		if (existsSync(fullPath)) {
			dotenv.config({path: fullPath});
		}
	}
	envLoadedFor = sdkRoot;
};

const resolveEnvLedgerValue = (
	env: NodeJS.ProcessEnv,
	network: HederaNetwork,
	kind: 'ACCOUNT_ID' | 'PRIVATE_KEY',
): string | undefined => {
	const prefix = network === 'mainnet' ? 'MAINNET' : network === 'previewnet' ? 'PREVIEWNET' : 'TESTNET';
	const scopedKey = `${prefix}_HEDERA_${kind}` as keyof NodeJS.ProcessEnv;
	const scoped = env[scopedKey];
	if (typeof scoped === 'string' && scoped.trim().length > 0) {
		return scoped.trim();
	}
	const generic = env[`HEDERA_${kind}` as keyof NodeJS.ProcessEnv];
	if (typeof generic === 'string' && generic.trim().length > 0) {
		return generic.trim();
	}
	if (kind === 'ACCOUNT_ID') {
		const operator = env.HEDERA_OPERATOR_ID ?? env.ACCOUNT_ID;
		if (typeof operator === 'string' && operator.trim().length > 0) {
			return operator.trim();
		}
	}
	if (kind === 'PRIVATE_KEY') {
		const operatorKey = env.HEDERA_OPERATOR_KEY ?? env.PRIVATE_KEY;
		if (typeof operatorKey === 'string' && operatorKey.trim().length > 0) {
			return operatorKey.trim();
		}
	}
	return undefined;
};

const resolveLedgerCredentials = (
	network: HederaNetwork,
	config: StandardsCliConfig['hedera'] | undefined,
	env: NodeJS.ProcessEnv,
): LedgerCredentials => {
	const scopedConfig =
		network === 'mainnet'
			? config?.mainnet
			: network === 'previewnet'
				? config?.previewnet
				: config?.testnet;
	return {
		accountId:
			scopedConfig?.accountId ??
			config?.defaultAccountId ??
			resolveEnvLedgerValue(env, network, 'ACCOUNT_ID'),
		privateKey:
			scopedConfig?.privateKey ??
			config?.defaultPrivateKey ??
			resolveEnvLedgerValue(env, network, 'PRIVATE_KEY'),
	};
};

const applyCredential = (
	env: NodeJS.ProcessEnv,
	network: 'mainnet' | 'testnet' | 'previewnet',
	credentials: LedgerCredentials,
) => {
	const label = NETWORK_LABELS[network];
	if (credentials.accountId) {
		env[`${label}_HEDERA_ACCOUNT_ID`] = credentials.accountId;
	}
	if (credentials.privateKey) {
		env[`${label}_HEDERA_PRIVATE_KEY`] = credentials.privateKey;
	}
};

export interface BuildEnvironmentOptions {
	sdkRoot: string;
	demo?: DemoDefinition;
}

export interface EnvironmentBuildResult {
	env: NodeJS.ProcessEnv;
	missing: string[];
}

const ensurePathIncludes = (existing: string | undefined, additions: string[]): string => {
	const fragments = new Set(
		(additions.filter(Boolean) as string[]).concat((existing ?? '').split(path.delimiter).filter(Boolean)),
	);
	return Array.from(fragments).join(path.delimiter);
};

export const buildEnvironment = (
	config: StandardsCliConfig,
	{sdkRoot, demo}: BuildEnvironmentOptions,
): EnvironmentBuildResult => {
	ensureDotEnvLoaded(sdkRoot);
	const env: NodeJS.ProcessEnv = {...process.env};

	env.STANDARDS_SDK_ROOT = sdkRoot;
	if (config.sdkRoot) {
		env.STANDARDS_SDK_CONFIG_ROOT = config.sdkRoot;
	}

	const hederaNetwork = config.hedera?.network ?? 'testnet';
	env.HEDERA_NETWORK = hederaNetwork;

	const preferredCredentials = resolveLedgerCredentials(hederaNetwork, config.hedera, env);

	if (preferredCredentials.accountId) {
		env.HEDERA_ACCOUNT_ID = preferredCredentials.accountId;
		env.HEDERA_OPERATOR_ID ??= preferredCredentials.accountId;
	}
	if (preferredCredentials.privateKey) {
		env.HEDERA_PRIVATE_KEY = preferredCredentials.privateKey;
		env.HEDERA_OPERATOR_KEY ??= preferredCredentials.privateKey;
	}

	for (const label of ['mainnet', 'testnet', 'previewnet'] as const) {
	const credentials = resolveLedgerCredentials(label, config.hedera, env);
	applyCredential(env, label, credentials);
}

if (!env.REGISTRY_BROKER_BASE_URL && config.registryBroker?.baseUrl) {
	env.REGISTRY_BROKER_BASE_URL = config.registryBroker.baseUrl;
}
if (!env.REGISTRY_BROKER_API_KEY && config.registryBroker?.apiKey) {
	env.REGISTRY_BROKER_API_KEY = config.registryBroker.apiKey;
}

if (config.registryBroker?.useLedger !== undefined && env.REGISTRY_BROKER_DEMO_USE_LEDGER === undefined) {
	env.REGISTRY_BROKER_DEMO_USE_LEDGER = config.registryBroker.useLedger ? '1' : '0';
}

if (config.registryBroker?.autoTopUp !== undefined && env.REGISTRY_BROKER_DEMO_AUTO_TOP_UP === undefined) {
	env.REGISTRY_BROKER_DEMO_AUTO_TOP_UP = config.registryBroker.autoTopUp ? '1' : '0';
}

if (config.registryBroker?.historyAutoTopUp !== undefined && env.REGISTRY_BROKER_HISTORY_AUTO_TOP_UP === undefined) {
	env.REGISTRY_BROKER_HISTORY_AUTO_TOP_UP = config.registryBroker.historyAutoTopUp ? '1' : '0';
}

if (!env.REGISTRY_BROKER_DEMO_PROFILE && config.registryBroker?.profileMode) {
	env.REGISTRY_BROKER_DEMO_PROFILE = config.registryBroker.profileMode;
}

if (!env.REGISTRY_BROKER_DEMO_HEADERS_TIMEOUT_MS && config.registryBroker?.headersTimeoutMs) {
	env.REGISTRY_BROKER_DEMO_HEADERS_TIMEOUT_MS = String(config.registryBroker.headersTimeoutMs);
}

if (!env.REGISTRY_BROKER_DEMO_BODY_TIMEOUT_MS && config.registryBroker?.bodyTimeoutMs) {
	env.REGISTRY_BROKER_DEMO_BODY_TIMEOUT_MS = String(config.registryBroker.bodyTimeoutMs);
}

	if (config.openRouter?.apiKey) {
		env.OPENROUTER_API_KEY = config.openRouter.apiKey;
	}
	if (config.openRouter?.modelId) {
		env.OPENROUTER_MODEL_ID = config.openRouter.modelId;
	}

	for (const [key, value] of Object.entries(config.environments ?? {})) {
		if (value !== undefined) {
			env[key] = value;
		}
	}

	const binCandidates = [
		path.join(sdkRoot, 'node_modules', '.bin'),
		path.join(CLI_ROOT, 'node_modules', '.bin'),
	];

	env.PATH = ensurePathIncludes(env.PATH, binCandidates);

	const required = new Set<string>();
	if (demo?.requiredEnv) {
		for (const key of demo.requiredEnv) {
			required.add(key);
		}
	}
	if (config.registryBroker?.useLedger) {
		required.add('HEDERA_ACCOUNT_ID');
		required.add('HEDERA_PRIVATE_KEY');
	}

	const missing: string[] = [];
	for (const key of required) {
		if (!env[key] || env[key]?.length === 0) {
			missing.push(key);
		}
	}

	return {env, missing};
};
