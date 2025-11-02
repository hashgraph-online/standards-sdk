import {access, readFile} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {StandardsCliConfig} from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT = path.resolve(__dirname, '..', '..');

const accessCached = async (target: string): Promise<boolean> => {
	try {
		await access(target, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
};

const isSdkRoot = async (directory: string): Promise<boolean> => {
	const packagePath = path.join(directory, 'package.json');
	if (!(await accessCached(packagePath))) {
		return false;
	}
	try {
		const raw = await readFile(packagePath, 'utf8');
		const parsed = JSON.parse(raw) as {name?: string} | undefined;
		if (parsed?.name === '@hashgraphonline/standards-sdk') {
			return true;
		}
	} catch {
		// ignore parse errors
	}
	if (!(await accessCached(path.join(directory, 'demo')))) {
		return false;
	}
	return true;
};

const ascendUntil = async (start: string): Promise<string | undefined> => {
	let current = path.resolve(start);
	const root = path.parse(current).root;
	while (current !== root) {
		if (await isSdkRoot(current)) {
			return current;
		}
		current = path.dirname(current);
	}
	if (await isSdkRoot(root)) {
		return root;
	}
	return undefined;
};

export const findSdkRoot = async (
	config?: StandardsCliConfig,
	options?: {candidates?: string[]},
): Promise<string> => {
	const candidatePaths = new Set(
		[
			config?.sdkRoot,
			process.env.STANDARDS_SDK_ROOT,
			process.cwd(),
			CLI_ROOT,
			path.dirname(CLI_ROOT),
			path.join(CLI_ROOT, '..', '..'),
			...(options?.candidates ?? []),
		]
			.filter((value): value is string => typeof value === 'string' && value.length > 0)
			.map(candidate => path.resolve(candidate)),
	);

	for (const candidate of candidatePaths) {
		const resolved = await ascendUntil(candidate);
		if (resolved) {
			return resolved;
		}
	}

	throw new Error(
		[
			'Unable to locate the standards-sdk repository root automatically.',
			'Set STANDARDS_SDK_ROOT or run `standards-cli config --sdk-root <path-to-standards-sdk>` to provide the location.',
		].join(' '),
	);
};
