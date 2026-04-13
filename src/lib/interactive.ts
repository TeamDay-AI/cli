/**
 * Interactive Chat — Mini Claude Code experience
 * Readline input with history, streaming output, tool call indicators, code highlighting
 */

import chalk from 'chalk'
import ora from 'ora'
import type { APIClient } from './api-client'
import type { AgentExecuteRequest, StreamChunk } from '../types/api'
import { ChatInput } from './chat-input'
import { ChatRenderer } from './chat-renderer'

export class ChatSession {
  private sessionId: string | null = null
  private chatId: string | null = null
  private messageCount = 0
  private debug = false
  private input: ChatInput
  private renderer: ChatRenderer

  constructor(
    private apiClient: APIClient,
    private agentId: string | undefined,
    private spaceId: string | undefined,
    options?: { sessionId?: string; chatId?: string }
  ) {
    this.input = new ChatInput()
    this.renderer = new ChatRenderer()
    if (options?.sessionId) this.sessionId = options.sessionId
    if (options?.chatId) this.chatId = options.chatId
  }

  /**
   * Start interactive chat session
   */
  async start(): Promise<void> {
    // Keep the event loop alive for the entire session.
    // Bun can exit between async operations if no active handles remain
    // (e.g., after a stream completes but before the next readline prompt).
    const keepAlive = setInterval(() => {}, 60_000)

    const spinner = ora('Loading...').start()

    try {
      let agentName = 'Assistant'
      let agentRole = 'Default'

      if (this.agentId) {
        const response = await this.apiClient.get(`/api/v1/agents/${this.agentId}`)
        const agent = response.agent
        agentName = agent.name
        agentRole = agent.role
      }

      spinner.stop()

      this.renderer.showWelcome(agentName, agentRole, this.spaceId)

      // Chat loop
      while (true) {
        try {
          const message = await this.input.prompt()

          // Skip empty input
          if (!message) continue

          // Handle slash commands
          if (message.startsWith('/')) {
            if (this.handleSlashCommand(message)) continue
          }

          await this.sendMessage(message)
        } catch (error: any) {
          if (error.message === 'exit') {
            this.showResumeHint()
            break
          }
          // Unexpected error — show and continue
          console.error(chalk.red(`\nError: ${error.message}\n`))
        }
      }
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to load agent'))
      console.error(chalk.red(`\nError: ${error.message}\n`))
      throw error
    } finally {
      clearInterval(keepAlive)
      this.input.close()
    }
  }

  /**
   * Send a single message (non-interactive mode: --message flag)
   * Streams response to stdout with tool indicators, then exits.
   */
  async sendSingleMessage(message: string): Promise<void> {
    const renderer = new ChatRenderer()
    const spinner = ora('Thinking...').start()

    try {
      let hasContent = false

      for await (const chunk of this.streamExecute(message)) {
        switch (chunk.type) {
          case 'text':
            if (!hasContent) {
              spinner.stop()
              hasContent = true
            }
            renderer.writeTextDelta(chunk.data)
            break
          case 'tool_start':
            if (!hasContent) {
              spinner.stop()
              hasContent = true
            }
            renderer.showToolStart(chunk.data)
            break
          case 'tool_end':
            renderer.showToolEnd(chunk.data)
            break
          case 'error':
            spinner.stop()
            renderer.showError(chunk.data)
            break
        }
      }

      renderer.flush()

      if (hasContent) {
        console.log() // final newline
      } else {
        spinner.stop()
        console.log(chalk.yellow('No response received'))
      }

      // Print session info to stderr for scripting
      if (this.sessionId) {
        console.error(chalk.gray(`session: ${this.sessionId}`))
      }
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to send message'))
      console.error(chalk.red(`\nError: ${error.message}\n`))

      if (error.statusCode === 401) {
        console.log(
          chalk.yellow('   Authentication expired. Please run: teamday auth login\n')
        )
      }
      throw error
    }
  }

