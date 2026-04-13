/**
 * Chat Input — Readline wrapper with history and slash commands
 *
 * Uses rl.question() instead of manual prompt/listener management
 * to avoid Bun-specific issues with readline resume and input echoing.
 */

import * as readline from 'node:readline'
import chalk from 'chalk'

export type SlashCommand = '/exit' | '/clear' | '/history' | '/session' | '/help' | '/debug'

const SLASH_COMMANDS: SlashCommand[] = ['/exit', '/clear', '/history', '/session', '/help', '/debug']

export class ChatInput {
  private rl: readline.Interface | null = null
  private closed = false
  private ctrlCCount = 0
  private ctrlCTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Lazily create readline interface on first use.
   */
  private ensureRL(): readline.Interface {
    if (!this.rl) {
      process.stdin.resume()
      if (typeof (process.stdin as any).ref === 'function') {
        (process.stdin as any).ref()
      }

      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        historySize: 200,
        terminal: process.stdin.isTTY ?? true,
      })
    }
    return this.rl
  }

  /**
   * Show prompt and wait for user input.
   * Uses rl.question() which handles resume/prompt internally.
   */
  prompt(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (this.closed) {
        reject(new Error('exit'))
        return
      }

      const rl = this.ensureRL()

      const onSIGINT = () => {
        this.ctrlCCount++

        if (this.ctrlCCount >= 2) {
          rl.removeListener('SIGINT', onSIGINT)
          rl.removeListener('close', onClose)
          reject(new Error('exit'))
          return
        }

        process.stdout.write('\n')
        process.stdout.write(chalk.gray('  (press Ctrl+C again to exit)\n'))

        // Re-ask with a fresh question call
        rl.removeListener('SIGINT', onSIGINT)
        rl.removeListener('close', onClose)
        if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer)
        this.ctrlCTimer = setTimeout(() => { this.ctrlCCount = 0 }, 1500)

        // Recursively re-prompt
        this.prompt().then(resolve, reject)
      }

      const onClose = () => {
        rl.removeListener('SIGINT', onSIGINT)
        reject(new Error('exit'))
      }

      rl.on('SIGINT', onSIGINT)
      rl.on('close', onClose)

      // rl.question() handles resume + prompt display + line reading internally
      rl.question(chalk.blue('You > '), (answer) => {
        rl.removeListener('SIGINT', onSIGINT)
        rl.removeListener('close', onClose)
        this.ctrlCCount = 0
        resolve(answer.trim())
      })
    })
  }

  /**
   * Check if input is a slash command
   */
  isSlashCommand(input: string): input is SlashCommand {
    return SLASH_COMMANDS.includes(input as SlashCommand)
  }

  /**
   * Close and cleanup
   */
  close(): void {
    this.closed = true
    if (this.ctrlCTimer) clearTimeout(this.ctrlCTimer)
    this.rl?.close()
    this.rl = null
  }
}
