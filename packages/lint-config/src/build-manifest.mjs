/**
 * BUILD THE CANONICAL POLICY AND THE PER-ENGINE MAPPINGS.
 *
 * The oracle answers "what does the current engine enforce". This turns that
 * answer into the repository's own authority: stable ids, roles, blocking
 * posture, the accepted disposition, and a proof placeholder per row.
 *
 * TWO THINGS IT DELIBERATELY DOES NOT DO.
 *
 * It does not decide dispositions from engine capability. All 117 rows carry
 * MIGRATED_TO_NEW_LINT_ENGINE because the accepted design allocates them there.
 * Probing a registry to see what the replacement "supports" would let the
 * engine choose the policy.
 *
 * It does not treat a replacement mapping as evidence. Those rows are
 * HYPOTHESES about which engine rule realises which policy. The fixture shards
 * prove or falsify them, and a falsified one blocks the landing and keeps
 * ESLint rather than rewriting the policy to fit the engine.
 */
import { policyIdFor } from './extract-legacy-policy.mjs'

/** Type-aware rules whose subject is DATA and TYPE soundness. */
const TYPED_UNSAFE =
  /^(no-unsafe-|restrict-|no-base-to-string$|.*type-constituents$|no-unnecessary-type-assertion$)/

/** Parse-level and declaration-level validity. */
export const PARSER_SYNTAX = new Set([
  'no-control-regex',
  'no-delete-var',
  'no-dupe-args',
  'no-dupe-class-members',
  'no-dupe-else-if',
  'no-dupe-keys',
  'no-duplicate-case',
  'no-empty-character-class',
  'no-invalid-regexp',
  'no-irregular-whitespace',
  'no-loss-of-precision',
  'no-misleading-character-class',
  'no-nonoctal-decimal-escape',
  'no-octal',
  'no-redeclare',
  'no-regex-spaces',
  'no-shadow-restricted-names',
  'no-sparse-arrays',
  'no-undef',
  'no-unexpected-multiline',
  'no-useless-backreference',
  'no-useless-escape',
  'no-with',
  'valid-typeof',
])

/** Control flow and runtime correctness. */
export const CORE_CONTROL = new Set([
  'constructor-super',
  'for-direction',
  'getter-return',
  'no-async-promise-executor',
  'no-case-declarations',
  'no-class-assign',
  'no-compare-neg-zero',
  'no-cond-assign',
  'no-const-assign',
  'no-constant-binary-expression',
  'no-constant-condition',
  'no-empty-pattern',
  'no-ex-assign',
  'no-fallthrough',
  'no-func-assign',
  'no-global-assign',
  'no-import-assign',
  'no-obj-calls',
  'no-self-assign',
  'no-setter-return',
  'no-this-before-super',
  'no-unassigned-vars',
  'no-unreachable',
  'no-unsafe-finally',
  'no-unsafe-negation',
  'no-unsafe-optional-chaining',
  'no-useless-assignment',
  'no-useless-catch',
  'preserve-caught-error',
  'require-yield',
  'use-isnan',
])

/** Hygiene, restriction, and the JavaScript/config posture. */
export const CORE_POLICY = new Set([
  'eqeqeq',
  'no-console',
  'no-debugger',
  'no-empty',
  'no-empty-static-block',
  'no-extra-boolean-cast',
  'no-new-native-nonconstructor',
  'no-prototype-builtins',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-unused-labels',
  'no-unused-private-class-members',
  'no-var',
  'prefer-const',
  'prefer-rest-params',
  'prefer-spread',
])

/**
 * Which shard proves a policy.
 *
 * Type-awareness is derived from the ORACLE, not from a list: a TypeScript rule
 * that survives into the JavaScript-config role cannot need type information,
 * because that role disables every type-aware rule. Deriving it means the split
 * cannot drift away from what the engine actually does.
 */
export function shardFor(ruleId, { typeAware }) {
  if (ruleId.startsWith('@typescript-eslint/')) {
    const bare = ruleId.slice('@typescript-eslint/'.length)
    if (!typeAware) return 'typescript-static'
    return TYPED_UNSAFE.test(bare) ? 'typescript-typed-unsafe' : 'typescript-typed-control'
  }
  if (PARSER_SYNTAX.has(ruleId)) return 'parser-syntax'
  if (CORE_CONTROL.has(ruleId)) return 'core-control'
  if (CORE_POLICY.has(ruleId)) return 'core-policy'
  throw new Error(`no shard assigned for core rule "${ruleId}"`)
}

/**
 * The replacement engine's name for a rule. A HYPOTHESIS, proven by fixtures.
 *
 * Oxlint reports core rules bare and TypeScript rules under a `typescript`
 * plugin, verified by running it rather than read from documentation.
 */
export function replacementRuleId(ruleId) {
  return ruleId.startsWith('@typescript-eslint/')
    ? `typescript/${ruleId.slice('@typescript-eslint/'.length)}`
    : ruleId
}

/**
 * Policies the replacement engine enforces at PARSE level, not through a rule.
 *
 * Both are strict-mode syntax errors in an ES module, so a parser that handles
 * modules correctly rejects them before any rule runs. Oxlint does: with zero
 * rules configured it still reports "Identifier `a` has already been declared"
 * and the deprecated octal literal.
 *
 * Discovered behaviourally. The engine has no `no-dupe-args` or `no-octal` rule
 * to configure, and a registration probe alone would have read that as the
 * policy being unavailable -- when the policy is in fact enforced more strongly
 * than a rule could enforce it. This is the mechanism the mapping schema exists
 * to express, and the reason unavailability is a conformance RESULT rather than
 * something a mapping row may assert.
 */
