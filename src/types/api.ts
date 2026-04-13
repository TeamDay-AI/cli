/**
 * API Request/Response Types
 */

export interface Agent {
  id: string
  name: string
  role: string
  systemPrompt: string
  visibility: 'private' | 'organization' | 'public' | 'unlisted'
  model: string
  tags: string[]
  advanced_tools: string[]
  createdAt: string
  updatedAt: string
}

export interface AgentListResponse {
  success: boolean
  agents: Agent[]
  total: number
}

export interface AgentCreateRequest {
  name: string
  role?: string
  systemPrompt: string
  visibility?: string
  model?: string
  advanced_tools?: string[]
  tags?: string[]
  basedOnAgentId?: string
}

export interface AgentCreateResponse {
  success: boolean
  id: string
  name: string
  status: string
  chatUrl: string
}

export interface AgentExecuteRequest {
  message: string
  spaceId?: string
  sessionId?: string
  chatId?: string
  stream?: boolean
  parentExecutionId?: string
  delegationDepth?: number
}

export interface AgentExecuteResponse {
  success: boolean
  executionId: string
  chatId: string
  sessionId: string
  result?: string
  streamUrl?: string
}

export interface SpaceRef {
  skillId?: string
  mcpId?: string
  agentId?: string
  /** @deprecated Use agentId */
  characterId?: string
  enabled: boolean
  addedAt: string
  addedBy: string
  addedViaAgent?: string
}

export interface Space {
  id: string
  name: string
  description?: string
  organizationId: string
  visibility: 'private' | 'organization' | 'public'
  skillRefs?: SpaceRef[]
  mcpRefs?: SpaceRef[]
  agentRefs?: SpaceRef[]
  instructions?: string | null
  secretKeys?: string[]
  createdAt: string
  updatedAt: string
}

export interface MCP {
  id: string
  mcpType: string
  name: string
  description: string | null
  isActive: boolean
  ownerId: string
  credentialsSet: string[]
  createdAt: string | null
  updatedAt: string | null
  usageCount: number
}

export interface MCPListResponse {
  success: boolean
  mcps: MCP[]
  total: number
}

export interface MCPCreateRequest {
  mcpType: string
  name: string
  description?: string
  isActive?: boolean
  credentials?: Record<string, { value: string; isSecret: boolean }>
  permissions?: string[]
}

export interface Skill {
  id: string
  name: string
  description?: string
  source: 'core' | 'organization' | 'marketplace'
  visibility?: string
}

export interface SkillsListResponse {
  success: boolean
  skills: {
    core: Skill[]
    organization: Skill[]
    marketplace: Skill[]
  }
  total: number
}

export interface SecretsListResponse {
  spaceId: string
  secrets: string[]
  count: number
}

// --- Agent (full persona entity — Firestore collection: 'agents') ---

export interface AgentFull {
  id: string
  name: string
  role: string
  category: string | null
  slug: string | null
  description: string
  initialGreeting: string
  image: string
  color: string
  visibility: string
  model: string
  tags: string[]
  skillIds: string[]
  advanced_tools: string[]
  allowedTools: string[]
  // SDK-aligned fields (Agent Data Model v2)
  disallowedTools: string[]
  mcpTypes: string[]
  mcpInstanceIds: string[]
  subagentIds: string[]
  maxTurns: number | null
  // Marketing
  longDescription?: string | null
  faq?: Array<{ question: string; answer: string }> | null
  useCases?: string[] | null
  integrations?: string[] | null
  missions?: string[] | null
  seo?: {
    title?: string
    description?: string
    keywords?: string[]
    ogImage?: string
  } | null
  createdAt: string | null
  updatedAt: string | null
}

/** @deprecated Use AgentFull */
export type Character = AgentFull

export interface AgentFullListResponse {
  success: boolean
  agents: AgentFull[]
  characters?: AgentFull[]  // backward compat — server may return either key
  total: number
}

/** @deprecated Use AgentFullListResponse */
export type CharacterListResponse = AgentFullListResponse

export interface AgentFullCreateRequest {
  name: string
  role: string
  category: string
  system_message: string
  slug?: string
  description?: string
  initialGreeting?: string
  image?: string
  color?: string
  visibility?: string
  model?: string
  tags?: string[]
  skillIds?: string[]
  advanced_tools?: string[]
  allowedTools?: string[]
  // SDK-aligned fields (Agent Data Model v2)
  disallowedTools?: string[]
  mcpTypes?: string[]
  mcpInstanceIds?: string[]
  subagentIds?: string[]
  maxTurns?: number
  // Marketing
  longDescription?: string
  faq?: Array<{ question: string; answer: string }>
  useCases?: string[]
  integrations?: string[]
  missions?: string[]
  seo?: {
    title?: string
    description?: string
    keywords?: string[]
    ogImage?: string
  }
}

/** @deprecated Use AgentFullCreateRequest */
export type CharacterCreateRequest = AgentFullCreateRequest

export interface Task {
  id: string
  organizationId: string
  title: string
  description?: string
  assignedTo?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  spaceId?: string
  createdAt: string
  createdBy?: string
  completedAt?: string
}

export interface Execution {
  id: string
  agentId: string
  /** @deprecated Use agentId */
  characterId?: string
  organizationId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  message: string
  result?: string
  executionTime?: number
  createdAt: string
  updatedAt: string
}

export interface StreamChunk {
  type: 'text' | 'error' | 'done' | 'meta' | 'tool_start' | 'tool_end'
  data: string
  raw?: any
}

// --- Claude Credential Management ---

export interface KeysStatusResponse {
  success: boolean
  credentials: {
    hasOAuthToken: boolean
    hasApiKey: boolean
    hasOrgOAuthToken: boolean
    hasOrgApiKey: boolean
  }
  activeTier: 'user-oauth' | 'user-api' | 'org-oauth' | 'org-api' | 'server-oauth' | 'server-api' | 'none'
  reason?: 'no_credentials' | 'insufficient_credits' | 'all_suspended'
}

export interface APIError {
  statusCode: number
  message: string
  data?: any
}
