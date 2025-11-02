import {Box, Text} from 'ink';

export default function DemoIndex() {
	return (
		<Box flexDirection="column">
			<Text color="yellow">Demo command</Text>
			<Text>
				List available demos with <Text color="cyan">standards-cli demo list</Text>
			</Text>
			<Text>
				Run a demo with <Text color="cyan">standards-cli demo run &lt;demo-id&gt;</Text>
			</Text>
			<Text>
				Show more information with <Text color="cyan">standards-cli demo info &lt;demo-id&gt;</Text>
			</Text>
		</Box>
	);
}
