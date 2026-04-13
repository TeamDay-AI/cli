/**
 * Mission Commands
 * Full mission management — create, list, update, run, and delete missions
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'

export function createMissionCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const missions = new Command('missions').description(
    'Manage missions (scheduled and on-demand agent tasks)'
  )

  // teamday missions list
  missions
    .command('list')
    .description('List all missions')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching missions...').start()

      try {
        const response = await apiClient.get<{
          missions: any[]
          count: number
        }>('/api/v1/missions')
        spinner.stop()

        const list = response.missions || []
        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        if (list.length === 0) {
          console.log(chalk.yellow('\nNo missions found\n'))
          return
        }

        const summary = list.map((m) => ({
          id: m.id,
          title: `${m.icon || ''} ${m.title}`.trim(),
          status: m.status,
          schedule: m.schedule?.type || '-',
          agent: m.characterId || m.agentId || '-',
          space: m.spaceId || '-',
          agentType: m.agentType || 'claude',
        }))

        console.log('\n' + formatter.format(summary) + '\n')
        console.log(chalk.gray(`Total: ${response.count} mission(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch missions'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday missions get <id>
  missions
    .command('get <id>')
    .description('Get mission details')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching mission...').start()

      try {
        const response = await apiClient.get(`/api/v1/missions/${id}`)
        const mission = response.mission
        spinner.stop()

        const format = options.format || (await config.get('format'))

        if (format === 'json' || format === 'yaml') {
          const formatter = getFormatter(format)
          console.log('\n' + formatter.format(mission) + '\n')
          return
        }

        // Rich display
        console.log(chalk.bold(`\n  ${mission.icon || ''} ${mission.title}`))
        console.log(chalk.gray(`  ID: ${mission.id}`))
        console.log(chalk.gray(`  Status: ${mission.status}`))
        console.log(chalk.gray(`  Agent: ${mission.agentType || 'claude'}`))
        console.log(chalk.gray(`  Visibility: ${mission.visibility}`))

        if (mission.spaceId)
          console.log(chalk.gray(`  Space: ${mission.spaceId}`))
        if (mission.characterId || mission.agentId)
          console.log(chalk.gray(`  Agent: ${mission.agentId || mission.characterId}`))
        if (mission.maxTurns)
          console.log(chalk.gray(`  Max turns: ${mission.maxTurns}`))

        if (mission.goal) {
          console.log(chalk.bold('\n  Goal:'))
          console.log(chalk.gray(`  ${mission.goal}`))
        }

        if (mission.schedule) {
          console.log(chalk.bold('\n  Schedule:'))
          console.log(chalk.gray(`  Type: ${mission.schedule.type}`))
          if (mission.schedule.value)
            console.log(chalk.gray(`  Value: ${mission.schedule.value}`))
          if (mission.schedule.runCount !== undefined)
            console.log(chalk.gray(`  Runs: ${mission.schedule.runCount}`))
          if (mission.schedule.lastRun)
            console.log(chalk.gray(`  Last run: ${mission.schedule.lastRun}`))
        }

        if (mission.createdAt)
          console.log(chalk.gray(`\n  Created: ${mission.createdAt}`))
        if (mission.updatedAt)
          console.log(chalk.gray(`  Updated: ${mission.updatedAt}`))

        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch mission'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday missions create
  missions
    .command('create')
    .description('Create a new mission')
    .requiredOption('--title <title>', 'Mission title')
    .requiredOption('--goal <goal>', 'Mission goal')
    .requiredOption('--space-id <id>', 'Space ID')
    .requiredOption('--character-id <id>', 'Agent ID (the agent to run this mission)')
    .option(
      '--schedule-type <type>',
      'Schedule type (none|once|cron|continuous)',
      'none'
    )
    .option(
      '--schedule-value <cron>',
      'Cron expression (required for type=cron)'
    )
    .option('--icon <emoji>', 'Mission icon emoji')
    .option('--max-turns <n>', 'Max conversation turns', '100')
    .option(
      '--agent-type <type>',
      'Agent type (claude|gemini|codex)',
      'claude'
    )
    .option(
      '--visibility <vis>',
      'Visibility (private|organization)',
      'organization'
    )
    .action(async (options) => {
      // Validate cron schedule
      if (
        options.scheduleType === 'cron' &&
        !options.scheduleValue
      ) {
        console.error(
          chalk.red(
            '\n  --schedule-value is required when --schedule-type is cron\n'
          )
        )
        process.exit(1)
      }

      const spinner = ora('Creating mission...').start()

      try {
        const body: Record<string, any> = {
          title: options.title,
          goal: options.goal,
          spaceId: options.spaceId,
          characterId: options.characterId,
          agentType: options.agentType,
          visibility: options.visibility,
          schedule: {
            type: options.scheduleType,
            value: options.scheduleValue || null,
          },
        }

        if (options.icon) body.icon = options.icon
        if (options.maxTurns)
          body.maxTurns = parseInt(options.maxTurns, 10)

        const response = await apiClient.post('/api/v1/missions', body)
        spinner.succeed(chalk.green('Mission created successfully'))

        console.log(chalk.green(`\n  Mission created:`))
        console.log(chalk.cyan(`   ID: ${response.id}`))
        console.log(chalk.gray(`   Title: ${response.title}`))
        console.log(chalk.gray(`   Status: ${response.status}`))
        console.log(
          chalk.gray(`   Schedule: ${response.schedule?.type || 'none'}\n`)
        )
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to create mission'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday missions update <id>
  missions
    .command('update <id>')
    .description('Update a mission')
    .option('--title <title>', 'Mission title')
    .option('--goal <goal>', 'Mission goal')
    .option('--icon <emoji>', 'Mission icon emoji')
    .option('--character-id <id>', 'Agent ID')
    .option(
      '--status <status>',
      'Status (pending|running|paused|completed)'
    )
    .option(
      '--schedule-type <type>',
      'Schedule type (none|once|cron|continuous)'
    )
    .option('--schedule-value <cron>', 'Cron expression')
    .action(async (id: string, options) => {
      const spinner = ora('Updating mission...').start()

      try {
        const body: Record<string, any> = {}

        if (options.title) body.title = options.title
        if (options.goal) body.goal = options.goal
        if (options.icon) body.icon = options.icon
        if (options.characterId) body.characterId = options.characterId
        if (options.status) body.status = options.status

        if (options.scheduleType || options.scheduleValue) {
          body.schedule = {}
          if (options.scheduleType)
            body.schedule.type = options.scheduleType
          if (options.scheduleValue)
            body.schedule.value = options.scheduleValue
        }

        if (Object.keys(body).length === 0) {
          spinner.fail(chalk.yellow('No fields to update'))
          console.log(
            chalk.gray(
              '\n   Provide at least one option to update (e.g. --title "New Title")\n'
            )
          )
          process.exit(1)
        }

        await apiClient.patch(`/api/v1/missions/${id}`, body)
        spinner.succeed(chalk.green('Mission updated'))
        console.log(chalk.green('\n  Mission updated successfully\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to update mission'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday missions delete <id>
  missions
    .command('delete <id>')
    .description('Delete a mission')
    .action(async (id: string) => {
      const spinner = ora('Deleting mission...').start()

      try {
        await apiClient.delete(`/api/v1/missions/${id}`)
        spinner.succeed(chalk.green('Mission deleted'))
        console.log(chalk.green('\n  Mission deleted successfully\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to delete mission'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday missions run <id>
  missions
    .command('run <id>')
    .description('Trigger a mission run (sets status to running)')
    .action(async (id: string) => {
      const spinner = ora('Starting mission...').start()

      try {
        await apiClient.patch(`/api/v1/missions/${id}`, {
          status: 'running',
        })
        spinner.succeed(chalk.green('Mission started'))
        console.log(chalk.green('\n  Mission is now running\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to start mission'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return missions
}
