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

import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { admit, authoringEligibility, packageBundle } from '@secure-home/knowledge-toolchain'

const DEFAULT_ROOT = process.cwd()

/**
 * A LIFECYCLE STATUS IS A CLAIM, AND THIS IS WHERE IT IS EARNED.
 *
 * A status used to be a coordinated prose/metadata claim: nothing tied
 * `Validated` to admission having actually run over the real bytes, or
 * `Packaged` to a package having actually been produced. Two edits in agreement
 * were indistinguishable from a fact.
 *
 * This command VALIDATES a claimed status. It never promotes one — a lifecycle
 * transition stays an explicit reviewed catalog change, and a checker that
 * advanced state on its own would be deciding rather than verifying.
 */
const CLAIMS_SOURCE = new Set(['Source-ready', 'Validated', 'Packaged', 'Published'])
const REQUIRES_ADMISSION = new Set(['Validated', 'Packaged', 'Published'])
const REQUIRES_PACKAGING = new Set(['Packaged', 'Published'])

/**
 * Generated or vendored trees are never GOVERNING SOURCES.
 *
 * This belongs to `repositoryPaths()` alone and must never be shared with
 * module enumeration. The two traversals answer different questions:
 *
 *   repositoryPaths()  where may a `governs` reference resolve?
 *                      generated output is legitimately not an answer
 *
 *   authoredFiles()    what IS this module's content?
 *                      every regular file below it, and no exceptions
 *
 * Sharing the set gave modules a silent bypass: content under
 * `knowledge/<group>/<module>/dist/` was never enumerated, so it never reached
 * `admit()`. It reads as a build convention rather than as a hole, and it opens
 * the moment the toolchain gate does.
 */
const VENDOR_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.turbo'])

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
      // NO NAME IS EXCLUDED HERE. The root README is the only silent exclusion
      // in this traversal, and it is applied by the caller.
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
      if (VENDOR_DIRS.has(name)) continue
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

/**
 * @param root repository root
 * @param deps narrow seam, defaulted to the real package. It exists so a test
 *   can wrap the REAL `packageBundle` and observe that it was invoked with the
 *   admission proof. Reporting the artifact's digest, member count, and
 *   manifest size proved nothing: a fabricated object carrying the catalog's own
 *   digest, the real member array, and a zero-length manifest satisfied all
 *   three without packaging anything. Invocation is the fact; the artifact's
 *   fields are a description a forgery can also produce.
 */
