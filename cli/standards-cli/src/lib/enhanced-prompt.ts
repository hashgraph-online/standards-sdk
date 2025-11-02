import * as readline from 'readline/promises';
import chalk from 'chalk';

/**
 * Enhanced readline interface that provides immediate feedback
 * after user input to improve the CLI experience
 */
export class EnhancedPrompt {
	private rl: readline.Interface;
	private spinnerInterval?: NodeJS.Timeout;

	constructor(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout) {
		this.rl = readline.createInterface({
			input,
			output,
		});
	}

	/**
	 * Ask a question with enhanced feedback
	 */
	async question(prompt: string, options?: {
		default?: string;
		showProcessing?: boolean;
		processingMessage?: string;
	}): Promise<string> {
		const fullPrompt = options?.default 
			? `${prompt} [${options.default}]: `
			: `${prompt}: `;

		const answer = await this.rl.question(fullPrompt, {
			signal: undefined,
		});

		const finalAnswer = answer.trim() || options?.default || '';

		if (options?.showProcessing !== false) {
			this.showProcessingState(options?.processingMessage);
		}

		return finalAnswer;
	}

	/**
	 * Show a processing state with visual feedback
	 */
	private showProcessingState(customMessage?: string): void {
		const message = customMessage || 'Processing...';
		process.stdout.write(chalk.dim(`\n⏳ ${message} (this may take 2-5 seconds)\n`));
		
		let dots = 0;
		this.spinnerInterval = setInterval(() => {
			process.stdout.write(chalk.dim('.'));
			dots++;
			if (dots > 2) {
				process.stdout.write(chalk.dim('\r   \r'));
				dots = 0;
			}
		}, 500);
	}

	/**
	 * Clear the processing state
	 */
	clearProcessing(): void {
		if (this.spinnerInterval) {
			clearInterval(this.spinnerInterval);
			this.spinnerInterval = undefined;
		}
		process.stdout.write('\r\x1b[K');
	}

	/**
	 * Close the readline interface
	 */
	close(): void {
		this.clearProcessing();
		this.rl.close();
	}

	/**
	 * Show a success message
	 */
	success(message: string): void {
		this.clearProcessing();
		process.stdout.write(chalk.green(`✅ ${message}\n`));
	}

	/**
	 * Show an info message
	 */
	info(message: string): void {
		this.clearProcessing();
		process.stdout.write(chalk.blue(`ℹ️  ${message}\n`));
	}

	/**
	 * Show a warning message
	 */
	warn(message: string): void {
		this.clearProcessing();
		process.stdout.write(chalk.yellow(`⚠️  ${message}\n`));
	}

	/**
	 * Show an error message
	 */
	error(message: string): void {
		this.clearProcessing();
		process.stdout.write(chalk.red(`❌ ${message}\n`));
	}
}

/**
 * Create an enhanced prompt interface
 */
export function createEnhancedPrompt(): EnhancedPrompt {
	return new EnhancedPrompt();
}
