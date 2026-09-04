/**
 * BEHAVIOURAL PARITY, BOTH ENGINES, EVERY POLICY.
 *
 * The question this answers is not "does the replacement engine have a rule
 * with a similar name". It is "does the replacement engine reject the same
 * source the legacy engine rejects, and accept the same source it accepts,
 * attributing both to the SAME semantic policy".
 *
 * Registration is not parity. A rule can exist, load, and appear in
 * `--print-config` while doing nothing, or doing something subtly different.
 * So every policy is exercised against two real files:
 *
 *   valid/<id>     both engines must ACCEPT   (no diagnostic for this policy)
 *   invalid/<id>   both engines must REJECT   (a diagnostic for this policy)
 *
 * A fixture that does not fire under the LEGACY engine is refused before the
 * replacement is consulted. Otherwise a fixture that violates nothing would
 * "pass" on both sides and prove that neither engine enforces the policy.
 *
 * PARSE-LEVEL POLICIES. Two policies are realised by the replacement engine's
 * parser rather than a rule, so their attribution is a parse diagnostic and not
 * a rule name. That is a mechanism difference, not a parity gap: the source is
 * still rejected, and rejected earlier.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
export const FIXTURE_ROOT = path.join(PACKAGE_ROOT, 'tests', 'fixtures')
const OXLINT = path.join(PACKAGE_ROOT, 'node_modules', '.bin', 'oxlint')

/**
 * The role a policy must be proved under.
 *
 * Not one role per shard: a policy is only enforced in the roles that enable
 * it, so linting under a role that switches it off would exercise nothing and
 * report a pass. `library` is preferred where it applies because it is the
 * strictest; otherwise the policy's own first role is used.
 */
export function roleFor(policy) {
  return policy.roles.includes('library') ? 'library' : policy.roles[0]
}

export function configForRole(role) {
  return path.join(PACKAGE_ROOT, 'generated', `oxlintrc.${role}.json`)
}

/**
 * Legacy diagnostics for one file, as rule ids.
 *
 * Linted through an explicit config rather than the fixture's location, because
 * `tests/fixtures/**` is ignored by the repository's own lint — deliberately,
 * since these files are invalid on purpose.
 */
/**
 * The same judgement applied to SOURCE TEXT rather than a committed file.
 *
 * Hostile cases need sources this repository must not contain -- a fixture with
 * its violation removed and an unrelated syntax error put in its place. Writing
 * those to disk would either commit them or place them outside the lint root,
 * where `lintFiles` declines to look.
 */
/**
 * The parser the legacy engine must use for a fixture.
 *
 * TypeScript fixtures need the TypeScript parser. Without it every `.ts`
 * fixture fails to parse under the default one, the rule never runs, and the
 * harness reports "the policy did not fire" for a reason that has nothing to do
 * with the policy. That is what the first run of the core-control shard showed:
 * fourteen legacy failures whose Oxlint side was already correct.
 */
/**
 * The plugins a rule id needs before it can be enabled.
 *
 * A namespaced rule cannot be turned on without its plugin registered: ESLint
 * refuses the whole config with `config-plugin-missing` rather than skipping
 * the rule, which is the right behaviour and the reason this is explicit.
 */
function pluginsFor(ruleId) {
  return ruleId !== undefined && ruleId.startsWith('@typescript-eslint/')
    ? { '@typescript-eslint': tseslint.plugin }
    : {}
}

function languageOptionsFor(file) {
  const parserOptions = { ecmaVersion: 2023, sourceType: 'module' }
  return file.endsWith('.ts') || file.endsWith('.tsx')
    ? { parser: tseslint.parser, parserOptions }
    : { parserOptions }
}

