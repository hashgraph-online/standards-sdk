import {Box, Text, useApp} from 'ink';
import {useEffect, useState} from 'react';
import zod from 'zod';
import {bin as cloudflaredBin, install as installCloudflared} from 'cloudflared';
import {stat} from 'node:fs/promises';
import {execa} from 'execa';
import {loadConfig} from '../../lib/config.js';

export const options = zod
	.object({
		port: zod.coerce.number().optional().describe('Local port to expose via Cloudflare'),
		url: zod.string().optional().describe('Override the local URL (defaults to http://127.0.0.1:PORT)'),
		hostname: zod.string().optional().describe('Optional custom hostname to request'),
		dryRun: zod.boolean().default(false).describe('Show the command without starting the tunnel'),
		noInstall: zod.boolean().default(false).describe('Skip automatic installation of the cloudflared binary'),
	})
	;

type Options = zod.infer<typeof options>;

type State =
	| {status: 'preparing'}
	| {status: 'running'; command: string}
	| {status: 'completed'; exitCode: number}
	| {status: 'error'; error: Error};

const ensureBinary = async (skipInstall: boolean): Promise<void> => {
	try {
		await stat(cloudflaredBin);
	} catch {
		if (skipInstall) {
			throw new Error(
				[
					'cloudflared binary is not installed.',
					'Run `standards-cli agent check --install` or re-run without --no-install.',
				].join(' '),
			);
		}
		await installCloudflared(cloudflaredBin);
	}
};

const describeCommand = (args: string[]): string =>
	[cloudflaredBin, ...args]
		.map(segment => (/\s/.test(segment) ? JSON.stringify(segment) : segment))
		.join(' ');

type Props = {
	options: Options;
};

export default function Tunnel({options: opts}: Props) {
	const [state, setState] = useState<State>({status: 'preparing'});
	const {exit} = useApp();

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				await ensureBinary(opts.noInstall);

				const config = await loadConfig();
				const port = opts.port ?? config.agent?.defaultPort ?? 8787;
				const targetUrl = opts.url ?? `http://127.0.0.1:${port}`;

				const args = ['tunnel', '--url', targetUrl, '--no-autoupdate'];
				if (opts.hostname) {
					args.push('--hostname', opts.hostname);
				}
				const commandPreview = describeCommand(args);

				if (opts.dryRun) {
					if (!cancelled) {
						setState({
							status: 'running',
							command: commandPreview,
						});
					}
					return;
				}

				if (!cancelled) {
					setState({
						status: 'running',
						command: commandPreview,
					});
				}

				const child = execa(cloudflaredBin, args, {
					stdio: 'inherit',
				});
				const result = await child;

				if (!cancelled) {
					setState({
						status: 'completed',
						exitCode: result.exitCode ?? 0,
					});
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
	}, [opts, exit]);

	if (state.status === 'preparing') {
		return <Text>Preparing Cloudflare tunnel…</Text>;
	}

	if (state.status === 'running') {
		return (
			<Box flexDirection="column">
				<Text color="green">Starting Cloudflare tunnel.</Text>
				<Text dimColor>{state.command}</Text>
				<Text dimColor>Press Ctrl+C to stop the tunnel.</Text>
			</Box>
		);
	}

	if (state.status === 'completed') {
		return <Text color="green">Tunnel closed (exit code {state.exitCode}).</Text>;
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Failed to start Cloudflare tunnel.</Text>
				<Text>{state.error.message}</Text>
			</Box>
		);
	}

	return <Text color="red">Unexpected tunnel state encountered.</Text>;
}
