/**
 * Error Utilities
 * Better error messages and handling
 */

import chalk from 'chalk'
import { APIError } from '../lib/api-client'

export function formatError(error: any): string {
  // API errors
  if (error instanceof APIError) {
    let message = `${error.message}`

    if (error.statusCode === 401) {
      message += '\n\n' + chalk.gray('   Not authenticated. Run: teamday auth login')
    } else if (error.statusCode === 403) {
      message += '\n\n' + chalk.gray('   Permission denied')
    } else if (error.statusCode === 404) {
      message += '\n\n' + chalk.gray('   Resource not found')
    } else if (error.statusCode === 429) {
      message += '\n\n' + chalk.gray('   Rate limit exceeded. Please try again later')
    } else if (error.statusCode >= 500) {
      message += '\n\n' + chalk.gray('   Server error. Please try again or contact support')
    }

    return message
  }

  // Network errors
  if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
    return `Cannot connect to API server\n\n${chalk.gray('   Check if the server is running and API URL is correct')}\n${chalk.gray('   Current API URL: ' + (error.apiUrl || 'not set'))}\n${chalk.gray('   Set with: teamday config set api_url <url>')}`
  }

  // Timeout errors
  if (error.message?.includes('timeout')) {
    return `Request timed out\n\n${chalk.gray('   Increase timeout with: teamday config set timeout <milliseconds>')}`
  }

  // Generic errors
  return error.message || 'An unknown error occurred'
}

export function handleError(error: any, verbose: boolean = false): never {
  const formattedError = formatError(error)
  console.error(chalk.red(`\n❌ ${formattedError}\n`))

  if (verbose && error.stack) {
    console.error(chalk.gray('\nStack trace:'))
    console.error(chalk.gray(error.stack))
    console.error()
  }

  process.exit(1)
}
