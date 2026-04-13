/**
 * Logger Utilities
 * Colored console output helpers
 */

import chalk from 'chalk'

export class Logger {
  constructor(private verbose: boolean = false) {}

  success(message: string): void {
    console.log(chalk.green(`✅ ${message}`))
  }

  error(message: string): void {
    console.error(chalk.red(`❌ ${message}`))
  }

  warn(message: string): void {
    console.warn(chalk.yellow(`⚠️  ${message}`))
  }

  info(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`))
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray(`[DEBUG] ${message}`))
    }
  }

  log(message: string): void {
    console.log(message)
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose
  }
}

export const logger = new Logger()
