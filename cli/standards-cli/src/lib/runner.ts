import {execa} from 'execa';
import chalk from 'chalk';
import path from 'node:path';
import {existsSync} from 'node:fs';
import type {DemoDefinition} from './demos.js';
import {CLI_ROOT} from './paths.js';

export interface RunDemoOptions {
	sdkRoot: string;
	env: NodeJS.ProcessEnv;
	args?: string[];
	dryRun?: boolean;
}

const formatCommand = (command: string, args: string[]): string => {
	const renderPart = (part: string) => (/\s/.test(part) ? JSON.stringify(part) : part);
	return [command, ...args].map(renderPart).join(' ');
};

export const describeDemoExecution = (demo: DemoDefinition, args: string[] = []): string => {
	switch (demo.runner.kind) {
		case 'package-script':
			return `pnpm run ${demo.runner.script}${args.length ? ` -- ${args.join(' ')}` : ''}`;
		case 'typescript':
			return `tsx ${demo.runner.entry}${args.length ? ` ${args.join(' ')}` : ''}`;
		case 'shell':
		default:
			return `${demo.runner.command}${args.length ? ` ${args.join(' ')}` : ''}`;
	}
};

/**
 * Load environment variables from SDK root .env file
 */
const loadSdkEnvironment = async (sdkRoot: string): Promise<NodeJS.ProcessEnv> => {
	try {
		const dotenv = await import('dotenv');
		const candidates = ['.env.local', '.env'];
		for (const candidate of candidates) {
			const envPath = path.join(sdkRoot, candidate);
			if (existsSync(envPath)) {
				dotenv.config({path: envPath});
			}
		}
	} catch {
		// optional dependency or file missing – ignore and continue
	}

	return {...process.env};
};

export const runDemo = async (
	demo: DemoDefinition,
	{sdkRoot, env, args = [], dryRun = false}: RunDemoOptions,
): Promise<void> => {
	if (dryRun) {
		console.log(chalk.cyan('Dry run:'), describeDemoExecution(demo, args));
		return;
	}

	// Load environment variables from SDK root before running demo
	const sdkEnv = await loadSdkEnvironment(sdkRoot);
	const mergedEnv = { ...sdkEnv, ...env };

	switch (demo.runner.kind) {
		case 'package-script': {
			const commandArgs = ['run', demo.runner.script];
			if (args.length > 0) {
				commandArgs.push('--', ...args);
			}
			await execa('pnpm', commandArgs, {
				cwd: sdkRoot,
				env: {
					...mergedEnv,
					FORCE_COLOR: '1',
				},
				stdio: ['inherit', 'inherit', 'inherit'],
				buffer: false,
			});
			return;
		}
		case 'typescript': {
			// Run demo in detached process to prevent process.exit() from terminating CLI
			await import('child_process').then(({ spawn }) => {
				return new Promise((resolve, reject) => {
					const child = spawn('tsx', [demo.runner.entry, ...args], {
						cwd: sdkRoot,
						env: {
							...mergedEnv,
							FORCE_COLOR: '1',
						},
						stdio: 'pipe',
						detached: true,
					});
					
					// Forward output
					child.stdout?.pipe(process.stdout);
					child.stderr?.pipe(process.stderr);
					if (process.stdin.isTTY) {
						process.stdin.pipe(child.stdin!);
					}
					
					child.on('close', (code) => {
						if (code === 0) {
							console.log('\n════════════════════════════════════════════════════════════');
							console.log('✓ Demo completed successfully!');
							console.log('════════════════════════════════════════════════════════════');
						} else {
							console.log('\n════════════════════════════════════════════════════════════');
							console.log('✗ Demo failed');
							console.log('════════════════════════════════════════════════════════════');
						}
						resolve(code);
					});
					
					child.on('error', (err) => {
						console.error('\n❌ Demo failed:', err.message);
						console.log('\n════════════════════════════════════════════════════════════');
						console.log('✗ Demo failed');
						console.log('════════════════════════════════════════════════════════════');
						reject(err);
					});
				});
			});
			return;
		}
		case 'shell':
		default: {
			await execa(
				demo.runner.command,
				args,
				{
					cwd: sdkRoot,
					env: mergedEnv,
					stdio: ['inherit', 'inherit', 'inherit'],
					buffer: false,
					shell: true,
				},
			);
		}
	}
};
