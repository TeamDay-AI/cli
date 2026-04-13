/**
 * Execution Commands
 * Execution tracking and management
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'

export function createExecutionCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const executions = new Command('executions').description(
    'Manage and track executions'
  )

  // teamday executions list
  executions
    .command('list')
    .description('List executions')
    .option('--agent <id>', 'Filter by agent ID')
    .option('--status <status>', 'Filter by status')
    .option('--since <date>', 'Filter by date')
    .option('--limit <n>', 'Limit results', '50')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching executions...').start()

      try {
        let url = '/api/v1/executions'
        const params = new URLSearchParams()

        if (options.agent) params.append('agentId', options.agent)
        if (options.status) params.append('status', options.status)
        if (options.since) params.append('since', options.since)
        params.append('limit', options.limit)

        if (params.toString()) {
          url += `?${params.toString()}`
        }

        const executionList = await apiClient.get(url)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        if (!executionList || executionList.length === 0) {
          console.log(chalk.yellow('\nNo executions found\n'))
          return
        }

        console.log('\n' + formatter.format(executionList) + '\n')
        console.log(chalk.gray(`Total: ${executionList.length} execution(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch executions'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday executions get <id>
  executions
    .command('get <id>')
    .description('Get execution details')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching execution...').start()

      try {
        const execution = await apiClient.get(`/api/v1/executions/${id}`)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        console.log('\n' + formatter.format(execution) + '\n')
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch execution'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday executions cancel <id>
  executions
    .command('cancel <id>')
    .description('Cancel a running execution')
    .action(async (id: string) => {
      const spinner = ora('Cancelling execution...').start()

      try {
        await apiClient.post(`/api/v1/executions/${id}/cancel`)
        spinner.succeed(chalk.green('Execution cancelled'))

        console.log(chalk.green('\n✅ Execution cancelled\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to cancel execution'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday executions tree <id>
  executions
    .command('tree <id>')
    .description('Show execution delegation tree')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching delegation tree...').start()

      try {
        const tree = await apiClient.get(`/api/v1/executions/${id}/tree`)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        console.log('\n' + formatter.format(tree) + '\n')
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch delegation tree'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday executions logs <id>
  executions
    .command('logs <id>')
    .description('View execution logs')
    .action(async (id: string) => {
      const spinner = ora('Fetching logs...').start()

      try {
        const logs = await apiClient.get(`/api/v1/executions/${id}/logs`)
        spinner.stop()

        console.log('\n' + chalk.gray('=== Execution Logs ===') + '\n')
        console.log(logs)
        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch logs'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return executions
}
