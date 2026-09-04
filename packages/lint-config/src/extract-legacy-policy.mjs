/**
 * THE LEGACY EXTRACTION ORACLE.
 *
 * The repository's lint policy is whatever the current engine ACTUALLY
 * enforces, and that is not what the config files say. `base.js` lists about
 * thirty rules; the effective set is 117, because `js.configs.recommended` and
 * `tseslint.configs.recommendedTypeChecked` contribute the rest, roles turn
 * some off, and the JavaScript block disables every type-aware rule.
 *
 * So the policy is not read from the config source. It is resolved through the
 * real ESLint API, per role, on a representative file — the same code path the
 * linter itself uses. Grepping the configs would produce a plausible list that
 * silently omitted every inherited rule, which is exactly the failure this
 * exists to prevent.
 *
 * WHAT IT PRODUCES. A normalized, engine-neutral effective set: for each rule
 * the roles where it is BLOCKING, and its options. Vendor identity is carried
 * separately as bootstrap provenance, never as policy identity — `policy.json`
 * must survive the engine that seeded it.
 *
 * Dependency-free apart from the engine it interrogates.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import js from '@eslint/js'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * One representative file per role.
 *
 * A role is a lint MODE, not a directory: `config-file` and `js-config` are
 * distinct because a package-root `*.config.ts` is type-checked tooling while
 * `eslint.config.js` is untyped JavaScript with every type-aware rule disabled.
 * Collapsing them would lose the JavaScript-config behaviour entirely.
 */
export const ROLE_PROBES = [
  { role: 'library', member: 'packages/contracts', file: 'src/index.ts' },
  { role: 'service', member: 'services/runner-control', file: 'src/index.ts' },
  { role: 'application', member: 'apps/web', file: 'src/index.ts' },
  { role: 'config-file', member: 'packages/contracts', file: 'vitest.config.ts' },
  { role: 'js-config', member: 'packages/contracts', file: 'eslint.config.js' },
  { role: 'adapter-bin', member: 'agents/adapters/coding/claude-code', file: 'src/bin.ts' },
]

/**
 * ORDINARY TEST FILES ARE NOT A ROLE.
 *
 * A `.test.ts` inside a library member resolves to EXACTLY the library
 * configuration -- asserted below, not assumed. No member composes
 * `@secure-home/eslint-config/test`, so nothing assigns a test file to the
 * exported role, and inventing a `test` role here would record an assignment
 * the repository does not make.
 *
 * REQ-LP-004 requires the two to be separate facts, so the exported role is
 * probed on its own and never merged into a member role.
 */
export const MEMBER_TEST_PROBE = {
  member: 'packages/contracts',
  file: 'tests/probe.test.ts',
  resolvesAs: 'library',
}

/** The separately exported, currently unconsumed test-role contract. */
export const EXPORTED_TEST_ROLE = 'exported-test'

/**
 * The options the REPOSITORY authored, as opposed to the ones the engine filled
 * in for itself.
 *
 * `calculateConfigForFile` returns RESOLVED options, including every default the
 * engine supplied. Those are not repository policy: nobody decided them, and
 * copying them into the manifest both overstates what was decided and breaks
 * the replacement engine, whose option schema differs. Oxlint rejects
 * `preserve-caught-error`'s `errorClassNames` outright -- an option this
 * repository never wrote.
 *
 * So options are diffed against a baseline resolved from the SAME presets with
 * none of the repository's own rules. What survives is what was actually
 * chosen here.
 */
export async function baselineOptions({ repoRoot = REPO_ROOT } = {}) {
  const eslint = new ESLint({
    cwd: path.join(repoRoot, 'packages/contracts'),
    overrideConfigFile: true,
    overrideConfig: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      { files: ['**/*.ts'], languageOptions: { parserOptions: { projectService: false } } },
    ],
  })
  const config = await eslint.calculateConfigForFile('src/index.ts')
  const baseline = new Map()
  for (const [ruleId, entry] of Object.entries(config.rules ?? {})) {
    baseline.set(ruleId, JSON.stringify(optionsOf(entry)))
  }
  return baseline
}

/** ESLint severity, normalized. Only `error` is blocking policy. */
export function severityOf(entry) {
  const raw = Array.isArray(entry) ? entry[0] : entry
  if (raw === 2 || raw === 'error') return 'error'
  if (raw === 1 || raw === 'warn') return 'warn'
  return 'off'
}

