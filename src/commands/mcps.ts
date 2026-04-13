/**
 * MCP Commands
 * Browse and manage organization MCP instances
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'
import type { MCPListResponse, MCPCreateRequest } from '../types/api'

export function createMCPCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const mcps = new Command('mcps').description('Browse and manage MCP instances')

  // teamday mcps list
  mcps
    .command('list')
    .description('List organization MCP instances')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching MCPs...').start()

      try {
        const response = await apiClient.get<MCPListResponse>('/api/v1/mcps')
        spinner.stop()

        const mcpList = response.mcps || []

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        if (mcpList.length === 0) {
          console.log(chalk.yellow('\nNo MCPs found\n'))
          return
        }

        // Show concise summary for table format
        const summary = mcpList.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.mcpType,
          active: m.isActive ? 'Yes' : 'No',
          credentials: m.credentialsSet.join(', ') || '-',
          usage: m.usageCount,
        }))

        console.log('\n' + formatter.format(summary) + '\n')
        console.log(chalk.gray(`Total: ${mcpList.length} MCP(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch MCPs'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday mcps get <id>
  mcps
    .command('get <id>')
    .description('Get MCP instance details')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching MCP...').start()

      try {
        const response = await apiClient.get(`/api/v1/mcps/${id}`)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        console.log('\n' + formatter.format(response.mcp) + '\n')
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch MCP'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday mcps create
  mcps
    .command('create')
    .description('Create a new MCP instance')
    .requiredOption('--type <type>', 'MCP type identifier')
    .requiredOption('--name <name>', 'MCP instance name')
    .option('--description <desc>', 'Description')
    .option('--credentials <json>', 'Credentials as JSON string')
    .action(async (options) => {
      const spinner = ora('Creating MCP...').start()

      try {
        const body: MCPCreateRequest = {
          mcpType: options.type,
          name: options.name,
        }

        if (options.description) body.description = options.description

        if (options.credentials) {
          try {
            body.credentials = JSON.parse(options.credentials)
          } catch {
            spinner.fail(chalk.red('Invalid credentials JSON'))
            process.exit(1)
          }
        }

        const response = await apiClient.post('/api/v1/mcps', body)
        spinner.succeed(chalk.green('MCP created successfully'))

        console.log(chalk.green(`\n MCP created:`))
        console.log(chalk.cyan(`   ID: ${response.id}`))
        console.log(chalk.gray(`   Name: ${response.name}`))
        console.log(chalk.gray(`   Type: ${response.mcpType}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to create MCP'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        if (error.data?.data) {
          console.error(chalk.gray(JSON.stringify(error.data.data, null, 2)))
        }
        process.exit(1)
      }
    })

  // teamday mcps delete <id>
  mcps
    .command('delete <id>')
    .description('Delete an MCP instance')
    .action(async (id: string) => {
      const spinner = ora('Deleting MCP...').start()

      try {
        await apiClient.delete(`/api/v1/mcps/${id}`)
        spinner.succeed(chalk.green(`MCP ${id} deleted`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to delete MCP'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return mcps
}