export const PARSER_ENFORCED = new Map([
  ['no-dupe-args', 'strict-mode duplicate binding detection'],
  ['no-octal', 'legacy octal literal rejection'],
  ['no-delete-var', 'strict-mode delete-of-a-binding rejection'],
  ['no-nonoctal-decimal-escape', 'strict-mode decimal escape rejection'],
  ['no-with', 'strict-mode with-statement rejection'],
])

/**
 * Policies the LEGACY engine also realises at parse level.
 *
 * Every source file here is an ES module, so strict mode, and these are
 * strict-mode syntax errors that ESLint reports as a fatal parse error with no
 * rule id. Recording them as rules would claim an attribution the engine never
 * produces.
 *
 * THE PARSER DECIDES, AND THE ROLE DECIDES THE PARSER. `no-delete-var` is
 * deliberately absent: the repository parses `.ts` with the TypeScript parser,
 * which accepts `delete localBinding` and lets the RULE fire instead. On the
 * replacement engine it is still a parse error. The two engines genuinely
 * differ in mechanism for the same policy, which is why mechanism is a
 * per-engine field and not a property of the policy.
 */
/**
 * The exact diagnostic each engine emits, per policy.
 *
 * A parse error alone is not attribution. Without a pattern, a fixture that
 * stopped violating the intended rule but contained ANY other syntax error
 * would still be "rejected by both engines" and would pass parity while
 * proving nothing. These are engine-specific raw strings, which is why they
 * live in the mapping and not in policy.json.
 */
export const PARSER_DIAGNOSTICS = new Map([
  ['no-dupe-args', { legacy: 'Argument name clash', replacement: 'already been declared' }],
  [
    'no-octal',
    { legacy: 'Octal literals are not allowed', replacement: "'0'-prefixed octal literals" },
  ],
  ['no-delete-var', { legacy: undefined, replacement: 'Delete of an unqualified identifier' }],
  [
    'no-nonoctal-decimal-escape',
    { legacy: "Escape sequence '\\8' is not allowed", replacement: '\\8 and \\9 are not allowed' },
  ],
  [
    'no-with',
    { legacy: "'with' in strict mode", replacement: "'with' statements are not allowed" },
  ],
])

export const LEGACY_PARSER_ENFORCED = new Set([
  'no-dupe-args',
  'no-octal',
  'no-nonoctal-decimal-escape',
  'no-with',
])

/**
 * The language a policy must be proved in.
 *
 * Derived from applicability, not guessed: if the only role enforcing a policy
 * is the JavaScript-config role, TypeScript source cannot demonstrate it.
 */
export function proofExtension(roles) {
  return roles.length === 1 && roles[0] === 'js-config' ? '.js' : '.ts'
}

/** Options that are engine-neutral SEMANTICS, keyed by policy id. */
function semanticOptions(row) {
  const values = Object.values(row.options).filter((v) => v.length > 0)
  if (values.length === 0) return undefined
  const first = JSON.stringify(values[0])
  // Only lift options into semantic policy when every role agrees. A per-role
  // difference is engine configuration, and belongs to the mapping.
  return values.every((v) => JSON.stringify(v) === first) ? { values: values[0] } : undefined
}

export function buildManifests(rows) {
  const jsConfig = new Set(rows.filter((r) => r.roles.includes('js-config')).map((r) => r.ruleId))

  const taken = new Set()
  const policies = []
  const mappings = []

  for (const row of rows) {
    const id = policyIdFor(row.ruleId, taken)
    taken.add(id)

    const typeAware = row.ruleId.startsWith('@typescript-eslint/') && !jsConfig.has(row.ruleId)
    const shard = shardFor(row.ruleId, { typeAware })
    const options = semanticOptions(row)

    policies.push({
      id,
      // Stated through the REPOSITORY-OWNED id. Naming the vendor rule here
      // would put engine identity back into engine-neutral policy through
      // prose, which is the same leak as a `ruleId` field and just as durable.
      intent: `Preserve the behaviour the repository enforces as the "${id}" policy.`,
      roles: row.roles,
      blocking: true,
      ...(options ? { options } : {}),
      disposition: 'MIGRATED_TO_NEW_LINT_ENGINE',
      proof: {
        shard,
        // A policy that applies ONLY to the JavaScript-config role must be
        // proved in JavaScript. typescript-eslint switches no-undef,
        // no-redeclare and no-dupe-class-members off for TypeScript because the
        // compiler already reports them, so a .ts fixture for one of those would
        // exercise a rule that is not enabled and prove nothing.
        valid: `${shard}/valid/${id}${proofExtension(row.roles)}`,
        invalid: `${shard}/invalid/${id}${proofExtension(row.roles)}`,
      },
    })

    const legacyParser = LEGACY_PARSER_ENFORCED.has(id)
    const diagnostics = PARSER_DIAGNOSTICS.get(id)
    mappings.push(
      legacyParser
        ? {
            policy: id,
            engine: 'legacy',
            mechanism: 'parser',
            parserMechanism: PARSER_ENFORCED.get(id) ?? 'strict-mode syntax rejection',
            diagnosticPattern: diagnostics.legacy,
          }
        : { policy: id, engine: 'legacy', mechanism: 'rule', ruleId: row.ruleId },
    )

    const parserMechanism = PARSER_ENFORCED.get(id)
    mappings.push(
      parserMechanism === undefined
        ? {
            policy: id,
            engine: 'replacement',
            mechanism: 'rule',
            ruleId: replacementRuleId(row.ruleId),
          }
        : {
            policy: id,
            engine: 'replacement',
            mechanism: 'parser',
            parserMechanism,
            diagnosticPattern: diagnostics.replacement,
          },
    )
  }

  return {
    policy: { schemaVersion: 1, policies },
    mappings: { schemaVersion: 1, engines: ['legacy', 'replacement'], mappings },
  }
}
