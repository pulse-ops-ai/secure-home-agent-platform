/**
 * REPOSITORY-WIDE POLICY AND ROLE-ASSIGNMENT INTEGRITY.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CONFORMANCE CORPUS. The corpus exercises
 * ONE fixture pair per policy. That establishes what each role MEANS, and it is
 * the only honest way to learn the semantics — but it is blind to which members
 * actually consume which role. A member could switch from `library` to
 * `service`, quietly dropping the process restrictions from a package that is
 * not a composition root, and every fixture would still pass because
 * `services/runner-control` still resolves `service` correctly.
 *
 * So role SEMANTICS come from the corpus and role ASSIGNMENT is checked here,
 * across every member. `AUTH-MEMBER-ROLES` owns both halves; one without the
 * other is not the authority it claims to be.
 *
 * The semantics half used to be read from a resolved ESLint configuration by
 * `extract-legacy-policy.mjs`. Task 3.4 retired that engine and that extractor;
 * the split it motivated is unchanged, because it was never about which engine
 * answered — it was about a probe being unable to say who consumes the answer.
 *
 * Dependency-free: node stdlib.
 */
import { spawnSync } from 'node:child_process'
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
export const EXPORTED_TEST_ROLE = 'exported-test'

export const NON_LINTING_MEMBERS = new Set(['packages/tsconfig', 'packages/lint-config'])

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

/**
 * How a member declares that it is linted, read from its own bytes.
 *
 * This used to read `eslint.config.js`, which task 3.4 retired along with the
 * engine. The surviving projection is the member's lint SCRIPT: `AUTH-MEMBER-
 * ROLES` names the policy as the authority and member configs/scripts as its
 * checked projections, so the authority did not move -- one of its two
 * projections did.
 */
export function declaredLintOf(repoRoot, rel) {
  const manifest = path.join(repoRoot, rel, 'package.json')
  if (!existsSync(manifest)) return { kind: 'absent', script: '' }
  const script = String(JSON.parse(readFileSync(manifest, 'utf8')).scripts?.lint ?? '')
  if (script === '') return { kind: 'absent', script }
  if (/no lint/.test(script)) return { kind: 'declared-none', script }
  if (script.includes(LINT_CAPABILITY)) return { kind: 'capability', script }
  return { kind: 'unknown', script }
}

/**
 * The local overrides a member config carries, parsed from its bytes.
 *
 * Each is the `files` list and the rules inside the same block. Parsing the
 * source rather than resolving it keeps this dependency-free and, more to the
 * point, catches the override as WRITTEN: a second glob entry or a fourth
 * relaxed rule is a broadening whether or not any file matches it today.
 */

/**
 * Every member's assignment, checked against the projection.
 *
 * Returns problems rather than throwing, so one run reports the whole picture.
 */
/**
 * No projection entry may hand a member the exported test role.
 *
 * ADV-ROLE-002. The role exists so that a package can PUBLISH relaxed rules for
 * test helpers it exports; a member acquiring it would move all of its own
 * tests onto the more permissive contract at once.
 *
 * Checked against the table rather than against each member, because the table
 * is where it could actually happen: `expectedRoleFor` derives a member's role
 * from this list alone, so a per-member check would be unreachable code that
 * could never fail and never be trusted. The table is a parameter for the same
 * reason -- a guard nothing can drive is not a guard.
 */
export function checkRoleProjectionTable(projection = ROLE_PROJECTION) {
  const problems = []
  for (const entry of projection) {
    if (entry.role === EXPORTED_TEST_ROLE) {
      problems.push(
        `the projection maps "${entry.prefix}" onto the exported test role. No member ` +
          "consumes it: its relaxations reaching a member's own tests is a reviewed decision",
      )
    }
  }
  return problems
}

/**
 * The admitted process-entry exception must be exactly what it says.
 *
 * ADV-ROLE-001. `ADAPTER_BIN_OVERRIDE.relaxes` is the DECLARATION -- three
 * named policies, relaxed at one file. The generated `adapter-bin` config is
 * the realisation. Until this check existed the declaration was inert data:
 * the runner read only the prefix and the filename, so the two could disagree
 * indefinitely and the relaxation could quietly grow a fourth rule.
 *
 * The exception used to be written into each adapter's own config, where it
 * was validated by reading that file's text. Task 3.4 deleted those files, so
 * the same broadenings are caught here instead -- against the configs the
 * engine is actually handed, which is a stronger place to catch them than a
 * regular expression over source.
 */
