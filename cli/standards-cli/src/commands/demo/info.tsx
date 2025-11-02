import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import zod from 'zod';
import {loadConfig} from '../../lib/config.js';
import {getDemoById, loadDemoDefinitions, type DemoDefinition} from '../../lib/demos.js';
import {describeDemoExecution} from '../../lib/runner.js';

export const args = zod.tuple([
	zod
		.string()
		.describe(
			'Demo identifier (as shown in `standards-cli demo list`). Colons separate nested groups, e.g. `hcs-10:index`.',
		),
]);

type Args = zod.infer<typeof args>;

type State =
	| {status: 'loading'}
	| {status: 'ready'; demo: DemoDefinition}
	| {status: 'error'; error: Error};

type Props = {
	args: Args;
};

export default function Info({args: [demoId]}: Props) {
	const [state, setState] = useState<State>({status: 'loading'});

	useEffect(() => {
		(async () => {
			try {
				const config = await loadConfig();
				const {sdkRoot, demos} = await loadDemoDefinitions(config);
				const demo = getDemoById(demos, demoId);
				if (!demo) {
					throw new Error(
						[
							`Unknown demo "${demoId}".`,
							'Run `standards-cli demo list` to inspect available demos.',
						].join(' '),
					);
				}
				setState({status: 'ready', demo: demo});
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		})();
	}, [demoId]);

	if (state.status === 'loading') {
		return <Text>Loading demo manifest…</Text>;
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Unable to load demo metadata.</Text>
				<Text>{state.error.message}</Text>
			</Box>
		);
	}

	const {demo} = state;
	const requirements = demo.requiredEnv?.length ? demo.requiredEnv.join(', ') : 'None';
	const command = describeDemoExecution(demo, []);

	return (
		<Box flexDirection="column">
			<Text color="cyan">{demo.id}</Text>
			<Text>{demo.label}</Text>
			{demo.description && <Text>{demo.description}</Text>}
			<Text>
				Group: <Text color="yellow">{demo.group}</Text>
			</Text>
			<Text>
				Runner: <Text color="green">{demo.runner.kind}</Text>
			</Text>
			{demo.relativePath && (
				<Text>
					Entry: <Text color="green">{demo.relativePath}</Text>
				</Text>
			)}
			<Text>
				Required environment: <Text color="magenta">{requirements}</Text>
			</Text>
			<Text>
				Command: <Text color="green">{command}</Text>
			</Text>
			<Text dimColor>Run with: standards-cli demo run {demo.id}</Text>
		</Box>
	);
}
