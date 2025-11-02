import {Text} from 'ink';
import type {DemoDifficulty} from './demos.js';

interface DifficultyBadgeProps {
	difficulty?: DemoDifficulty;
	inline?: boolean;
}

interface DifficultyConfig {
	symbol: string;
	color: 'green' | 'yellow' | 'red';
	label: string;
}

const DIFFICULTY_CONFIG: Record<DemoDifficulty, DifficultyConfig> = {
	beginner: {
		symbol: '🟢',
		color: 'green',
		label: 'Beginner',
	},
	intermediate: {
		symbol: '🟡',
		color: 'yellow',
		label: 'Intermediate',
	},
	advanced: {
		symbol: '🔴',
		color: 'red',
		label: 'Advanced',
	},
};

export const DifficultyBadge: React.FC<DifficultyBadgeProps> = ({difficulty, inline = false}) => {
	if (!difficulty) {
		return null;
	}

	const config = DIFFICULTY_CONFIG[difficulty];

	if (inline) {
		return (
			<Text color={config.color}>
				{config.symbol} {config.label}
			</Text>
		);
	}

	return (
		<Text color={config.color}>
			{config.symbol} {config.label} Level
		</Text>
	);
};

export function getDifficultySymbol(difficulty?: DemoDifficulty): string {
	if (!difficulty) {
		return '●';
	}
	return DIFFICULTY_CONFIG[difficulty].symbol;
}

export function getDifficultyLabel(difficulty?: DemoDifficulty): string {
	if (!difficulty) {
		return 'Unknown';
	}
	return DIFFICULTY_CONFIG[difficulty].label;
}

export function getDifficultyColor(difficulty?: DemoDifficulty): 'green' | 'yellow' | 'red' | 'gray' {
	if (!difficulty) {
		return 'gray';
	}
	return DIFFICULTY_CONFIG[difficulty].color;
}