/** Engine options, minus the severity. */
export function optionsOf(entry) {
  return Array.isArray(entry) ? entry.slice(1) : []
}

/**
 * A stable, repository-owned policy id derived from a vendor rule id.
 *
 * The vendor prefix is dropped because it names the ENGINE, not the rule the
 * repository cares about. Where dropping it would collide — a core rule and its
 * type-aware namesake — the typed one keeps a `typed-` qualifier, so both
 * survive with distinct identities instead of one silently overwriting the
 * other.
 */
export function policyIdFor(ruleId, taken = new Set()) {
  const bare = ruleId.includes('/') ? ruleId.slice(ruleId.lastIndexOf('/') + 1) : ruleId
  const base = bare
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
  if (!taken.has(base)) return base
  const qualified = `typed-${base}`
  if (!taken.has(qualified)) return qualified
  throw new Error(`cannot derive a unique policy id for ${ruleId}`)
}

/**
 * The effective blocking policy, per role, straight from the engine.
 *
 * Returns rows keyed by VENDOR id — this is the oracle's output, so it is still
 * in engine terms. Turning it into repository policy is the caller's job, and
 * keeping the two steps separate is what stops vendor identity leaking into
 * `policy.json`.
 */
export async function extractEffectivePolicy({
  repoRoot = REPO_ROOT,
  probes = ROLE_PROBES,
  includeExportedTestRole = true,
} = {}) {
  const byRule = new Map()
  const all = includeExportedTestRole
    ? [...probes, await exportedTestRoleProbe(repoRoot)]
    : [...probes]

  for (const { role, member, file, cwd: explicitCwd } of all) {
    const cwd = explicitCwd ?? path.join(repoRoot, member)
    const eslint = new ESLint({ cwd })
    const config = await eslint.calculateConfigForFile(file)

    for (const [ruleId, entry] of Object.entries(config.rules ?? {})) {
      if (severityOf(entry) !== 'error') continue
      if (!byRule.has(ruleId)) byRule.set(ruleId, { ruleId, roles: [], options: {} })
      const row = byRule.get(ruleId)
      row.roles.push(role)
      row.options[role] = optionsOf(entry)
    }
  }

  return [...byRule.values()]
    .map((row) => ({ ...row, roles: row.roles.sort() }))
    .sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0))
}

/**
 * What is NOT linted, decided the same way as what is: by asking the engine.
 *
 * Reading the glob list out of `base.js` would mean importing one build-tooling
 * package from another at the same layer, and would trust the config source
 * over the resolved behaviour. `isPathIgnored` is the linter's own answer, so a
 * change to how ignores compose cannot pass unnoticed.
 */
export const IGNORE_PROBES = [
  { path: 'dist/index.js', ignored: true, why: 'build output' },
  { path: 'coverage/lcov.info', ignored: true, why: 'coverage output' },
  { path: 'src/generated.d.ts', ignored: true, why: 'declaration file' },
  { path: 'tests/fixtures/broken.ts', ignored: true, why: 'deliberately-invalid lint fixture' },
  { path: 'src/index.ts', ignored: false, why: 'ordinary source' },
  { path: 'tests/real.test.ts', ignored: false, why: 'ordinary test source' },
]

export async function extractIgnores({ repoRoot = REPO_ROOT, member = 'packages/contracts' } = {}) {
  const eslint = new ESLint({ cwd: path.join(repoRoot, member) })
  const rows = []
  for (const probe of IGNORE_PROBES) {
    rows.push({ ...probe, actual: await eslint.isPathIgnored(probe.path) })
  }
  return rows
}

/**
 * Materialize a throwaway workspace whose config composes the exported test
 * role, so its contract resolves through the same engine path as every other
 * role.
 *
 * The config is written to a scratch directory rather than committed: a
 * committed one would look like a member that composes the export, which is
 * exactly the fact this must not fabricate.
 */
export async function exportedTestRoleProbe(repoRoot = REPO_ROOT) {
  const dir = await mkdtemp(path.join(tmpdir(), 'exported-test-role-'))
  const href = pathToFileURL(path.join(repoRoot, 'packages/eslint-config/test.js')).href
  await writeFile(
    path.join(dir, 'eslint.config.js'),
    `import { test } from ${JSON.stringify(href)}\nexport default test\n`,
  )
  await writeFile(path.join(dir, 'probe.test.ts'), 'export const probe = 1\n')
  return { role: EXPORTED_TEST_ROLE, cwd: dir, file: 'probe.test.ts' }
}
