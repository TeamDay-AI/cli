/**
 * Transient per-invocation CLI options that shouldn't persist to ~/.teamday/config.json.
 * Set by the preAction hook in index.ts, read by command actions.
 */

export interface CliOptions {
  orgOverride?: string
}

const state: CliOptions = {}

export function setCliOptions(opts: Partial<CliOptions>) {
  Object.assign(state, opts)
}

export function getCliOptions(): CliOptions {
  return state
}
