/**
 * Agent Commands
 * Agent management and execution commands
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'
import { ChatSession } from '../lib/interactive'
import type {
  AgentListResponse,
  AgentCreateRequest,
  AgentCreateResponse,
  AgentExecuteRequest,
} from '../types/api'

export function createAgentCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const agents = new Command('agents').description('Manage agents')

  // teamday agents list
  agents
    .command('list')
    .description('List all agents')
    .option('--status <status>', 'Filter by status (active|archived)')
    .option(
      '--visibility <visibility>',
      'Filter by visibility (private|organization|public|unlisted)'
    )
    .option('--tag <tag>', 'Filter by tag')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching agents...').start()

      try {
        const response = await apiClient.get<AgentListResponse>('/api/v1/agents')
        spinner.stop()

        let agentList = response.agents

        // Apply filters
        if (options.status) {
          agentList = agentList.filter((a: any) => {
            // archived status is inverse
            if (options.status === 'archived') {
              return a.archived === true
            }
            return a.archived !== true
          })
        }

        if (options.visibility) {
          agentList = agentList.filter(
            (a: any) => a.visibility === options.visibility
          )
        }

        if (options.tag) {
          agentList = agentList.filter((a: any) =>
            a.tags?.includes(options.tag)
          )
        }

        // Format output
        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        if (agentList.length === 0) {
          console.log(chalk.yellow('\nNo agents found\n'))
          return
        }

        console.log('\n' + formatter.format(agentList) + '\n')
        console.log(chalk.gray(`Total: ${agentList.length} agent(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch agents'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday agents get <id>
  agents
    .command('get <id>')
    .description('Get agent details')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching agent...').start()

      try {
        const response = await apiClient.get(`/api/v1/agents/${id}`)
        spinner.stop()

        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        console.log('\n' + formatter.format(response.agent) + '\n')
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch agent'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday agents create
  agents
    .command('create')
    .description('Create a new agent')
    .requiredOption('--name <name>', 'Agent name')
    .option('--role <role>', 'Agent role', 'Assistant')
    .requiredOption('--system-prompt <prompt>', 'System prompt')
    .option('--model <model>', 'AI model', 'claude-sonnet-4-5-20250929')
    .option(
      '--visibility <visibility>',
      'Visibility level (private|organization|public|unlisted)',
      'private'
    )
    .option('--mcps <mcps>', 'MCP tools (comma-separated)')
    .option('--tags <tags>', 'Tags (comma-separated)')
    .option('--based-on <id>', 'Use existing agent as template')
    .action(async (options) => {
      const spinner = ora('Creating agent...').start()

      try {
        const body: AgentCreateRequest = {
          name: options.name,
          role: options.role,
          systemPrompt: options.systemPrompt,
          visibility: options.visibility,
          model: options.model,
        }

        if (options.mcps) {
          body.advanced_tools = options.mcps.split(',').map((s: string) => s.trim())
        }

        if (options.tags) {
          body.tags = options.tags.split(',').map((s: string) => s.trim())
        }

        if (options.basedOn) {
          body.basedOnAgentId = options.basedOn
        }

        const response =
          await apiClient.post<AgentCreateResponse>('/api/v1/agents', body)
        spinner.succeed(chalk.green('Agent created successfully'))

        console.log(chalk.green(`\n✅ Agent created:`))
        console.log(chalk.cyan(`   ID: ${response.id}`))
        console.log(chalk.gray(`   Name: ${response.name}`))
        console.log(chalk.gray(`   Status: ${response.status}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to create agent'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday agents update <id>
  agents
    .command('update <id>')
    .description('Update an agent')
    .option('--name <name>', 'Agent name')
    .option('--role <role>', 'Agent role')
    .option('--system-prompt <prompt>', 'System prompt')
    .option('--visibility <visibility>', 'Visibility level')
    .option('--model <model>', 'AI model')
    .option('--mcps <mcps>', 'MCP tools (comma-separated)')
    .option('--tags <tags>', 'Tags (comma-separated)')
    .action(async (id: string, options) => {
      const spinner = ora('Updating agent...').start()

      try {
        const body: any = {}

        if (options.name) body.name = options.name
        if (options.role) body.role = options.role
        if (options.systemPrompt) body.systemPrompt = options.systemPrompt
        if (options.visibility) body.visibility = options.visibility
        if (options.model) body.model = options.model

        if (options.mcps) {
          body.advanced_tools = options.mcps.split(',').map((s: string) => s.trim())
        }

        if (options.tags) {
          body.tags = options.tags.split(',').map((s: string) => s.trim())
        }

        await apiClient.patch(`/api/v1/agents/${id}`, body)
        spinner.succeed(chalk.green('Agent updated successfully'))

        console.log(chalk.green('\n✅ Agent updated\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to update agent'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday agents delete <id>
  agents
    .command('delete <id>')
    .description('Archive an agent')
    .action(async (id: string) => {
      const spinner = ora('Archiving agent...').start()

      try {
        await apiClient.delete(`/api/v1/agents/${id}`)
        spinner.succeed(chalk.green('Agent archived successfully'))

        console.log(chalk.green('\n✅ Agent archived\n'))
        console.log(
          chalk.gray('   Note: Agent is archived, not permanently deleted\n')
        )
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to archive agent'))
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday agents exec <id> <message>
  agents
    .command('exec <id> <message>')
    .description('Execute agent with a message')
    .option('--space <id>', 'Execute in space')
    .option('--session <id>', 'Continue session')
    .option('--chat <id>', 'Continue chat')
    .option('--no-stream', 'Get complete response (no streaming)')
    .option('--timeout <ms>', 'Execution timeout in milliseconds')
    .action(async (id: string, message: string, options) => {
      const useStream = options.stream !== false

      if (useStream) {
        // Streaming mode: POST and read SSE from response body
        const spinner = ora('Executing agent...').start()

        try {
          const body: AgentExecuteRequest = {
            message,
            stream: true,
          }

          if (options.space) body.spaceId = options.space
          if (options.session) body.sessionId = options.session
          if (options.chat) body.chatId = options.chat

          let hasContent = false
          let executionId = ''
          let sessionId = ''

          for await (const chunk of apiClient.streamPOST(
            `/api/v1/agents/${id}/execute`,
            body
          )) {
            if (chunk.type === 'meta' && chunk.raw) {
              executionId = chunk.raw.executionId || ''
              sessionId = chunk.raw.sessionId || ''
              continue
            }

            if (chunk.type === 'text' && chunk.data) {
              if (!hasContent) {
                spinner.stop()
                console.log(chalk.green('\nAgent Response:\n'))
                hasContent = true
              }
              process.stdout.write(chunk.data)
            } else if (chunk.type === 'error') {
              spinner.stop()
              console.error(chalk.red(`\n\nError: ${chunk.data}`))
              break
            } else if (chunk.type === 'done' && chunk.raw) {
              sessionId = chunk.raw.sessionId || sessionId
              break
            }
          }

          if (hasContent) console.log('\n')
          else spinner.stop()

          if (executionId) console.log(chalk.gray(`Execution ID: ${executionId}`))
          if (sessionId) console.log(chalk.gray(`Session ID: ${sessionId}\n`))
        } catch (error: any) {
          spinner.fail(chalk.red('Execution failed'))
          console.error(chalk.red(`\nError: ${error.message}\n`))
          process.exit(1)
        }
      } else {
        // Non-streaming mode: regular POST
        const spinner = ora('Executing agent...').start()

        try {
          const body: AgentExecuteRequest = {
            message,
            stream: false,
          }

          if (options.space) body.spaceId = options.space
          if (options.session) body.sessionId = options.session
          if (options.chat) body.chatId = options.chat

          const response = await apiClient.post(
            `/api/v1/agents/${id}/execute`,
            body,
            { timeout: options.timeout ? parseInt(options.timeout) : undefined }
          )

          spinner.stop()

          if (response.result) {
            console.log(chalk.green('\nAgent Response:\n'))
            console.log(response.result)
            console.log()
          }

          console.log(chalk.gray(`Execution ID: ${response.executionId}`))
          console.log(chalk.gray(`Session ID: ${response.sessionId}\n`))
        } catch (error: any) {
          spinner.fail(chalk.red('Execution failed'))
          console.error(chalk.red(`\nError: ${error.message}\n`))
          process.exit(1)
        }
      }
    })

  // teamday agents chat <id>
  agents
    .command('chat <id>')
    .description('Start interactive chat session')
    .action(async (id: string) => {
      try {
        const session = new ChatSession(apiClient, id)
        await session.start()
      } catch (error: any) {
        // Error already handled in ChatSession
        if (error.statusCode === 401) {
          process.exit(1)
        }
      }
    })

  return agents
}
