/**
 * REPOSITORY-WIDE POLICY AND ROLE-ASSIGNMENT INTEGRITY.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE ORACLE. `extract-legacy-policy.mjs`
 * resolves ONE representative file per role. That establishes what each role
 * MEANS, and it is the only honest way to learn the semantics — but it is blind
 * to which members actually consume which role. A member could switch from
 * `library` to `service`, quietly dropping the process restrictions from a
 * package that is not a composition root, and every representative probe would
 * still pass because `services/runner-control` still resolves `service`
 * correctly.
 *
 * So role SEMANTICS come from probes and role ASSIGNMENT is checked here,
 * across every member. `AUTH-MEMBER-ROLES` owns both halves; one without the
 * other is not the authority it claims to be.
 *
 * Dependency-free: node stdlib.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * The canonical projection: taxonomy position decides role.
 *
 * Stated as a rule rather than a per-member list, so a NEW member is covered
 * the day it appears instead of the day somebody remembers to add it.
 */
export const ROLE_PROJECTION = [
  { prefix: 'services/', role: 'service', why: 'a deployable composition root' },
  { prefix: 'apps/', role: 'application', why: 'a human-facing application' },
  { prefix: 'agents/adapters/coding/', role: 'library', why: 'a reusable adapter library' },
  { prefix: 'packages/', role: 'library', why: 'a reusable library' },
]

/**
 * Members that legitimately run no lint engine.
 *
 * A closed list, because "this one is special" is exactly the sentence that
 * turns a gate into a suggestion. Each must still declare a lint script that
 * says so out loud, so the absence is a recorded decision and not an omission.
 */
export const NON_LINTING_MEMBERS = new Set(['packages/tsconfig', 'packages/lint-config'])

/**
 * The one member allowed to lint itself with what it exports, since asking it
 * to consume a published role would be circular.
 */
export const SELF_LINTING_MEMBER = 'packages/eslint-config'

/** The one admitted process-boundary override, and the exact rules it may relax. */
export const ADAPTER_BIN_OVERRIDE = {
  prefix: 'agents/adapters/coding/',
  files: 'src/bin.ts',
  relaxes: ['no-console', 'no-restricted-globals', 'no-restricted-properties'],
}

export const MEMBER_GLOBS = [
  'packages',
  'services',
  'services/workers',
  'apps',
  'agents',
  'agents/adapters/coding',
]

export function members(repoRoot = REPO_ROOT) {
  const found = []
  for (const glob of MEMBER_GLOBS) {
    const root = path.join(repoRoot, glob)
    if (!existsSync(root)) continue
    for (const name of readdirSorted(root)) {
      const rel = `${glob}/${name}`
      if (existsSync(path.join(repoRoot, rel, 'package.json'))) found.push(rel)
    }
  }
  return [...new Set(found)].sort()
}