export function checkAdmittedException(policy, mappings, generated) {
  const problems = []
  const memberRole = 'library'
  const exemptRole = 'adapter-bin'
  const member = generated[memberRole]
  const exempt = generated[exemptRole]
  if (member === undefined || exempt === undefined) {
    problems.push(`the "${memberRole}" and "${exemptRole}" configs must both exist to compare`)
    return problems
  }

  const ruleFor = new Map()
  for (const mapping of mappings.mappings) {
    if (mapping.engine !== 'replacement' || mapping.mechanism !== 'rule') continue
    ruleFor.set(mapping.policy, mapping.ruleId)
  }

  const declared = []
  for (const id of ADAPTER_BIN_OVERRIDE.relaxes) {
    const row = policy.policies.find((entry) => entry.id === id)
    if (row === undefined) {
      problems.push(`the admitted exception relaxes "${id}", which is not a policy`)
      continue
    }
    if (!row.roles.includes(memberRole)) {
      problems.push(
        `the admitted exception relaxes "${id}", which the "${memberRole}" role does not ` +
          'enforce, so there is nothing to relax',
      )
      continue
    }
    const ruleId = ruleFor.get(id)
    if (ruleId === undefined) {
      problems.push(`the admitted exception relaxes "${id}", which no rule realises`)
      continue
    }
    declared.push(ruleId)
  }

  const memberRules = new Set(Object.keys(member.rules ?? {}))
  const exemptRules = new Set(Object.keys(exempt.rules ?? {}))
  const relaxed = [...memberRules].filter((rule) => !exemptRules.has(rule)).sort()
  const gained = [...exemptRules].filter((rule) => !memberRules.has(rule)).sort()

  if (gained.length > 0) {
    problems.push(
      `the "${exemptRole}" role enforces ${gained.join(', ')}, which "${memberRole}" does not. ` +
        'An exception may only relax',
    )
  }
  const expected = [...declared].sort()
  if (relaxed.join(',') !== expected.join(',')) {
    problems.push(
      `the "${exemptRole}" role relaxes ${relaxed.join(', ') || '(nothing)'} but the admitted ` +
        `exception declares ${expected.join(', ') || '(nothing)'}`,
    )
  }

  return problems
}

