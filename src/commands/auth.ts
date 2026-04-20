/**
 * Auth Commands
 * Authentication and token management
 */

import { Command } from 'commander'
import chalk from 'chalk'
import type { AuthManager } from '../lib/auth-manager'
import type { APIClient } from '../lib/api-client'
import type { ConfigManager } from '../lib/config-manager'

export function createAuthCommands(
  authManager: AuthManager,
  apiClient: APIClient,
  config: ConfigManager
): Command {
  const auth = new Command('auth').description('Authentication commands')

  // teamday auth login [--token <pat>] [--org <id>]
  auth
    .command('login')
    .description('Authenticate with OAuth, or pass --token <PAT> for headless setup')
    .option('--token <token>', 'Personal Access Token (td_...) for non-interactive auth')
    .option('--org <id>', 'Default organization ID to persist in config')
    .action(async (options: { token?: string; org?: string }) => {
      try {
        if (options.token) {
          // Headless path — skip OAuth, persist PAT + optional default org.
          // Mirrors `auth set-key` but also lets agents/scripts set org in one call.
          await authManager.setKey(options.token)
          if (options.org) {
            await config.set('organization', options.org)
            console.log(chalk.gray(`   Default organization: ${options.org}`))
          }
          return
        }
        await authManager.login()
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Login failed: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday auth logout
  auth
    .command('logout')
    .description('Clear stored credentials')
    .action(async () => {
      try {
        await authManager.logout()
      } catch (error: any) {
        console.error(chalk.red(`❌ Logout failed: ${error.message}`))
        process.exit(1)
      }
    })

  // teamday auth status
  auth
    .command('status')
    .description('Show authentication status')
    .action(async () => {
      try {
        const status = await authManager.getStatus()

        if (!status.authenticated) {
          console.log(chalk.yellow('\n⚠️  Not authenticated'))
          console.log(chalk.gray('   Run: teamday auth login\n'))
          process.exit(1)
        }

        console.log(chalk.green('\n✓ Authenticated\n'))
        console.log(`${chalk.bold('Method:')} ${status.method}`)

        if (status.userId) {
          console.log(`${chalk.bold('User ID:')} ${status.userId}`)
        }

        if (status.organizationId) {
          console.log(
            `${chalk.bold('Organization:')} ${status.organizationId}`
          )
        }

        if (status.expiresAt) {
          const now = new Date()
          const timeLeft = Math.floor(
            (status.expiresAt.getTime() - now.getTime()) / 1000 / 60
          )

          if (timeLeft > 0) {
            console.log(
              `${chalk.bold('Expires:')} in ${timeLeft} minutes`
            )
          } else {
            console.log(chalk.yellow(`${chalk.bold('Expires:')} Expired`))
            console.log(
              chalk.gray('   Token will auto-refresh on next request')
            )
          }
        }

        console.log()
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday auth set-key <token>
  auth
    .command('set-key <token>')
    .description('Set Personal Access Token')
    .action(async (token: string) => {
      try {
        await authManager.setKey(token)
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday auth refresh
  auth
    .command('refresh')
    .description('Refresh access token')
    .action(async () => {
      try {
        await authManager.refreshAccessToken()
        console.log(chalk.green('\n✅ Access token refreshed\n'))
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Refresh failed: ${error.message}\n`))
        console.log(chalk.gray('   Try logging in again: teamday auth login\n'))
        process.exit(1)
      }
    })

  // ─── Token Management ─────────────────────────────

  // teamday auth create-token <name>
  auth
    .command('create-token <name>')
    .description('Create a new Personal Access Token (PAT)')
    .option('--expires <days>', 'Expiration in days (1-365)', '90')
    .option('--org <id>', 'Organization ID (defaults to current org)')
    .action(async (name: string, options: { expires: string; org?: string }) => {
      try {
        const expiresInDays = parseInt(options.expires, 10)
        if (isNaN(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
          console.error(chalk.red('❌ --expires must be 1-365'))
          process.exit(1)
        }

        // Get org ID from flag, auth context, or fail
        let organizationId = options.org
        if (!organizationId) {
          const status = await authManager.getStatus()
          organizationId = status.organizationId
        }

        const response = await apiClient.post<{
          token: string
          id: string
          expiresAt: string
        }>('/api/tokens/create', {
          name,
          expiresInDays,
          organizationId,
        })

        console.log(chalk.green('\n✅ Token created\n'))
        console.log(`${chalk.bold('Name:')}    ${name}`)
        console.log(`${chalk.bold('Token:')}   ${chalk.cyan(response.token)}`)
        console.log(`${chalk.bold('Expires:')} ${new Date(response.expiresAt).toLocaleDateString()}`)
        console.log(`${chalk.bold('ID:')}      ${response.id}`)
        console.log(chalk.yellow('\n⚠️  Copy the token now — it won\'t be shown again.\n'))
        console.log(chalk.gray(`   Use it: teamday auth set-key ${response.token}`))
        console.log(chalk.gray(`   Or set: export TEAMDAY_API_TOKEN=${response.token}\n`))
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Failed to create token: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday auth list-tokens
  auth
    .command('list-tokens')
    .description('List your Personal Access Tokens')
    .option('--org <id>', 'Organization ID (defaults to current org)')
    .action(async (options: { org?: string }) => {
      try {
        let organizationId = options.org
        if (!organizationId) {
          const status = await authManager.getStatus()
          organizationId = status.organizationId
        }

        const params = organizationId ? `?organizationId=${organizationId}` : ''
        const response = await apiClient.get<{
          tokens: Array<{
            id: string
            name: string
            tokenPreview: string
            createdAt: string
            expiresAt: string
            lastUsedAt: string | null
          }>
          count: number
        }>(`/api/tokens/list${params}`)

        if (response.count === 0) {
          console.log(chalk.yellow('\n  No tokens found.\n'))
          console.log(chalk.gray('  Create one: teamday auth create-token my-token\n'))
          return
        }

        console.log(`\n  ${chalk.bold(`${response.count} token(s)`)}\n`)

        for (const t of response.tokens) {
          const expired = new Date(t.expiresAt) < new Date()
          const expiryLabel = expired
            ? chalk.red('expired')
            : chalk.green(`expires ${new Date(t.expiresAt).toLocaleDateString()}`)

          console.log(`  ${chalk.bold(t.name)} ${chalk.gray(t.tokenPreview)}`)
          console.log(`    ${expiryLabel} | created ${new Date(t.createdAt).toLocaleDateString()}${t.lastUsedAt ? ` | last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ''}`)
          console.log(`    ${chalk.gray(`ID: ${t.id}`)}`)
          console.log()
        }
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Failed to list tokens: ${error.message}\n`))
        process.exit(1)
      }
    })

  // teamday auth revoke-token <id>
  auth
    .command('revoke-token <id>')
    .description('Revoke a Personal Access Token by ID')
    .action(async (id: string) => {
      try {
        await apiClient.post(`/api/tokens/${id}/revoke`)
        console.log(chalk.green(`\n✅ Token ${id} revoked\n`))
      } catch (error: any) {
        console.error(chalk.red(`\n❌ Failed to revoke token: ${error.message}\n`))
        process.exit(1)
      }
    })

  return auth
}
