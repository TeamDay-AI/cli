/**
 * Chat Renderer — Streaming output with tool call indicators and code highlighting
 */

import chalk from 'chalk'
import ora, { type Ora } from 'ora'

let highlight: ((code: string, options?: { language?: string }) => string) | null = null
try {
  // cli-highlight is optional — degrade gracefully if unavailable
  const mod = await import('cli-highlight')
  highlight = mod.highlight
} catch {
  // no syntax highlighting available
}

type FenceState = { mode: 'outside' } | { mode: 'inside'; lang: string; buffer: string[] }

export class ChatRenderer {
  private spinner: Ora | null = null
  private fenceState: FenceState = { mode: 'outside' }
  private lineBuffer = ''

  // --- Streaming text ---

  /**
   * Write a text delta from the stream.
   * Handles code fence detection and syntax highlighting.
   */
  writeTextDelta(text: string): void {
    // Process character by character to detect code fences at line boundaries
    for (const char of text) {
      if (char === '\n') {
        this.processLine(this.lineBuffer)
        this.lineBuffer = ''
      } else {
        this.lineBuffer += char
      }
    }

    // Write any partial line that isn't inside a fence
    if (this.fenceState.mode === 'outside' && this.lineBuffer) {
      process.stdout.write(this.lineBuffer)
      this.lineBuffer = ''
    }
  }

  /**
   * Flush any remaining buffered content (call after stream ends)
   */
  flush(): void {
    if (this.lineBuffer) {
      if (this.fenceState.mode === 'inside') {
        this.fenceState.buffer.push(this.lineBuffer)
      } else {
        process.stdout.write(this.lineBuffer)
      }
      this.lineBuffer = ''
    }

    // If we're still inside a fence at stream end, flush it
    if (this.fenceState.mode === 'inside') {
      this.renderCodeBlock(this.fenceState.lang, this.fenceState.buffer)
      this.fenceState = { mode: 'outside' }
    }
  }

  private processLine(line: string): void {
    const trimmed = line.trimStart()

    if (this.fenceState.mode === 'outside') {
      // Check for opening fence
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim()
        this.fenceState = { mode: 'inside', lang, buffer: [] }
        return
      }
      // Regular line — write to stdout
      process.stdout.write(line + '\n')
    } else {
      // Inside a code fence — check for closing fence
      if (trimmed === '```') {
        this.renderCodeBlock(this.fenceState.lang, this.fenceState.buffer)
        this.fenceState = { mode: 'outside' }
        return
      }
      // Buffer the line
      this.fenceState.buffer.push(line)
    }
  }

  private renderCodeBlock(lang: string, lines: string[]): void {
    const code = lines.join('\n')
    const langLabel = lang ? chalk.gray(` ${lang} `) : ''
    const divider = chalk.gray('─'.repeat(Math.min(60, process.stdout.columns || 80)))

    process.stdout.write(chalk.gray('┌') + langLabel + divider.slice(langLabel.length + 1) + '\n')

    if (highlight && lang) {
      try {
        const highlighted = highlight(code, { language: lang })
        // Indent each line for visual grouping
        for (const hl of highlighted.split('\n')) {
          process.stdout.write(chalk.gray('│ ') + hl + '\n')
        }
      } catch {
        // Fallback: no highlighting
        for (const l of lines) {
          process.stdout.write(chalk.gray('│ ') + l + '\n')
        }
      }
    } else {
      for (const l of lines) {
        process.stdout.write(chalk.gray('│ ') + l + '\n')
      }
    }

    process.stdout.write(chalk.gray('└') + divider.slice(1) + '\n')
  }

  // --- Tool calls ---

  showToolStart(toolName: string): void {
    // Stop any existing spinner first
    if (this.spinner) {
      this.spinner.stop()
    }
    this.spinner = ora({
      text: chalk.cyan(toolName),
      color: 'cyan',
      indent: 0,
    }).start()
  }

  showToolEnd(toolName: string): void {
    if (this.spinner) {
      this.spinner.stopAndPersist({
        symbol: chalk.green('✓'),
        text: chalk.gray(toolName),
      })
      this.spinner = null
    }
  }

  // --- Session/status info ---

  showWelcome(agentName: string, role: string, spaceId?: string): void {
    console.log('')
    console.log(chalk.bold(`  ${agentName}`) + chalk.gray(` — ${role}`))
    if (spaceId) {
      console.log(chalk.gray(`  Space: ${spaceId}`))
    }
    console.log('')
    console.log(chalk.gray('  Commands: /exit  /clear  /history  /session  /debug  /help'))
    console.log('')
  }

  showSessionInfo(sessionId: string): void {
    if (sessionId) {
      console.log(chalk.gray(`  session: ${sessionId}`))
    }
  }

  showError(message: string): void {
    if (this.spinner) {
      this.spinner.fail(chalk.red(message))
      this.spinner = null
    } else {
      console.error(chalk.red(`\n  Error: ${message}`))
    }
  }

  showHelp(): void {
    console.log('')
    console.log(chalk.bold('  Chat:'))
    console.log(chalk.cyan('  /exit         ') + chalk.gray('— End session (shows resume command)'))
    console.log(chalk.cyan('  /clear        ') + chalk.gray('— Clear the screen'))
    console.log(chalk.cyan('  /session      ') + chalk.gray('— Show current session ID'))
    console.log(chalk.cyan('  /history      ') + chalk.gray('— Show message count'))
    console.log(chalk.cyan('  /debug        ') + chalk.gray('— Toggle debug mode'))
    console.log('')
    console.log(chalk.bold('  Explore:'))
    console.log(chalk.cyan('  /spaces       ') + chalk.gray('— List your spaces'))
    console.log(chalk.cyan('  /agents       ') + chalk.gray('— List available agents'))
    console.log(chalk.cyan('  /switch <id>  ') + chalk.gray('— Switch to a different agent'))
    console.log(chalk.cyan('  /ls [path]    ') + chalk.gray('— List files in current space'))
    console.log('')
    console.log(chalk.cyan('  /help         ') + chalk.gray('— Show this help'))
    console.log('')
  }

  // --- Screen control ---

  clear(): void {
    process.stdout.write('\x1B[2J\x1B[H')
  }

  newline(): void {
    console.log('')
  }

  /**
   * Stop any active spinner (e.g., on error)
   */
  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop()
      this.spinner = null
    }
  }
}
