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
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'

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
      languageOptions: { parserOptions: { ecmaVersion: 2023, sourceType: 'module' } },
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

/** The replacement engine's verdict on source text, via a scratch file. */
export function replacementDiagnosticsForText(text, extension, configPath) {
  const dir = mkdtempSync(path.join(tmpdir(), 'parity-text-'))
  const file = path.join(dir, `subject${extension}`)
  writeFileSync(file, text)
  return replacementDiagnostics(file, configPath)
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
      languageOptions: { parserOptions: { ecmaVersion: 2023, sourceType: 'module' } },
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
    out = execFileSync(OXLINT, ['--config', configPath, file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    out = `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`
  }
  return {
    rules: [...out.matchAll(/\b(?:eslint|typescript|oxc)\(([a-z0-9-]+)\)/g)].map((m) => m[1]),
    parseErrors: [...out.matchAll(/^.*: error: (?!\w+\()(.+)$/gm)].map((m) => m[1].trim()),
    raw: out,
  }
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

/** Both engines, both fixtures, one policy. */
export async function parityFor(policy, legacy, replacement, configPath) {
  const valid = fixturePath(policy.proof.valid)
  const invalid = fixturePath(policy.proof.invalid)

  const legacyInvalid = await legacyDiagnostics(invalid, legacy.ruleId, legacy.engineOptions)
  const legacyValid = await legacyDiagnostics(valid, legacy.ruleId, legacy.engineOptions)
  const replacementInvalid = replacementDiagnostics(invalid, configPath)
  const replacementValid = replacementDiagnostics(valid, configPath)

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
