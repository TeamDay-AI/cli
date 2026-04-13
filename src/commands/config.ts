/**
 * Config Commands
 * CLI configuration management
 */

import { Command } from 'commander'
import chalk from 'chalk'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'

export function createConfigCommands(config: ConfigManager): Command {
  const configCmd = new Command('config').description('Configuration management')

  // teamday config list
  configCmd
    .command('list')
    .description('Show all configuration')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      try {
        const cfg = await config.getAll()

        const format = options.format || cfg.format || 'table'
        const formatter = getFormatter(format)

        console.log('\n' + formatter.format(cfg) + '\n')
        console.log(chalk.gray(`Config file: ${config.getConfigFile()}\n`))
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday config get <key>
  configCmd
    .command('get <key>')
    .description('Get configuration value')
    .action(async (key: string) => {
      try {
        const value = await config.get(key)

        if (value === undefined) {
          console.log(chalk.yellow(`\n⚠️  Key '${key}' not found\n`))
          process.exit(1)
        }

        console.log(chalk.cyan(`\n${key}:`), value, '\n')
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday config set <key> <value>
  configCmd
    .command('set <key> <value>')
    .description('Set configuration value')
    .action(async (key: string, value: string) => {
      try {
        // Parse value based on type
        let parsedValue: any = value

        // Boolean
        if (value === 'true') parsedValue = true
        else if (value === 'false') parsedValue = false
        // Number
        else if (!isNaN(Number(value)) && value.trim() !== '') {
          parsedValue = Number(value)
        }

        await config.set(key, parsedValue)

        console.log(chalk.green(`\n✅ Set ${chalk.cyan(key)} = ${parsedValue}\n`))
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday config unset <key>
  configCmd
    .command('unset <key>')
    .description('Remove configuration value (restore default)')
    .action(async (key: string) => {
      try {
        await config.unset(key)
        console.log(chalk.green(`\n✅ Reset ${chalk.cyan(key)} to default\n`))
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday config reset
  configCmd
    .command('reset')
    .description('Reset all configuration to defaults')
    .action(async () => {
      try {
        await config.reset()
        console.log(chalk.green('\n✅ All configuration reset to defaults\n'))
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return configCmd
}
