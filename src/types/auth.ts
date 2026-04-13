/**
 * Authentication Types
 */

export interface AuthTokens {
  /** OAuth access token (15 min expiry) */
  accessToken: string

  /** OAuth refresh token (90 day expiry) */
  refreshToken: string

  /** Access token expiration timestamp */
  expiresAt: Date

  /** Authenticated user ID */
  userId: string

  /** User's organization ID */
  organizationId: string
}

export interface PersonalAccessToken {
  /** PAT token value (td_...) */
  pat: string

  /** Token type identifier */
  type: 'personal_access_token'
}

export type StoredAuth = AuthTokens | PersonalAccessToken

export interface AuthStatus {
  /** Whether user is authenticated */
  authenticated: boolean

  /** Authentication method used */
  method?: 'oauth' | 'pat' | 'env'

  /** User ID (if OAuth) */
  userId?: string

  /** Organization ID */
  organizationId?: string

  /** Token expiration (if OAuth) */
  expiresAt?: Date
}

export interface OAuthInitiateResponse {
  /** Authorization code for polling */
  code: string

  /** URL for user to authorize */
  authUrl: string

  /** Seconds until code expires */
  expiresIn: number
}

export interface OAuthPollResponse {
  /** Poll status */
  status: 'pending' | 'authorized'

  /** Message (if pending) */
  message?: string

  /** Access token (if authorized) */
  accessToken?: string

  /** Refresh token (if authorized) */
  refreshToken?: string

  /** Expiration timestamp (if authorized) */
  expiresAt?: string

  /** User ID (if authorized) */
  userId?: string

  /** Organization ID (if authorized) */
  organizationId?: string
}

export interface RefreshTokenResponse {
  /** New access token */
  accessToken: string

  /** New expiration timestamp */
  expiresAt: string
}
