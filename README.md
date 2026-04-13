# TeamDay CLI

> Command-line interface for managing AI agents, spaces, offices, and tasks.

The CLI is the proof that offices work. If you can't `teamday scan "ai agents"` and see real data, the office isn't done.

## Installation

```bash
# Install dependencies
bun install

# Run CLI locally
bun run bin/teamday.ts [command]

# Or link globally
bun link
teamday [command]
```

No build step needed — Bun runs TypeScript directly.

## Quick Start

```bash
# 1. Authenticate
teamday auth login                              # OAuth (opens browser)

# 2. Check connection
teamday auth status

# 3. Try an office command
teamday scan "ai agents, mcp servers" --time week

# 4. Or manage resources
teamday agents list
teamday spaces list
```

## Commands

### Authentication

```bash
teamday auth login                  # OAuth login (opens browser)
teamday auth logout                 # Clear credentials
teamday auth status                 # Show auth status + org
teamday auth set-key <token>        # Set PAT token (td_ prefix)
teamday auth refresh                # Refresh access token
```

### Agents

```bash
teamday agents list [options]       # List agents (--status, --visibility, --tag)
teamday agents get <id>             # Get agent details
teamday agents create [options]     # Create agent (--name, --role, --system-prompt)
teamday agents update <id> [opts]   # Update agent
teamday agents delete <id>          # Archive agent
teamday agents exec <id> <msg>      # Execute agent (--space, --session)
teamday agents chat <id>            # Interactive chat session
```

### Spaces

```bash
teamday spaces list [options]       # List spaces
teamday spaces get <id>             # Get space details
teamday spaces create [options]     # Create space
teamday spaces delete <id>          # Delete space
teamday spaces ls <id> [path]       # List files in space
teamday spaces git <id> <args...>   # Run git command in space
```

### Tasks

```bash
teamday tasks list [options]        # List tasks
teamday tasks get <id>              # Get task details
teamday tasks create [options]      # Create task
teamday tasks update <id> [opts]    # Update task
teamday tasks complete <id>         # Mark complete
teamday tasks cancel <id>           # Cancel task
```

### Executions

```bash
teamday executions list [options]   # List executions
teamday executions get <id>         # Get execution details
teamday executions cancel <id>      # Cancel execution
teamday executions tree <id>        # Show delegation tree
teamday executions logs <id>        # View execution logs
```

### Characters

```bash
teamday characters list             # List all characters
teamday characters get <id>         # Get character details
```

### Skills

```bash
teamday skills list                 # List installed skills
teamday skills get <id>             # Get skill details
```

### MCP Servers

```bash
teamday mcps list                   # List MCP server connections
teamday mcps get <id>               # Get MCP details
```

### API Keys

```bash
teamday keys list                   # List API keys
teamday keys create [options]       # Create new key
teamday keys revoke <id>            # Revoke a key
```

### Chat (Default Command)

```bash
teamday chat <agent-id>             # Start interactive chat
teamday                             # Auto-detect agent and start chatting
teamday chat --list [spaceId]       # List recent chats (optionally by space)
teamday chat --read <chatId>        # Read a chat's message history
teamday chat --list-missions        # List mission-spawned chats with run info
```

### Office Commands

Office-specific commands expose key office actions for testing and automation.

```bash
# Social Media Office — scan Reddit + HN for opportunities
teamday scan <topics> [options]
teamday scan "ai agents, mcp" --time week --limit 5
teamday scan "claude, anthropic" --platforms reddit --format json
```

Options:
- `--time <range>` — Time range: day, week, month, year (default: week)
- `--limit <n>` — Results per platform per topic (default: 10)
- `--platforms <list>` — Platforms: reddit,hackernews (default: both)
- `--format <format>` — Output: table or json

### Config

```bash
teamday config list                 # Show all config
teamday config get <key>            # Get value
teamday config set <key> <value>    # Set value
teamday config unset <key>          # Reset to default
teamday config reset                # Reset all
```

## Configuration

Config file: `~/.teamday/config.json`

```json
{
  "api_url": "https://cc.teamday.ai",
  "format": "table",
  "no_color": false,
  "timeout": 300000,
  "verbose": false
}
```

### Switching Environments

```bash
# Local development
teamday config set api_url http://localhost:3000
teamday auth login

# Production
teamday config set api_url https://cc.teamday.ai
teamday auth login
```

### Output Formats

All list commands support `--format`:

```bash
teamday agents list                         # Table (default)
teamday agents list --format json           # JSON (for piping)
teamday agents list --format yaml           # YAML
teamday scan "ai agents" --format json      # JSON scan results
```

## Adding a New Office Command

Every office should expose its key action as a CLI command. See `docs/office-patterns/cli-command.md` for the full template.

Quick steps:

1. Create `src/commands/{office}.ts` exporting `create{Office}Commands(apiClient, config)`
2. Import + register in `src/index.ts`
3. Use `ora` for spinners, `chalk` for colors, `apiClient.get()` for API calls
4. Support `--format json` for machine-readable output
5. Test: `teamday {command} --help`

Reference: `src/commands/scan.ts` (Social Media scan command).

## Architecture

```
packages/cli/
├── bin/teamday.ts              # Entry point (#!/usr/bin/env bun)
├── src/
│   ├── index.ts                # Registers all commands via Commander.js
│   ├── commands/               # Command implementations
│   │   ├── auth.ts             # Auth: login, logout, status, set-key
│   │   ├── agents.ts           # Agent CRUD + exec + chat
│   │   ├── spaces.ts           # Space CRUD + ls + git
│   │   ├── tasks.ts            # Task CRUD + complete + cancel
│   │   ├── executions.ts       # Execution tracking + tree + logs
│   │   ├── characters.ts       # Character list + get
│   │   ├── skills.ts           # Skill list + get
│   │   ├── mcps.ts             # MCP server list + get
│   │   ├── keys.ts             # API key management
│   │   ├── chat.ts             # Interactive chat + default action
│   │   ├── scan.ts             # Social Media scan (office command)
│   │   └── config.ts           # Config management
│   ├── lib/                    # Core libraries
│   │   ├── api-client.ts       # HTTP client (GET/POST/PATCH/DELETE + SSE)
│   │   ├── auth-manager.ts     # OAuth flow + PAT token management
│   │   ├── config-manager.ts   # ~/.teamday/config.json persistence
│   │   ├── formatters.ts       # Table, JSON, YAML output formatting
│   │   └── interactive.ts      # Interactive chat mode (readline + SSE)
│   └── types/                  # TypeScript definitions
└── tests/                      # Unit + integration tests
```

## Technology Stack

- **Runtime**: Bun (no build step — runs TS directly)
- **CLI Framework**: Commander.js
- **HTTP Client**: Native fetch API
- **Streaming**: Server-Sent Events (SSE) via eventsource-parser
- **Auth**: OAuth 2.0 flow + PAT tokens (keytar for secure storage)
- **Output**: cli-table3, js-yaml, chalk, ora
- **Interactive**: Inquirer.js

## Troubleshooting

```bash
# Auth issues
teamday auth status                          # Check what's connected
teamday auth logout && teamday auth login    # Re-authenticate

# Connection issues
teamday config get api_url                   # Check target URL
teamday config set api_url http://localhost:3000  # Switch to local

# Verbose output for debugging
teamday --verbose agents list
```

## Testing

```bash
# Unit tests
bun run test:unit

# Integration tests (local)
bun run test:integration:local

# Integration tests (production)
bun run test:integration:cc

# Character tests
bun run test:characters
```
