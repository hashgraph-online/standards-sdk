import {Box, Text} from 'ink';

export default function AgentIndex() {
	return (
		<Box flexDirection="column">
			<Text color="yellow">Agent tooling</Text>
			<Text>
				Check Cloudflare tunnel support:{' '}
				<Text color="cyan">standards-cli agent check</Text>
			</Text>
			<Text>
				Install or update cloudflared:{' '}
				<Text color="cyan">standards-cli agent check --install</Text>
			</Text>
			<Text>
				Start an ephemeral tunnel:{' '}
				<Text color="cyan">standards-cli agent tunnel --port 8787</Text>
			</Text>
		</Box>
	);
}
