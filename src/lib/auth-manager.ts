/**
 * Authentication Manager
 * Handles OAuth flow, token storage, and authentication state
 */

import { join } from 'path'
import { homedir } from 'os'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import open from 'open'
import ora from 'ora'
import chalk from 'chalk'
import type { ConfigManager } from './config-manager'
import type {
  AuthTokens,
  PersonalAccessToken,
  StoredAuth,
  AuthStatus,
  OAuthInitiateResponse,
  OAuthPollResponse,
  RefreshTokenResponse,
} from '../types/auth'

const CONFIG_DIR = join(homedir(), '.teamday')
const TOKEN_FILE = join(CONFIG_DIR, 'auth.json')
const SERVICE_NAME = 'teamday-cli'
const TOKEN_ACCOUNT = 'default'

export class AuthManager {
  private cachedAuth: StoredAuth | null = null
  private apiClient: any = null // Will be set by APIClient

  constructor(private config: ConfigManager) {}

  /**
   * Set API client (called by APIClient after construction)
   */
  setApiClient(client: any): void {
    this.apiClient = client
  }

  /**
   * OAuth login flow
   */
  async login(): Promise<void> {
    const spinner = ora('Initiating authentication...').start()

    try {
      // 1. Initiate OAuth flow
      const { code, authUrl, expiresIn } = await this.apiClient.post<OAuthInitiateResponse>(
        '/api/auth/cli/initiate',
        null,
        { skipAuth: true }
      )

      spinner.succeed('Authentication code generated')

      // 2. Open browser
      console.log(chalk.blue('\n🔐 Opening browser for authentication...\n'))
      console.log(chalk.gray(`If browser doesn't open, visit: ${authUrl}\n`))

      try {
        await open(authUrl)
      } catch (error) {
        console.warn(chalk.yellow('Could not open browser automatically'))
      }

      // 3. Poll for tokens
      spinner.start('Waiting for authorization...')
      const tokens = await this.pollForTokens(code, expiresIn)
      spinner.succeed(chalk.green('Authentication successful!'))

      // 4. Store tokens
      await this.storeTokens(tokens)

      console.log(chalk.green('\n✅ You are now authenticated'))
      console.log(chalk.gray(`   User ID: ${tokens.userId}`))
      console.log(chalk.gray(`   Organization: ${tokens.organizationId}\n`))
    } catch (error: any) {
      spinner.fail(chalk.red('Authentication failed'))
      throw error
    }
  }

  /**
   * Poll for OAuth tokens
   */
  private async pollForTokens(
    code: string,
    expiresIn: number
  ): Promise<AuthTokens> {
    const maxAttempts = Math.floor(expiresIn / 2) // Poll every 2 seconds

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.apiClient.get<OAuthPollResponse>(
          `/api/auth/cli/poll?code=${code}`,
          { skipAuth: true }
        )

        if (response.status === 'authorized') {
          return {
            accessToken: response.accessToken!,
            refreshToken: response.refreshToken!,
            expiresAt: new Date(response.expiresAt!),
            userId: response.userId!,
            organizationId: response.organizationId!,
          }
        }

        // Wait 2 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (error) {
        // Ignore poll errors, continue trying
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    throw new Error(
      'Authentication timeout - user did not authorize within 5 minutes'
    )
  }

  /**
   * Logout (clear tokens)
   */
  async logout(): Promise<void> {
    // Try keytar first
    try {
      const keytar = await this.loadKeytar()
      if (keytar) {
        await keytar.deletePassword(SERVICE_NAME, TOKEN_ACCOUNT)
      }
    } catch (error) {
      // Keytar not available, that's okay
    }

    // Remove file storage
    if (existsSync(TOKEN_FILE)) {
      await rm(TOKEN_FILE)
    }

    this.cachedAuth = null
    console.log(chalk.green('✅ Logged out successfully'))
  }

  /**
   * Get authentication status
   */
  async getStatus(): Promise<AuthStatus> {
    // Check environment variable first
    const envToken = process.env.TEAMDAY_API_TOKEN
    if (envToken) {
      return {
        authenticated: true,
        method: 'env',
      }
    }

    // Load stored tokens
    const auth = await this.loadTokens()

    if (!auth) {
      return {
        authenticated: false,
      }
    }

    // Check if it's a PAT
    if ('pat' in auth) {
      return {
        authenticated: true,
        method: 'pat',
      }
    }

    // It's OAuth tokens
    return {
      authenticated: true,
      method: 'oauth',
      userId: auth.userId,
      organizationId: auth.organizationId,
      expiresAt: auth.expiresAt,
    }
  }