  /**
   * Handle slash commands. Returns true if handled (loop should continue).
   * Async commands schedule work and return true immediately.
   */
  private handleSlashCommand(command: string): boolean {
    // Split command and args: "/switch abc123" → ["/switch", "abc123"]
    const [cmd, ...args] = command.split(/\s+/)

    switch (cmd) {
      case '/exit':
        this.showResumeHint()
        this.input.close()
        process.exit(0)

      case '/clear':
        this.renderer.clear()
        return true

      case '/session':
        if (this.sessionId) {
          console.log(chalk.gray(`\n  Session: ${this.sessionId}`))
          if (this.chatId) console.log(chalk.gray(`  Chat: ${this.chatId}`))
        } else {
          console.log(chalk.gray('\n  No active session yet'))
        }
        console.log('')
        return true

      case '/history':
        console.log(chalk.gray(`\n  Messages sent: ${this.messageCount}\n`))
        return true

      case '/debug':
        this.debug = !this.debug
        console.log(chalk.gray(`\n  Debug mode: ${this.debug ? 'ON' : 'OFF'}\n`))
        return true

      case '/spaces':
        this.runAsync(this.listSpaces())
        return true

      case '/characters':
      case '/agents':
        this.runAsync(this.listAgents())
        return true

      case '/ls':
        this.runAsync(this.listFiles(args[0]))
        return true

      case '/switch':
        if (!args[0]) {
          console.log(chalk.yellow('\n  Usage: /switch <agentId>\n'))
        } else {
          this.runAsync(this.switchAgent(args[0]))
        }
        return true

      case '/help':
        this.renderer.showHelp()
        return true

      default:
        console.log(chalk.yellow(`\n  Unknown command: ${cmd}`))
        console.log(chalk.gray('  Type /help for available commands\n'))
        return true
    }
  }

  /**
   * Run an async command and catch errors (for slash commands that need API calls)
   */
  private runAsync(promise: Promise<void>): void {
    promise.catch((err) => {
      console.error(chalk.red(`\n  Error: ${err.message}\n`))
    })
  }

  // --- Async slash command handlers ---

  private async listSpaces(): Promise<void> {
    const spinner = ora('Fetching spaces...').start()
    const response = await this.apiClient.get('/api/v1/spaces')
    const spaces = Array.isArray(response) ? response : response.spaces || []
    spinner.stop()

    if (spaces.length === 0) {
      console.log(chalk.gray('\n  No spaces found\n'))
      return
    }

    console.log('')
    for (const s of spaces) {
      if (s.archived) continue
      const current = s.id === this.spaceId ? chalk.cyan(' ← current') : ''
      const agents = (s.agentRefs || []).filter((r: any) => r.enabled !== false).length
      console.log(chalk.gray(`  ${s.id}  `) + chalk.bold(s.name) + chalk.gray(` (${agents} agents)`) + current)
    }
    console.log('')
  }

  private async listAgents(): Promise<void> {
    const spinner = ora('Fetching agents...').start()
    const response = await this.apiClient.get('/api/v1/agents')
    const agents = response.agents || []
    spinner.stop()

    if (agents.length === 0) {
      console.log(chalk.gray('\n  No agents found\n'))
      return
    }

    console.log('')
    for (const a of agents) {
      if (a.archived) continue
      const current = a.id === this.agentId ? chalk.cyan(' ← current') : ''
      console.log(chalk.gray(`  ${a.id}  `) + chalk.bold(a.name) + chalk.gray(` — ${a.role}`) + current)
    }
    console.log(chalk.gray('\n  Switch with: /switch <id>\n'))
  }

  private async listFiles(path?: string): Promise<void> {
    if (!this.spaceId) {
      console.log(chalk.gray('\n  No space connected\n'))
      return
    }
    const spinner = ora('Listing files...').start()
    try {
      const files = await this.apiClient.get(
        `/api/spaces/${this.spaceId}/files/browse?path=${encodeURIComponent(path || '/')}`
      )
      spinner.stop()

      const items = Array.isArray(files) ? files : files.files || files.entries || []
      if (items.length === 0) {
        console.log(chalk.gray('\n  Empty directory\n'))
        return
      }

      console.log('')
      for (const f of items) {
        const name = f.name || f.path || f
        const isDir = f.type === 'directory' || f.isDirectory
        console.log(chalk.gray('  ') + (isDir ? chalk.blue(name + '/') : name))
      }
      console.log('')
    } catch {
      spinner.stop()
      console.log(chalk.gray('\n  Could not list files\n'))
    }
  }

