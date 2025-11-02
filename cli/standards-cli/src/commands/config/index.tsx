import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import zod from 'zod';
import {loadConfig, resetConfig, saveConfig, type StandardsCliConfig} from '../../lib/config.js';

const networkSchema = zod.enum(['mainnet', 'testnet', 'previewnet']).describe('Set default Hedera network');

export const options = zod
	.object({
		show: zod.boolean().default(true).describe('Display configuration after updates'),
		reset: zod.boolean().default(false).describe('Reset configuration to defaults'),
		network: networkSchema.optional(),
		accountId: zod.string().optional().describe('Set the default Hedera account ID'),
		privateKey: zod.string().optional().describe('Set the default Hedera private key'),
		testnetAccountId: zod.string().optional().describe('Override testnet account ID'),
		testnetPrivateKey: zod.string().optional().describe('Override testnet private key'),
		mainnetAccountId: zod.string().optional().describe('Override mainnet account ID'),
		mainnetPrivateKey: zod.string().optional().describe('Override mainnet private key'),
		previewnetAccountId: zod.string().optional().describe('Override previewnet account ID'),
		previewnetPrivateKey: zod.string().optional().describe('Override previewnet private key'),
		registryBaseUrl: zod.string().optional().describe('Registry broker base URL'),
		registryApiKey: zod.string().optional().describe('Registry broker API key'),
		useLedger: zod.boolean().optional().describe('Enable ledger authentication for registry broker demos'),
		autoTopUp: zod.boolean().optional().describe('Enable registry broker registration auto top-up'),
		historyAutoTopUp: zod.boolean().optional().describe('Enable registry broker history auto top-up'),
		headersTimeout: zod.coerce.number().optional().describe('Registry broker headers timeout (ms)'),
		bodyTimeout: zod.coerce.number().optional().describe('Registry broker body timeout (ms)'),
		profileMode: zod.enum(['ai', 'mcp']).optional().describe('Default registry broker demo profile mode'),
		openRouterApiKey: zod.string().optional().describe('OpenRouter API key'),
		openRouterModelId: zod.string().optional().describe('OpenRouter model identifier'),
		sdkRoot: zod.string().optional().describe('Override the standards-sdk repository root path'),
		preferCloudflared: zod.boolean().optional().describe('Prefer Cloudflare tunnels for agent demos'),
		fallbackLocalTunnel: zod.boolean().optional().describe('Allow localtunnel fallback when Cloudflare is unavailable'),
		agentPort: zod.coerce.number().optional().describe('Default local agent port'),
		env: zod
			.array(zod.string())
			.optional()
			.describe('Additional environment variables to set (KEY=VALUE). Repeatable'),
		unsetEnv: zod
			.array(zod.string())
			.optional()
			.describe('Environment variable keys to remove from configuration'),
	})
	.passthrough();

type Options = zod.infer<typeof options>;

type State =
	| {status: 'processing'}
	| {status: 'ready'; config: StandardsCliConfig; message: string}
	| {status: 'error'; error: Error};

const parseKeyValue = (entry: string): [string, string] | undefined => {
	const index = entry.indexOf('=');
	if (index === -1) {
		return undefined;
	}
	const key = entry.slice(0, index).trim();
	const value = entry.slice(index + 1).trim();
	if (!key) {
		return undefined;
	}
	return [key, value];
};

