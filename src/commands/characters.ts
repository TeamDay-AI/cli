/**
 * Agent Commands (aliased as "characters" for backward compat)
 * Full agent management with marketing, capabilities, and identity
 *
 * Agents are the rich persona entity (category, skills, marketing, SEO).
 * This command exposes the full CRUD interface for agents.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { getFormatter } from '../lib/formatters'
import type {
  AgentFullListResponse,
  AgentFullCreateRequest,
} from '../types/api'

export function createCharacterCommands(
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const characters = new Command('characters')
    .alias('agents')
    .description(
      'Manage agents (personas with marketing, skills, and identity)'
    )

  // teamday characters list
  characters
    .command('list')
    .description('List all agents')
    .option('--category <cat>', 'Filter by category (marketing|finance|hr|engineering|operations|general|data)')
    .option('--visibility <vis>', 'Filter by visibility')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (options) => {
      const spinner = ora('Fetching agents...').start()

      try {
        const params = new URLSearchParams()
        if (options.category) params.append('category', options.category)
        if (options.visibility) params.append('visibility', options.visibility)

        const qs = params.toString()
        const url = `/api/v1/agents${qs ? `?${qs}` : ''}`
        const response = await apiClient.get<AgentFullListResponse>(url)
        spinner.stop()

        const agents = response.agents || response.characters || []
        const format = options.format || (await config.get('format'))
        const formatter = getFormatter(format)

        if (agents.length === 0) {
          console.log(chalk.yellow('\nNo agents found\n'))
          return
        }

        // Concise summary for table format
        const summary = agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          category: a.category || '-',
          visibility: a.visibility,
          skills: (a.skillIds || []).length,
          mcps: (a.mcpInstanceIds || a.advanced_tools || []).length,
          subagents: (a.subagentIds || []).length,
          maxTurns: a.maxTurns || '-',
        }))

        console.log('\n' + formatter.format(summary) + '\n')
        console.log(chalk.gray(`Total: ${response.total} agent(s)\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch agents'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday characters get <id>
  characters
    .command('get <id>')
    .description('Get full agent details')
    .option('--format <format>', 'Output format (table|json|yaml)')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching agent...').start()

      try {
        const response = await apiClient.get(`/api/v1/agents/${id}`)
        const agent = response.character || response.agent
        spinner.stop()

        const format = options.format || (await config.get('format'))

        if (format === 'json' || format === 'yaml') {
          const formatter = getFormatter(format)
          console.log('\n' + formatter.format(agent) + '\n')
          return
        }

        // Rich display
        console.log(chalk.bold(`\n  ${agent.name}`))
        console.log(chalk.gray(`  ${agent.role}`))
        console.log(chalk.gray(`  ID: ${agent.id}`))
        if (agent.slug) console.log(chalk.gray(`  Slug: ${agent.slug}`))
        if (agent.category) console.log(chalk.gray(`  Category: ${agent.category}`))
        console.log(chalk.gray(`  Visibility: ${agent.visibility}`))
        console.log(chalk.gray(`  Model: ${agent.model}`))

        if (agent.characterDescription) {
          console.log(chalk.bold('\n  Description:'))
          console.log(chalk.gray(`  ${agent.characterDescription}`))
        }

        // Capabilities
        const skills = agent.skillIds || []
        const mcpInstances = agent.mcpInstanceIds || []
        const mcpTypes = agent.mcpTypes || []
        const mcpsLegacy = agent.advanced_tools || []
        const tools = agent.allowedTools || []
        const disallowed = agent.disallowedTools || []
        const subagents = agent.subagentIds || []

        if (skills.length || mcpInstances.length || mcpsLegacy.length || tools.length || subagents.length) {
          console.log(chalk.bold('\n  Capabilities:'))
          if (skills.length) console.log(chalk.gray(`  Skills: ${skills.join(', ')}`))
          if (mcpInstances.length) console.log(chalk.gray(`  MCP Instances: ${mcpInstances.join(', ')}`))
          else if (mcpsLegacy.length) console.log(chalk.gray(`  MCPs (legacy): ${mcpsLegacy.join(', ')}`))
          if (mcpTypes.length) console.log(chalk.gray(`  MCP Types: ${mcpTypes.join(', ')}`))
          if (tools.length) console.log(chalk.gray(`  Tools: ${tools.join(', ')}`))
          if (disallowed.length) console.log(chalk.gray(`  Disallowed: ${disallowed.join(', ')}`))
          if (subagents.length) console.log(chalk.gray(`  Subagents: ${subagents.join(', ')}`))
          if (agent.maxTurns) console.log(chalk.gray(`  Max Turns: ${agent.maxTurns}`))
        }

        // Marketing
        if (agent.useCases?.length) {
          console.log(chalk.bold('\n  Use Cases:'))
          for (const uc of agent.useCases) {
            console.log(chalk.gray(`  - ${uc}`))
          }
        }

        if (agent.faq?.length) {
          console.log(chalk.bold('\n  FAQ:'))
          for (const item of agent.faq) {
            console.log(chalk.gray(`  Q: ${item.question}`))
            console.log(chalk.gray(`  A: ${item.answer}`))
          }
        }

        if (agent.integrations?.length) {
          console.log(chalk.gray(`\n  Integrations: ${agent.integrations.join(', ')}`))
        }

        if (agent.seo) {
          console.log(chalk.bold('\n  SEO:'))
          if (agent.seo.title) console.log(chalk.gray(`  Title: ${agent.seo.title}`))
          if (agent.seo.description) console.log(chalk.gray(`  Description: ${agent.seo.description}`))
          if (agent.seo.keywords?.length) console.log(chalk.gray(`  Keywords: ${agent.seo.keywords.join(', ')}`))
        }

        console.log()
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to fetch agent'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday characters create
  characters
    .command('create')
    .description('Create a new agent')
    .requiredOption('--name <name>', 'Agent name')
    .requiredOption('--role <role>', 'Role description')
    .requiredOption('--category <cat>', 'Category (marketing|finance|hr|engineering|operations|general|data)')
    .requiredOption('--system-prompt <prompt>', 'System prompt')
    .option('--slug <slug>', 'URL slug')
    .option('--description <desc>', 'Short agent description')
    .option('--greeting <msg>', 'Initial greeting message')
    .option('--visibility <vis>', 'Visibility (private|organization|public|unlisted)', 'organization')
    .option('--model <model>', 'AI model')
    .option('--skills <ids>', 'Skill IDs (comma-separated)')
    .option('--mcps <ids>', 'MCP tool IDs (comma-separated, legacy)')
    .option('--mcp-instances <ids>', 'MCP instance IDs (comma-separated)')
    .option('--mcp-types <types>', 'MCP type identifiers (comma-separated, e.g. ahrefs,search-console)')
    .option('--subagents <ids>', 'Subagent IDs (comma-separated)')
    .option('--disallowed-tools <tools>', 'Disallowed tool names (comma-separated)')
    .option('--max-turns <n>', 'Max execution turns per run', parseInt)
    .option('--tags <tags>', 'Tags (comma-separated)')
    .option('--image <url>', 'Avatar image URL')
    .action(async (options) => {
      const spinner = ora('Creating agent...').start()

      try {
        const body: AgentFullCreateRequest = {
          name: options.name,
          role: options.role,
          category: options.category,
          system_message: options.systemPrompt,
          visibility: options.visibility,
        }

        if (options.slug) body.slug = options.slug
        if (options.description) body.characterDescription = options.description
        if (options.greeting) body.initialGreeting = options.greeting
        if (options.model) body.model = options.model
        if (options.image) body.image = options.image
        if (options.skills) body.skillIds = options.skills.split(',').map((s: string) => s.trim())
        if (options.mcps) body.advanced_tools = options.mcps.split(',').map((s: string) => s.trim())
        if (options.mcpInstances) body.mcpInstanceIds = options.mcpInstances.split(',').map((s: string) => s.trim())
        if (options.mcpTypes) body.mcpTypes = options.mcpTypes.split(',').map((s: string) => s.trim())
        if (options.subagents) body.subagentIds = options.subagents.split(',').map((s: string) => s.trim())
        if (options.disallowedTools) body.disallowedTools = options.disallowedTools.split(',').map((s: string) => s.trim())
        if (options.maxTurns) body.maxTurns = options.maxTurns
        if (options.tags) body.tags = options.tags.split(',').map((s: string) => s.trim())

        const response = await apiClient.post('/api/v1/agents', body)
        spinner.succeed(chalk.green('Agent created successfully'))

        console.log(chalk.green(`\n  Agent created:`))
        console.log(chalk.cyan(`   ID: ${response.id}`))
        console.log(chalk.gray(`   Name: ${response.name}`))
        console.log(chalk.gray(`   Slug: ${response.slug}`))
        if (response.marketingUrl) {
          console.log(chalk.gray(`   Marketing URL: ${response.marketingUrl}`))
        }
        console.log(chalk.gray(`   Chat URL: ${response.chatUrl}\n`))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to create agent'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday characters update <id>
  characters
    .command('update <id>')
    .description('Update an agent')
    .option('--name <name>', 'Agent name')
    .option('--role <role>', 'Role description')
    .option('--category <cat>', 'Category')
    .option('--system-prompt <prompt>', 'System prompt')
    .option('--slug <slug>', 'URL slug')
    .option('--description <desc>', 'Short agent description')
    .option('--greeting <msg>', 'Initial greeting message')
    .option('--visibility <vis>', 'Visibility')
    .option('--model <model>', 'AI model')
    .option('--skills <ids>', 'Skill IDs (comma-separated, replaces existing)')
    .option('--mcps <ids>', 'MCP tool IDs (comma-separated, replaces existing, legacy)')
    .option('--mcp-instances <ids>', 'MCP instance IDs (comma-separated, replaces existing)')
    .option('--mcp-types <types>', 'MCP type identifiers (comma-separated, replaces existing)')
    .option('--subagents <ids>', 'Subagent IDs (comma-separated, replaces existing)')
    .option('--disallowed-tools <tools>', 'Disallowed tool names (comma-separated, replaces existing)')
    .option('--max-turns <n>', 'Max execution turns per run', parseInt)
    .option('--tags <tags>', 'Tags (comma-separated, replaces existing)')
    .option('--image <url>', 'Avatar image URL')
    .action(async (id: string, options) => {
      const spinner = ora('Updating agent...').start()

      try {
        const body: Record<string, any> = {}

        if (options.name) body.name = options.name
        if (options.role) body.role = options.role
        if (options.category) body.category = options.category
        if (options.systemPrompt) body.system_message = options.systemPrompt
        if (options.slug) body.slug = options.slug
        if (options.description) body.characterDescription = options.description
        if (options.greeting) body.initialGreeting = options.greeting
        if (options.visibility) body.visibility = options.visibility
        if (options.model) body.model = options.model
        if (options.image) body.image = options.image
        if (options.skills) body.skillIds = options.skills.split(',').map((s: string) => s.trim())
        if (options.mcps) body.advanced_tools = options.mcps.split(',').map((s: string) => s.trim())
        if (options.mcpInstances) body.mcpInstanceIds = options.mcpInstances.split(',').map((s: string) => s.trim())
        if (options.mcpTypes) body.mcpTypes = options.mcpTypes.split(',').map((s: string) => s.trim())
        if (options.subagents) body.subagentIds = options.subagents.split(',').map((s: string) => s.trim())
        if (options.disallowedTools) body.disallowedTools = options.disallowedTools.split(',').map((s: string) => s.trim())
        if (options.maxTurns) body.maxTurns = options.maxTurns
        if (options.tags) body.tags = options.tags.split(',').map((s: string) => s.trim())

        if (Object.keys(body).length === 0) {
          spinner.fail(chalk.yellow('No fields to update'))
          console.log(chalk.gray('\n   Provide at least one option to update (e.g. --name "New Name")\n'))
          process.exit(1)
        }

        await apiClient.patch(`/api/v1/agents/${id}`, body)
        spinner.succeed(chalk.green('Agent updated'))
        console.log(chalk.green('\n  Agent updated successfully\n'))
      } catch (error: any) {
        spinner.fail(chalk.red('Failed to update agent'))
        console.error(chalk.red(`\n Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  return characters
}
