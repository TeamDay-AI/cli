/**
 * Skills Commands
 * Browse available skills
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'
import type { SkillsListResponse } from '../types/api'

export function createSkillCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const skills = new Command('skills').description('Browse available skills')

  // teamday skills list
  skills
    .command('list')
    .description('List available skills (core, organization, marketplace)')
    .option('--source <source>', 'Filter by source (core|organization|marketplace)')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching skills...').start()

      try {
        const response = await apiClient.get<SkillsListResponse>('/api/v1/skills')
        spinner.stop()

        const { skills: skillGroups } = response
        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        // Filter by source if specified
        const sources = options.source
          ? [options.source]
          : ['core', 'organization', 'marketplace']

        for (const source of sources) {
          const list = (skillGroups as any)[source] || []
          if (list.length === 0) continue

          console.log(chalk.bold(`\n${source.charAt(0).toUpperCase() + source.slice(1)} Skills (${list.length}):`))

          const summary = list.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: (s.description || '').slice(0, 60) || '-',
          }))

          console.log(formatter.format(summary))
        }

        console.log(chalk.gray(`\nTotal: ${response.total} skill(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch skills'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return skills
}
