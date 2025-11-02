import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import zod from 'zod';
import {install as installCloudflared} from 'cloudflared';
import {execa} from 'execa';
import {
	bundledCloudflaredPath as cloudflaredBin,
	fileExists,
	findSystemCloudflared,
} from '../../lib/cloudflared.js';

export const options = zod
	.object({
		install: zod.boolean().default(false).describe('Download or update the cloudflared binary if missing'),
	});

type Options = zod.infer<typeof options>;

type State =
	| {status: 'checking'}
	| {status: 'ready'; version: string; path: string; installed: boolean}
	| {status: 'error'; error: Error};

type Props = {
	options: Options;
};

export default function Check({options: opts}: Props) {
	const [state, setState] = useState<State>({status: 'checking'});

	useEffect(() => {
		(async () => {
			try {
				let binaryPath = cloudflaredBin;
				let installed = await fileExists(binaryPath);
				if (!installed) {
					const systemBinary = await findSystemCloudflared();
					if (systemBinary) {
						binaryPath = systemBinary;
						installed = true;
					}
				}

				if (!installed && !opts.install) {
					setState({
						status: 'error',
						error: new Error(
							[
								'cloudflared binary is not installed yet.',
								'Run `standards-cli agent check --install` to download it automatically or add cloudflared to your PATH.',
							].join(' '),
						),
					});
					return;
				}

				if (opts.install) {
					await installCloudflared(cloudflaredBin);
					binaryPath = cloudflaredBin;
				}

				const versionResult = await execa(binaryPath, ['--version'], {
					stdio: 'pipe',
				});

				process.env.CLOUDFLARED_BIN = binaryPath;
				setState({
					status: 'ready',
					version: versionResult.stdout.trim(),
					path: binaryPath,
					installed: opts.install || binaryPath === cloudflaredBin,
				});
			} catch (error) {
				setState({
					status: 'error',
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		})();
	}, [opts.install]);

	if (state.status === 'checking') {
		return <Text>Checking cloudflared support…</Text>;
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">Cloudflare tunnel support is not ready.</Text>
				<Text>{state.error.message}</Text>
				<Text>
					If you prefer to install manually, visit{' '}
					<Text color="cyan">https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/trycloudflare/</Text>
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="green">
				cloudflared {state.installed ? 'installed' : 'detected'} successfully.
			</Text>
			<Text>Binary path: {state.path}</Text>
			<Text>Version: {state.version}</Text>
			<Text dimColor>
				Agent demos will automatically prefer Cloudflare tunnels when this binary is available.
			</Text>
		</Box>
	);
}
