import {Box, Text, useApp} from 'ink';
import {useEffect, useState} from 'react';
import zod from 'zod';
import {loadConfig} from '../../lib/config.js';
import {buildEnvironment} from '../../lib/environment.js';
import {getDemoById, loadDemoDefinitions, type DemoDefinition} from '../../lib/demos.js';
import {describeDemoExecution, runDemo} from '../../lib/runner.js';

export const options = zod
	.object({
		dryRun: zod.boolean().default(false).describe('Print the command without executing it'),
		printEnv: zod.boolean().default(false).describe('Display relevant environment variables before running'),
	});

export const args = zod
	.array(zod.string())
	.min(1, 'Provide the demo identifier to run')
	.describe('Demo identifier followed by optional `--` separator and arguments passed through to the demo script.');

type Options = zod.infer<typeof options>;
type Args = zod.infer<typeof args>;

type State =
	| {status: 'initialising'}
	| {status: 'missing-env'; demo: DemoDefinition; missing: string[]}
	| {status: 'error'; error: Error}
	| {status: 'completed'; exitCode: number};

const formatEnvPreview = (env: NodeJS.ProcessEnv, demo: DemoDefinition): string[] => {
	const keys = new Set<string>([
		'HEDERA_NETWORK',
		'HEDERA_ACCOUNT_ID',
		'HEDERA_PRIVATE_KEY',
		'REGISTRY_BROKER_BASE_URL',
		'REGISTRY_BROKER_API_KEY',
		'OPENROUTER_API_KEY',
		'OPENROUTER_MODEL_ID',
		...(demo.requiredEnv ?? []),
	]);

	return Array.from(keys)
		.filter(Boolean)
		.map(key => {
			const value = env[key];
			if (!value) {
				return `${key}=<unset>`;
			}
			return value.length > 48 ? `${key}=${value.slice(0, 32)}…${value.slice(-4)}` : `${key}=${value}`;
		})
		.sort((a, b) => a.localeCompare(b));
};

type Props = {
	options: Options;
	args: Args;
};

export default function Run({options: opts, args: cliArgs}: Props) {
	const [state, setState] = useState<State>({status: 'initialising'});
	const {exit} = useApp();

	useEffect(() => {
		let cancelled = false;

		(async () => {
			const rawArgs = [...cliArgs];
			let dryRun = opts.dryRun ?? false;
			let printEnv = opts.printEnv ?? false;

			const forwardedArgs: string[] = [];
			let demoId: string | undefined;

			while (rawArgs.length > 0) {
				const token = rawArgs.shift()!;
				if (token === '--') {
					forwardedArgs.push(...rawArgs.splice(0));
					break;
				}
				if (token === '--dry-run') {
					dryRun = true;
					continue;
				}
				if (token === '--print-env') {
					printEnv = true;
					continue;
				}
				if (!demoId) {
					demoId = token;
				} else {
					forwardedArgs.push(token);
				}
			}

			if (!demoId) {
				throw new Error('No demo identifier provided.');
			}
			try {
				const config = await loadConfig();
				const {sdkRoot, demos} = await loadDemoDefinitions(config);
				const demo = getDemoById(demos, demoId);
				if (!demo) {
					throw new Error(
						[
							`Unknown demo "${demoId}".`,
							'Use `standards-cli demo list` to show the available demos.',
						].join(' '),
					);
				}

				const {env, missing} = buildEnvironment(config, {sdkRoot, demo});
				if (missing.length > 0 && !dryRun) {
					if (!cancelled) {
						setState({status: 'missing-env', demo, missing});
					}
					return;
				}

				console.log(`Running ${demo.label}`);
				const commandPreview = describeDemoExecution(demo, forwardedArgs);
				console.log(commandPreview);

				if (missing.length > 0 && dryRun) {
					console.log(
						[
							'Warning: some required environment variables are missing for this demo:',
							missing.map(item => `  - ${item}`).join('\n'),
						].join('\n'),
					);
				}

				if (printEnv) {
					const previewLines = formatEnvPreview(env, demo);
					if (previewLines.length > 0) {
						console.log('\nEnvironment preview:');
						for (const line of previewLines) {
							console.log(`  ${line}`);
						}
					}
				}

				await runDemo(demo, {
					sdkRoot,
					env,
					args: forwardedArgs,
					dryRun,
				});

				if (!cancelled) {
					setState({status: 'completed', exitCode: 0});
				}
				exit();
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				if (!cancelled) {
					setState({
						status: 'error',
						error: err,
					});
				}
				exit(err);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [opts, cliArgs, exit]);

	if (state.status === 'initialising') {
		return <Text>Preparing demo execution…</Text>;
	}

	if (state.status === 'missing-env') {
		return (
			<Box flexDirection="column">
				<Text color="red">Missing required environment variables:</Text>
				{state.missing.map(key => (
					<Text key={key}>• {key}</Text>
				))}
				<Text>
					Update your configuration with{' '}
					<Text color="cyan">standards-cli config --account-id … --private-key …</Text>
				</Text>
			</Box>
		);
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Demo failed to start.</Text>
				<Text>{state.error.message}</Text>
			</Box>
		);
	}

	return <Text color="green">Demo completed successfully.</Text>;
}
