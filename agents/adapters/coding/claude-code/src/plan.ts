/**
 * Invocation → launch plan, pure.
 *
 * Translation only (ADR-0013 decision 1): the plan narrows what the
 * provider can even SEE to the granted tool surface (decision 2 — real
 * defense in depth, never the security boundary, which stays with the
 * substrate), passes routing through as data (no model identifier exists
 * in this package), and names the credential variables the substrate must
 * provision without ever holding a value (decision 7).
 *
 * Flag surface verified against the pinned CLI, `claude --version` =
 * 2.1.241: `--print`, `--output-format stream-json`, `--verbose`,
 * `--tools` ("" disables all tools; comma-separated names otherwise),
 * `--allowedTools`, `--model`, `--fallback-model`, `--setting-sources`.
 */
import type { WireInvocation } from './spi.js'

/** The provider CLI this adapter targets, and the version it is pinned to. */
export const PROVIDER = {
  command: 'claude',
  package: '@anthropic-ai/claude-code',
  version: '2.1.241',
  image: 'secure-home-runner-claude',
} as const

export interface LaunchPlan {
  /** Resolved by name on PATH — the pinned binary inside the paired image. */
  readonly command: typeof PROVIDER.command
  readonly argv: readonly string[]
  /**
   * Environment-variable NAMES the substrate must provision. Names only:
   * the plan has no field a credential value could occupy.
   */
  readonly required_env: readonly string[]
  /** The opaque workspace root reference; the adapter resolves nothing. */
  readonly cwd_ref: string
}

export type PlanResult =
  | { readonly ok: true; readonly plan: LaunchPlan }
  | { readonly ok: false; readonly refusal: string }

/**
 * Tool lists travel as ONE comma-joined argv token. The CLI accepts the
 * comma form, and a single token cannot be re-split by variadic-flag
 * parsing into swallowing the positional task.
 */
const toolList = (tools: readonly string[]): string => tools.join(',')

export function planLaunch(invocation: WireInvocation): PlanResult {
  // Faithful translation or refusal — never reshaping (decision 10). The
  // pinned CLI has no surface for platform-defined key/value parameters;
  // folding them into the prompt would silently rewrite the workload.
  const parameterKeys = Object.keys(invocation.input.parameters)
  if (parameterKeys.length > 0) {
    return {
      ok: false,
      refusal:
        `input.parameters is not expressible by the ${PROVIDER.package} CLI ` +
        `(keys: ${parameterKeys.join(', ')}); no faithful translation exists`,
    }
  }

  const granted = invocation.grant.tools

  const argv: string[] = [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    // Hermetic by construction: the invocation is the authority, so no
    // user/project/local settings source may add tools, hooks, or
    // instructions the profile never granted.
    '--setting-sources',
    '',
    // Availability narrowing: the model cannot see outside the grant. An
    // empty grant disables every tool ("" is the CLI's documented spelling
    // for that), so denial-by-absence is structural, not a permission race.
    '--tools',
    toolList(granted),
    '--model',
    invocation.routing.model_route,
  ]

  if (granted.length > 0) {
    // Pre-approve exactly the granted set so a non-interactive run cannot
    // stall on a permission prompt for a tool the platform already granted.
    argv.push('--allowedTools', toolList(granted))
  }

  if (invocation.routing.fallback !== '') {
    argv.push('--fallback-model', invocation.routing.fallback)
  }

  argv.push(invocation.input.task)

  return {
    ok: true,
    plan: {
      command: PROVIDER.command,
      argv,
      required_env: invocation.credentials.map((c) => c.env_var),
      cwd_ref: invocation.workspace.root_ref,
    },
  }
}
