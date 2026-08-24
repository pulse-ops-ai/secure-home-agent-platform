/**
 * Invocation → launch plan, pure — every row traced to the L6 spike
 * (`docs/spikes/l6-copilot-cli/`), which is the empirical basis ADR-0013
 * cites for this provider.
 *
 * The two-control model is SPIKE-02's central finding: tool AVAILABILITY
 * (`--available-tools`, closed set, fail-closed) and PERMISSION
 * (`--allow-tool`/`--deny-tool`, deny wins) are separate. A grant is
 * therefore expressed as availability narrowed to the granted set PLUS
 * explicit allow rules for it — and, because read-only shell commands
 * auto-approve even when unlisted (SPIKE-02 boundary finding), an
 * explicit `--deny-tool=shell` whenever the grant does not include
 * `shell`. The hermetic flag set is the spike harness's own
 * (COMMAND-RESULTS.txt): no custom instructions, no auto-update, no
 * built-in MCPs, no remote surfaces, no interactive approval.
 */
import type { WireInvocation } from './spi.js'

/** The provider CLI this adapter targets, and the version it is pinned to. */
export const PROVIDER = {
  command: 'copilot',
  package: '@github/copilot',
  version: '1.0.79',
  image: 'secure-home-runner-copilot',
} as const

/**
 * Per-run state isolation the substrate must provision (SPIKE-05:
 * transcript, usage, and credential state persist under COPILOT_HOME —
 * and `~/.cache/copilot` escapes it, a caveat the README carries).
 */
export const ISOLATION_ENV = 'COPILOT_HOME'

export interface LaunchPlan {
  /** Resolved by name on PATH — the pinned binary inside the paired image. */
  readonly command: typeof PROVIDER.command
  readonly argv: readonly string[]
  /**
   * Environment-variable NAMES the substrate must provision: credential
   * references from the invocation, plus the per-run isolation home.
   * Names only — the plan has no field a value could occupy.
   */
  readonly required_env: readonly string[]
  /** The opaque workspace root reference; the adapter resolves nothing. */
  readonly cwd_ref: string
}

export type PlanResult =
  | { readonly ok: true; readonly plan: LaunchPlan }
  | { readonly ok: false; readonly refusal: string }

/**
 * What the provider process needs merely to exist: binary resolution,
 * a home for the CLI's own state, a writable temp dir. Nothing else is
 * baseline — everything else must be DECLARED by the invocation (for
 * this provider that includes the per-run isolation home, which the
 * plan appends to `required_env`).
 */
const BASELINE_ENV = ['PATH', 'HOME', 'TMPDIR'] as const

/**
 * The provider child environment, ALLOWLISTED — pure, so the property is
 * unit-testable. The child receives exactly the baseline plus the
 * variables the plan declares (`required_env`); an ambient variable the
 * invocation never named — an undeclared credential, a harness detail —
 * cannot reach the provider. A declared variable the substrate failed to
 * provision stays absent: the provider's resulting failure is observed,
 * never papered over (the adapter translates; it does not enforce
 * provisioning).
 */
export function childEnvironment(
  plan: LaunchPlan,
  ambient: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const child: Record<string, string> = {}
  for (const name of [...BASELINE_ENV, ...plan.required_env]) {
    const value = ambient[name]
    if (value !== undefined) child[name] = value
  }
  return child
}

export function planLaunch(invocation: WireInvocation): PlanResult {
  // Faithful translation or refusal — never reshaping (ADR-0013 decision
  // 10). The pinned CLI has no surface for platform key/value parameters.
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

  // One --available-tools=<tool> per granted tool keeps our own emission
  // single-valued, but the CLI's list parsing of the value is not proven
  // single-valued (the L6 evidence only ever passed bare names). A grant
  // identity containing a comma could therefore widen to multiple tools
  // inside the provider — fail closed instead of trusting an unevidenced
  // parser property.
  const delimited = granted.find((tool) => tool.includes(','))
  if (delimited !== undefined) {
    return {
      ok: false,
      refusal:
        `grant.tools entry ${JSON.stringify(delimited)} contains a list ` +
        "delimiter (','); the provider's value parsing is not proven " +
        'single-valued, so translating it could widen the grant — no ' +
        'faithful translation exists',
    }
  }

  const argv: string[] = [
    '-p',
    invocation.input.task,
    // Explicit model pin, never Auto — the spike pinned the model for
    // every evidence run and this adapter passes the route through as data.
    '--model',
    invocation.routing.model_route,
    '--output-format',
    'json',
    '--stream',
    'off',
    // The spike harness's hermetic surface: nothing ambient may widen the
    // run beyond the platform-built invocation.
    '--no-color',
    '--no-custom-instructions',
    '--no-auto-update',
    '--disable-builtin-mcps',
    '--no-remote',
    '--no-remote-export',
    // Non-interactive: unapproved writes fail closed (SPIKE-02).
    '--no-ask-user',
  ]

  // Availability first: the model cannot see outside the grant. The
  // `--flag=value` spelling is the one the spike evidenced; one value per
  // occurrence, so no list parsing can swallow a neighbour.
  for (const tool of granted) {
    argv.push(`--available-tools=${tool}`)
  }
  // Permission second: pre-approve exactly the granted set so the
  // non-interactive run cannot stall on tools the platform already granted.
  for (const tool of granted) {
    argv.push(`--allow-tool=${tool}`)
  }
  // The documented auto-approve hole, closed explicitly: read-only shell
  // executes without an allow rule, so an ungranted shell is denied by
  // rule, not just by absence (SPIKE-02 boundary finding; deny wins).
  if (!granted.includes('shell')) {
    argv.push('--deny-tool=shell')
  }

  return {
    ok: true,
    plan: {
      command: PROVIDER.command,
      argv,
      required_env: [...invocation.credentials.map((c) => c.env_var), ISOLATION_ENV],
      cwd_ref: invocation.workspace.root_ref,
    },
  }
}
