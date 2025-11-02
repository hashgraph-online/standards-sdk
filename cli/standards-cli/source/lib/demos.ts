import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import type {StandardsCliConfig} from './config.js';
import {findSdkRoot} from './paths.js';

export type DemoRunner =
	| {kind: 'package-script'; script: string}
	| {kind: 'typescript'; entry: string}
	| {kind: 'shell'; command: string};

export type DemoDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface DemoMetadata {
	description?: string;
	requiredEnv?: string[];
	tags?: string[];
	category?: string;
	label?: string;
	difficulty?: DemoDifficulty;
	prerequisites?: string[];
	estimatedDuration?: string;
	learningObjectives?: string[];
	exampleOutput?: string;
}

export interface DemoDefinition extends DemoMetadata {
	id: string;
	label: string;
	group: string;
	relativePath?: string;
	runner: DemoRunner;
	fromPackageScript?: boolean;
}

const HINTS: Record<string, DemoMetadata> = {
	'connection-manager': {
		label: 'HCS-10 Connection Manager',
		category: 'hcs-10',
	},
	'fee': {
		label: 'HCS-10 Fee Mechanics',
		category: 'hcs-10',
	},
	'hcs-10': {
		label: 'HCS-10 End-to-End Demo',
		category: 'hcs-10',
	},
	'hcs-10:create-registry': {
		label: '🟡 HCS-10 Create Registry',
		category: 'hcs-10',
		difficulty: 'intermediate',
		estimatedDuration: '3-4 minutes',
		prerequisites: ['hcs-2:create'],
		learningObjectives: [
			'Create an agent-to-agent communication registry',
			'Understand HCS-10 protocol structure',
			'Set up a registry for agent interactions',
		],
		description: 'Create an HCS-10 registry for agent-to-agent communication protocols.',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
	},
	'hcs-10:test-create-method': {
		label: 'HCS-10 Test Create Method',
		category: 'hcs-10',
	},
	'hcs-10:registry-broker-hcs10-chat': {
		description: 'Runs the HCS-10 chat bootstrap using the registry broker API.',
		requiredEnv: ['REGISTRY_BROKER_BASE_URL', 'HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'registry-broker',
		label: 'Registry Broker HCS-10 Chat',
	},
	'hcs-12': {
		label: 'HCS-12 Overview',
		category: 'hcs-12',
	},
	'hcs-12:builder-demo': {
		label: 'HCS-12 Builder Demo',
		category: 'hcs-12',
	},
	'hcs-12:cli-demo': {
		label: 'HCS-12 CLI Demo',
		category: 'hcs-12',
	},
	'hcs-11:profile': {
		label: 'HCS-11 Profile Inscriptions',
		category: 'hcs-11',
	},
	'hcs-11:resolve-uaid': {
		label: 'HCS-11 Resolve UAID',
		category: 'hcs-11',
	},
	'hcs12': {
		label: 'HCS-12 Web Demo',
		category: 'hcs-12',
	},
	'hcs-5': {
		label: '🟢 HCS-5 Mint Hashinal',
		category: 'getting-started',
		difficulty: 'beginner',
		estimatedDuration: '2-3 minutes',
		learningObjectives: [
			'Understand NFT inscriptions on Hedera',
			'Mint your first Hashinal (on-chain NFT)',
			'See how data is stored on HCS topics',
		],
		description: 'Mint an NFT inscription (Hashinal) directly to the Hedera network. Great for learning about on-chain assets!',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		exampleOutput: `✅ Hashinal minted successfully!
Inscription Topic ID: 0.0.123456
Type: Image/PNG
View: https://kiloscribe.com/inscription/0.0.123456`,
	},
	'hcs-6': {
		label: 'HCS-6 Dynamic Hashinal Demo',
		category: 'hcs-6',
	},
	'hcs-6:create-registry': {
		label: '🟢 HCS-6 Create Registry',
		category: 'getting-started',
		difficulty: 'beginner',
		estimatedDuration: '2 minutes',
		learningObjectives: [
			'Create a dynamic Hashinal registry',
			'Understand HCS-6 metadata structure',
			'Learn how registries manage collections',
		],
		description: 'Create an HCS-6 registry for managing dynamic Hashinals and collections.',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		prerequisites: ['hcs-5'],
	},
	'hcs-6:mint': {
		label: 'HCS-6 Mint Hashinal',
		category: 'hcs-6',
	},
	'hcs-6:query-registry': {
		label: 'HCS-6 Query Registry',
		category: 'hcs-6',
	},
	'hcs-6:browser': {
		description: 'Launches the HCS-6 web demo (requires browser, runs Vite dev server).',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'hcs-6',
		label: 'HCS-6 Browser Demo',
	},
	'hcs-7:create': {
		label: 'HCS-7 Topic Creation',
		category: 'hcs-7',
	},
	'hcs-15': {
		label: 'HCS-15 Petal Accounts',
		category: 'hcs-15',
	},
	'hcs-16': {
		label: 'HCS-16 Flora Builder',
		category: 'hcs-16',
	},
	'hcs-16:create-flora': {
		label: 'HCS-16 Create Flora',
		category: 'hcs-16',
	},
	'hcs-16:flora-e2e-demo': {
		label: 'HCS-16 Flora E2E Demo',
		category: 'hcs-16',
	},
	'hcs-17': {
		label: 'HCS-17 State Hash Demo',
		category: 'hcs-17',
	},
	'hcs-18:flora-discovery-demo': {
		label: 'HCS-18 Flora Discovery',
		category: 'hcs-18',
	},
	'hcs-2:create': {
		label: '🟢 HCS-2 Create Registry',
		category: 'getting-started',
		difficulty: 'beginner',
		estimatedDuration: '1-2 minutes',
		learningObjectives: [
			'Understand what a registry is on Hedera',
			'Create your first HCS topic',
			'Submit your first transaction to Hedera testnet',
		],
		description: 'Create a simple topic-based registry on Hedera. Perfect first demo for newcomers!',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		exampleOutput: `✅ Registry created successfully!
Topic ID: 0.0.123456
Registry Type: HCS-2 (Simple Topic Registry)
View on HashScan: https://hashscan.io/testnet/topic/0.0.123456`,
	},
	'hcs-20:deploy-and-mint': {
		label: 'HCS-20 Deploy and Mint',
		category: 'hcs-20',
	},
	'hcs-20:deploy-points': {
		label: 'HCS-20 Deploy Points',
		category: 'hcs-20',
	},
	'hcs-20:mint-transfer-burn': {
		label: 'HCS-20 Mint/Transfer/Burn',
		category: 'hcs-20',
	},
	'inscribe': {
		description: 'Demonstrates inscription flow for multiple content types.',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'inscriptions',
		label: 'Inscribe Demo',
	},
	'inscription-quote-demo': {
		description: 'Shows inscription quoting workflow with the inscription service.',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'inscriptions',
		label: 'Inscription Quote Demo',
	},
	'inscribe-profile-with-uaid': {
		description: 'Inscribe profile and UAID using HCS-11 flows.',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'hcs-11',
	},
	'registry-broker:openrouter-chat': {
		description: 'Creates a registry broker chat session that forwards to OpenRouter models.',
		requiredEnv: [
			'HEDERA_ACCOUNT_ID',
			'HEDERA_PRIVATE_KEY',
			'REGISTRY_BROKER_BASE_URL',
			'OPENROUTER_API_KEY',
		],
		category: 'registry-broker',
		label: 'Registry Broker OpenRouter Chat',
	},
	'registry-broker:register-agent': {
		description: 'Registers a demo agent against the registry broker.',
		requiredEnv: ['REGISTRY_BROKER_BASE_URL', 'HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'registry-broker',
		label: 'Registry Broker Agent Registration',
	},
	'registry-broker:register-agent-erc8004': {
		description: 'Registers an ERC-8004 agent through the broker, optionally provisioning a local tunnel.',
		requiredEnv: ['REGISTRY_BROKER_BASE_URL', 'HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'registry-broker',
		label: 'Registry Broker ERC-8004 Agent Registration',
	},
	'registry-broker': {
		description:
			'Runs the full registry broker workflow including agent registration and conversational API examples.',
		requiredEnv: ['REGISTRY_BROKER_BASE_URL', 'REGISTRY_BROKER_API_KEY', 'HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'registry-broker',
		label: '🔴 Registry Broker Conversational Demo',
		difficulty: 'advanced',
		estimatedDuration: '10-15 minutes',
		prerequisites: ['hcs-10:create-registry', 'registry-broker:register-agent'],
		learningObjectives: [
			'Complete end-to-end agent registration',
			'Use registry broker conversational API',
			'Understand agent discovery patterns',
			'Integrate with external AI services',
		],
	},
	'registry-broker-agentverse': {
		description: 'Agentverse registry broker demo with optional local trycloudflare tunnel support.',
		requiredEnv: ['REGISTRY_BROKER_BASE_URL', 'HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'registry-broker',
		label: 'Registry Broker Agentverse',
	},
	'registry-broker-erc8004': {
		description: 'Demonstrates ERC-8004 registry broker integration end-to-end.',
		requiredEnv: ['REGISTRY_BROKER_BASE_URL', 'HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'registry-broker',
		label: 'Registry Broker ERC-8004 Demo',
	},
	'registry-broker-history': {
		description: 'Explores broker history API, including compaction scenarios.',
		requiredEnv: ['REGISTRY_BROKER_BASE_URL', 'REGISTRY_BROKER_API_KEY', 'HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'registry-broker',
		label: 'Registry Broker History Exploration',
	},
	'resolve-profile-uaid': {
		description: 'Resolves UAID profile via HCS-11.',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'hcs-11',
	},
	'hcs-14:issue-resolve': {
		description: 'Issues and resolves DIDs with optional UAID wrapping.',
		requiredEnv: ['HEDERA_ACCOUNT_ID', 'HEDERA_PRIVATE_KEY'],
		category: 'hcs-14',
	},
	'hcs-14:aid-generate': {
		label: 'HCS-14 AID Generate',
		category: 'hcs-14',
	},
	'hcs-14:hiero-issue-and-uaid': {
		label: 'HCS-14 Hiero Issue & UAID',
		category: 'hcs-14',
	},
	'hcs-14:resolve-did': {
		label: 'HCS-14 Resolve DID',
		category: 'hcs-14',
	},
	'hrl-content': {
		label: 'HRL Content Demo',
		category: 'hrl',
	},
	'transact': {
		label: 'HCS-10 Transact Demo',
		category: 'hcs-10',
	},
	'transact-agent': {
		label: 'HCS-10 Transact Agent Demo',
		category: 'hcs-10',
	},
	'polling-agent': {
		label: 'HCS-10 Polling Agent',
		category: 'hcs-10',
	},
	'mcp-chat': {
		label: 'HCS-10 MCP Chat',
		category: 'hcs-10',
	},
};

const SKIP_DIR_NAMES = new Set(['utils', 'assets', 'pkg', 'scripts', 'node_modules', 'dist', 'rust-wasm']);
const SKIP_BASENAMES = new Set(['utils.ts', 'network.ts']);

const DEFAULT_GROUP = 'general';

const slugify = (value: string): string =>
	value
		.replace(/^demo\//, '')
		.replace(/\.ts$/, '')
		.replace(/\//g, ':');

const toLabel = (id: string): string =>
	id
		.split(':')
		.map(segment => formatSegment(segment))
		.join(' • ');

const formatSegment = (segment: string): string => {
	const normalised = segment.toLowerCase();
	if (/^hcs[-_]?\d+$/.test(normalised)) {
		const digits = normalised.replace(/\D+/g, '');
		return digits ? `HCS-${digits}` : 'HCS';
	}
	if (/^hcs\d+$/.test(normalised)) {
		const digits = normalised.replace(/\D+/g, '');
		return digits ? `HCS-${digits}` : 'HCS';
	}
	if (normalised === 'hcs') {
		return 'HCS';
	}
	if (normalised === 'hrl') {
		return 'HRL';
	}
	if (normalised === 'mcp') {
		return 'MCP';
	}
	const parts = segment.split(/[-_]/g);
	return parts
		.map(part => {
			if (!part.length) {
				return part;
			}
			const lower = part.toLowerCase();
			if (lower === 'hcs') {
				return 'HCS';
			}
			if (lower === 'hrl') {
				return 'HRL';
			}
			if (lower === 'mcp') {
				return 'MCP';
			}
			if (/^\d+$/.test(part)) {
				return part;
			}
			if (/^hcs\d+$/.test(lower)) {
				const digits = lower.replace(/\D+/g, '');
				return digits ? `HCS-${digits}` : 'HCS';
			}
			return part[0].toUpperCase() + part.slice(1);
		})
		.join(' ');
};

const listAllFiles = async (directory: string, base = directory): Promise<string[]> => {
	const entries = await readdir(directory, {withFileTypes: true});
	const files: string[] = [];
	for (const entry of entries) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIR_NAMES.has(entry.name)) {
				continue;
			}
			files.push(...(await listAllFiles(absolute, base)));
		} else if (entry.isFile()) {
			const relative = path.relative(base, absolute);
			files.push(relative);
		}
	}
	return files;
};

const parseDemoScripts = async (
	sdkRoot: string,
): Promise<{definitions: DemoDefinition[]; scriptPaths: Map<string, string>}> => {
	const packagePath = path.join(sdkRoot, 'package.json');
	const raw = await readFile(packagePath, 'utf8');
	const pkg = JSON.parse(raw) as {scripts?: Record<string, string>};
	const definitions: DemoDefinition[] = [];
	const scriptPaths = new Map<string, string>();

	for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
		if (!name.startsWith('demo')) {
			continue;
		}
		const id = name.replace(/^demo:?/, '');
		const relativeMatch = command.match(/tsx\s+([^\s"']+\.ts)/);
		const relativePath = relativeMatch?.[1];
		if (relativePath) {
			scriptPaths.set(path.normalize(relativePath), name);
		}
		const hint = HINTS[id] ?? HINTS[relativePath ? slugify(relativePath) : ''] ?? {};
		const label = hint.label ?? toLabel(id);
		const group = hint.category ?? (id.includes(':') ? id.split(':')[0] : DEFAULT_GROUP);
		definitions.push({
			id,
			label,
			group,
			description: hint.description,
			requiredEnv: hint.requiredEnv,
			tags: hint.tags,
			category: hint.category,
			relativePath,
			runner: {kind: 'package-script', script: name},
			fromPackageScript: true,
		});
	}

	return {definitions, scriptPaths};
};

const shouldIncludeFile = async (sdkRoot: string, relative: string): Promise<boolean> => {
	if (!relative.endsWith('.ts')) {
		return false;
	}
	if (relative.endsWith('.d.ts')) {
		return false;
	}
	if (relative.includes(`${path.sep}utils${path.sep}`)) {
		return false;
	}
	if (relative.includes(`${path.sep}browser${path.sep}`)) {
		return false;
	}
	if (relative.includes(`${path.sep}assets${path.sep}`)) {
		return false;
	}
	if (relative.includes(`${path.sep}rust-wasm${path.sep}`)) {
		return false;
	}
	const basename = path.basename(relative);
	if (SKIP_BASENAMES.has(basename)) {
		return false;
	}
	const absolute = path.join(sdkRoot, 'demo', relative);
	const stats = await stat(absolute);
	if (!stats.isFile()) {
		return false;
	}
	return true;
};

export const loadDemoDefinitions = async (
	config?: StandardsCliConfig,
): Promise<{sdkRoot: string; demos: DemoDefinition[]}> => {
	const sdkRoot = await findSdkRoot(config);
	const demoRoot = path.join(sdkRoot, 'demo');
	const {definitions: scriptDefinitions, scriptPaths} = await parseDemoScripts(sdkRoot);

	const files = await listAllFiles(demoRoot, demoRoot);
	const additional: DemoDefinition[] = [];
	for (const fileRelative of files) {
		const normalised = path.normalize(path.join('demo', fileRelative));
		if (scriptPaths.has(normalised)) {
			continue;
		}
		if (!(await shouldIncludeFile(sdkRoot, fileRelative))) {
			continue;
		}
		const id = slugify(path.join('demo', fileRelative));
		const hint = HINTS[id] ?? {};
		const label = hint.label ?? toLabel(id);
		const group = hint.category ?? (id.includes(':') ? id.split(':')[0] : DEFAULT_GROUP);
		additional.push({
			id,
			label,
			group,
			description: hint.description,
			requiredEnv: hint.requiredEnv,
			tags: hint.tags,
			category: hint.category,
			relativePath: path.join('demo', fileRelative),
			runner: {kind: 'typescript', entry: path.join('demo', fileRelative)},
		});
	}

	const combined = [...scriptDefinitions];
	for (const entry of additional) {
		if (!combined.some(existing => existing.id === entry.id)) {
			combined.push(entry);
		}
	}

	combined.sort((a, b) => a.label.localeCompare(b.label));

	return {sdkRoot, demos: combined};
};

export const getDemoById = (
	demos: DemoDefinition[],
	identifier: string,
): DemoDefinition | undefined => {
	const direct = demos.find(demo => demo.id === identifier);
	if (direct) {
		return direct;
	}
	const fallback = demos.find(demo => demo.id.replace(/[:]/g, '-') === identifier);
	if (fallback) {
		return fallback;
	}
	const loose = demos.find(
		demo => demo.id.replace(/[:]/g, '').replace(/-/g, '') === identifier.replace(/[:]/g, '').replace(/-/g, ''),
	);
	return loose;
};
