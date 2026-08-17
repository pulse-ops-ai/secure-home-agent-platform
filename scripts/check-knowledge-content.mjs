#!/usr/bin/env node
/**
 * check-knowledge-content.mjs — run REAL repository content through admission.
 *
 * The toolchain was well tested and never invoked. Every rule lived in
 * `packages/knowledge-toolchain` with a conformance suite around it, and
 * nothing in CI ever handed it a file from this repository — so the library
 * was proven and the repository was not. This closes that gap, and it is the
 * canonical repository-content admission command.
 *
 * ## What this file owns, and nothing more
 *
 *   reading the catalog
 *   enumerating a module's authored source members
 *   reading exact bytes
 *   mapping the authoritative catalog entry into an AdmitRequest
 *   providing the repository-path set that `governs` resolves against
 *   invoking @secure-home/knowledge-toolchain admit()
 *   reporting typed refusal rules and exiting nonzero
 *
 * ## What it must NEVER own
 *
 * Profile validation, prohibited-content indicators, Proof A, reference rules,
 * envelope rules, digest rules. Those are owned exactly once, by the package.
 * A second implementation here would not be a safety net — it would be a second
 * answer, and the two would drift. If a rule is missing, it is missing from the
 * package, and that is where it gets fixed.
 *
 * The proof that this holds is behavioural rather than aspirational: the
 * integration tests assert the EXACT rule identifiers the package emits
 * (`execution.*`, `attestation.digest.binding`, and so on). Parallel logic here
 * could not produce them by accident.
 *
 * ## Source convention — explicit and deterministic
 *
 *   knowledge/<group>/<module>/README.md
 *       specification only. NOT bundle source, ever.
 *
 *   every other regular file under that module directory
 *       candidate bundle source, addressed by its module-relative POSIX path,
 *       enumerated recursively and sorted by path so the member order — and
 *       therefore the bundle digest — does not depend on directory iteration
 *       order or on the filesystem.
 *
 * A symlink or any non-regular entry is a FAILURE, not a skip. Following one
 * would make repository layout an authority over what gets admitted, and
 * skipping it silently would let content escape the gate by choosing a file
 * type.
 *
 * A module with no authored source is not yet authored: there is nothing to
 * admit, and that is a normal state rather than a finding. Today that is every
 * module, which is why the live repository is a no-content control.
 *
 * Usage:
 *   node scripts/check-knowledge-content.mjs [repository-root]
 *
 * Governed by AGENTS.md, ADR-0010, ADR-0015, and ADR-0016.
 */

import { readFileSync, lstatSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

import { admit, authoringEligibility } from '@secure-home/knowledge-toolchain'

const DEFAULT_ROOT = process.cwd()

/** Generated or vendored trees are never governing sources or module content. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.turbo'])

const posixify = (value) => value.split(sep).join('/')

/**
 * Every regular file under `dir`, as module-relative POSIX paths, sorted.
 *
 * `lstat` rather than `stat`: `stat` follows a symlink, so a link pointing
 * outside the module would be read as though it were module content.
 */
function authoredFiles(dir, prefix = '') {
  const found = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    const stats = lstatSync(full)
    if (stats.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      found.push(...authoredFiles(full, rel))
      continue
    }
    if (!stats.isFile()) {
      // Fails closed: a symlink, socket, or device is refused rather than
      // followed or ignored.
      found.push({ path: rel, irregular: true })
      continue
    }
    found.push({ path: rel, irregular: false })
  }
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** Every repository path a `governs` reference may resolve against. */
function repositoryPaths(root) {
  const paths = new Set()
  const walk = (dir, prefix) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries.sort()) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      const rel = prefix ? `${prefix}/${name}` : name
      let stats
      try {
        stats = lstatSync(full)
      } catch {
        continue
      }
      if (stats.isDirectory()) walk(full, rel)
      else if (stats.isFile()) paths.add(rel)
    }
  }
  walk(root, '')
  return paths
}

/** The catalog entry, mapped to what the package's contract asks for. */
const toEntry = (module) => ({
  id: module.id,
  owner: module.owner,
  asOf: module.asOf,
  limitations: module.limitations,
  governingSources: module.governingSources ?? [],
  ...(module.contentReview ? { contentReview: module.contentReview } : {}),
})

export function checkKnowledgeContent(root = DEFAULT_ROOT) {
  const problems = []
  const catalogPath = join(root, 'knowledge', 'catalog.json')

  let catalog
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch (error) {
    return { problems: [`knowledge/catalog.json: unreadable — ${error.message}`], evaluated: 0 }
  }

  const paths = repositoryPaths(root)
  let evaluated = 0
  let authoredModules = 0

  for (const module of catalog.modules ?? []) {
    const moduleDir = join(root, 'knowledge', ...module.id.split('/'))
    let entries
    try {
      entries = authoredFiles(moduleDir)
    } catch {
      // A registered module with no directory is a registry problem, and
      // `check-knowledge.mjs` owns that. Not this command's finding to make.
      continue
    }

    const irregular = entries.filter((e) => e.irregular)
    for (const bad of irregular) {
      problems.push(
        `${module.id}: "${bad.path}" is not a regular file — a symlink or special ` +
          'file is refused rather than followed, because repository layout must not ' +
          'decide what gets admitted',
      )
    }
    if (irregular.length > 0) continue

    // The module README is the specification for the directory, never a member
    // of the bundle it describes.
    const sources = entries.filter((e) => e.path !== 'README.md')
    if (sources.length === 0) continue
    authoredModules += 1

    // Gates first: authored source under a closed gate is a finding no matter
    // what the content says, and admission is not the place that decides it.
    const eligibility = authoringEligibility({
      blockedByToolchain: module.blockedByToolchain === true,
      blockedByRollout: module.blockedByRollout === true,
    })
    if (!eligibility.eligible) {
      problems.push(
        `${module.id}: ${sources.length} authored source file(s) under a closed gate ` +
          `(refused by ${eligibility.refusedBy}) — authoring eligibility precedes admission`,
      )
      continue
    }

    const members = sources.map((source) => ({
      path: source.path,
      bytes: new Uint8Array(readFileSync(join(moduleDir, source.path.split('/').join(sep)))),
    }))

    // THE PACKAGE DECIDES. Everything above is plumbing.
    const outcome = admit({ members, entry: toEntry(module), repositoryPaths: paths })
    evaluated += 1

    for (const refusal of outcome.refusals) {
      problems.push(
        `${module.id}${refusal.path ? `/${refusal.path}` : ''}: ${refusal.rule} — ${refusal.detail}`,
      )
    }

    // `publishable: false` with `proof_b_unavailable` is the NORMAL outcome
    // here and must never fail this gate. No Proof B producer exists, by
    // accepted design (ADR-0016 §5a) — treating its absence as an admission
    // failure would make every module unadmittable and would misreport which
    // of the two stages actually blocked.
  }

  return { problems, evaluated, authoredModules }
}

// --- CLI -------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const root = process.argv[2] ?? DEFAULT_ROOT
  const { problems, evaluated, authoredModules } = checkKnowledgeContent(root)

  if (problems.length > 0) {
    console.error(`✗ knowledge content admission — ${problems.length} problem(s)\n`)
    for (const p of problems) console.error(`    ${p}`)
    process.exit(1)
  }

  if (authoredModules === 0) {
    console.log('✓ knowledge content admission — no authored module source to admit')
  } else {
    console.log(
      `✓ knowledge content admission — ${evaluated} module(s) admitted ` +
        'by @secure-home/knowledge-toolchain',
    )
  }
}
