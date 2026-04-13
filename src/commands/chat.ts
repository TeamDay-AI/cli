/**
 * Chat Command — Auto-detect space + agent and start interactive chat
 * The "just type teamday" experience.
 *
 * Also supports history browsing:
 *   teamday chat --list [spaceId]       — list recent chats
 *   teamday chat --read <chatId>        — read a chat's messages
 *   teamday chat --list-missions        — list mission-spawned chats
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import Table from 'cli-table3'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'
import { ChatSession } from '../lib/interactive'

/**
 * Auto-detect a space and agent, then start a chat session.
 * Priority: explicit flags > config defaults > first space with agent > first org agent
 */
async function startAutoChat(
  apiClient: APIClient,
  config: ConfigManager,
  options: { space?: string; agent?: string; message?: string; session?: string; chat?: string }
): Promise<void> {
  const spinner = ora('Connecting...').start()

  try {
    // Layer 1: explicit flags
    let spaceId = options.space
    let agentId = options.agent

    // Layer 2: config defaults
    if (!spaceId) spaceId = await config.get('default_space') || undefined
    if (!agentId) agentId = await config.get('default_character') || undefined

    // If we have both, skip detection
    if (spaceId && agentId) {
      spinner.stop()
    } else {
      // Layer 3: auto-detect from API
      const spacesResponse = await apiClient.get('/api/v1/spaces')
      const spaces = Array.isArray(spacesResponse)
        ? spacesResponse
        : spacesResponse.spaces || []

      if (!spaceId && spaces.length > 0) {
        const space = spaces.find((s: any) => !s.archived) || spaces[0]
        spaceId = space.id

        if (!agentId) {
          const agentRefs = space.agentRefs || []
          const enabledRef = agentRefs.find((r: any) => r.enabled !== false)
          if (enabledRef) {
            agentId = enabledRef.characterId || enabledRef.agentId
          }
        }
      }

      if (!agentId && spaceId) {
        try {
          const spaceDetail = await apiClient.get(`/api/v1/spaces/${spaceId}`)
          const space = spaceDetail.space || spaceDetail
          const agentRefs = space.agentRefs || []
          const enabledRef = agentRefs.find((r: any) => r.enabled !== false)
          if (enabledRef) {
            agentId = enabledRef.characterId || enabledRef.agentId
          }
        } catch {
          // Ignore — try org agents next
        }
      }

      if (!agentId) {
        const agentsResponse = await apiClient.get('/api/v1/agents')
        const agents = agentsResponse.agents || []
        if (agents.length > 0) {
          agentId = agents[0].id
        }
      }

      spinner.stop()

      if (!agentId) {
        console.log(chalk.gray('  No agent specified — using default assistant'))
      } else if (!spaceId) {
        console.log(chalk.gray(`  Using agent: ${agentId} (no space)`))
      }
    }

    const session = new ChatSession(apiClient, agentId, spaceId, {
      sessionId: options.session,
      chatId: options.chat,
    })

    if (options.session) {
      console.log(chalk.gray(`  Resuming session: ${options.session}\n`))
    }

    if (options.message) {
      await session.sendSingleMessage(options.message)
    } else {
      await session.start()
    }
  } catch (error: any) {
    spinner.stop()
    if (error.statusCode === 401) {
      console.error(chalk.red('\n  Not authenticated. Run: teamday auth login\n'))
      process.exit(1)
    }
    // Clean up HTML error pages (e.g. nginx 502/503)
    const msg = error.message || String(error)
    if (msg.includes('<html') || msg.includes('<!DOCTYPE')) {
      const statusMatch = msg.match(/<title>(\d{3}[^<]*)<\/title>/)
      const status = statusMatch ? statusMatch[1] : 'unreachable'
      console.error(chalk.red(`\n  API server ${status}. Is the backend running?\n`))
    } else {
      console.error(chalk.red(`\n  ${msg}\n`))
    }
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Chat history: --list
// ---------------------------------------------------------------------------

async function listChats(
  apiClient: APIClient,
  spaceId?: string
): Promise<void> {
  const spinner = ora('Fetching chats...').start()

  try {
    const params = new URLSearchParams()
    if (spaceId) params.set('spaceId', spaceId)
    params.set('limit', '50')

    const qs = params.toString()
    const response = await apiClient.get(`/api/v1/chats${qs ? `?${qs}` : ''}`)
    spinner.stop()

    const chats: any[] = response.chats || []

    if (chats.length === 0) {
      console.log(chalk.yellow('\n  No chats found\n'))
      return
    }

    const table = new Table({
      head: [
        chalk.cyan.bold('ID'),
        chalk.cyan.bold('Title'),
        chalk.cyan.bold('Agent'),
        chalk.cyan.bold('Status'),
        chalk.cyan.bold('Messages'),
        chalk.cyan.bold('Updated'),
      ],
      style: { head: [], border: ['gray'] },
      colWidths: [16, 30, 20, 12, 10, 22],
      wordWrap: true,
      wrapOnWordBoundary: false,
    })

    for (const chat of chats) {
      const statusColor = getStatusColor(chat.status)

      table.push([
        chat.id.length > 14 ? chat.id.slice(0, 14) + '..' : chat.id,
        (chat.title || chalk.gray('(untitled)')).slice(0, 28),
        chat.characterName || chat.agentName || chalk.gray('-'),
        statusColor(chat.status || '-'),
        String(chat.messageCount ?? '-'),
        formatTime(chat.updatedAt),
      ])
    }

    console.log('\n' + table.toString())
    console.log(chalk.gray(`\n  Total: ${chats.length} chat(s)\n`))
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch chats'))
    handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Chat history: --read
// ---------------------------------------------------------------------------

async function readChat(
  apiClient: APIClient,
  chatId: string
): Promise<void> {
  const spinner = ora('Fetching messages...').start()

  try {
    const response = await apiClient.get(`/api/v1/chats/${chatId}/messages`)
    spinner.stop()

    const messages: any[] = response.messages || []

    console.log(chalk.bold(`\n  Chat: ${response.title || chatId}`))
    console.log(chalk.gray(`  Status: ${response.status || '-'}  |  Messages: ${messages.length}`))
    console.log(chalk.gray('  ' + '-'.repeat(60)))

    for (const msg of messages) {
      const roleLabel = msg.role === 'user'
        ? chalk.blue.bold('  USER')
        : chalk.green.bold('  ASSISTANT')
      const time = msg.createdAt ? chalk.gray(formatTime(msg.createdAt)) : ''

      console.log(`\n${roleLabel}  ${time}`)

      // Show content, truncated to 500 chars
      const content = (msg.content || '').trim()
      if (content) {
        const display = content.length > 500 ? content.slice(0, 500) + chalk.gray('... (truncated)') : content
        // Indent each line
        for (const line of display.split('\n')) {
          console.log(`  ${line}`)
        }
      }

      // Show tool calls as one-line summaries
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          const inputSummary = summarizeToolInput(tc.input)
          console.log(chalk.yellow(`  [tool] ${tc.name}(${inputSummary})`))
        }
      }
    }

    console.log(chalk.gray('\n  ' + '-'.repeat(60) + '\n'))
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to read chat'))
    handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Chat history: --list-missions
// ---------------------------------------------------------------------------

async function listMissionChats(
  apiClient: APIClient
): Promise<void> {
  const spinner = ora('Fetching mission chats...').start()

  try {
    const response = await apiClient.get('/api/v1/chats?mission=true&limit=50')
    spinner.stop()

    const chats: any[] = response.chats || []

    if (chats.length === 0) {
      console.log(chalk.yellow('\n  No mission chats found\n'))
      return
    }

    const table = new Table({
      head: [
        chalk.cyan.bold('Chat ID'),
        chalk.cyan.bold('Mission'),
        chalk.cyan.bold('Run #'),
        chalk.cyan.bold('Agent'),
        chalk.cyan.bold('Status'),
        chalk.cyan.bold('Messages'),
        chalk.cyan.bold('Updated'),
      ],
      style: { head: [], border: ['gray'] },
      colWidths: [16, 24, 7, 18, 12, 10, 22],
      wordWrap: true,
      wrapOnWordBoundary: false,
    })

    for (const chat of chats) {
      const statusColor = getStatusColor(chat.status)

      table.push([
        chat.id.length > 14 ? chat.id.slice(0, 14) + '..' : chat.id,
        (chat.missionTitle || chat.missionId || chalk.gray('-')).slice(0, 22),
        chat.runNumber != null ? String(chat.runNumber) : chalk.gray('-'),
        chat.characterName || chat.agentName || chalk.gray('-'),
        statusColor(chat.status || '-'),
        String(chat.messageCount ?? '-'),
        formatTime(chat.updatedAt),
      ])
    }

    console.log('\n' + table.toString())
    console.log(chalk.gray(`\n  Total: ${chats.length} mission chat(s)\n`))
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch mission chats'))
    handleError(error)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusColor(status: string): (s: string) => string {
  switch (status) {
    case 'done':
      return chalk.green
    case 'working':
      return chalk.cyan
    case 'error':
      return chalk.red
    case 'needs_attention':
      return chalk.yellow
    case 'standby':
    default:
      return chalk.gray
  }
}

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return chalk.gray('-')
  try {
    const d = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`

    // Older than a week — show date
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return chalk.gray(isoString)
  }
}

function summarizeToolInput(input: any): string {
  if (!input) return ''
  if (typeof input === 'string') return input.slice(0, 60)

  // Pick the most informative fields for a one-line summary
  const keys = Object.keys(input)
  if (keys.length === 0) return ''

  const parts: string[] = []
  for (const key of keys.slice(0, 3)) {
    const val = input[key]
    if (typeof val === 'string') {
      parts.push(`${key}: "${val.length > 30 ? val.slice(0, 30) + '...' : val}"`)
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      parts.push(`${key}: ${val}`)
    }
  }
  if (keys.length > 3) parts.push('...')
  return parts.join(', ')
}

function handleError(error: any): void {
  if (error.statusCode === 401) {
    console.error(chalk.red('\n  Not authenticated. Run: teamday auth login\n'))
  } else {
    const msg = error.message || String(error)
    if (msg.includes('<html') || msg.includes('<!DOCTYPE')) {
      const statusMatch = msg.match(/<title>(\d{3}[^<]*)<\/title>/)
      const status = statusMatch ? statusMatch[1] : 'unreachable'
      console.error(chalk.red(`\n  API server ${status}. Is the backend running?\n`))
    } else {
      console.error(chalk.red(`\n  ${msg}\n`))
    }
  }
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function createChatCommand(apiClient: APIClient, config: ConfigManager): Command {
  const chat = new Command('chat')
    .description('Start interactive chat, or browse chat history (--list, --read, --list-missions)')
    .argument('[spaceId]', 'Space ID (auto-detected if omitted)')
    .option('--character <id>', 'Agent ID (auto-detected if omitted)')
    .option('--agent <id>', 'Agent ID (auto-detected if omitted)')
    .option('--session <id>', 'Resume a previous session')
    .option('--chat <id>', 'Resume a previous chat')
    .option('--message <msg>', 'Send a single message and exit')
    .option('--list', 'List recent chats (optionally filtered by spaceId argument)')
    .option('--read <chatId>', 'Read a chat\'s message history')
    .option('--list-missions', 'List chats created by missions')
    .action(async (spaceId: string | undefined, options) => {
      // Route to the appropriate sub-handler
      if (options.read) {
        await readChat(apiClient, options.read)
        return
      }

      if (options.listMissions) {
        await listMissionChats(apiClient)
        return
      }

      if (options.list) {
        await listChats(apiClient, spaceId)
        return
      }

      // Default: interactive chat
      await startAutoChat(apiClient, config, {
        space: spaceId,
        agent: options.agent || options.character,
        session: options.session,
        chat: options.chat,
        message: options.message,
      })
    })

  return chat
}

/**
 * Default action handler — called when `teamday` is run with no subcommand
 */
export function createDefaultAction(apiClient: APIClient, config: ConfigManager): () => Promise<void> {
  return async () => {
    await startAutoChat(apiClient, config, {})
  }
}
