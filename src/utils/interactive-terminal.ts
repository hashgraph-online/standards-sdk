import * as readline from 'readline/promises';

/**
 * Professional terminal interface for interactive CLI operations
 * Provides immediate feedback and clean user input handling
 */
export class InteractiveTerminal {
  private input: NodeJS.ReadableStream;
  private output: NodeJS.WritableStream;

  constructor(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout,
  ) {
    this.input = input;
    this.output = output;
  }

  /**
   * Ask a question with immediate feedback
   */
  async question(
    prompt: string,
    options?: {
      default?: string;
      showProcessing?: boolean;
      processingMessage?: string;
    },
  ): Promise<string> {
    const fullPrompt = options?.default
      ? `${prompt} [${options.default}]: `
      : `${prompt}: `;

    // Create fresh readline interface for each question to avoid state corruption
    const rl = readline.createInterface({
      input: this.input,
      output: this.output,
    });

    try {
      const answer = await rl.question(fullPrompt, {
        signal: undefined,
      });
      const finalAnswer = answer.trim() || options?.default || '';

      // Show immediate feedback that Enter was received
      process.stdout.write('✓\n');

      return finalAnswer;
    } finally {
      // Always close the interface and reset terminal state
      rl.close();
      process.stdout.write('\x1b[?0h'); // Reset terminal to normal mode
    }
  }

  /**
   * Close the terminal interface
   */
  close(): void {
    // No persistent interface to close
  }

  /**
   * Show a success message
   */
  success(message: string): void {
    process.stdout.write(`✅ ${message}\n`);
  }

  /**
   * Show an info message
   */
  info(message: string): void {
    process.stdout.write(`ℹ️  ${message}\n`);
  }

  /**
   * Show a warning message
   */
  warn(message: string): void {
    process.stdout.write(`⚠️  ${message}\n`);
  }

  /**
   * Show an error message
   */
  error(message: string): void {
    process.stdout.write(`❌ ${message}\n`);
  }
}

/**
 * Create an interactive terminal instance
 */
export function createInteractiveTerminal(): InteractiveTerminal {
  return new InteractiveTerminal();
}
