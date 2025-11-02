import {Box, Text, useApp, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {execa} from 'execa';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {renderLogo} from '../lib/logo.js';
import {bundledCloudflaredPath, findSystemCloudflared} from '../lib/cloudflared.js';
import {CONFIG_PATH, loadConfig, redactValue, type StandardsCliConfig} from '../lib/config.js';
import {findSdkRoot} from '../lib/paths.js';
import {loadDemoDefinitions, type DemoDefinition} from '../lib/demos.js';
import {buildEnvironment} from '../lib/environment.js';
import {describeDemoExecution, runDemo} from '../lib/runner.js';

const supportsRawMode = Boolean(
	process.stdin &&
	process.stdin.isTTY &&
	typeof process.stdin.setRawMode === 'function',
);

type ViewState =
	| {status: 'loading'}
	| {status: 'error'; error: Error}
	| {status: 'ready'; config: StandardsCliConfig; sdkRoot: string; demos: DemoDefinition[]};

type MenuAction = 'run-demo' | 'config' | 'agent' | 'exit';
type MenuView = 'menu' | 'category-list' | 'demo-list' | 'demo-detail' | 'demo-run' | 'config' | 'agent';

type DemoRunContext = {
	demo: DemoDefinition;
	env: NodeJS.ProcessEnv;
	dryRun: boolean;
	sdkRoot: string;
	command: string;
};

const formatDemoLabel = (demo: DemoDefinition): string => {
	const groupLabel = demo.group && demo.group !== 'general' ? formatGroupLabel(demo.group) : null;
	const suffix =
		groupLabel && !demo.label.toLowerCase().includes(groupLabel.toLowerCase())
			? ` (${groupLabel})`
			: '';
	return `${demo.label}${suffix}`;
};

const formatGroupLabel = (group: string): string => {
	const lower = group.toLowerCase();
	if (lower === 'general') {
		return 'General';
	}
	if (/^hcs[-_]?\d+$/.test(lower) || /^hcs\d+$/.test(lower)) {
		const digits = lower.replace(/\D+/g, '');
		return digits ? `HCS-${digits}` : 'HCS';
	}
	if (lower === 'registry-broker') {
		return 'Registry Broker';
	}
	if (lower === 'inscriptions') {
		return 'Inscriptions';
	}
	if (lower === 'agent') {
		return 'Agent';
	}
	return group[0].toUpperCase() + group.slice(1);
};

const formatMissing = (missing: string[]): string =>
	missing.length === 0 ? 'None' : missing.join(', ');

export default function Index(): JSX.Element {
	const [state, setState] = useState<ViewState>({status: 'loading'});

	useEffect(() => {
		(async () => {
			try {
				const config = await loadConfig();
				const {sdkRoot, demos} = await loadDemoDefinitions(config);
				setState({status: 'ready', config, sdkRoot, demos});
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		})();
	}, []);

	if (state.status === 'loading') {
		return <Text>Loading standards-sdk CLI…</Text>;
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Failed to initialise the CLI.</Text>
				<Text>{state.error.message}</Text>
				<Text>
					Ensure dependencies are installed with{' '}
					<Text color="cyan">pnpm --dir cli/standards-cli install</Text>.
				</Text>
			</Box>
		);
	}

	if (!supportsRawMode) {
		return (
			<NonInteractiveMessage config={state.config} demos={state.demos} />
		);
	}

	return <Dashboard config={state.config} sdkRoot={state.sdkRoot} demos={state.demos} />;
}

interface NonInteractiveMessageProps {
	config: StandardsCliConfig;
	demos: DemoDefinition[];
}

const NonInteractiveMessage = ({config, demos}: NonInteractiveMessageProps): JSX.Element => {
	const hedera = config.hedera ?? {};

	return (
		<Box flexDirection="column">
			<Text color="yellow">Interactive mode requires running in a TTY-enabled terminal.</Text>
			<Text>
				Run{' '}
				<Text color="cyan">pnpm --dir cli/standards-cli start demo list</Text>{' '}
				to view demos or{' '}
				<Text color="cyan">pnpm run cli -- demo run &lt;demo-id&gt;</Text>{' '}
				to execute directly.
			</Text>
			<Text>
				Config file:{' '}
				<Text color="cyan">{CONFIG_PATH}</Text>
			</Text>
			<Text>
				Current network:{' '}
				<Text color="cyan">{hedera.network ?? 'testnet'}</Text>
			</Text>
			<Text>
				Default account:{' '}
				<Text color="cyan">{redactValue(hedera.defaultAccountId) ?? 'not configured'}</Text>
			</Text>
		<Text>
			Available demos:{' '}
			<Text color="cyan">{demos.length}</Text>
		</Text>
		<Text dimColor>
			Brand assets sourced from hcs-improvement-proposals/static/Logo_Whole.png
		</Text>
		<Text dimColor>
			Open an interactive session by running this command in a standard terminal environment.
		</Text>
		</Box>
	);
};

interface DashboardProps {
	config: StandardsCliConfig;
	sdkRoot: string;
	demos: DemoDefinition[];
}

const Dashboard = ({config, sdkRoot, demos}: DashboardProps): JSX.Element => {
	const {exit} = useApp();
	const [view, setView] = useState<MenuView>('menu');
	const [activeDemo, setActiveDemo] = useState<DemoDefinition | null>(null);
	const [activeCategory, setActiveCategory] = useState<string | null>(null);
	const [runContext, setRunContext] = useState<DemoRunContext | null>(null);

	const handleMenuSelect = useCallback(
		(item: {value: MenuAction}) => {
			switch (item.value) {
				case 'run-demo':
					setView('category-list');
					return;
				case 'config':
					setView('config');
					return;
				case 'agent':
					setView('agent');
					return;
				case 'exit':
					exit();
			}
		},
		[exit],
	);

	return (
		<Box flexDirection="column">
			{view === 'menu' && (
				<MenuView
					demoCount={demos.length}
					config={config}
					onSelect={handleMenuSelect}
				/>
			)}

			{view === 'category-list' && (
				<CategoryListView
					demos={demos}
					onSelectCategory={category => {
						setActiveCategory(category);
						setView('demo-list');
					}}
					onBackToMenu={() => {
						setActiveCategory(null);
						setView('menu');
					}}
				/>
			)}

			{view === 'demo-list' && (
				<DemoListView
					demos={activeCategory ? demos.filter(d => {
						if (activeCategory === 'getting-started') {
							return d.category === 'getting-started';
						}
						if (activeCategory === 'registry-broker') {
							return d.category === 'registry-broker';
						}
						if (activeCategory.startsWith('hcs-')) {
							return d.category === activeCategory || d.group === activeCategory;
						}
						return d.category === activeCategory || d.group === activeCategory;
					}) : demos}
					config={config}
					sdkRoot={sdkRoot}
					categoryName={activeCategory}
					onPickDemo={demo => {
						setActiveDemo(demo);
						const info = buildEnvironment(config, {sdkRoot, demo});
						setRunContext({
							demo,
							env: info.env,
							dryRun: false,
							sdkRoot,
							command: describeDemoExecution(demo, []),
						});
						setView('demo-run');
					}}
					onBackToMenu={() => {
						setActiveDemo(null);
						setView('menu');
					}}
					onBackToCategories={() => {
						setActiveCategory(null);
						setView('category-list');
					}}
				/>
			)}

			{view === 'demo-detail' && activeDemo && (
				<DemoDetailView
					demo={activeDemo}
					config={config}
					sdkRoot={sdkRoot}
					onBackToList={() => setView('demo-list')}
					onBackToMenu={() => {
						setActiveDemo(null);
						setView('menu');
					}}
					onRun={context => {
						setRunContext(context);
						setView('demo-run');
					}}
				/>
			)}

			{view === 'demo-run' && runContext && (
				<DemoRunnerView
					context={runContext}
					onComplete={target => {
						if (target === 'detail') {
							setView('demo-detail');
						} else if (target === 'list') {
							setActiveDemo(null);
							setView('demo-list');
						} else {
							setActiveDemo(null);
							setView('menu');
						}
						setRunContext(null);
					}}
				/>
			)}

			{view === 'config' && (
				<ConfigView
					config={config}
					onBack={() => setView('menu')}
				/>
			)}

			{view === 'agent' && (
				<AgentView
					sdkRoot={sdkRoot}
					onBack={() => setView('menu')}
				/>
			)}
		</Box>
	);
};

interface MenuViewProps {
	demoCount: number;
	config: StandardsCliConfig;
	onSelect: (item: {value: MenuAction}) => void;
}

const MenuView = ({demoCount, config, onSelect}: MenuViewProps): JSX.Element => {
	const items: Array<{label: string; value: MenuAction; key: string}> = useMemo(
		() => [
			{label: 'Run a demo', value: 'run-demo', key: 'run-demo'},
			{label: 'View configuration summary', value: 'config', key: 'config'},
			{label: 'Agent utilities', value: 'agent', key: 'agent'},
			{label: 'Exit', value: 'exit', key: 'exit'},
		],
		[],
	);

	const hedera = config.hedera ?? {};

	return (
		<Box flexDirection="column">
			<Box flexDirection="column" alignItems="center" marginBottom={1}>
				{renderLogo()}
			</Box>
			<Text color="green">Standards SDK CLI</Text>
			<Text>
				Config file:{' '}
				<Text color="cyan">{CONFIG_PATH}</Text>
			</Text>
			<Text>
				Current network:{' '}
				<Text color="cyan">{hedera.network ?? 'testnet'}</Text>
			</Text>
			<Text>
				Default account:{' '}
				<Text color="cyan">{redactValue(hedera.defaultAccountId) ?? 'not configured'}</Text>
			</Text>
			<Text>
				Available demos:{' '}
				<Text color="cyan">{demoCount}</Text>
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text color="yellow">Select an action:</Text>
				<SelectInput items={items} onSelect={onSelect} />
			</Box>
			<Text dimColor>Use arrow keys and Enter. Press Ctrl+C to exit at any time.</Text>
		</Box>
	);
};

interface CategoryListViewProps {
	demos: DemoDefinition[];
	onSelectCategory: (category: string) => void;
	onBackToMenu: () => void;
}

const CategoryListView = ({demos, onSelectCategory, onBackToMenu}: CategoryListViewProps): JSX.Element => {
	const categories = useMemo(() => {
		const categoryMap = new Map<string, {name: string; count: number; emoji: string; priority: number}>();

		categoryMap.set('getting-started', {
			name: '🟢 Getting Started',
			count: 0,
			emoji: '🟢',
			priority: 1,
		});

		demos.forEach(demo => {
			const cat = demo.category || demo.group;
			if (cat === 'getting-started') {
				categoryMap.get('getting-started')!.count++;
			} else if (cat === 'registry-broker') {
				if (!categoryMap.has('registry-broker')) {
					categoryMap.set('registry-broker', {
						name: '🤖 Registry Broker & Agents',
						count: 0,
						emoji: '🤖',
						priority: 3,
					});
				}
				categoryMap.get('registry-broker')!.count++;
			} else if (cat?.startsWith('hcs-')) {
				const hcsNum = cat.match(/hcs-(\d+)/)?.[1];
				if (hcsNum && !categoryMap.has(cat)) {
					categoryMap.set(cat, {
						name: `📚 HCS-${hcsNum} Standard`,
						count: 0,
						emoji: '📚',
						priority: 2,
					});
				}
				if (categoryMap.has(cat)) {
					categoryMap.get(cat)!.count++;
				}
			} else if (cat === 'inscriptions') {
				if (!categoryMap.has('inscriptions')) {
					categoryMap.set('inscriptions', {
						name: '🎨 Inscriptions',
						count: 0,
						emoji: '🎨',
						priority: 2,
					});
				}
				categoryMap.get('inscriptions')!.count++;
			}
		});

		return Array.from(categoryMap.entries())
			.filter(([, data]) => data.count > 0)
			.sort((a, b) => a[1].priority - b[1].priority || a[1].name.localeCompare(b[1].name))
			.map(([id, data]) => ({
				id,
				label: `${data.name} (${data.count} demos)`,
				count: data.count,
			}));
	}, [demos]);

	const items = useMemo(
		() => [
			...categories.map(cat => ({label: cat.label, value: cat.id, key: cat.id})),
			{label: '⬅ Back to main menu', value: '__back', key: '__back'},
		],
		[categories],
	);

	useInput((_, key) => {
		if (key.escape) {
			onBackToMenu();
		}
	});

	return (
		<Box flexDirection="column">
			<Text color="yellow" bold>Choose a category</Text>
			<Box marginTop={1}>
				<Text dimColor>Browse demos organized by topic and difficulty</Text>
			</Box>

			<Box marginTop={1}>
				<SelectInput
					items={items}
					onSelect={item => {
						if (item.value === '__back') {
							onBackToMenu();
							return;
						}
						onSelectCategory(item.value);
					}}
				/>
			</Box>

			<Text dimColor>Press Esc to return to the main menu.</Text>
		</Box>
	);
};

interface DemoListViewProps {
	demos: DemoDefinition[];
	config: StandardsCliConfig;
	sdkRoot: string;
	categoryName: string | null;
	onPickDemo: (demo: DemoDefinition) => void;
	onBackToMenu: () => void;
	onBackToCategories: () => void;
}

const DemoListView = ({demos, config, sdkRoot, categoryName, onPickDemo, onBackToMenu, onBackToCategories}: DemoListViewProps): JSX.Element => {
	const demoMap = useMemo(() => new Map(demos.map(demo => [demo.id, demo])), [demos]);

	const sortedDemos = useMemo(() => {
		return [...demos].sort((a, b) => {
			if (a.category === 'getting-started' && b.category !== 'getting-started') return -1;
			if (a.category !== 'getting-started' && b.category === 'getting-started') return 1;

			const difficultyOrder = {beginner: 0, intermediate: 1, advanced: 2};
			const aDiff = difficultyOrder[a.difficulty ?? 'intermediate'];
			const bDiff = difficultyOrder[b.difficulty ?? 'intermediate'];
			if (aDiff !== bDiff) return aDiff - bDiff;

			return a.label.localeCompare(b.label);
		});
	}, [demos]);

	const items = useMemo<Array<{label: string; value: string; key: string}>>(
		() => [
			...sortedDemos.map(demo => ({label: formatDemoLabel(demo), value: demo.id, key: demo.id})),
			{label: '⬅ Back to categories', value: '__categories', key: '__categories'},
			{label: '⬅ Back to main menu', value: '__back', key: '__back'},
		],
		[sortedDemos],
	);

	const firstDemoId = sortedDemos[0]?.id ?? null;
	const [activeDemoId, setActiveDemoId] = useState<string | null>(firstDemoId);

	useEffect(() => {
		setActiveDemoId(sortedDemos[0]?.id ?? null);
	}, [sortedDemos]);

	useInput((_, key) => {
		if (key.escape) {
			onBackToCategories();
		}
	});

	const preview = useMemo(() => {
		if (!activeDemoId) {
			return null;
		}
		const demo = demoMap.get(activeDemoId);
		if (!demo) {
			return null;
		}
		const {missing} = buildEnvironment(config, {sdkRoot, demo});
		return {
			demo,
			missing,
			command: describeDemoExecution(demo, []),
		};
	}, [activeDemoId, demoMap, config, sdkRoot]);

	const getCategoryDisplayName = (cat: string | null): string => {
		if (!cat) return 'All Demos';
		if (cat === 'getting-started') return 'Getting Started';
		if (cat === 'registry-broker') return 'Registry Broker & Agents';
		if (cat === 'inscriptions') return 'Inscriptions';
		if (cat.startsWith('hcs-')) {
			const num = cat.match(/hcs-(\d+)/)?.[1];
			return num ? `HCS-${num} Standard` : cat;
		}
		return cat;
	};

	return (
		<Box flexDirection="column">
			<Text color="yellow" bold>{getCategoryDisplayName(categoryName)}</Text>
			<Box marginTop={1}>
				<Text dimColor>🟢 = Beginner  🟡 = Intermediate  🔴 = Advanced</Text>
			</Box>

			{preview ? (
				<Box flexDirection="column" marginBottom={1} marginTop={1}>
					<Text color="cyan">{preview.demo.label}</Text>

					{preview.demo.difficulty && (
						<Box>
							<Text dimColor>Difficulty: </Text>
							<Text color={preview.demo.difficulty === 'beginner' ? 'green' : preview.demo.difficulty === 'intermediate' ? 'yellow' : 'red'}>
								{preview.demo.difficulty.charAt(0).toUpperCase() + preview.demo.difficulty.slice(1)}
							</Text>
							{preview.demo.estimatedDuration && (
								<Text dimColor> • {preview.demo.estimatedDuration}</Text>
							)}
						</Box>
					)}

					{preview.demo.description && <Text>{preview.demo.description}</Text>}

					{preview.demo.requiredEnv && preview.demo.requiredEnv.length > 0 && (
						<Text color={preview.missing.length ? 'red' : 'green'}>
							Environment: {preview.missing.length ? `Missing ${preview.missing.length} vars` : 'Ready ✓'}
						</Text>
					)}
				</Box>
			) : (
				<Text dimColor>Select a demo to see details.</Text>
			)}

			<SelectInput
				items={items}
				onHighlight={item => {
					if (item.value === '__back' || item.value === '__categories') {
						setActiveDemoId(null);
						return;
					}
					setActiveDemoId(item.value);
				}}
				onSelect={item => {
					if (item.value === '__back') {
						onBackToMenu();
						return;
					}
					if (item.value === '__categories') {
						onBackToCategories();
						return;
					}
					const demo = demoMap.get(item.value);
					if (demo) {
						onPickDemo(demo);
					}
				}}
			/>
			<Text dimColor>Press Esc to return to categories. {sortedDemos.length} demos in this category.</Text>
		</Box>
	);
};

interface DemoDetailViewProps {
	demo: DemoDefinition;
	config: StandardsCliConfig;
	sdkRoot: string;
	onBackToList: () => void;
	onBackToMenu: () => void;
	onRun: (context: DemoRunContext) => void;
}

const DemoDetailView = ({demo, config, sdkRoot, onBackToList, onBackToMenu, onRun}: DemoDetailViewProps): JSX.Element => {
	const preview = useMemo(() => {
		const info = buildEnvironment(config, {sdkRoot, demo});
		return {
			env: info.env,
			missing: info.missing,
			command: describeDemoExecution(demo, []),
		};
	}, [config, sdkRoot, demo]);

	const [feedback, setFeedback] = useState<string | null>(null);

	useEffect(() => {
		setFeedback(null);
	}, [demo]);

	useInput((_, key) => {
		if (key.escape) {
			onBackToList();
		}
	});

	const items: Array<{label: string; value: 'run' | 'dry-run' | 'back-list' | 'back-menu'; key: string}> = useMemo(
		() => [
			{
				label: preview.missing.length ? 'Run demo (unavailable – missing env)' : 'Run demo',
				value: 'run',
				key: 'run',
			},
			{label: 'Dry run demo', value: 'dry-run', key: 'dry-run'},
			{label: 'Back to demo list', value: 'back-list', key: 'back-list'},
			{label: 'Back to main menu', value: 'back-menu', key: 'back-menu'},
		],
		[preview.missing.length],
	);

	return (
		<Box flexDirection="column">
			<Text color="cyan" bold>{demo.label}</Text>

			{demo.difficulty && (
				<Box marginTop={1}>
					<Text dimColor>Difficulty: </Text>
					<Text color={demo.difficulty === 'beginner' ? 'green' : demo.difficulty === 'intermediate' ? 'yellow' : 'red'}>
						{demo.difficulty.charAt(0).toUpperCase() + demo.difficulty.slice(1)}
					</Text>
					{demo.estimatedDuration && (
						<Text dimColor> • Duration: {demo.estimatedDuration}</Text>
					)}
				</Box>
			)}

			{demo.description && <Box marginTop={1}><Text>{demo.description}</Text></Box>}

			{demo.learningObjectives && demo.learningObjectives.length > 0 && (
				<Box marginTop={1} flexDirection="column">
					<Text color="yellow">What you'll learn:</Text>
					{demo.learningObjectives.map((objective, idx) => (
						<Text key={idx}>  • {objective}</Text>
					))}
				</Box>
			)}

			{demo.prerequisites && demo.prerequisites.length > 0 && (
				<Box marginTop={1}>
					<Text color="yellow">Prerequisites:</Text>
					<Text> {demo.prerequisites.join(', ')}</Text>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>Command: {preview.command}</Text>
			</Box>

			{demo.requiredEnv && demo.requiredEnv.length > 0 && (
				<Box marginTop={1} flexDirection="column">
					<Text color={preview.missing.length ? 'red' : 'green'}>
						Environment Variables: {preview.missing.length ? `Missing ${preview.missing.length} of ${demo.requiredEnv.length}` : 'All configured ✓'}
					</Text>
					{preview.missing.length > 0 && (
						<Box flexDirection="column" marginLeft={2}>
							<Text dimColor>Missing:</Text>
							{preview.missing.map((envVar, idx) => (
								<Text key={idx} dimColor>  • {envVar}</Text>
							))}
							<Box marginTop={1}>
								<Text dimColor>
									Tip: Set these in your .env file or configure via the CLI config command
								</Text>
							</Box>
						</Box>
					)}
				</Box>
			)}

			{feedback && <Box marginTop={1}><Text color="red">{feedback}</Text></Box>}

			<Box marginTop={1}>
				<SelectInput
					items={items}
					onSelect={item => {
						switch (item.value) {
							case 'run':
								if (preview.missing.length) {
									setFeedback(`Provide ${preview.missing.join(', ')} to run this demo.`);
									return;
								}
								onRun({demo, env: preview.env, dryRun: false, sdkRoot, command: preview.command});
								return;
							case 'dry-run':
								onRun({demo, env: preview.env, dryRun: true, sdkRoot, command: preview.command});
								return;
							case 'back-list':
								onBackToList();
								return;
							case 'back-menu':
								onBackToMenu();
								return;
						}
					}}
				/>
			</Box>
			<Text dimColor>Press Esc to return to the demo list.</Text>
		</Box>
	);
};

interface DemoRunnerViewProps {
	context: DemoRunContext;
	onComplete: (target: 'detail' | 'list' | 'menu') => void;
}

const DemoRunnerView = ({context, onComplete}: DemoRunnerViewProps): JSX.Element => {
	const [status, setStatus] = useState<'ready' | 'running' | 'success' | 'error'>('ready');
	const [error, setError] = useState<Error | null>(null);
	const [dryRunMode, setDryRunMode] = useState(context.dryRun);

	const startDemo = useCallback(async () => {
		setStatus('running');
		try {
			await runDemo(context.demo, {
				sdkRoot: context.sdkRoot,
				env: context.env,
				args: [],
				dryRun: dryRunMode,
			});
			setStatus('success');
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
			setStatus('error');
		}
	}, [context, dryRunMode]);

	useInput((input, key) => {
		// Completely disable input processing when demo is running
		if (status === 'running') return;

		if (status === 'ready') {
			if (key.return) {
				startDemo();
			} else if (key.escape) {
				onComplete('list');
			} else if (input === 'd' || input === 'D') {
				setDryRunMode(prev => !prev);
			}
		} else if (key.escape) {
			onComplete('list');
		}
	}, [status]);

	if (status === 'ready') {
		return (
			<Box flexDirection="column">
				<Text color="cyan" bold>Ready to run: {context.demo.label}</Text>
				<Box marginTop={1} flexDirection="column">
					<Text dimColor>{'─'.repeat(60)}</Text>
				</Box>

				{context.demo.description && (
					<Box marginTop={1}>
						<Text>{context.demo.description}</Text>
					</Box>
				)}

				{context.demo.learningObjectives && context.demo.learningObjectives.length > 0 && (
					<Box marginTop={1} flexDirection="column">
						<Text color="yellow">You'll learn:</Text>
						{context.demo.learningObjectives.slice(0, 3).map((obj, idx) => (
							<Text key={idx} dimColor>  • {obj}</Text>
						))}
					</Box>
				)}

				<Box marginTop={1} flexDirection="column">
					<Text color="yellow">🎯 What will happen:</Text>
					<Text dimColor>  1. The demo will execute: {context.command}</Text>
					<Text dimColor>  2. You'll see prompts for configuration options</Text>
					<Text dimColor>  3. Press ENTER on any prompt to use the default value</Text>
					<Text dimColor>  4. Results will appear below once processing completes</Text>
					<Text dimColor>  5. Press Ctrl+C anytime to abort</Text>
				</Box>

				{context.demo.estimatedDuration && (
					<Box marginTop={1}>
						<Text dimColor>⏱  Estimated time: {context.demo.estimatedDuration}</Text>
					</Box>
				)}

				<Box marginTop={1}>
					<Text dimColor>Mode: </Text>
					<Text color={dryRunMode ? 'yellow' : 'green'}>
						{dryRunMode ? 'Dry Run (simulation only)' : 'Live Run (real execution)'}
					</Text>
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>{'─'.repeat(60)}</Text>
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text color="green" bold>Press ENTER to start</Text>
					<Text dimColor>Press D to toggle dry-run mode</Text>
					<Text dimColor>Press Esc to go back to demo list</Text>
				</Box>
			</Box>
		);
	}

	if (status === 'running') {
		return (
			<Box flexDirection="column">
				<Text color="cyan" bold>▶ {dryRunMode ? 'Dry Running' : 'Running'}: {context.demo.label}</Text>
				<Box marginTop={1}>
					<Text dimColor>{'═'.repeat(60)}</Text>
				</Box>
				<Box marginTop={1} flexDirection="column">
					<Text color="yellow" bold>🎯 Demo is now executing</Text>
					<Text dimColor>• Answer the prompts below</Text>
					<Text dimColor>• Press ENTER to use default values shown in [brackets]</Text>
					<Text dimColor>• Press Ctrl+C anytime to abort</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>{'─'.repeat(60)}</Text>
				</Box>
			</Box>
		);
	}

	const items: Array<{label: string; value: 'detail' | 'list' | 'menu'; key: string}> = [
		{label: 'Run another demo', value: 'list', key: 'list'},
		{label: 'Back to main menu', value: 'menu', key: 'menu'},
	];

	return (
		<Box flexDirection="column">
			<Box marginTop={2}>
				<Text dimColor>{'═'.repeat(60)}</Text>
			</Box>

			{status === 'success' ? (
				<Box marginTop={1} flexDirection="column">
					<Text color="green" bold>✓ {dryRunMode ? 'Dry run completed successfully!' : 'Demo completed successfully!'}</Text>
					<Box marginTop={1}>
						<Text dimColor>{context.demo.label}</Text>
					</Box>
					{context.demo.exampleOutput && !dryRunMode && (
						<Box marginTop={1} flexDirection="column">
							<Text color="yellow">Example output format:</Text>
							<Text dimColor>{context.demo.exampleOutput}</Text>
						</Box>
					)}
				</Box>
			) : (
				<Box marginTop={1} flexDirection="column">
					<Text color="red" bold>✗ Demo failed</Text>
					<Box marginTop={1}>
						<Text color="red">{error?.message ?? 'Unknown error'}</Text>
					</Box>
					<Box marginTop={1}>
						<Text dimColor>Tip: Check that all environment variables are set correctly</Text>
					</Box>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>{'─'.repeat(60)}</Text>
			</Box>

			<Box marginTop={1}>
				<Text color="yellow">What next?</Text>
			</Box>
			<SelectInput
				items={items}
				onSelect={item => {
					onComplete(item.value);
				}}
			/>
			<Text dimColor>Press Esc to go back to demo list.</Text>
		</Box>
	);
};

interface ConfigViewProps {
	config: StandardsCliConfig;
	onBack: () => void;
}

const ConfigView = ({config, onBack}: ConfigViewProps): JSX.Element => {
	const hedera = config.hedera ?? {};

	useInput((_, key) => {
		if (key.escape) {
			onBack();
		}
	});

	const items = [{label: '⬅ Back to main menu', value: 'back', key: 'back'}];

	return (
		<Box flexDirection="column">
			<Text color="yellow">Configuration summary</Text>
			<Text>
				Config file:{' '}
				<Text color="cyan">{CONFIG_PATH}</Text>
			</Text>
			<Text>
				Network:{' '}
				<Text color="cyan">{hedera.network ?? 'testnet'}</Text>
			</Text>
			<Text>
				Default account:{' '}
				<Text color="cyan">{redactValue(hedera.defaultAccountId) ?? 'not configured'}</Text>
			</Text>
			<Text>
				Default key:{' '}
				<Text color="cyan">{redactValue(hedera.defaultPrivateKey) ?? 'not configured'}</Text>
			</Text>
			<Text>
				Registry broker base URL:{' '}
				<Text color="cyan">{config.registryBroker?.baseUrl ?? 'not configured'}</Text>
			</Text>
			<Text>
				Registry broker API key:{' '}
				<Text color="cyan">{redactValue(config.registryBroker?.apiKey) ?? 'not configured'}</Text>
			</Text>
	<Box marginTop={1}>
		<Text dimColor>
			Update values with{' '}
			<Text color="cyan">pnpm run cli -- config --account-id &lt;...&gt;</Text>
		</Text>
	</Box>
	<Box marginTop={1}>
				<SelectInput
					items={items}
					onSelect={() => onBack()}
				/>
			</Box>
			<Text dimColor>Press Esc to return to the menu.</Text>
		</Box>
	);
};

interface AgentViewProps {
	sdkRoot: string;
	onBack: () => void;
}

const AgentView = ({sdkRoot, onBack}: AgentViewProps): JSX.Element => {
	const cliDir = join(sdkRoot, 'cli/standards-cli');
	const tsxExecutable = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
	const tsxPath = join(cliDir, 'node_modules', '.bin', tsxExecutable);
	const [status, setStatus] = useState<'idle' | 'running'>('idle');
	const [lastOutcome, setLastOutcome] = useState<'success' | 'error' | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [binaryPath, setBinaryPath] = useState<string | null>(() => {
		const envPath = process.env.CLOUDFLARED_BIN?.trim();
		if (envPath) {
			return envPath;
		}
		if (existsSync(bundledCloudflaredPath)) {
			return bundledCloudflaredPath;
		}
		return null;
	});

	useEffect(() => {
		if (binaryPath) {
			return;
		}
		let active = true;
		(async () => {
			const systemBinary = await findSystemCloudflared();
			if (!active || !systemBinary) {
				return;
			}
			setBinaryPath(systemBinary);
			process.env.CLOUDFLARED_BIN = systemBinary;
		})();
		return () => {
			active = false;
		};
	}, [binaryPath]);

	const runAgentCommand = useCallback(
		async (args: string[]) => {
			if (!existsSync(tsxPath)) {
				setLastOutcome('error');
				setMessage('CLI dependencies missing. Run pnpm run cli:install first.');
				return;
			}

			setStatus('running');
			try {
				const child = execa(tsxPath, ['src/cli.ts', 'agent', ...args], {
					cwd: cliDir,
					stdout: 'pipe',
					stderr: 'pipe',
				});
				let detectedBinary: string | null = null;
				child.stdout?.on('data', chunk => {
					const text = chunk.toString();
					const match = text.match(/Binary path:\s*(.*)\s*$/m);
					if (match) {
						detectedBinary = match[1].trim();
					}
					process.stdout.write(text);
				});
				child.stderr?.on('data', chunk => {
					process.stderr.write(chunk);
				});
				await child;
				if (detectedBinary) {
					setBinaryPath(detectedBinary);
					process.env.CLOUDFLARED_BIN = detectedBinary;
				}
				setLastOutcome('success');
				setMessage(`Command "agent ${args.join(' ')}" completed.`);
			} catch (error) {
				setLastOutcome('error');
				setMessage(
					error instanceof Error
						? error.message
						: `Command failed: ${String(error)}`,
				);
			} finally {
				setStatus('idle');
			}
		},
		[cliDir, tsxPath],
	);

	useInput((_, key) => {
		if (status === 'idle' && key.escape) {
			onBack();
		}
	});

	if (status === 'running') {
		return (
			<Box flexDirection="column">
				<Text color="cyan">Running agent command…</Text>
				<Text dimColor>Output streams above. Press Ctrl+C to abort.</Text>
			</Box>
		);
	}

	const items: Array<{label: string; value: string[] | '__back'; key: string}> = [
		{label: 'Check cloudflared binary', value: ['check'], key: 'check'},
		{label: 'Install/update cloudflared binary', value: ['check', '--install'], key: 'install'},
		{label: 'Dry run tunnel on port 8787', value: ['tunnel', '--dry-run', '--port', '8787'], key: 'tunnel-dry-run'},
		{label: '⬅ Back to main menu', value: '__back', key: '__back'},
	];

	return (
		<Box flexDirection="column">
			<Text color="yellow">Agent utilities</Text>
			<Text>
				Run quick helpers for agent tooling. Commands execute within the CLI workspace using the bundled
				cloudflared binary when available.
			</Text>
			{binaryPath && (
				<Text>
					Detected binary:{' '}
					<Text color="cyan">{binaryPath}</Text>
				</Text>
			)}
			{message && (
				<Text color={lastOutcome === 'error' ? 'red' : 'green'}>{message}</Text>
			)}
			<SelectInput
				items={items}
				onSelect={item => {
					if (item.value === '__back') {
						onBack();
						return;
					}
					runAgentCommand(item.value);
				}}
			/>
			<Text dimColor>Press Esc to return to the main menu.</Text>
		</Box>
	);
};
