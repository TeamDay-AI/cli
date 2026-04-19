/**
 * TeamDay CLI
 * Main entry point
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { ConfigManager } from './lib/config-manager'
import { AuthManager } from './lib/auth-manager'
import { APIClient } from './lib/api-client'
import { createAuthCommands } from './commands/auth'
import { createAgentCommands } from './commands/agents'
import { createSpaceCommands } from './commands/spaces'
import { createTaskCommands } from './commands/tasks'
import { createExecutionCommands } from './commands/executions'
import { createConfigCommands } from './commands/config'
import { createMCPCommands } from './commands/mcps'
import { createSkillCommands } from './commands/skills'
import { createCharacterCommands } from './commands/characters'
import { createKeysCommands } from './commands/keys'
import { createChatCommand, createDefaultAction } from './commands/chat'
import { createScanCommands } from './commands/scan'
import { createMissionCommands } from './commands/missions'
import { createFileCommands } from './commands/files'
import { createDirsCommands } from './commands/dirs'
import { setCliOptions } from './lib/cli-options'

async function main() {
  const program = new Command()

  // CLI metadata
  program
    .name('teamday')
    .version('0.1.0')
    .description('TeamDay CLI - Manage agents, spaces, and tasks from the command line')

  // Global options
  program
    .option('--format <format>', 'Output format (table|json|yaml)', 'table')
    .option('--no-color', 'Disable colored output')
    .option('--verbose', 'Enable verbose output')
    .option('--api-url <url>', 'API endpoint URL')
    .option('--env <env>', 'Shortcut for common API URLs (production|local|superscale)')
    .option('--org <id>', 'Organization ID override (falls back to logged-in org)')
    .option('--json', 'Shortcut for --format json')

  // Initialize services
  const config = new ConfigManager()
  const authManager = new AuthManager(config)
  const apiClient = new APIClient(config, authManager)

  // Set API client on auth manager (circular dependency resolution)
  authManager.setApiClient(apiClient)

  const ENV_URLS: Record<string, string> = {
    production: 'https://cc.teamday.ai',
    local: 'http://localhost:3000',
    superscale: 'https://ai.superscale.com',
  }

  // Apply CLI options and init API client before any command runs
  program.hook('preAction', async () => {
    const opts = program.opts()
    if (opts.env) {
      const url = ENV_URLS[opts.env]
      if (!url) {
        console.error(chalk.red(`\n❌ Unknown --env '${opts.env}'. Valid: ${Object.keys(ENV_URLS).join(', ')}\n`))
        process.exit(1)
      }
      await config.set('api_url', url)
    }
    if (opts.apiUrl) {
      await config.set('api_url', opts.apiUrl)
    }
    if (opts.json) {
      await config.set('format', 'json')
    } else if (opts.format) {
      await config.set('format', opts.format)
    }
    if (opts.org) {
      setCliOptions({ orgOverride: opts.org })
    }
    if (opts.noColor) {
      await config.set('no_color', true)
    }
    if (opts.verbose) {
      await config.set('verbose', true)
    }

    // Initialize API client (reads config including any CLI overrides)
    await apiClient.init()
  })

  // Register command groups
  program.addCommand(createAuthCommands(authManager, apiClient, config))
  program.addCommand(createAgentCommands(apiClient, config))
  program.addCommand(createSpaceCommands(apiClient, config, authManager))
  program.addCommand(createTaskCommands(apiClient, config))
  program.addCommand(createExecutionCommands(apiClient, config))
  program.addCommand(createConfigCommands(config))
  program.addCommand(createMCPCommands(apiClient, config))
  program.addCommand(createSkillCommands(apiClient, config))
  program.addCommand(createKeysCommands(apiClient, authManager, config))
  program.addCommand(createChatCommand(apiClient, config))
  program.addCommand(createScanCommands(apiClient, config))
  program.addCommand(createMissionCommands(apiClient, config))
  program.addCommand(createFileCommands(apiClient, config))
  program.addCommand(createDirsCommands(apiClient, authManager, config))

  // Default action: `teamday` with no args → auto-detect and chat
  program.action(createDefaultAction(apiClient, config))

  // Error handling
  program.exitOverride()

  try {
    await program.parseAsync(process.argv)
  } catch (error: any) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      // Help or version was shown, exit normally
      process.exit(0)
    }

    if (error.code === 'commander.unknownCommand') {
      console.error(chalk.red(`\n❌ Unknown command: ${error.message}\n`))
      console.log(chalk.gray('Run `teamday --help` for available commands\n'))
      process.exit(1)
    }

    // Other errors
    console.error(chalk.red(`\n❌ Error: ${error.message}\n`))

    if (program.opts().verbose && error.stack) {
      console.error(chalk.gray(error.stack))
    }

    process.exit(1)
  }
}

// Run main function
main().catch((error) => {
  console.error(chalk.red(`\n❌ Fatal error: ${error.message}\n`))
  process.exit(1)
})
