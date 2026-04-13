/**
 * Task Commands
 * Task management commands
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'

export function createTaskCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const tasks = new Command('tasks').description('Manage tasks')

  // teamday tasks list
  tasks
    .command('list')
    .description('List tasks')
    .option('--status <status>', 'Filter by status')
    .option('--assigned-to <id>', 'Filter by assignee')
    .option('--space <id>', 'Filter by space')
    .option('--priority <priority>', 'Filter by priority')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching tasks...').start()

      try {
        let url = '/api/v1/tasks'
        const params = new URLSearchParams()

        if (options.status) params.append('status', options.status)
        if (options.assignedTo) params.append('assignedTo', options.assignedTo)
        if (options.space) params.append('spaceId', options.space)
        if (options.priority) params.append('priority', options.priority)

        if (params.toString()) {
          url += `?${params.toString()}`
        }

        const taskList = await apiClient.get(url)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        if (!taskList || taskList.length === 0) {
          console.log(chalk.yellow('\nNo tasks found\n'))
          return
        }

        console.log('\n' + formatter.format(taskList) + '\n')
        console.log(chalk.gray(`Total: ${taskList.length} task(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch tasks'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday tasks get <id>
  tasks
    .command('get <id>')
    .description('Get task details')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching task...').start()

      try {
        const task = await apiClient.get(`/api/v1/tasks/${id}`)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        console.log('\n' + formatter.format(task) + '\n')
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch task'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday tasks create
  tasks
    .command('create')
    .description('Create a new task')
    .requiredOption('--title <title>', 'Task title')
    .option('--description <desc>', 'Task description')
    .option('--assigned-to <id>', 'Agent or user ID')
    .option('--priority <priority>', 'Priority (low|medium|high|urgent)', 'medium')
    .option('--space <id>', 'Space ID')
    .action(async (options) => {
      const spinner = ora('Creating task...').start()

      try {
        const body: any = {
          id: `task_${Date.now()}`, // Generate temporary ID
          title: options.title,
          priority: options.priority,
          status: 'pending',
        }

        if (options.description) body.description = options.description
        if (options.assignedTo) body.assignedTo = options.assignedTo
        if (options.space) body.spaceId = options.space

        const task = await apiClient.post('/api/v1/tasks', body)
        spinner.succeed(chalk.green('Task created successfully'))

        console.log(chalk.green(`\n✅ Task created:`))
        console.log(chalk.cyan(`   ID: ${task.id}`))
        console.log(chalk.gray(`   Title: ${task.title}`))
        console.log(chalk.gray(`   Status: ${task.status}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to create task'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday tasks update <id>
  tasks
    .command('update <id>')
    .description('Update a task')
    .option('--title <title>', 'Task title')
    .option('--description <desc>', 'Task description')
    .option('--status <status>', 'Status (pending|in_progress|completed|cancelled)')
    .option('--assigned-to <id>', 'Agent or user ID')
    .option('--priority <priority>', 'Priority (low|medium|high|urgent)')
    .action(async (id: string, options) => {
      const spinner = ora('Updating task...').start()

      try {
        const body: any = {}

        if (options.title) body.title = options.title
        if (options.description) body.description = options.description
        if (options.status) body.status = options.status
        if (options.assignedTo) body.assignedTo = options.assignedTo
        if (options.priority) body.priority = options.priority

        await apiClient.patch(`/api/v1/tasks/${id}`, body)
        spinner.succeed(chalk.green('Task updated successfully'))

        console.log(chalk.green('\n✅ Task updated\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to update task'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday tasks complete <id>
  tasks
    .command('complete <id>')
    .description('Mark task as completed')
    .action(async (id: string) => {
      const spinner = ora('Completing task...').start()

      try {
        await apiClient.patch(`/api/v1/tasks/${id}`, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        })
        spinner.succeed(chalk.green('Task marked as completed'))

        console.log(chalk.green('\n✅ Task completed\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to complete task'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday tasks cancel <id>
  tasks
    .command('cancel <id>')
    .description('Cancel a task')
    .action(async (id: string) => {
      const spinner = ora('Cancelling task...').start()

      try {
        await apiClient.patch(`/api/v1/tasks/${id}`, {
          status: 'cancelled',
        })
        spinner.succeed(chalk.green('Task cancelled'))

        console.log(chalk.green('\n✅ Task cancelled\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to cancel task'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return tasks
}