const applyUpdates = (config: StandardsCliConfig, opts: Options): StandardsCliConfig => {
	const draft: StandardsCliConfig = structuredClone(config);
	draft.hedera ??= {};
	draft.registryBroker ??= {};
	draft.openRouter ??= {};
	draft.environments ??= {};
	draft.agent ??= {};

	if (opts.sdkRoot) {
		draft.sdkRoot = opts.sdkRoot;
	}

	if (opts.network) {
		draft.hedera.network = opts.network;
	}
	if (opts.accountId) {
		draft.hedera.defaultAccountId = opts.accountId;
	}
	if (opts.privateKey) {
		draft.hedera.defaultPrivateKey = opts.privateKey;
	}
	if (opts.testnetAccountId) {
		draft.hedera.testnet ??= {};
		draft.hedera.testnet.accountId = opts.testnetAccountId;
	}
	if (opts.testnetPrivateKey) {
		draft.hedera.testnet ??= {};
		draft.hedera.testnet.privateKey = opts.testnetPrivateKey;
	}
	if (opts.mainnetAccountId) {
		draft.hedera.mainnet ??= {};
		draft.hedera.mainnet.accountId = opts.mainnetAccountId;
	}
	if (opts.mainnetPrivateKey) {
		draft.hedera.mainnet ??= {};
		draft.hedera.mainnet.privateKey = opts.mainnetPrivateKey;
	}
	if (opts.previewnetAccountId) {
		draft.hedera.previewnet ??= {};
		draft.hedera.previewnet.accountId = opts.previewnetAccountId;
	}
	if (opts.previewnetPrivateKey) {
		draft.hedera.previewnet ??= {};
		draft.hedera.previewnet.privateKey = opts.previewnetPrivateKey;
	}

	if (opts.registryBaseUrl) {
		draft.registryBroker.baseUrl = opts.registryBaseUrl;
	}
	if (opts.registryApiKey) {
		draft.registryBroker.apiKey = opts.registryApiKey;
	}
	if (opts.useLedger !== undefined) {
		draft.registryBroker.useLedger = opts.useLedger;
	}
	if (opts.autoTopUp !== undefined) {
		draft.registryBroker.autoTopUp = opts.autoTopUp;
	}
	if (opts.historyAutoTopUp !== undefined) {
		draft.registryBroker.historyAutoTopUp = opts.historyAutoTopUp;
	}
	if (opts.headersTimeout !== undefined) {
		draft.registryBroker.headersTimeoutMs = opts.headersTimeout;
	}
	if (opts.bodyTimeout !== undefined) {
		draft.registryBroker.bodyTimeoutMs = opts.bodyTimeout;
	}
	if (opts.profileMode) {
		draft.registryBroker.profileMode = opts.profileMode;
	}

	if (opts.openRouterApiKey) {
		draft.openRouter.apiKey = opts.openRouterApiKey;
	}
	if (opts.openRouterModelId) {
		draft.openRouter.modelId = opts.openRouterModelId;
	}

	if (opts.preferCloudflared !== undefined) {
		draft.agent.preferCloudflared = opts.preferCloudflared;
	}
	if (opts.fallbackLocalTunnel !== undefined) {
		draft.agent.fallbackToLocalTunnel = opts.fallbackLocalTunnel;
	}
	if (opts.agentPort !== undefined) {
		draft.agent.defaultPort = opts.agentPort;
	}

	if (opts.env) {
		for (const entry of opts.env) {
			const result = parseKeyValue(entry);
			if (result) {
				const [key, value] = result;
				draft.environments[key] = value;
			}
		}
	}

	if (opts.unsetEnv) {
		for (const key of opts.unsetEnv) {
			delete draft.environments[key];
		}
	}

	return draft;
};

type Props = {
	options: Options;
};

const summarise = (config: StandardsCliConfig): string[] => {
	const parts: string[] = [];
	const hedera = config.hedera ?? {};
	if (hedera.network) {
		parts.push(`Hedera network: ${hedera.network}`);
	}
	if (hedera.defaultAccountId) {
		parts.push(`Default account: ${hedera.defaultAccountId}`);
	}
	if (hedera.defaultPrivateKey) {
		parts.push(`Default private key: ${hedera.defaultPrivateKey.slice(0, 10)}…`);
	}
	if (config.registryBroker?.baseUrl) {
		parts.push(`Registry broker: ${config.registryBroker.baseUrl}`);
	}
	if (config.openRouter?.apiKey) {
		parts.push('OpenRouter API key configured');
	}
	return parts.length ? parts : ['No configuration overrides set yet.'];
};

export default function Config({options: opts}: Props) {
	const [state, setState] = useState<State>({status: 'processing'});

	useEffect(() => {
		(async () => {
			try {
				if (opts.reset) {
					const config = await resetConfig();
					setState({
						status: 'ready',
						config,
						message: 'Configuration reset to defaults.',
					});
					return;
				}

				const config = await loadConfig();
				const updated = applyUpdates(config, opts);
				await saveConfig(updated);

				setState({
					status: 'ready',
					config: updated,
					message: 'Configuration updated.',
				});
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		})();
	}, [opts]);

	if (state.status === 'processing') {
		return <Text>Updating configuration…</Text>;
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Unable to update configuration.</Text>
				<Text>{state.error.message}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="green">{state.message}</Text>
			{opts.show &&
				summarise(state.config).map((line, index) => (
					<Text key={index}>
						• {line}
					</Text>
				))}
		</Box>
	);
}