  private async switchAgent(newAgentId: string): Promise<void> {
    const spinner = ora('Loading agent...').start()
    try {
      const response = await this.apiClient.get(`/api/v1/agents/${newAgentId}`)
      const agent = response.agent
      spinner.stop()

      this.agentId = newAgentId
      // Reset session — new agent = new conversation
      this.sessionId = null
      this.chatId = null
      this.messageCount = 0

      console.log(chalk.green(`\n  Switched to: ${agent.name} — ${agent.role}\n`))
    } catch {
      spinner.stop()
      console.log(chalk.red(`\n  Agent not found: ${newAgentId}\n`))
    }
  }

  /**
   * Show how to resume this session (like Claude Code does on exit)
   */
  private showResumeHint(): void {
    console.log('')
    if (this.sessionId) {
      const parts = ['teamday chat']
      if (this.spaceId) parts.push(this.spaceId)
      parts.push(`--session ${this.sessionId}`)
      if (this.chatId) parts.push(`--chat ${this.chatId}`)
      if (this.agentId) parts.push(`--agent ${this.agentId}`)

      console.log(chalk.gray('  To resume this session:'))
      console.log(chalk.cyan(`  ${parts.join(' ')}`))
    }
    console.log('')
  }

  /**
   * Send a message in interactive mode — stream response with tool indicators
   */
  private async sendMessage(message: string): Promise<void> {
    const spinner = ora('Thinking...').start()

    try {
      let hasContent = false
      this.messageCount++

      if (this.debug) {
        console.error(chalk.gray(`  [debug] sending: sessionId=${this.sessionId}, chatId=${this.chatId}`))
      }

      for await (const chunk of this.streamExecute(message)) {
        if (this.debug) {
          const preview = chunk.data?.substring(0, 80) || ''
          console.error(chalk.gray(`  [debug] chunk: type=${chunk.type} data="${preview}"${chunk.raw ? ' +raw' : ''}`))
        }

        switch (chunk.type) {
          case 'text':
            if (!hasContent) {
              spinner.stop()
              hasContent = true
            }
            this.renderer.writeTextDelta(chunk.data)
            break
          case 'tool_start':
            if (!hasContent) {
              spinner.stop()
              hasContent = true
            }
            this.renderer.showToolStart(chunk.data)
            break
          case 'tool_end':
            this.renderer.showToolEnd(chunk.data)
            break
          case 'error':
            this.renderer.stopSpinner()
            spinner.stop()
            this.renderer.showError(chunk.data)
            break
        }
      }

      this.renderer.flush()

      if (hasContent) {
        this.renderer.newline()
      } else {
        spinner.stop()
      }
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to send message'))
      console.error(chalk.red(`\nError: ${error.message}\n`))

      if (error.statusCode === 401) {
        console.log(
          chalk.yellow('   Authentication expired. Please run: teamday auth login\n')
        )
        throw error
      }
    }
  }

  /**
   * Stream an execution request via POST SSE
   * Captures sessionId/chatId from meta/result events for multi-turn continuity
   */
  private async *streamExecute(message: string): AsyncGenerator<StreamChunk> {
    const body: AgentExecuteRequest = {
      message,
      stream: true,
    }

    if (this.spaceId) body.spaceId = this.spaceId
    if (this.sessionId) body.sessionId = this.sessionId
    if (this.chatId) body.chatId = this.chatId

    // Use agent-specific endpoint if we have an agentId, otherwise the generic one
    const endpoint = this.agentId
      ? `/api/v1/agents/${this.agentId}/execute`
      : '/api/v1/execute'

    for await (const chunk of this.apiClient.streamPOST(endpoint, body)) {
      // Capture session context from meta/result events
      if (chunk.type === 'meta' && chunk.raw) {
        this.sessionId = chunk.raw.sessionId || this.sessionId
        this.chatId = chunk.raw.chatId || this.chatId
      } else if (chunk.type === 'done' && chunk.raw) {
        this.sessionId = chunk.raw.sessionId || this.sessionId
      }

      yield chunk
    }
  }
}
