import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import zod from 'zod';
import {loadConfig} from '../../lib/config.js';
import {loadDemoDefinitions, type DemoDefinition} from '../../lib/demos.js';

export const options = zod
	.object({
		group: zod.string().optional().describe('Filter demos by group prefix'),
		json: zod.boolean().default(false).describe('Print the demo manifest as JSON'),
	});

type Options = zod.infer<typeof options>;

type State =
	| {status: 'loading'}
	| {status: 'ready'; demos: DemoDefinition[]}
	| {status: 'error'; error: Error};

const formatGroup = (demo: DemoDefinition): string => demo.group ?? 'general';

const filterByGroup = (demos: DemoDefinition[], group?: string): DemoDefinition[] => {
	if (!group) {
		return demos;
	}
	return demos.filter(demo => demo.group === group || demo.id.startsWith(`${group}:`));
};

const renderDemo = (demo: DemoDefinition): string => {
	const requirements = demo.requiredEnv?.length ? ` (${demo.requiredEnv.join(', ')})` : '';
	return `${demo.id} – ${demo.label}${requirements}`;
};

type Props = {
	options: Options;
};

export default function List({options: opts}: Props) {
	const [state, setState] = useState<State>({status: 'loading'});

	useEffect(() => {
		(async () => {
			try {
				const config = await loadConfig();
				const {demos} = await loadDemoDefinitions(config);
				setState({status: 'ready', demos: filterByGroup(demos, opts.group)});
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		})();
	}, [opts.group]);

	if (state.status === 'loading') {
		return <Text>Loading demos…</Text>;
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Failed to load demo manifest.</Text>
				<Text>{state.error.message}</Text>
			</Box>
		);
	}

	if (opts.json) {
		const payload = JSON.stringify(state.demos, null, 2);
		return <Text>{payload}</Text>;
	}

	if (state.demos.length === 0) {
		return <Text>No demos matched your filters.</Text>;
	}

	return (
		<Box flexDirection="column">
			{state.demos.map(demo => (
				<Box key={demo.id} flexDirection="column" marginBottom={1}>
					<Text color="cyan">{demo.id}</Text>
					<Text>{demo.label}</Text>
					<Text dimColor>{formatGroup(demo)}</Text>
					{demo.description && <Text>{demo.description}</Text>}
					{demo.requiredEnv && demo.requiredEnv.length > 0 && (
						<Text dimColor>Requires: {demo.requiredEnv.join(', ')}</Text>
					)}
					<Text dimColor>
						Run: standards-cli demo run {demo.id}
					</Text>
				</Box>
			))}
		</Box>
	);
}
