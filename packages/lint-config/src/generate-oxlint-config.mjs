/**
 * GENERATE THE REPLACEMENT ENGINE'S CONFIGURATION.
 *
 * Deterministically, from two authorities and nothing else: the semantic policy
 * and the replacement mapping. Hand-maintaining this file would create a second
 * semantic policy that drifts from the first, which is the whole failure
 * ADR-0022 separates policy from engine to avoid.
 *
 * AMBIENT DEFAULTS ARE DISABLED. `categories: {}` switches off every rule the
 * engine would otherwise enable on its own. An Oxlint default is not repository
 * policy: if a rule is not in `policy.json`, nobody decided it, and a lint
 * failure nobody decided is indistinguishable from a bug in the gate.
 *
 * NO FORMATTING. Prettier is the single formatting authority. Nothing here may
 * emit or fix formatting, and the generated config carries no formatting rule
 * because no policy row is one.
 *
 * ONE CONFIG PER ROLE. Applicability is policy, and the roles differ by up to
 * 29 rules. A single config would have to pick one role and be wrong for the
 * other six.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The engine plugin a mapped rule belongs to, from its own namespace. */
export function pluginFor(ruleId) {
  return ruleId.includes('/') ? ruleId.slice(0, ruleId.indexOf('/')) : 'eslint'
}

export function generateForRole(policy, mappings, role) {
  const replacement = new Map(
    mappings.mappings.filter((m) => m.engine === 'replacement').map((m) => [m.policy, m]),
  )

  const rules = {}
  const plugins = new Set()

  for (const row of policy.policies) {
    if (!row.roles.includes(role)) continue
    const mapped = replacement.get(row.id)
    if (mapped === undefined) {
      throw new Error(`policy "${row.id}" has no replacement mapping; cannot generate a config`)
    }
    if (mapped.mechanism !== 'rule') continue
    const plugin = pluginFor(mapped.ruleId)
    if (plugin !== 'eslint') plugins.add(plugin)
    // Severity comes from the POLICY's blocking posture, never from the engine
    // default: a rule the repository blocks on must block, whatever the engine
    // would have chosen.
    //
    // Options travel with it. A rule such as `no-restricted-globals` with no
    // restrictions declared is a rule that permits everything, so emitting the
    // severity alone would produce a config that loads, reports nothing, and
    // looks like the policy is enforced. Engine-specific overrides win where a
    // mapping declares them; otherwise the policy's semantic options are used.
    const severity = row.blocking ? 'error' : 'warn'
    const options = mapped.engineOptions?.values ?? row.options?.values
    rules[mapped.ruleId] = options === undefined ? severity : [severity, ...options]
  }

  return {
    $schema: './node_modules/oxlint/configuration_schema.json',
    plugins: [...plugins].sort(),
    // Ambient defaults off. Every enabled rule below is a decision recorded in
    // policy.json, and nothing else runs.
    categories: {},
    rules: Object.fromEntries(Object.entries(rules).sort(([a], [b]) => (a < b ? -1 : 1))),
  }
}

export const GENERATED_ROLES = [
  'library',
  'service',
  'application',
  'exported-test',
  'config-file',
  'js-config',
  'adapter-bin',
]

export function generateAll(policy, mappings) {
  return Object.fromEntries(
    GENERATED_ROLES.map((role) => [role, generateForRole(policy, mappings, role)]),
  )
}

export function loadAuthorities(root = PACKAGE_ROOT) {
  return {
    policy: JSON.parse(readFileSync(path.join(root, 'policy.json'), 'utf8')),
    mappings: JSON.parse(readFileSync(path.join(root, 'engine-mappings.json'), 'utf8')),
  }
}
