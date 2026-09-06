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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { OXLINT_CATEGORIES } from './generate-oxlint-config.mjs'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
export const FIXTURE_ROOT = path.join(PACKAGE_ROOT, 'tests', 'fixtures')
/** Scratch subjects live beside the corpus, never inside it. */
/**
 * Where transient lint subjects are written.
 *
 * OUTSIDE the compiled tree, and outside `tests/` in particular. The package
 * tsconfig includes `tests` and excludes only `tests/fixtures`, so a scratch
 * subject written under `tests/` joins the typed program -- and then vanishes
 * underneath a `tsc --noEmit` running concurrently, which `check.sh` does. It
 * failed intermittently and only under the combined gate, which is the worst
 * way for a defect to present.
 *
 * Still inside the PACKAGE, deliberately: the engine resolves its config and
 * ignore rules relative to its working directory, so a subject in the system
 * temp directory would be linted under different rules than a real file.
 */
export const SCRATCH_ROOT = path.join(PACKAGE_ROOT, '.scratch')
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
  // OUTSIDE the fixture tree, deliberately. The fixture tsconfig includes
  // `**/*.ts`, so a scratch subject written inside it joins the typed program
  // that the typed shards build concurrently, and then vanishes underneath
  // them. Still inside the package, because the engine resolves its config and
  // ignore rules relative to its working directory.
  mkdirSync(SCRATCH_ROOT, { recursive: true })
  const dir = mkdtempSync(path.join(SCRATCH_ROOT, 'subject-'))
  const file = path.join(dir, `subject${extension}`)
  writeFileSync(file, text)
  try {
    return replacementDiagnostics(file, configPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * What the engine says it RESOLVED from a config, in its own words.
 *
 * The committed policy is a claim about a live configuration, and a claim
 * nobody re-derives is a comment. Reading the generated file back cannot
 * re-derive anything -- it is the same bytes the generator wrote, so it agrees
 * with itself by construction.
 *
 * `--print-config` is the engine's answer instead of ours: the rules it will
 * actually apply, the severity it will apply them at, and the state of every
 * ambient category. That last field is why this matters more than it looks.
 * An engine default that switches back on does not change a single committed
 * byte, and it is precisely how `no-dupe-keys` once fired on a role that never
 * declared it.
 */
export function resolveEngineConfig(configPath) {
  let out = ''
  try {
    out = execFileSync(OXLINT, ['--print-config', '--config', configPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    out = `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`
  }
  let parsed
  try {
    parsed = JSON.parse(out)
  } catch {
    // Same discipline as the diagnostic reader: unreadable output must fail
    // loudly. "The engine resolved nothing" and "we could not read the engine"
    // are different facts, and only one of them is a passing subject.
    throw new Error(
      `the replacement engine did not print a readable config for ${configPath}: ${out.trim()}`,
    )
  }
  if (parsed?.rules === undefined || parsed?.categories === undefined) {
    throw new Error(
      `the replacement engine printed a config with no rules or categories for ${configPath}`,
    )
  }
  return parsed
}

/** The engine's resolution of every generated role. */
export function resolvedByRole(roles) {
  const resolved = {}
  for (const role of roles) resolved[role] = resolveEngineConfig(configForRole(role))
  return resolved
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
 * One fixture under one role, observed through the REPLACEMENT engine.
 *
 * It used to run both engines and report each one's answer. With the legacy
 * engine retired the question is no longer "do they agree" but "does this role
 * still enforce exactly the policies it is assigned" -- which is the property
 * the role matrix always existed to protect. Keyed by POLICY id, with the rule
 * id resolved through the mappings.
 */
export function roleObservation({ file, role, policyIds, mappings, replacementConfig }) {
  const replacement = new Map(
    mappings.mappings.filter((m) => m.engine === 'replacement').map((m) => [m.policy, m]),
  )
  const out = replacementDiagnostics(file, replacementConfig ?? configForRole(role))
  const observed = {}
  for (const id of policyIds) {
    const ruleId = replacement.get(id)?.ruleId
    const bare =
      ruleId === undefined
        ? undefined
        : ruleId.includes('/')
          ? ruleId.slice(ruleId.lastIndexOf('/') + 1)
          : ruleId
    observed[id] = out.rules.includes(bare)
  }
  return { file, role, observed, detail: { out } }
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
      if (seen !== mustReject) {
        problems.push(
          `${policyId}: the replacement engine ${seen ? 'rejected' : 'accepted'} ` +
            `${path.basename(observation.file)} under the "${role}" role, which must ` +
            `${mustReject ? 'reject' : 'accept'} it`,
        )
      }
    }
  }
  return problems
}

/** Both engines, both fixtures, one policy. */
/**
 * One policy's conformance under the REPLACEMENT engine.
 *
 * This was `parityFor`, which asked whether two engines agreed. Task 3.4
 * retired the legacy engine, so agreement is no longer a question that can be
 * asked -- but "does this policy still enforce" very much is, and retirement
 * must not be allowed to answer it by making the question disappear.
 *
 * The contract per policy is unchanged: its invalid fixture must be REJECTED
 * for the intended policy, and its valid fixture ACCEPTED. Attribution still
 * matters, so a parser-enforced policy must reject for its own diagnostic
 * rather than for any parse failure.
 */
export function conformanceFor(policy, replacement, configPath) {
  const valid = fixturePath(policy.proof.valid)
  const invalid = fixturePath(policy.proof.invalid)

  // Typed policies go through the TYPED backend. Falling back to the static
  // path would take a no-answer for a clean answer.
  const typed = TYPED_SHARDS.has(policy.proof.shard)
  const run = typed ? replacementTypedDiagnostics : replacementDiagnostics

  const onInvalid = run(invalid, configPath)
  const onValid = run(valid, configPath)

  const ruleId = replacement.ruleId
  const bare =
    ruleId === undefined
      ? undefined
      : ruleId.includes('/')
        ? ruleId.slice(ruleId.lastIndexOf('/') + 1)
        : ruleId

  return {
    id: policy.id,
    rejects:
      replacement.mechanism === 'parser'
        ? matches(onInvalid.parseErrors, replacement.diagnosticPattern)
        : onInvalid.rules.includes(bare),
    accepts:
      replacement.mechanism === 'parser'
        ? !matches(onValid.parseErrors, replacement.diagnosticPattern)
        : !onValid.rules.includes(bare),
    detail: { onInvalid, onValid },
  }
}

// ── option semantics ────────────────────────────────────────────────────────

/** The replacement engine's fixed output for the same source. */
/**
 * An ad-hoc config isolating ONE rule under CHOSEN options.
 *
 * The retired engine exposed this as an API call: verify a source against a
 * single rule with a single option array. The replacement engine has no
 * single-rule entry point, so the equivalent experiment is expressed in its
 * own vocabulary -- every ambient category off, one rule on, exactly the
 * options under test.
 *
 * This is not a convenience. An option is only shown to be load-bearing by
 * running the SAME source WITHOUT it, and a generated per-role config can
 * never do that: it contains only the option that was chosen. Without this
 * probe, "the option appears in the config" would be the whole of the
 * evidence, which is the thing this suite exists to refuse.
 */
export function ruleProbeConfig(dir, ruleId, options) {
  const slash = ruleId.indexOf('/')
  const config = {
    plugins: slash === -1 ? [] : [ruleId.slice(0, slash)],
    // Named off one by one. `categories: {}` does NOT disable them -- the
    // engine keeps its own defaults, and an ambient rule firing here would be
    // read as this rule firing.
    categories: Object.fromEntries(OXLINT_CATEGORIES.map((name) => [name, 'off'])),
    rules: { [ruleId]: options === undefined ? 'error' : ['error', ...options] },
  }
  const configPath = path.join(dir, 'oxlintrc.json')
  writeFileSync(configPath, JSON.stringify(config))
  return configPath
}

/** Diagnostics for one rule under chosen options. */
export function replacementRuleDiagnostics(text, extension, ruleId, options) {
  mkdirSync(SCRATCH_ROOT, { recursive: true })
  const dir = mkdtempSync(path.join(SCRATCH_ROOT, 'subject-'))
  try {
    const configPath = ruleProbeConfig(dir, ruleId, options)
    const file = path.join(dir, `subject${extension}`)
    writeFileSync(file, text)
    return replacementDiagnostics(file, configPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Fix output for one rule under chosen options. */
export function replacementRuleFixOutput(text, extension, ruleId, options) {
  mkdirSync(SCRATCH_ROOT, { recursive: true })
  const dir = mkdtempSync(path.join(SCRATCH_ROOT, 'subject-'))
  try {
    const configPath = ruleProbeConfig(dir, ruleId, options)
    const file = path.join(dir, `subject${extension}`)
    writeFileSync(file, text)
    try {
      execFileSync(OXLINT, ['--config', configPath, '--fix', file], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      // Non-zero means unfixed diagnostics remain; the written bytes are what
      // this measures.
    }
    return readFileSync(file, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

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
 * Replacement typed lint, through the engine's own type-aware backend.
 *
 * `--type-aware` is required: without it the typed rules are simply not run,
 * and the engine exits clean. Treating that as "no violations" would be the
 * silent downgrade this whole harness exists to prevent, so absence of the
 * backend is an error rather than an empty result.
 */
/**
 * @param cwd Where the engine runs, and therefore one of the two places it
 * looks for its typed backend: resolution walks UP from here.
 * @param env The other place. The backend is found on PATH too, which a
 * package-manager-run script populates with `node_modules/.bin` -- so a cwd
 * override alone hides the backend when run directly and does NOT hide it
 * under `pnpm test`.
 *
 * Both are overridable so that a test can put the harness somewhere the
 * backend is genuinely unreachable. The alternative was moving
 * `node_modules/.bin/tsgolint` aside, which is shared state and races every
 * other test file in the run.
 */
export function replacementTypedDiagnostics(
  file,
  configPath,
  cwd = FIXTURE_ROOT,
  env = process.env,
) {
  let out = ''
  let failed = false
  try {
    out = execFileSync(OXLINT, ['--type-aware', '--format=json', '--config', configPath, file], {
      cwd,
      env,
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
