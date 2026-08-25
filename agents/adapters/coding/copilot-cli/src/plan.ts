/**
 * Invocation → launch plan, pure — every row traced to the L6 spike
 * (`docs/spikes/l6-copilot-cli/`), which is the empirical basis ADR-0013
 * cites for this provider.
 *
 * The two-control model is SPIKE-02's central finding: tool AVAILABILITY
 * (`--available-tools`, closed set, fail-closed) and PERMISSION
 * (`--allow-tool`/`--deny-tool`, deny wins) are SEPARATE controls with
 * SEPARATE identity grammars — availability uses built-in tool names
 * (`bash`, `view`), permission uses command-rule identifiers
 * (`shell`, `shell(printf)`, `shell(stem:*)`). The proven positive case
 * is `--available-tools=bash` + `--allow-tool='shell(printf)'`: one
 * grant string must never be copied into both namespaces. This plan
 * therefore translates between them through the evidenced mapping
 * (`bash` ↔ the `shell` permission family) and emits an allow rule ONLY
 * where the mapping is evidenced; a granted non-shell tool runs under
 * the provider's own permission defaults (read-only auto-approves,
 * writes fail closed and surface as denials — SPIKE-02). The read-only
 * auto-approve hole is closed with `--deny-tool=shell` exactly when
 * `bash` is NOT granted — never against a granted tool's own family.
 *
 * Credential references are additionally carried into the ONE
 * L6-evidenced secrecy control: `--secret-env-vars=<NAME>` strips the
 * named variables from shell/MCP subprocess environments and redacts
 * them from output (SPIKE-05). Custody remains the substrate's (L9).
 *
 * The hermetic flag set is the spike harness's own
 * (COMMAND-RESULTS.txt): no custom instructions, no auto-update, no
 * built-in MCPs, no remote surfaces, no interactive approval.
 *
 * Deliberately NOT translated: `routing.fallback` is PLATFORM routing
 * policy (ADR-0007), enforced by the substrate before an invocation
 * exists — never a provider identifier. `workspace.*` references are
 * opaque platform data (the frozen SPI: "The adapter resolves nothing
 * itself") — never a working directory; the L9 session substrate
 * establishes the sandbox cwd and the adapter and provider inherit it.
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

/**
 * Every character that could separate tool identities in a provider tool
 * list. The pinned CLI's own help shows comma-separated values
 * (`--secret-env-vars=MY_KEY,OTHER_KEY`), and whitespace splitting inside
 * a value is not proven ABSENT by the L6 evidence — which only ever
 * passed bare single names. Fail closed on both.
 */
const TOOL_IDENTITY_DELIMITERS = /[\s,]/

/**
 * THE PREDICATE: is this grant entry expressible as exactly ONE provider
 * tool identity? The platform's `CapabilityGrant` admits any non-empty
 * string, so a single authorized entry could contain a delimiter the
 * provider splits on — one platform authority silently becoming several
 * provider capabilities. Anything not expressible as one identity is
 * refused rather than passed.
 */
const expressibleAsOneToolIdentity = (tool: string): boolean => !TOOL_IDENTITY_DELIMITERS.test(tool)

/**
 * Availability identity → permission-rule family, exactly as far as the
 * L6 evidence reaches: `bash` is governed by the `shell` rule grammar
 * (`shell`, `shell(cmd)`, `shell(stem:*)`). No other pairing was
 * evidenced, and an unevidenced pairing is not invented — a granted tool
 * absent from this map simply gets no allow rule.
 */
const PERMISSION_FAMILIES: Readonly<Record<string, string>> = {
  bash: 'shell',
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

  const inexpressible = granted.find((tool) => !expressibleAsOneToolIdentity(tool))
  if (inexpressible !== undefined) {
    return {
      ok: false,
      refusal:
        `grant.tools entry ${JSON.stringify(inexpressible)} is not expressible as ` +
        "one provider tool identity — the provider's value parsing is not proven " +
        'single-valued for commas or whitespace, so translating it could widen ' +
        'the grant into multiple provider tools; no faithful translation exists',
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
  //
  // An EMPTY grant STATES the empty set — it never omits the control.
  // Omitting `--available-tools` leaves the provider's normal tool
  // visibility in place, so a zero-tool grant would silently become an
  // every-tool run. The evidenced spelling for the empty set is the BARE
  // flag: the L6 `no-tool` case ran `--available-tools --allow-tool` with
  // no values, and the pinned CLI's own help declares the value optional
  // (`--available-tools[=tools...]`), so a bare flag cannot swallow the
  // argument that follows it.
  if (granted.length === 0) {
    argv.push('--available-tools', '--allow-tool')
  }
  for (const tool of granted) {
    argv.push(`--available-tools=${tool}`)
  }
  // Permission second, through the NAMESPACE MAPPING — never by copying
  // an availability name into the permission grammar. An unqualified
  // `bash` grant carries the whole shell family (the substrate, not the
  // provider, is the capability boundary — ADR-0013 decision 2), and
  // `--allow-tool=shell` is the evidenced family-level rule (the L6
  // deny-precedence case used exactly `allow=shell`). Granted tools with
  // no evidenced permission identifier get NO allow rule and run under
  // the provider's own defaults.
  for (const tool of granted) {
    const permissionFamily = PERMISSION_FAMILIES[tool]
    if (permissionFamily !== undefined) {
      argv.push(`--allow-tool=${permissionFamily}`)
    }
  }
  // The documented auto-approve hole, closed explicitly — but only when
  // the family is UNGRANTED: read-only shell executes without an allow
  // rule (SPIKE-02 boundary finding), so shell is denied by rule when
  // `bash` is outside the grant. Denying the family of a granted tool
  // would contradict the grant (deny wins — SPIKE-02).
  if (!granted.includes('bash')) {
    argv.push('--deny-tool=shell')
  }
  // The one evidenced secrecy control (SPIKE-05): every declared
  // credential reference is stripped from shell/MCP subprocess
  // environments and redacted from output. Names only, never values.
  for (const credential of invocation.credentials) {
    argv.push(`--secret-env-vars=${credential.env_var}`)
  }

  return {
    ok: true,
    plan: {
      command: PROVIDER.command,
      argv,
      required_env: [...invocation.credentials.map((c) => c.env_var), ISOLATION_ENV],
    },
  }
}