export async function legacyDiagnosticsForText(text, filePath, ruleId, options) {
  const rules =
    ruleId === undefined
      ? {}
      : { [ruleId]: options === undefined ? 'error' : ['error', ...options] }
  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.ts', '**/*.js'],
      plugins: pluginsFor(ruleId),
      languageOptions: languageOptionsFor(filePath),
      rules,
    },
  })
  const [result] = await eslint.lintText(text, { filePath })
  const messages = result?.messages ?? []
  return {
    rules: messages.filter((m) => m.ruleId !== null).map((m) => m.ruleId),
    fatalMessages: messages.filter((m) => m.fatal === true).map((m) => m.message),
  }
}

/**
 * The replacement engine's verdict on source text, via a scratch file.
 *
 * The scratch file lives INSIDE the fixture root, not in the OS temp
 * directory. The engine is invoked with the fixture root as its working
 * directory, and a subject outside that tree is not reliably analysed: locally
 * an absolute /tmp path worked, and on the hosted runner the same call returned
 * no diagnostics at all — which read as "the engine accepted it" and made four
 * hostile cases pass for the wrong reason.
 *
 * Keeping the subject under the root removes the difference rather than
 * accommodating it. The directory is ignored by git and is already covered by
 * every exclusion that covers the corpus.
 */
/**
 * Turn the replacement engine's report into diagnostics.
 *
 * This asks for JSON and reads fields, deliberately. The engine picks a
 * different human-readable reporter when it detects GitHub Actions, and its
 * `github` form drops the ` error: ` marker that a text parser keyed on. The
 * result was a harness that read "no parse errors" from a runner where the
 * engine had in fact reported one -- the parity suite passed locally and failed
 * on every hosted runner. A structural read cannot drift that way: a rule
 * violation carries `code`, a parse error carries none.
 *
 * Unreadable output THROWS. Returning an empty result would restore exactly the
 * failure being fixed here, where "the engine found nothing" and "the harness
 * could not read the engine" were indistinguishable.
 */
export function parseReplacementReport(out) {
  let report
  try {
    report = JSON.parse(out)
  } catch {
    throw new Error(
      `the replacement engine did not emit readable JSON, so its verdict is unknown: ${out.trim()}`,
    )
  }
  if (!Array.isArray(report?.diagnostics)) {
    throw new Error(
      `the replacement engine emitted JSON with no diagnostics array, so its verdict is unknown: ${out.trim()}`,
    )
  }
  const rules = []
  const parseErrors = []
  for (const diagnostic of report.diagnostics) {
    // `code` is the rule identity ("eslint(no-var)"). A diagnostic without one
    // is the engine refusing the source rather than a policy firing.
    const code = /^(?:eslint|typescript|oxc)\(([a-z0-9-]+)\)$/.exec(diagnostic?.code ?? '')
    if (code) {
      rules.push(code[1])
      continue
    }
    // `help` carries the specific reason ("\\8 and \\9 are not allowed"); the
    // message alone is often generic ("Invalid escape sequence"). The engine's
    // text reporter concatenates them, and the accepted per-engine
    // diagnosticPattern values were derived from that concatenation, so the
    // structural read must reconstruct the same text rather than the mapping
    // being rewritten to fit a narrower field.
    const message = String(diagnostic?.message ?? '').trim()
    const help = String(diagnostic?.help ?? '').trim()
    parseErrors.push(help ? `${message} help: ${help}` : message)
  }
  return { rules, parseErrors, raw: out }
}

export function replacementDiagnosticsForText(text, extension, configPath) {
  const dir = mkdtempSync(path.join(FIXTURE_ROOT, '.scratch-'))
  const file = path.join(dir, `subject${extension}`)
  writeFileSync(file, text)
  try {
    return replacementDiagnostics(file, configPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function legacyDiagnostics(file, ruleId, options) {
  // A parser-enforced policy has no rule to enable; the parse itself decides.
  const rules =
    ruleId === undefined
      ? {}
      : { [ruleId]: options === undefined ? 'error' : ['error', ...options] }
  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.ts', '**/*.js'],
      plugins: pluginsFor(ruleId),
      languageOptions: languageOptionsFor(file),
      rules,
    },
  })
  const [result] = await eslint.lintFiles([file])
  const messages = result?.messages ?? []
  return {
    rules: messages.filter((m) => m.ruleId !== null).map((m) => m.ruleId),
    // The TEXT, not merely "was there a parse error". A boolean cannot tell
    // the intended violation from an unrelated typo, so it would let any
    // syntax error satisfy any parser-enforced policy.
    fatalMessages: messages.filter((m) => m.fatal === true).map((m) => m.message),
  }
}

/** Replacement diagnostics for one file: rule names plus parse errors. */
export function replacementDiagnostics(file, configPath) {
  let out = ''
  try {
    // --format is pinned, never inherited: the engine selects a different
    // reporter on a CI runner than on a workstation.
    out = execFileSync(OXLINT, ['--format=json', '--config', configPath, file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    out = `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`
  }
  return parseReplacementReport(out)
}

/**
 * Attribution for a parse-level policy.
 *
 * The expected diagnostic must actually appear. "Some parse error occurred" is
 * not parity: a fixture whose intended violation was removed and replaced by an
 * unrelated syntax error would still be rejected by both engines, and would
 * pass while proving nothing.
 */
export function matches(diagnostics, pattern) {
  if (pattern === undefined) return false
  return diagnostics.some((message) => message.includes(pattern))
}

export function fixturePath(relative) {
  return path.join(FIXTURE_ROOT, relative)
}

export function fixtureExists(relative) {
  return existsSync(fixturePath(relative))
}

export function loadAuthorities(root = PACKAGE_ROOT) {
  return {
    policy: JSON.parse(readFileSync(path.join(root, 'policy.json'), 'utf8')),
    mappings: JSON.parse(readFileSync(path.join(root, 'engine-mappings.json'), 'utf8')),
  }
}

/** Shards whose policies cannot be decided without type information. */
export const TYPED_SHARDS = new Set(['typescript-typed-control', 'typescript-typed-unsafe'])

// ── role behaviour ──────────────────────────────────────────────────────────

/** The role fixtures: one source, judged under every role (task 1.11). */
export const ROLE_FIXTURE_ROOT = path.join(FIXTURE_ROOT, 'roles')

/**
 * The legacy rule ids that cannot run without a program, by the rules' OWN
 * declaration (`meta.docs.requiresTypeChecking`).
 *
 * Role behaviour is proved on the STATIC path: a role fixture is one file with
 * no project behind it, so a typed rule would give no answer there rather than
 * a wrong one. The typed policies' role differences are asserted from the
 * oracle's resolved configuration instead; these ids are what the static role
 * run leaves out, explicitly, so the omission is a list and not an accident.
 *
 * Not the typed SHARDS: shard allocation derives type-awareness from the
 * oracle, and a static rule the JavaScript-config override switches off
 * (`explicit-module-boundary-types`) lands in a typed shard that way. That is
 * harmless for the shard, which runs with a program, and wrong for the role
 * run, which would silently drop a static rule it must exercise.
 */
export function typedLegacyRuleIds(mappings) {
  const typed = new Set()
  for (const mapping of mappings.mappings) {
    if (mapping.engine !== 'legacy' || mapping.ruleId === undefined) continue
    if (!mapping.ruleId.startsWith('@typescript-eslint/')) continue
    const rule = tseslint.plugin.rules[mapping.ruleId.slice('@typescript-eslint/'.length)]
    if (rule?.meta?.docs?.requiresTypeChecking === true) typed.add(mapping.ruleId)
  }
  return typed
}

/**
 * The legacy engine's static rule set for one role, from the oracle's rows.
 *
 * The rows are what `calculateConfigForFile` resolved for the role's
 * representative file -- the same answer the linter gives that file -- so
 * linting a fixture under them is linting it AS that role, minus the typed
 * rules named above. Options travel with each rule: a restriction rule with
 * no restrictions permits everything.
 */
export function legacyRulesForRole(rows, role, typed) {
  const rules = {}
  for (const row of rows) {
    if (!row.roles.includes(role) || typed.has(row.ruleId)) continue
    rules[row.ruleId] = ['error', ...(row.options?.[role] ?? [])]
  }
  return rules
}

/**
 * Legacy diagnostics for one file under a whole rule set, as rule ids.
 *
 * The TypeScript parser for JavaScript too, with type checking off: that is
 * what the repository's own JavaScript block does (`disableTypeChecked` keeps
 * the parser and drops the program), and a static TypeScript rule that is
 * enabled for the JavaScript-config role loads only against that parser.
 */
export async function legacyDiagnosticsForRules(file, rules) {
  const plugins = Object.keys(rules).some((id) => id.startsWith('@typescript-eslint/'))
    ? { '@typescript-eslint': tseslint.plugin }
    : {}
  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.ts', '**/*.js'],
      plugins,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          project: false,
          projectService: false,
        },
      },
      rules,
    },
  })
  const [result] = await eslint.lintFiles([file])
  const messages = result?.messages ?? []
  return {
    rules: messages.filter((m) => m.ruleId !== null).map((m) => m.ruleId),
    fatalMessages: messages.filter((m) => m.fatal === true).map((m) => m.message),
  }
}

/**
 * One fixture under one role, both engines: did each engine report the
 * policy? Keyed by POLICY id, with each engine's own rule id resolved through
 * the mappings, exactly as the shard parity does.
 */
export async function roleObservation({
  file,
  role,
  policyIds,
  rows,
  policy,
  mappings,
  legacyRules,
  replacementConfig,
}) {
  const legacy = new Map(
    mappings.mappings.filter((m) => m.engine === 'legacy').map((m) => [m.policy, m]),
  )
  const replacement = new Map(
    mappings.mappings.filter((m) => m.engine === 'replacement').map((m) => [m.policy, m]),
  )
  const legacyOut = await legacyDiagnosticsForRules(
    file,
    legacyRules ?? legacyRulesForRole(rows, role, typedLegacyRuleIds(mappings)),
  )
  const replacementOut = replacementDiagnostics(file, replacementConfig ?? configForRole(role))
  const observed = {}
  for (const id of policyIds) {
    const legacyRule = legacy.get(id)?.ruleId
    const replacementRule = replacement.get(id)?.ruleId
    const bare =
      replacementRule === undefined
        ? undefined
        : replacementRule.includes('/')
          ? replacementRule.slice(replacementRule.lastIndexOf('/') + 1)
          : replacementRule
    observed[id] = {
      legacy: legacyOut.rules.includes(legacyRule),
      replacement: replacementOut.rules.includes(bare),
    }
  }
  return { file, role, observed, detail: { legacyOut, replacementOut } }
}

/**
 * The matrix judgement, pure so it can be driven with a mutated observation.
 *
 * `expectations` maps a policy id to the roles that must REJECT the fixture;
 * every other role in `roles` must accept it. A role that stops rejecting
 * what it must (the process exception broadened beyond the adapter entry) and
 * a role that starts rejecting what it must not (the library's restrictions
 * leaking into a service) are both problems, on either engine.
 */
export function roleMatrixProblems(observations, expectations, roles) {
  const problems = []
  for (const [policyId, rejecting] of Object.entries(expectations)) {
    for (const role of roles) {
      const observation = observations.find((o) => o.role === role)
      if (observation === undefined) {
        problems.push(`${policyId}: no observation for the "${role}" role`)
        continue
      }
      const seen = observation.observed[policyId]
      if (seen === undefined) {
        problems.push(`${policyId}: the "${role}" observation carries no verdict for it`)
        continue
      }
      const mustReject = rejecting.includes(role)
      for (const engine of ['legacy', 'replacement']) {
        if (seen[engine] !== mustReject) {
          problems.push(
            `${policyId}: the ${engine} engine ${seen[engine] ? 'rejected' : 'accepted'} ` +
              `${path.basename(observation.file)} under the "${role}" role, which must ` +
              `${mustReject ? 'reject' : 'accept'} it`,
          )
        }
      }
    }
  }
  return problems
}

/** Both engines, both fixtures, one policy. */
export async function parityFor(policy, legacy, replacement, configPath) {
  const valid = fixturePath(policy.proof.valid)
  const invalid = fixturePath(policy.proof.invalid)

  // Semantic options come from the POLICY, and a rule that needs them does not
  // fire without them. `no-restricted-globals` with no restrictions declared is
  // a rule that permits everything: the fixture would be accepted and the
  // harness would report that the policy is not enforced -- when what is not
  // enforced is the empty configuration it was handed.
  const options = legacy.engineOptions ?? policy.options?.values

  // Typed policies go through the TYPED backends on both sides. Falling back to
  // the static path for either one would compare a typed answer against a
  // no-answer and call the result parity.
  const typed = TYPED_SHARDS.has(policy.proof.shard)
  const legacyRun = typed ? legacyTypedDiagnostics : legacyDiagnostics
  const replacementRun = typed ? replacementTypedDiagnostics : replacementDiagnostics

  const legacyInvalid = await legacyRun(invalid, legacy.ruleId, options)
  const legacyValid = await legacyRun(valid, legacy.ruleId, options)
  const replacementInvalid = replacementRun(invalid, configPath)
  const replacementValid = replacementRun(valid, configPath)

  const replacementRule = replacement.ruleId
  const bare =
    replacementRule === undefined
      ? undefined
      : replacementRule.includes('/')
        ? replacementRule.slice(replacementRule.lastIndexOf('/') + 1)
        : replacementRule

  return {
    id: policy.id,
    legacyRejects:
      legacy.mechanism === 'parser'
        ? matches(legacyInvalid.fatalMessages, legacy.diagnosticPattern)
        : legacyInvalid.rules.includes(legacy.ruleId),
    legacyAccepts:
      legacy.mechanism === 'parser'
        ? !matches(legacyValid.fatalMessages, legacy.diagnosticPattern)
        : !legacyValid.rules.includes(legacy.ruleId),
    replacementRejects:
      replacement.mechanism === 'parser'
        ? matches(replacementInvalid.parseErrors, replacement.diagnosticPattern)
        : replacementInvalid.rules.includes(bare),
    replacementAccepts:
      replacement.mechanism === 'parser'
        ? !matches(replacementValid.parseErrors, replacement.diagnosticPattern)
        : !replacementValid.rules.includes(bare),
    detail: { legacyInvalid, legacyValid, replacementInvalid, replacementValid },
  }
}

// ── option semantics ────────────────────────────────────────────────────────

/**
 * The FIXED OUTPUT a rule produces, not merely whether it fired.
 *
 * Some options change what the fix writes rather than whether a diagnostic
 * appears. `consistent-type-imports` with `fixStyle: "inline-type-imports"`
 * rejects the same source as the separate-import style and repairs it
 * differently. Proving both engines reject a file therefore says nothing about
 * whether the repository's chosen option survived the migration -- the two
 * could agree on rejection and disagree on every byte they write.
 */
export async function legacyFixOutput(text, filePath, ruleId, options) {
  const rules =
    ruleId === undefined
      ? {}
      : { [ruleId]: options === undefined ? 'error' : ['error', ...options] }
  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    fix: true,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.ts', '**/*.js'],
      plugins: pluginsFor(ruleId),
      languageOptions: languageOptionsFor(filePath),
      rules,
    },
  })
  const [result] = await eslint.lintText(text, { filePath })
  return result?.output ?? text
}

/** The replacement engine's fixed output for the same source. */
export function replacementFixOutput(text, extension, configPath) {
  const dir = mkdtempSync(path.join(tmpdir(), 'parity-fix-'))
  const file = path.join(dir, `subject${extension}`)
  writeFileSync(file, text)
  try {
    execFileSync(OXLINT, ['--config', configPath, '--fix', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    // A non-zero exit means unfixed diagnostics remain; the file is still
    // written, and the written bytes are what this measures.
  }
  return readFileSync(file, 'utf8')
}

// ── typed execution ─────────────────────────────────────────────────────────

/** The fixture corpus's own type environment, loaded only by this harness. */
export const FIXTURE_TSCONFIG = path.join(FIXTURE_ROOT, 'tsconfig.json')

export class TypedBackendUnavailable extends Error {}

/**
 * Legacy typed lint, with a REAL TypeScript program.
 *
 * A typed rule cannot be decided without types: `await-thenable` has to know
 * whether the awaited value is a promise. Running it without a program does not
 * produce a wrong answer, it produces NO answer -- and a rule that reports
 * nothing is indistinguishable from a rule that found nothing.
 *
 * So a missing or unusable project is thrown, never absorbed. The suite must
 * fail because typed execution disappeared, not quietly pass because the
 * expected diagnostic did.
 */
export async function legacyTypedDiagnostics(file, ruleId, options) {
  if (!existsSync(FIXTURE_TSCONFIG)) {
    throw new TypedBackendUnavailable(
      `the fixture type environment is missing at ${FIXTURE_TSCONFIG}; typed lint ` +
        'cannot run, and a static fallback would report nothing while looking like a pass',
    )
  }
  const rules =
    ruleId === undefined
      ? {}
      : { [ruleId]: options === undefined ? 'error' : ['error', ...options] }
  const eslint = new ESLint({
    cwd: FIXTURE_ROOT,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.ts'],
      plugins: pluginsFor(ruleId),
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          project: FIXTURE_TSCONFIG,
          tsconfigRootDir: FIXTURE_ROOT,
        },
      },
      rules,
    },
  })
  const [result] = await eslint.lintFiles([file])
  const messages = result?.messages ?? []
  const fatal = messages.filter((m) => m.fatal === true).map((m) => m.message)
  // A parser that could not build a program says so fatally. That is a backend
  // failure, not a lint result.
  if (fatal.some((m) => /project|tsconfig|program|type information/i.test(m))) {
    throw new TypedBackendUnavailable(`typed lint could not initialize: ${fatal.join('; ')}`)
  }
  return {
    rules: messages.filter((m) => m.ruleId !== null).map((m) => m.ruleId),
    fatalMessages: fatal,
  }
}

/**
 * Replacement typed lint, through the engine's own type-aware backend.
 *
 * `--type-aware` is required: without it the typed rules are simply not run,
 * and the engine exits clean. Treating that as "no violations" would be the
 * silent downgrade this whole harness exists to prevent, so absence of the
 * backend is an error rather than an empty result.
 */
export function replacementTypedDiagnostics(file, configPath) {
  let out = ''
  let failed = false
  try {
    out = execFileSync(OXLINT, ['--type-aware', '--format=json', '--config', configPath, file], {
      cwd: FIXTURE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    failed = true
    out = `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`
  }
  if (
    /tsgolint|type-aware|not (?:found|installed)/i.test(out) &&
    /error|failed|cannot/i.test(out)
  ) {
    throw new TypedBackendUnavailable(`the replacement typed backend did not run: ${out.trim()}`)
  }
  void failed
  return parseReplacementReport(out)
}