export function checkKnowledgeContent(root = DEFAULT_ROOT, deps = {}) {
  const pack = deps.packageBundle ?? packageBundle
  const problems = []
  const catalogPath = join(root, 'knowledge', 'catalog.json')

  let catalog
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch (error) {
    return { problems: [`knowledge/catalog.json: unreadable — ${error.message}`], evaluated: 0 }
  }

  const paths = repositoryPaths(root)
  const evidence = []
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
    const status = module.status

    // AUTHORING ELIGIBILITY PRECEDES LIFECYCLE EVIDENCE.
    //
    // Authoring is the act being gated, so once source exists the gate is the
    // first question. Checking lifecycle coherence first MASKED the gate: a
    // Planned module with authored source under a closed rollout reported only
    // "Planned claims no source" and never mentioned rollout at all — the
    // weaker finding hiding the stronger one.
    //
    // A no-source lifecycle claim is not gated here: there is no authored act
    // to refuse, and the claim fails on its own terms below.
    if (sources.length > 0) {
      const eligibility = authoringEligibility({
        blockedByToolchain: module.blockedByToolchain === true,
        blockedByRollout: module.blockedByRollout === true,
      })
      if (!eligibility.eligible) {
        problems.push(
          `${module.id}: ${sources.length} authored source file(s) under a closed gate ` +
            `(refused by ${eligibility.refusedBy}) — authoring eligibility precedes ` +
            'admission and lifecycle evidence',
        )
        continue
      }
    }

    // SOURCE PRESENCE AND STATUS MUST AGREE, in both directions.
    if (status === 'Planned' && sources.length > 0) {
      problems.push(
        `${module.id}: status "Planned" claims no authored source, but ` +
          `${sources.length} authored source file(s) exist`,
      )
      continue
    }
    if (CLAIMS_SOURCE.has(status) && sources.length === 0) {
      problems.push(
        `${module.id}: status "${status}" claims content, but no authored source ` +
          'exists to substantiate it',
      )
      continue
    }

    if (sources.length === 0) continue
    authoredModules += 1

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
    //
    // A `Source-ready` module is still admitted above: the merge gate requires
    // every authored byte to pass admission whatever the lifecycle claims. The
    // status says how far the REVIEWED lifecycle has advanced, and is never
    // permission to merge invalid content.

    if (!outcome.admitted || outcome.proof === undefined) continue

    // VALIDATED — admission actually ran, over these exact bytes.
    if (REQUIRES_ADMISSION.has(status)) {
      const reviewed = module.contentReview?.sourceDigest
      evidence.push({ id: module.id, status, admittedDigest: reviewed })
    }

    // PACKAGED — through the OPAQUE PROOF, never from compiled bytes.
    // `packageBundle` accepts only what `admit()` minted, so this chain is the
    // mechanism: compile -> package would prove nothing about admission.
    if (REQUIRES_PACKAGING.has(status)) {
      const packaged = pack(outcome.proof)
      const reviewed = (module.contentReview?.sourceDigest ?? '').replace(/^sha256:/, '')
      // A REGRESSION GUARD THAT IS UNREACHABLE TODAY, AND SAYS SO.
      //
      // It cannot fire through the public API: admission already refuses via
      // `attestation.digest.binding` when the reviewed digest does not match the
      // bytes, and `packageBundle` computes its identity from the very members
      // `admit` hashed — so the two are equal by construction. A mutation
      // disabling this branch therefore survives every test, which is reported
      // rather than hidden.
      //
      // It is kept because it is the assertion that would fail first if package
      // identity were ever decoupled from admitted identity. It is defence
      // against a future change, not evidence about the present one.
      if (packaged.digest !== reviewed) {
        problems.push(
          `${module.id}: package identity ${packaged.digest} does not equal the ` +
            `reviewed byte identity ${reviewed} — the artifact is not the bytes a ` +
            'human reviewed',
        )
        continue
      }
      // The member count and manifest size come FROM THE ARTIFACT, not from a
      // string. Reporting the digest alone was a circular proof: a fabricated
      // `{ digest }` echoing the catalog's claim satisfied it without packaging
      // anything, and a mutation doing exactly that survived.
      evidence.push({
        id: module.id,
        status,
        packageDigest: packaged.digest,
        members: packaged.members.length,
        manifestBytes: packaged.manifest().length,
      })
    }

    // PUBLISHED is a further stage, and packaging does not reach it.
    if (status === 'Published') {
      problems.push(
        `${module.id}: status "Published" requires Proof B — governed human-review ` +
          'evidence — and no producer exists (ADR-0016 §5a). Admission and packaging ' +
          'succeeding does not make a module publishable',
      )
    }
  }

  return { problems, evaluated, authoredModules, evidence }
}

// --- CLI -------------------------------------------------------------------

// process.argv[1] preserves a symlinked invocation path; the ESM loader
// realpaths import.meta.url. Compared raw, a symlinked invocation matches
// nothing, runs nothing, and exits 0 — a silent no-op where exit 0 reads as
// PASS. Both sides are therefore resolved to REAL paths, and an entry path
// that cannot be resolved is some other module importing this one.
const isMain = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()
if (isMain) {
  const root = process.argv[2] ?? DEFAULT_ROOT
  const { problems, evaluated, authoredModules, evidence } = checkKnowledgeContent(root)

  if (problems.length > 0) {
    console.error(`✗ knowledge content admission — ${problems.length} problem(s)\n`)
    for (const p of problems) console.error(`    ${p}`)
    process.exit(1)
  }

  // The lifecycle evidence is printed because a claim nobody can see is a claim
  // nobody can check — including the tests that prove packaging actually ran.
  for (const item of evidence ?? []) {
    if (item.packageDigest !== undefined) {
      console.log(
        `    ${item.id}: ${item.status} — package ${item.packageDigest} ` +
          `(${item.members} members, ${item.manifestBytes}-byte manifest)`,
      )
    } else {
      console.log(`    ${item.id}: ${item.status} — admitted ${item.admittedDigest}`)
    }
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