function readdirSorted(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

export function expectedRoleFor(rel) {
  for (const entry of ROLE_PROJECTION) {
    if (rel.startsWith(entry.prefix)) return entry
  }
  return undefined
}

/** The role a member's config actually composes, read from its own bytes. */
export function declaredRoleOf(repoRoot, rel) {
  const configPath = path.join(repoRoot, rel, 'eslint.config.js')
  if (!existsSync(configPath)) return { kind: 'absent' }
  const text = readFileSync(configPath, 'utf8')
  if (/from\s+'\.\/index\.js'/.test(text)) return { kind: 'self', text }
  const match = /@secure-home\/eslint-config\/([a-z]+)/.exec(text)
  return match === null ? { kind: 'unknown', text } : { kind: 'role', role: match[1], text }
}

/**
 * The local overrides a member config carries, parsed from its bytes.
 *
 * Each is the `files` list and the rules inside the same block. Parsing the
 * source rather than resolving it keeps this dependency-free and, more to the
 * point, catches the override as WRITTEN: a second glob entry or a fourth
 * relaxed rule is a broadening whether or not any file matches it today.
 */
export function localOverridesOf(text) {
  const overrides = []
  const blocks = text.matchAll(/files:\s*\[([^\]]*)\](?:[^{}]*rules:\s*\{([^}]*)\})?/g)
  for (const [, files, rules] of blocks) {
    const globs = files
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter((s) => s.length > 0)
    const entries =
      rules === undefined
        ? undefined
        : [...rules.matchAll(/['"]?([@\w/-]+)['"]?\s*:\s*(['"][\w-]+['"]|[\w[{]+)/g)].map(
            ([, rule, value]) => ({ rule, value: value.replace(/^['"]|['"]$/g, '') }),
          )
    overrides.push({ globs, rules: entries })
  }
  return overrides
}

/**
 * Every member's assignment, checked against the projection.
 *
 * Returns problems rather than throwing, so one run reports the whole picture.
 */
export function checkMemberRoles(repoRoot = REPO_ROOT) {
  const problems = []

  for (const rel of members(repoRoot)) {
    const declared = declaredRoleOf(repoRoot, rel)

    if (NON_LINTING_MEMBERS.has(rel)) {
      if (declared.kind !== 'absent') {
        problems.push(`${rel}: declared non-linting but ships an eslint.config.js`)
        continue
      }
      const pkg = JSON.parse(readFileSync(path.join(repoRoot, rel, 'package.json'), 'utf8'))
      if (!/no lint/.test(String(pkg.scripts?.lint ?? ''))) {
        problems.push(`${rel}: runs no lint engine but its lint script does not say so`)
      }
      continue
    }

    if (rel === SELF_LINTING_MEMBER) {
      if (declared.kind !== 'self') {
        problems.push(`${rel}: the engine config package must lint itself with what it exports`)
      }
      continue
    }

    if (declared.kind === 'absent') {
      problems.push(`${rel}: no eslint.config.js, and it is not a declared non-linting member`)
      continue
    }
    if (declared.kind !== 'role') {
      problems.push(`${rel}: eslint.config.js composes no recognisable exported role`)
      continue
    }

    const expected = expectedRoleFor(rel)
    if (expected === undefined) {
      problems.push(`${rel}: outside every taxonomy prefix, so no role can be projected for it`)
      continue
    }
    if (declared.role !== expected.role) {
      problems.push(
        `${rel}: composes the "${declared.role}" role but the projection says "${expected.role}" ` +
          `(${expected.why}). A role change alters which policies block, so it is a reviewed ` +
          `decision, not a config edit`,
      )
    }

    // The exported test role is consumed by NO member today. A member that
    // starts composing it moves every one of its tests onto a more permissive
    // contract, so that is a reviewed decision and never a quiet config edit
    // (REQ-LP-004; ADV-ROLE-002).
    if (/@secure-home\/eslint-config\/test\b/.test(declared.text)) {
      problems.push(
        `${rel}: eslint.config.js composes the exported test role. No member consumes it; ` +
          `its relaxations reaching a member's tests is a reviewed decision, not a config edit`,
      )
    }

    // The one admitted override, EXACTLY: the adapter's `src/bin.ts` and no
    // other glob beside it, relaxing the three process-boundary rules and
    // nothing else, to `off` and nothing else. A second glob entry or a fourth
    // rule is a broadening whether or not anything matches it yet
    // (ADV-ROLE-001).
    for (const { globs, rules } of localOverridesOf(declared.text)) {
      const files = globs.join(', ')
      const isAdapterEntry =
        rel.startsWith(ADAPTER_BIN_OVERRIDE.prefix) &&
        globs.length === 1 &&
        globs[0] === ADAPTER_BIN_OVERRIDE.files
      if (!isAdapterEntry) {
        problems.push(
          `${rel}: eslint.config.js carries a local override for ${files}. Policy is ` +
            `repository-wide; the only admitted local exception is the coding-adapter ` +
            `${ADAPTER_BIN_OVERRIDE.files} process entry, alone`,
        )
        continue
      }
      if (rules === undefined) {
        problems.push(`${rel}: the ${files} override's rules could not be read`)
        continue
      }
      for (const { rule, value } of rules) {
        if (!ADAPTER_BIN_OVERRIDE.relaxes.includes(rule)) {
          problems.push(
            `${rel}: the ${files} override touches "${rule}". The admitted exception relaxes ` +
              `exactly ${ADAPTER_BIN_OVERRIDE.relaxes.join(', ')}`,
          )
        } else if (value !== 'off') {
          problems.push(
            `${rel}: the ${files} override sets "${rule}" to ${value}; the exception switches ` +
              `it off, it does not re-configure it`,
          )
        }
      }
    }
  }

  return problems
}

// ── neutrality: no framework rule, no formatting rule ───────────────────────

/**
 * Rule families the repository does not enforce, on purpose.
 *
 * Framework rules belong to the issue that introduces the framework (ADR-0003,
 * ADR-0012); formatting belongs to Prettier alone. Neither may arrive through
 * a policy row, a mapping, or a generated engine config -- the three places a
 * migration could quietly add one.
 */
export const FRAMEWORK_RULE =
  /^(react|react-hooks|@next|next|vue|@angular|@nestjs|jest|vitest|jsx-a11y|import|n|node|unicorn|promise)\//
export const FRAMEWORK_PLUGINS = new Set([
  'react',
  'react-hooks',
  'next',
  'vue',
  'angular',
  'nestjs',
  'jest',
  'vitest',
  'jsx-a11y',
  'import',
  'node',
  'n',
  'unicorn',
  'promise',
])
export const FORMATTING_RULES = new Set([
  'indent',
  'quotes',
  'semi',
  'comma-dangle',
  'comma-spacing',
  'max-len',
  'linebreak-style',
  'eol-last',
  'no-trailing-spaces',
  'no-mixed-spaces-and-tabs',
  'space-before-function-paren',
  'object-curly-spacing',
  'array-bracket-spacing',
  'arrow-parens',
  'brace-style',
  'key-spacing',
  'keyword-spacing',
  'padded-blocks',
  'quote-props',
])
const FORMATTING_NAMESPACE = /^(@stylistic|stylistic|prettier|@prettier)\//

const bareRule = (id) => (id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id)

/** No framework-specific policy, mapping, or enabled plugin, anywhere. */
export function checkFrameworkNeutrality(policy, mappings, generated) {
  const problems = []
  for (const row of policy.policies) {
    if (FRAMEWORK_RULE.test(row.id)) problems.push(`policy "${row.id}" is a framework rule`)
  }
  for (const row of mappings.mappings) {
    if (row.ruleId !== undefined && FRAMEWORK_RULE.test(row.ruleId)) {
      problems.push(
        `the ${row.engine} mapping for "${row.policy}" names framework rule ${row.ruleId}`,
      )
    }
  }
  for (const [role, config] of Object.entries(generated)) {
    for (const plugin of config.plugins ?? []) {
      if (FRAMEWORK_PLUGINS.has(plugin)) {
        problems.push(`the generated ${role} config enables the framework plugin "${plugin}"`)
      }
    }
    for (const ruleId of Object.keys(config.rules ?? {})) {
      if (FRAMEWORK_RULE.test(ruleId)) {
        problems.push(`the generated ${role} config enables framework rule ${ruleId}`)
      }
    }
  }
  return problems
}

/** No formatting or stylistic authority in policy or in any generated config. */
export function checkFormattingNeutrality(policy, generated) {
  const problems = []
  const formatting = (id) => FORMATTING_RULES.has(bareRule(id)) || FORMATTING_NAMESPACE.test(id)
  for (const row of policy.policies) {
    if (formatting(row.id)) {
      problems.push(`policy "${row.id}" is a formatting rule; Prettier is the formatting authority`)
    }
  }
  for (const [role, config] of Object.entries(generated)) {
    for (const plugin of config.plugins ?? []) {
      if (FORMATTING_NAMESPACE.test(`${plugin}/`)) {
        problems.push(`the generated ${role} config enables the formatting plugin "${plugin}"`)
      }
    }
    for (const ruleId of Object.keys(config.rules ?? {})) {
      if (formatting(ruleId)) {
        problems.push(
          `the generated ${role} config enables formatting rule ${ruleId}; Prettier is the ` +
            `formatting authority`,
        )
      }
    }
  }
  return problems
}

/** The committed generated configs, keyed by role, for the neutrality checks. */
export function loadGeneratedConfigs(root = path.join(REPO_ROOT, 'packages/lint-config')) {
  const dir = path.join(root, 'generated')
  const configs = {}
  for (const name of readdirSync(dir)) {
    const match = /^oxlintrc\.([a-z-]+)\.json$/.exec(name)
    if (match !== null) configs[match[1]] = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
  }
  return configs
}

// ── referential integrity between the two authorities ───────────────────────

/**
 * The properties neither schema can express, because each validates one file.
 *
 * A schema proves a mapping row is well formed. Only a cross-file check proves
 * it points at a policy that exists, that no policy was left without an engine,
 * and that no vendor identity leaked into the semantic side.
 */
export function checkReferentialIntegrity(policy, mappings) {
  const problems = []
  const ids = new Set()

  for (const row of policy.policies) {
    if (ids.has(row.id)) problems.push(`policy "${row.id}" is declared more than once`)
    ids.add(row.id)

    if (/^@|\//.test(row.id)) {
      problems.push(`policy "${row.id}" carries a vendor-shaped identity`)
    }
    if (new Set(row.roles).size !== row.roles.length) {
      problems.push(`policy "${row.id}" repeats a role, so its applicability is ambiguous`)
    }
    const { shard, valid, invalid } = row.proof
    if (!valid.startsWith(`${shard}/`) || !invalid.startsWith(`${shard}/`)) {
      problems.push(`policy "${row.id}" points at proof outside its own shard "${shard}"`)
    }
    if (valid === invalid) {
      problems.push(`policy "${row.id}" uses one file as both its positive and negative case`)
    }
  }

  const seen = new Map()
  for (const row of mappings.mappings) {
    const key = `${row.policy}::${row.engine}`
    if (seen.has(key)) {
      problems.push(`policy "${row.policy}" has more than one ${row.engine} mapping`)
    }
    seen.set(key, row)
    if (!ids.has(row.policy)) {
      problems.push(`mapping for "${row.policy}" (${row.engine}) references no known policy`)
    }
  }

  for (const id of ids) {
    for (const engine of mappings.engines) {
      if (!seen.has(`${id}::${engine}`)) {
        problems.push(`policy "${id}" has no ${engine} mapping, so one engine would not enforce it`)
      }
    }
  }

  return problems
}

/**
 * The manifest must still describe the engine's real behaviour.
 *
 * Committed policy is a claim about a live configuration, and a claim nobody
 * re-derives is a comment. Deleting or re-scoping a rule in eslint-config
 * without regenerating shows up here as drift rather than as silence.
 */
export function checkPolicyDrift(policy, mappings, liveRows, deriveId) {
  const problems = []

  // Keyed on the DERIVED policy identity, not on a legacy rule id. Five
  // policies are realised by the parser on both engines and carry no rule to
  // key on, and keying on one would have made them look unclaimed -- which is
  // exactly what happened when they were first reclassified.
  const taken = new Set()
  const liveById = new Map()
  for (const row of liveRows) {
    const id = deriveId(row.ruleId, taken)
    taken.add(id)
    liveById.set(id, row)
  }

  const declared = new Set(policy.policies.map((p) => p.id))

  for (const [id, row] of liveById) {
    if (!declared.has(id)) {
      problems.push(`the engine enforces "${row.ruleId}" but no policy row claims it`)
    }
  }
  for (const id of declared) {
    if (!liveById.has(id)) {
      problems.push(`policy claims "${id}" but the engine no longer enforces it`)
    }
  }

  for (const row of policy.policies) {
    const live = liveById.get(row.id)
    if (live === undefined) continue
    const declared = [...row.roles].sort().join(',')
    const actual = [...live.roles].sort().join(',')
    if (declared !== actual) {
      problems.push(
        `policy "${row.id}" claims roles [${declared}] but the engine blocks it in [${actual}]`,
      )
    }
    if (row.blocking !== true) {
      problems.push(`policy "${row.id}" is not blocking, yet every current policy blocks`)
    }
  }

  return problems
}

// ── generated-authority byte identity ───────────────────────────────────────

/**
 * Every generated authority must be BYTE-identical to generator output.
 *
 * Not object-identical. `AUTH-LINT-CONFIG` is a generated file, and comparing
 * parsed objects accepts whitespace and key-order changes -- so a committed
 * config could be edited into something the generator would never emit and
 * still report clean. Byte identity is the only comparison that makes
 * "generated" mean anything.
 *
 * Lives here rather than in a test so that removing the comparison is a change
 * to checked code, which the suite then catches. A check that exists only
 * inside its own test cannot be regression-tested at all.
 */
export async function checkGeneratedDrift(entries, canonicalize) {
  const problems = []
  for (const { path: repoPath, value, committed } of entries) {
    const expected = await canonicalize(value)
    if (expected !== committed) {
      problems.push(
        `${repoPath} is not byte-identical to generator output. It is a GENERATED ` +
          `authority: regenerate it rather than editing it, and never reformat it ` +
          `by hand`,
      )
    }
  }
  return problems
}

// ── the conformance-fixture class, across every reader ──────────────────────

/**
 * Where the deliberately-invalid evidence corpus lives.
 *
 * `_negative-controls` is part of the class: it holds fixtures whose intended
 * violation was REMOVED and replaced by an unrelated syntax error, so it is
 * exactly as unfit for ordinary lint, formatting, and compilation as the rest.
 */
export const FIXTURE_CLASS = [
  'tests/fixtures',
  'tests/fixtures/_negative-controls',
  'tests/fixtures/roles',
]

/**
 * Four readers exclude the corpus, for four DIFFERENT reasons, and a fifth
 * consumes it deliberately.
 *
 * These are separate authorities, not duplicated ones: the formatter, the
 * compiler, the lint engine, and the architecture scanner each have their own
 * reason to skip a file that is invalid on purpose. That is why they are four
 * strings rather than one setting.
 *
 * But four strings can silently diverge. Delete any one and the corpus starts
 * failing a gate it was never meant to face, or -- worse -- the harness stops
 * seeing the evidence and every parity result becomes vacuous while staying
 * green. So the projection is checked rather than trusted.
 */
export function checkFixtureProjection(repoRoot = REPO_ROOT) {
  const problems = []
  const read = (rel) => {
    const full = path.join(repoRoot, rel)
    return existsSync(full) ? readFileSync(full, 'utf8') : undefined
  }

  const readers = [
    {
      name: 'lint discovery',
      file: 'packages/eslint-config/base.js',
      why: 'linting the corpus fails the build on the very violations it proves',
      matches: (text) => /\*\*\/tests\/fixtures\/\*\*/.test(text),
    },
    {
      name: 'Prettier',
      file: '.prettierignore',
      why: 'formatting repairs the violation and destroys the evidence',
      matches: (text) => /packages\/lint-config\/tests\/fixtures\//.test(text),
    },
    {
      name: 'the package compiler project',
      file: 'packages/lint-config/tsconfig.json',
      why: 'type-checking the corpus fails on deliberate type errors',
      matches: (text) => {
        const parsed = JSON.parse(text)
        return (parsed.exclude ?? []).some((entry) => entry.startsWith('tests/fixtures'))
      },
    },
    {
      name: 'source-import scanning',
      file: 'scripts/check-source-imports.mjs',
      why: 'a deliberate syntax error has no parseable imports to govern',
      matches: (text) => /tests\/fixtures/.test(text),
    },
  ]

  for (const reader of readers) {
    const text = read(reader.file)
    if (text === undefined) {
      problems.push(`${reader.name}: ${reader.file} is missing, so its exclusion cannot be checked`)
      continue
    }
    if (!reader.matches(text)) {
      problems.push(
        `${reader.name} no longer excludes the conformance corpus (${reader.file}). ` +
          `It must, because ${reader.why}`,
      )
    }
  }

  // The fifth reader, and the one that must NOT exclude it. A corpus nothing
  // consumes proves nothing, and the failure is silent: every parity assertion
  // would still pass, against no evidence.
  // Matched as CODE -- the fixture root's `path.join` -- not as any mention:
  // a comment that still says "tests/fixtures" must not stand in for the
  // harness actually pointing there.
  const harness = read('packages/lint-config/src/run-parity.mjs')
  if (harness === undefined) {
    problems.push('the parity harness is missing, so nothing consumes the corpus')
  } else if (!/FIXTURE_ROOT\s*=\s*path\.join\([^)]*'tests',\s*'fixtures'\)/.test(harness)) {
    problems.push(
      'the parity harness no longer points at the conformance corpus. Every parity ' +
        'result would still pass, against no evidence',
    )
  }

  for (const rel of FIXTURE_CLASS) {
    if (!existsSync(path.join(repoRoot, 'packages/lint-config', rel))) {
      problems.push(`${rel} is part of the fixture class but does not exist`)
    }
  }

  return problems
}

// ── production lint wiring ──────────────────────────────────────────────────

/** The capability every linting member must invoke. */
export const LINT_CAPABILITY = 'secure-home-lint'

/** Engines a member must never invoke directly. */
export const ENGINE_BINARIES = ['eslint', 'oxlint', 'tsgolint']

/**
 * Members that must keep a prerequisite before linting.
 *
 * These declare a manifest check that has to pass first. Rewriting their lint
 * script must not drop it, so the requirement is recorded rather than
 * remembered.
 */
export const LINT_PREREQUISITES = new Map([
  ['packages/events', 'pnpm run deps'],
  ['packages/runner-core', 'pnpm run deps'],
  ['services/runner-control', 'pnpm run deps'],
  ['agents/adapters/coding/claude-code', 'pnpm run deps'],
  ['agents/adapters/coding/copilot-cli', 'pnpm run deps'],
])

/**
 * Every member reaches both engines through the capability, and none assembles
 * its own combination.
 *
 * A member that called `eslint src` directly would run one engine and pass,
 * which is exactly the state this landing replaces. A member that called
 * `oxlint` directly would skip the typed backend and the role projection. Both
 * look like working lint scripts, and neither enforces the contract, so the
 * wiring is checked rather than trusted to stay put.
 */
export function checkLintWiring(repoRoot = REPO_ROOT) {
  const problems = []

  for (const rel of members(repoRoot)) {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, rel, 'package.json'), 'utf8'))
    const script = String(pkg.scripts?.lint ?? '')

    if (NON_LINTING_MEMBERS.has(rel)) {
      if (script.includes(LINT_CAPABILITY) || ENGINE_BINARIES.some((e) => script.includes(e))) {
        problems.push(`${rel}: declared non-linting but its lint script runs an engine`)
      }
      continue
    }

    if (!script.includes(LINT_CAPABILITY)) {
      problems.push(
        `${rel}: lint does not go through ${LINT_CAPABILITY}. A member that invokes an ` +
          'engine directly runs one half of the dual-engine contract and reports success',
      )
    }

    for (const engine of ENGINE_BINARIES) {
      // Word-boundary match so `secure-home-lint` is not read as `eslint`.
      if (new RegExp(`(^|[\\s&|])${engine}([\\s]|$)`).test(script)) {
        problems.push(
          `${rel}: lint invokes "${engine}" directly. Command ownership belongs to the ` +
            'capability, or the dual-engine contract drifts per package',
        )
      }
    }

    const prerequisite = LINT_PREREQUISITES.get(rel)
    if (prerequisite !== undefined && !script.includes(prerequisite)) {
      problems.push(`${rel}: lint no longer runs its "${prerequisite}" prerequisite first`)
    }

    if (!pkg.devDependencies?.['@secure-home/lint-config']) {
      problems.push(`${rel}: uses ${LINT_CAPABILITY} without declaring the capability package`)
    }
  }

  return problems
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const here = fileURLToPath(new URL('..', import.meta.url))
  const read = (name) => JSON.parse(readFileSync(path.join(here, name), 'utf8'))

  const generated = loadGeneratedConfigs()
  const problems = [
    ...checkMemberRoles(REPO_ROOT),
    ...checkReferentialIntegrity(read('policy.json'), read('engine-mappings.json')),
    ...checkFixtureProjection(REPO_ROOT),
    ...checkFrameworkNeutrality(read('policy.json'), read('engine-mappings.json'), generated),
    ...checkFormattingNeutrality(read('policy.json'), generated),
  ]

  // Drift needs the engine, which needs an install. It is checked in the
  // package's own test run, where the toolchain is guaranteed present; running
  // it here too would make this gate depend on a resolved workspace.
  if (problems.length > 0) {
    console.error(`✗ lint policy integrity — ${problems.length} problem(s)\n`)
    for (const problem of problems) console.error(`    ${problem}`)
    process.exit(1)
  }
  const policy = read('policy.json')
  console.log(
    `✓ lint policy integrity — ${policy.policies.length} policies, ` +
      `${members(REPO_ROOT).length} members on their projected roles`,
  )
}