export function checkMemberRoles(repoRoot = REPO_ROOT) {
  const problems = []
  const generated = loadGeneratedConfigs()

  for (const rel of members(repoRoot)) {
    const declared = declaredLintOf(repoRoot, rel)

    if (NON_LINTING_MEMBERS.has(rel)) {
      if (declared.kind !== 'declared-none') {
        problems.push(
          `${rel}: declared non-linting, but its lint script does not say so (${declared.kind})`,
        )
      }
      continue
    }

    if (declared.kind === 'absent') {
      problems.push(`${rel}: has no lint script, and it is not a declared non-linting member`)
      continue
    }
    if (declared.kind === 'declared-none') {
      problems.push(`${rel}: opts out of lint without being a declared non-linting member`)
      continue
    }
    if (declared.kind !== 'capability') {
      problems.push(
        `${rel}: its lint script does not go through ${LINT_CAPABILITY}. A member that assembles ` +
          'its own engine command owns lint semantics the policy is supposed to own',
      )
      continue
    }

    const expected = expectedRoleFor(rel)
    if (expected === undefined) {
      problems.push(`${rel}: outside every taxonomy prefix, so no role can be projected for it`)
      continue
    }
    // The projected role must be one the policy actually renders. A projection
    // naming a role with no generated config would leave the member linted by
    // nothing while every structural check still passed.
    if (generated[expected.role] === undefined) {
      problems.push(
        `${rel}: projects the "${expected.role}" role, which the policy renders no config for`,
      )
      continue
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
 * The bare rule name, with any plugin namespace removed.
 *
 * The engine canonicalises a TypeScript EXTENSION rule -- one that replaces a
 * core rule of the same name, such as `typescript/no-unused-vars` -- back to
 * the core name when it reports its resolved configuration. Three of the 117
 * are like that. Comparing raw keys would report all three as both unclaimed
 * and missing, which is a naming artefact and not drift.
 *
 * Normalising is only safe while the bare names stay unique within a role, and
 * `checkPolicyDrift` asserts that rather than assuming it: two policies
 * collapsing onto one name would make a real disappearance invisible.
 */
export function bareRuleName(ruleId) {
  const slash = ruleId.lastIndexOf('/')
  return slash === -1 ? ruleId : ruleId.slice(slash + 1)
}

/**
 * The manifest must still describe the engine's real behaviour.
 *
 * Committed policy is a CLAIM about a live configuration, and a claim nobody
 * re-derives is a comment. Task 3.4 retired the engine this used to re-derive
 * from, so the claim is now checked against the engine that actually runs:
 * `resolved` is what Oxlint itself reports it will apply for each role, not
 * what our own generated file says.
 *
 * Reading the generated file back would prove nothing. It is the generator's
 * own output, so it agrees with the generator by construction. Only the engine
 * can say whether the rule survived, at what severity, and whether anything
 * NOBODY declared is switched on beside it.
 *
 * Presence and severity, not options. The engine does not report the authored
 * options for an extension rule even though it applies them, so an option
 * comparison here would fail on three policies that are in fact correct. That
 * the options survive into behaviour is proven where it can be proven, by
 * running the engine -- see `option-semantics.test.ts`.
 *
 * @param resolved `{ [role]: { rules, categories } }` from `--print-config`.
 */
export function checkPolicyDrift(policy, mappings, resolved) {
  const problems = []

  const ruleFor = new Map()
  for (const mapping of mappings.mappings) {
    if (mapping.engine !== 'replacement') continue
    // Parser-realised policies carry no rule to resolve. They are enforced
    // before any rule runs, which is why they are absent here rather than
    // missing -- keying on a rule id they do not have is exactly what once
    // made them look unclaimed.
    if (mapping.mechanism !== 'rule') continue
    ruleFor.set(mapping.policy, mapping.ruleId)
  }

  for (const [role, live] of Object.entries(resolved)) {
    for (const [category, state] of Object.entries(live.categories ?? {})) {
      // `off` is how the config says it; `allow` is how the engine says it
      // back. Anything else means the engine is enforcing rules that reached
      // it through a category rather than through policy.
      if (state !== 'off' && state !== 'allow') {
        problems.push(
          `role "${role}" leaves the "${category}" category on (${state}), so the engine ` +
            'enforces rules no policy decided',
        )
      }
    }

    const expected = new Map()
    for (const row of policy.policies) {
      if (!row.roles.includes(role)) continue
      const ruleId = ruleFor.get(row.id)
      if (ruleId === undefined) continue
      const bare = bareRuleName(ruleId)
      const clash = expected.get(bare)
      if (clash !== undefined) {
        problems.push(
          `policies "${clash.row.id}" and "${row.id}" both resolve to the rule name ` +
            `"${bare}" in role "${role}", so one disappearing would be invisible here`,
        )
        continue
      }
      expected.set(bare, { row, ruleId })
    }

    const applied = new Map()
    for (const [ruleId, entry] of Object.entries(live.rules ?? {})) {
      applied.set(bareRuleName(ruleId), entry)
    }

    for (const bare of applied.keys()) {
      if (!expected.has(bare)) {
        problems.push(
          `the engine enforces "${bare}" in role "${role}" but no policy row claims it there`,
        )
      }
    }
    for (const [bare, { row, ruleId }] of expected) {
      if (!applied.has(bare)) {
        problems.push(
          `policy "${row.id}" claims role "${role}" but the engine no longer enforces ` +
            `"${ruleId}" there`,
        )
        continue
      }
      const entry = applied.get(bare)
      const severity = Array.isArray(entry) ? entry[0] : entry
      // Blocking is a policy word; `deny` is the engine's word for it. A rule
      // resolved to `warn` still appears in the config and still looks
      // enforced, while failing nothing.
      if (row.blocking === true && severity !== 'deny' && severity !== 'error') {
        problems.push(
          `policy "${row.id}" is blocking, but the engine applies "${ruleId}" in role ` +
            `"${role}" at "${severity}"`,
        )
      }
    }
  }

  for (const row of policy.policies) {
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
      // Task 3.4 retired the engine that carried this exclusion as an ignore
      // glob. The exclusion did not go away with it -- it moved to the byte
      // that now decides whether the corpus is ever handed to an engine at
      // all. `run-lint.mjs` lints each member in its own directory, so the
      // corpus is out of reach precisely while its OWNER declines to be
      // linted. Give `packages/lint-config` a real lint script and every
      // deliberately-invalid fixture becomes a build failure.
      name: 'lint discovery',
      file: 'packages/lint-config/package.json',
      why: 'linting the corpus fails the build on the very violations it proves',
      matches: (text) => /no lint/.test(String(JSON.parse(text).scripts?.lint ?? '')),
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
// `eslint` stays on this list after its retirement, deliberately. The list
// names binaries a member's lint script must not invoke DIRECTLY, and the
// retired engine is the one most likely to be reached for by habit or by a
// copied snippet. Removing it would make reintroducing it the one bypass this
// check does not notice.
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
 * Every member reaches the replacement engine through the capability, and none
 * assembles its own command.
 *
 * Scope 2 is replacement-only: task 3.4 retired the second engine, so there is
 * one engine and the capability is the one way to it. A member that called
 * `oxlint` directly would skip the typed backend and the role projection, and
 * it would still look like a working lint script -- which is why the wiring is
 * checked rather than trusted to stay put.
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
          'engine directly chooses its own config, rules and severity, and reports success ' +
          'against a contract nobody checked',
      )
    }

    for (const engine of ENGINE_BINARIES) {
      // Word-boundary match so `secure-home-lint` is not read as `eslint`.
      if (new RegExp(`(^|[\\s&|])${engine}([\\s]|$)`).test(script)) {
        problems.push(
          `${rel}: lint invokes "${engine}" directly. Command ownership belongs to the ` +
            'capability, or the lint contract drifts per package',
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

// ── the bounded compatibility seam ──────────────────────────────────────────

/** The compatibility package. NOT a compiler. */
export const COMPATIBILITY_PACKAGE = '@typescript/typescript6'

/** The normal compiler, which nothing here may displace. */
export const NORMAL_COMPILER = 'typescript'

/**
 * The seam is bounded to a SINGLETON consumer, and cannot become a compiler.
 *
 * Two separate failures are possible and both are silent.
 *
 * A second consumer widens a parsing seam into a general-purpose compiler
 * dependency. Nothing breaks; the boundary simply stops being one, and the next
 * compiler cutover drags whatever adopted it.
 *
 * The other direction is worse: switching this file back to the normal compiler
 * ERASES the seam. Everything still passes, because the traditional API and the
 * current compiler agree today. The coupling only reappears at the cutover, by
 * which time the boundary that was supposed to absorb it no longer exists. So
 * the seam's PRESENCE is asserted, not merely its narrowness.
 */
export function checkCompatibilitySeam(repoRoot = REPO_ROOT) {
  const problems = []
  const boundariesPath = path.join(repoRoot, 'scripts', 'toolchain-boundaries.json')
  if (!existsSync(boundariesPath)) {
    problems.push('scripts/toolchain-boundaries.json is missing; the seam has no allowlist')
    return problems
  }
  const boundaries = JSON.parse(readFileSync(boundariesPath, 'utf8'))
  const allowed = new Set(boundaries.compatibilityConsumers ?? [])

  if (allowed.size !== 1 || !allowed.has('scripts/check-source-imports.mjs')) {
    problems.push(
      `the compatibility allowlist must be exactly ["scripts/check-source-imports.mjs"]; ` +
        `found [${[...allowed].join(', ')}]`,
    )
  }
  for (const entry of allowed) {
    if (entry.includes('*')) {
      problems.push(`the compatibility allowlist entry "${entry}" is a glob; it must name a file`)
    }
  }

  // Who actually loads it, from the AST rather than from text.
  //
  // A regex over comment-stripped source does not converge on "what is a module
  // load": a `//` inside a string truncated the line and erased a real
  // `import("...")` after it, and only a bare identifier counted as a computed
  // load, so `import(process.env.X)`, `import(a + b)`, `import(f())` and
  // `require(c ? a : b)` were all invisible. The architecture gate already
  // parses every file for exactly this question and is the only admitted
  // consumer of the compatibility parser, so its inventory is the answer both
  // checks share instead of two gates disagreeing about module loading.
  const report = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'check-source-imports.mjs'), '--report-loads', repoRoot],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (report.status !== 0) {
    problems.push(
      `the load-site inventory could not be produced, so the seam is unproved: ${report.stderr?.trim()}`,
    )
    return problems
  }
  const loads = JSON.parse(report.stdout)

  const actual = []
  for (const [rel, sites] of Object.entries(loads)) {
    if (sites.specifiers.includes(COMPATIBILITY_PACKAGE)) actual.push(rel)
    // A specifier the parser could not resolve is a place the package can hide.
    // Unresolvable is unanswered, not absent, so it fails CLOSED.
    for (const site of sites.nonLiteral) {
      if (rel === 'scripts/check-source-imports.mjs') continue
      problems.push(
        `${rel}:${site.line} loads a module through a non-literal specifier. The seam cannot be ` +
          'proved bounded when a load site is unresolvable without running the code, so this ' +
          'fails closed: give the specifier literally, or move the load out of repository source',
      )
    }
  }
  actual.sort()
  for (const rel of actual) {
    if (!allowed.has(rel)) {
      problems.push(
        `${rel} imports ${COMPATIBILITY_PACKAGE} but is not an admitted consumer. The seam is ` +
          'a bounded parsing surface, not a general compiler dependency',
      )
    }
  }
  for (const rel of allowed) {
    if (!actual.includes(rel)) {
      problems.push(
        `${rel} is the admitted consumer but no longer imports ${COMPATIBILITY_PACKAGE}. ` +
          'Reverting it to the normal compiler erases the seam silently: the two agree ' +
          'today, and the coupling only reappears at the cutover',
      )
    }
  }

  return problems
}

/**
 * The compatibility package may never satisfy a normal compiler entry point.
 *
 * `tsc6` is not an alternative compiler. If a package script typechecked,
 * built, or generated through the compatibility API, the repository would have
 * two compilers and the seam would have become the thing it exists to prevent.
 */
export function checkNormalCompilerAuthority(repoRoot = REPO_ROOT) {
  const problems = []
  const boundaries = JSON.parse(
    readFileSync(path.join(repoRoot, 'scripts', 'toolchain-boundaries.json'), 'utf8'),
  )
  const guarded = boundaries.normalCompilerEntryPoints ?? []

  const manifests = [
    ['package.json', 'the repository root'],
    ...members(repoRoot).map((rel) => [`${rel}/package.json`, rel]),
  ]
  for (const [rel, label] of manifests) {
    const full = path.join(repoRoot, rel)
    if (!existsSync(full)) continue
    const pkg = JSON.parse(readFileSync(full, 'utf8'))
    for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
      const guardedEntry = guarded.some((entry) => name === entry || name.startsWith(`${entry}:`))
      if (!guardedEntry) continue
      if (/tsc6|typescript6/.test(String(script))) {
        problems.push(
          `${label}: the "${name}" script reaches the compatibility API. It is a parsing ` +
            'seam, not a compiler, and a normal entry point must resolve ' +
            `${NORMAL_COMPILER}`,
        )
      }
      // A lint engine's type-aware mode is not a compiler either. It reads
      // types to decide lint questions; it does not own whether the repository
      // compiles, and substituting it here would retire the compiler authority
      // without any decision being recorded. Checking only for the
      // compatibility API missed this entirely.
      const lintEngine = /\b(oxlint|eslint)\b/.exec(String(script))
      if (lintEngine) {
        problems.push(
          `${label}: the "${name}" script resolves ${lintEngine[1]}. A lint engine, including ` +
            'its type-aware mode, is not a compiler authority; a normal entry point must ' +
            `resolve ${NORMAL_COMPILER}`,
        )
      }
    }
  }

  // And the package itself must never be a dependency of anything but the root,
  // where the single admitted consumer lives.
  for (const rel of members(repoRoot)) {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, rel, 'package.json'), 'utf8'))
    for (const field of DEP_FIELDS_CHECKED) {
      if (pkg[field]?.[COMPATIBILITY_PACKAGE]) {
        problems.push(
          `${rel} declares ${COMPATIBILITY_PACKAGE} in ${field}. Only the repository root ` +
            'may, because only the root hosts the admitted consumer',
        )
      }
    }
  }

  return problems
}