  /**
   * Set Personal Access Token
   */
  async setKey(token: string): Promise<void> {
    // Validate token format
    if (!token.startsWith('td_')) {
      throw new Error(
        'Invalid token format. Personal Access Tokens must start with "td_"'
      )
    }

    const patData: PersonalAccessToken = {
      pat: token,
      type: 'personal_access_token',
    }

    await this.storeTokens(patData)

    console.log(chalk.green('✅ Personal Access Token saved'))
  }

  /**
   * Get authentication header for API requests
   */
  async getAuthHeader(): Promise<string> {
    // Check environment variable first (highest priority)
    const envToken = process.env.TEAMDAY_API_TOKEN
    if (envToken) {
      return `Bearer ${envToken}`
    }

    // Load from storage
    const auth = await this.loadTokens()

    if (!auth) {
      throw new Error(
        'Not authenticated. Run: teamday auth login'
      )
    }

    // If it's a PAT, use directly
    if ('pat' in auth) {
      return `Bearer ${auth.pat}`
    }

    // It's OAuth - check if expired
    const now = new Date()
    if (auth.expiresAt < now) {
      // Token expired, try to refresh
      try {
        const refreshed = await this.refreshAccessToken()
        return `Bearer ${refreshed.accessToken}`
      } catch (error) {
        throw new Error(
          'Access token expired and refresh failed. Please login again: teamday auth login'
        )
      }
    }

    return `Bearer ${auth.accessToken}`
  }

  /**
   * Refresh OAuth access token
   */
  async refreshAccessToken(): Promise<AuthTokens> {
    const auth = await this.loadTokens()

    if (!auth || 'pat' in auth) {
      throw new Error('No OAuth tokens to refresh')
    }

    const response = await this.apiClient.post<RefreshTokenResponse>(
      '/api/auth/cli/refresh',
      { refreshToken: auth.refreshToken },
      { skipAuth: true }
    )

    const newTokens: AuthTokens = {
      ...auth,
      accessToken: response.accessToken,
      expiresAt: new Date(response.expiresAt),
    }

    await this.storeTokens(newTokens)

    this.cachedAuth = newTokens
    return newTokens
  }

  /**
   * Store tokens securely
   */
  private async storeTokens(auth: StoredAuth): Promise<void> {
    // Try keytar first (most secure)
    try {
      const keytar = await this.loadKeytar()
      if (keytar) {
        await keytar.setPassword(
          SERVICE_NAME,
          TOKEN_ACCOUNT,
          JSON.stringify(auth)
        )
        this.cachedAuth = auth
        return
      }
    } catch (error) {
      // Keytar failed, fall back to file storage
      console.warn(
        chalk.yellow(
          '⚠️  Keychain unavailable, using file storage (less secure)'
        )
      )
    }

    // Fallback: File storage
    await this.storeTokensFile(auth)
  }

  /**
   * Load tokens from storage
   */
  private async loadTokens(): Promise<StoredAuth | null> {
    // Check cache first
    if (this.cachedAuth) {
      return this.cachedAuth
    }

    // Try keytar first
    try {
      const keytar = await this.loadKeytar()
      if (keytar) {
        const json = await keytar.getPassword(SERVICE_NAME, TOKEN_ACCOUNT)
        if (json) {
          const auth = JSON.parse(json)
          // Convert expiresAt string to Date if it's OAuth tokens
          if ('expiresAt' in auth && typeof auth.expiresAt === 'string') {
            auth.expiresAt = new Date(auth.expiresAt)
          }
          this.cachedAuth = auth
          return auth
        }
      }
    } catch (error) {
      // Keytar not available, try file
    }

    // Try file storage
    return this.loadTokensFile()
  }

  /**
   * Store tokens in file (fallback)
   */
  private async storeTokensFile(auth: StoredAuth): Promise<void> {
    // Ensure directory exists
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true })
    }

    // Write to file
    await writeFile(TOKEN_FILE, JSON.stringify(auth, null, 2), 'utf-8')
    this.cachedAuth = auth
  }

  /**
   * Load tokens from file (fallback)
   */
  private async loadTokensFile(): Promise<StoredAuth | null> {
    if (!existsSync(TOKEN_FILE)) {
      return null
    }

    try {
      const json = await readFile(TOKEN_FILE, 'utf-8')
      const auth = JSON.parse(json)

      // Convert expiresAt string to Date if it's OAuth tokens
      if ('expiresAt' in auth && typeof auth.expiresAt === 'string') {
        auth.expiresAt = new Date(auth.expiresAt)
      }

      this.cachedAuth = auth
      return auth
    } catch (error) {
      return null
    }
  }

  /**
   * Load keytar module dynamically (optional dependency)
   */
  private async loadKeytar(): Promise<any> {
    try {
      // Try to import keytar
      const keytar = await import('keytar')
      return keytar.default || keytar
    } catch (error) {
      // Keytar not available
      return null
    }
  }
}
