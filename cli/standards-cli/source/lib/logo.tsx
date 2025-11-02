import {Box, Text} from 'ink';

const logoLines: Array<{text: string; color: string}> = [
	{ text: '██╗  ██╗ █████╗ ███████╗██╗  ██╗ ██████╗ ██████╗  █████╗ ██████╗ ██╗  ██╗', color: 'cyan' },
	{ text: '██║  ██║██╔══██╗██╔════╝██║  ██║██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██║  ██║', color: 'cyan' },
	{ text: '███████║███████║███████╗███████║██║  ███╗██████╔╝███████║██████╔╝███████║', color: 'cyan' },
	{ text: '██╔══██║██╔══██║╚════██║██╔══██║██║   ██║██╔══██╗██╔══██║██╔═══╝ ██╔══██║', color: 'cyan' },
	{ text: '██║  ██║██║  ██║███████║██║  ██║╚██████╔╝██║  ██║██║  ██║██║     ██║  ██║', color: 'cyan' },
	{ text: '╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝', color: 'cyan' },
	{ text: '', color: 'white' },
	{ text: ' ██████╗ ███╗   ██╗██╗     ██╗███╗   ██╗███████╗    ', color: 'magenta' },
	{ text: '██╔═══██╗████╗  ██║██║     ██║████╗  ██║██╔════╝    ', color: 'magenta' },
	{ text: '██║   ██║██╔██╗ ██║██║     ██║██╔██╗ ██║█████╗      ', color: 'magenta' },
	{ text: '██║   ██║██║╚██╗██║██║     ██║██║╚██╗██║██╔══╝      ', color: 'magenta' },
	{ text: '╚██████╔╝██║ ╚████║███████╗██║██║ ╚████║███████╗    ', color: 'magenta' },
	{ text: ' ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝╚═╝  ╚═══╝╚══════╝    ', color: 'magenta' },
	{ text: '                                               _____', color: 'white' },
];

export const renderLogo = (): JSX.Element => (
	<Box flexDirection="column" alignItems="center">
		{logoLines.map((line, index) => (
			<Text key={index} color={line.color}>
				{line.text}
			</Text>
		))}
	</Box>
);