/**
 * All four manifest dependency fields.
 *
 * `optionalDependencies` was omitted, and an optional edge installs the package
 * exactly like a required one when the platform matches. A member could make
 * the compatibility parser locally resolvable through it while the singleton
 * SOURCE-consumer proof stayed green, because no source file need import it for
 * the boundary to have moved -- availability is the thing the seam bounds.
 * The lockfile importer scan already read all four for the same reason.
 */
const DEP_FIELDS_CHECKED = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

/** Repository scripts, which is where a second consumer would appear. */
const SOURCE_EXTENSIONS = new Set(['.mjs', '.cjs', '.js', '.ts', '.mts', '.cts', '.tsx'])
const NEVER_WALKED = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo'])

/**
 * Every source file in the repository.
 *
 * This scanned only `scripts/*.mjs`, which bounded the seam to one directory
 * rather than to one file: a workspace package could import the compatibility
 * parser and no gate would notice, because nothing outside `scripts/` was ever
 * read. The allowlist is a claim about the WHOLE repository, so the scan has to
 * be too.
 */
function sourceFiles(repoRoot) {
  const found = []
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (NEVER_WALKED.has(entry.name)) continue
        walk(path.join(dir, entry.name), childRel)
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        found.push(childRel)
      }
    }
  }
  walk(repoRoot, '')
  return found
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
    ...checkRoleProjectionTable(),
    ...checkAdmittedException(read('policy.json'), read('engine-mappings.json'), generated),
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
