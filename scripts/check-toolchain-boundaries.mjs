#!/usr/bin/env node
/**
 * THE PREDECESSOR-BOUND MAINTENANCE CLASSIFIER.
 *
 * A tool-only security-maintenance claim is a TWO-REVISION property. Candidate-
 * local evidence cannot establish it: a candidate that deletes a policy row and
 * the only fixture proving that row stays internally consistent, its schema
 * still validates, its corpus still passes, and its generated configs still
 * match. It is smaller, and nothing inside it says so. Only comparison with a
 * trusted predecessor sees the loss.
 *
 * This module decides ADMISSIBLE DATA DIFFERENCE and nothing else. It is handed
 * two revision readers by its caller and never resolves, selects, or trusts a
 * revision itself -- the trusted execution boundary (task 1.16,
 * AUTH-MAINTENANCE-VERIFIER) owns that, and keeping the two apart is what stops
 * a candidate from choosing the predecessor it is judged against.
 *
 * Everything fails closed. A missing revision, an unreadable file, a malformed
 * class, an unknown class id, an uncovered changed path, or any protected drift
 * refuses the claim. There is no "assume unchanged" path, because the whole
 * point is detecting a difference nobody declared.
 *
 * Node standard library only: scripts/check.sh runs the governance checks on a
 * host with no workspace installed.
 *
 * Governed by AGENTS.md, ADR-0022, and D13. See scripts/README.md.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export const BOUNDARIES_PATH = 'scripts/toolchain-boundaries.json'

/** A refusal is the normal negative outcome, not a crash. */
export class MaintenanceRefusal extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MaintenanceRefusal'
    this.code = code
  }
}

const refuse = (code, message) => {
  throw new MaintenanceRefusal(code, message)
}

// --- revision readers -------------------------------------------------------

/**
 * A revision is anything that can produce bytes for a path and enumerate a
 * subtree. Git objects, a worktree, or a test fixture all satisfy it, which is
 * why two-revision behaviour is testable without inventing commits.
 */
export function revisionFromMap(id, files) {
  const map = new Map(Object.entries(files))
  return {
    id,
    read: (p) => (map.has(p) ? map.get(p) : null),
    list: (prefix) => {
      const root = prefix.endsWith('/') ? prefix : `${prefix}/`
      return [...map.keys()].filter((p) => p === prefix || p.startsWith(root)).sort()
    },
  }
}

// --- parsers (stdlib only) --------------------------------------------------

function parseJson(revision, filePath, what) {
  const raw = revision.read(filePath)
  if (raw === null) {
    refuse('UNREADABLE_AUTHORITY', `${what} is missing at ${revision.id}: ${filePath}`)
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    refuse(
      'MALFORMED_AUTHORITY',
      `${what} at ${revision.id} is not readable JSON: ${error.message}`,
    )
  }
  return undefined
}

/**
 * The catalog block of pnpm-workspace.yaml, as `name -> exact pin`.
 *
 * Deliberately strict rather than a general YAML reader: this decides whether a
 * version moved, so a line it cannot account for must refuse rather than be
 * skipped. A skipped line is an unnoticed version change.
 */
export function parseCatalogPins(text, revisionId = 'unknown') {
  if (text === null)
    refuse('UNREADABLE_AUTHORITY', `pnpm-workspace.yaml is missing at ${revisionId}`)
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^catalog:\s*$/.test(l))
  if (start === -1)
    refuse('MALFORMED_AUTHORITY', `pnpm-workspace.yaml at ${revisionId} has no catalog block`)
  const pins = {}
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    if (!/^\s/.test(line)) break // dedent ends the block
    const entry = /^\s{2}(?:'([^']+)'|"([^"]+)"|([^\s:'"]+))\s*:\s*(\S+)\s*$/.exec(line)
    if (!entry) {
      refuse(
        'MALFORMED_AUTHORITY',
        `pnpm-workspace.yaml at ${revisionId} has a catalog line this reader cannot account for, ` +
          `so a version change could pass unseen: ${JSON.stringify(line)}`,
      )
    }
    const name = entry[1] ?? entry[2] ?? entry[3]
    pins[name] = entry[4].replace(/^['"]|['"]$/g, '')
  }
  return pins
}

/**
 * `snapshot key -> sorted dependency keys` from a pnpm lockfile.
 *
 * Only the resolved graph is read. The closure derived from it is what bounds
 * admissible lock movement, so an unparseable snapshots block refuses.
 */
export function parseLockGraph(text, revisionId = 'unknown') {
  if (text === null) refuse('UNREADABLE_AUTHORITY', `pnpm-lock.yaml is missing at ${revisionId}`)
  const lines = text.split('\n')
  const graph = new Map()
  let inSnapshots = false
  let current = null
  let inDeps = false
  const unquote = (s) => s.replace(/^['"]|['"]$/g, '')
  for (const line of lines) {
    if (/^snapshots:\s*$/.test(line)) {
      inSnapshots = true
      continue
    }
    if (!inSnapshots) continue
    if (/^\S/.test(line)) break // a new top-level block ends it
    if (line.trim() === '') continue

    // A snapshot key, either `  key:` or the inline-empty `  key: {}`. Missing
    // the inline form silently drops every leaf package from the graph, which
    // is how a root with no dependencies came back with an EMPTY closure --
    // and an empty closure quietly admits nothing instead of refusing.
    const entry = /^ {2}('[^']+'|"[^"]+"|[^\s:][^:]*):(?:\s*\{\})?\s*$/.exec(line)
    if (entry) {
      current = unquote(entry[1])
      if (!graph.has(current)) graph.set(current, [])
      inDeps = false
      continue
    }
    if (/^ {4}(?:optional)?[Dd]ependencies:\s*$/.test(line)) {
      inDeps = true
      continue
    }
    if (/^ {4}\S/.test(line)) {
      inDeps = false
      continue
    }
    if (inDeps && current) {
      // `      name: version` -- the edge target is the `name@version` key, not
      // the bare name. Treating the name as the key breaks every traversal.
      const dep = /^ {6}('[^']+'|"[^"]+"|[^\s:][^:]*):\s*(\S.*?)\s*$/.exec(line)
      if (dep) {
        const name = unquote(dep[1])
        const value = unquote(dep[2])
        // An ALIASED dependency writes the target key as the value
        // (`'@typescript/old': typescript@6.0.3`), so the edge points at
        // `typescript@6.0.3`, not at `@typescript/old@typescript@6.0.3`. A peer
        // suffix also contains `@`, so it is stripped before deciding.
        const aliased = value.replace(/\(.*\)$/, '').includes('@')
        graph.get(current).push(aliased ? value : `${name}@${value}`)
      }
    }
  }
  if (graph.size === 0) {
    refuse('MALFORMED_AUTHORITY', `pnpm-lock.yaml at ${revisionId} yielded no resolved graph`)
  }
  for (const [key, deps] of graph) graph.set(key, [...deps].sort())
  return graph
}

/**
 * The package name inside a resolved key.
 *
 * Keys carry a peer suffix (`oxlint@1.80.0(oxlint-tsgolint@7.0.2001)`) and may
 * be scoped (`@oxlint/binding-linux-x64@1.80.0`), so neither the first nor the
 * last `@` is the separator on its own.
 */
export const packageNameOf = (key) => {
  const withoutPeers = key.replace(/\(.*\)$/, '')
  const at = withoutPeers.lastIndexOf('@')
  return at <= 0 ? withoutPeers : withoutPeers.slice(0, at)
}

export function deriveLockClosure(graph, roots) {
  const wanted = new Set(roots)
  const queue = [...graph.keys()].filter((k) => wanted.has(packageNameOf(k)))
  const closure = new Set(queue)
  while (queue.length > 0) {
    const key = queue.shift()
    for (const dep of graph.get(key) ?? []) {
      if (!closure.has(dep)) {
        closure.add(dep)
        queue.push(dep)
      }
    }
  }
  return closure
}

// --- projections ------------------------------------------------------------

function mappingRows(revision, filePath) {
  const doc = parseJson(revision, filePath, 'engine mappings')
  const rows = Array.isArray(doc) ? doc : (doc?.mappings ?? [])
  if (!Array.isArray(rows)) {
    refuse('MALFORMED_AUTHORITY', `engine mappings at ${revision.id} carry no mapping rows`)
  }
  return rows
}

/**
 * Compute one projection at one revision.
 *
 * A projection is a function over content, which is exactly why the same file
 * can be protected and permitted at once: `engine-mappings.json` is protected
 * under `mapping-coverage` and permitted under `mapping-detail`. Resolving the
 * lint-engine class against a whole-file rule by carving out an exception would
 * have left the contradiction in place and hidden it behind a special case.
 */
export function project(revision, spec) {
  switch (spec.projection) {
    case 'bytes':
      return { kind: 'bytes', value: revision.read(spec.path) }

    case 'tree-bytes': {
      const paths = revision.list(spec.path)
      return {
        kind: 'tree-bytes',
        value: Object.fromEntries(paths.map((p) => [p, revision.read(p)])),
      }
    }

    case 'mapping-coverage': {
      const pairs = mappingRows(revision, spec.path)
        .map((row) => `${row?.policy}::${row?.engine}`)
        .sort()
      return { kind: 'mapping-coverage', value: pairs }
    }

    case 'mapping-detail': {
      const engines = new Set(spec.engines ?? ['legacy', 'replacement'])
      const detail = {}
      for (const row of mappingRows(revision, spec.path)) {
        if (!engines.has(row?.engine)) continue
        detail[`${row.policy}::${row.engine}`] = {
          ruleName: row.ruleName ?? null,
          mechanism: row.mechanism ?? null,
          parserMechanism: row.parserMechanism ?? null,
          diagnosticPattern: row.diagnosticPattern ?? null,
        }
      }
      return { kind: 'mapping-detail', value: detail }
    }

    case 'catalog-pins': {
      const pins = parseCatalogPins(revision.read(spec.path), revision.id)
      const selected = spec.packages ?? []
      return {
        kind: 'catalog-pins',
        value: Object.fromEntries(selected.map((name) => [name, pins[name] ?? null])),
      }
    }

    case 'catalog-pins-except': {
      const pins = parseCatalogPins(revision.read(spec.path), revision.id)
      const excluded = new Set(spec.packages ?? [])
      return {
        kind: 'catalog-pins-except',
        value: Object.fromEntries(
          Object.entries(pins)
            .filter(([name]) => !excluded.has(name))
            .sort(([a], [b]) => (a < b ? -1 : 1)),
        ),
      }
    }

    case 'lock-closure': {
      const graph = parseLockGraph(revision.read(spec.path), revision.id)
      const closure = deriveLockClosure(graph, spec.packages ?? [])
      return { kind: 'lock-closure', value: { graph, closure } }
    }

    default:
      return refuse('MALFORMED_AUTHORITY', `unknown projection "${spec.projection}"`)
  }
}

const stable = (value) =>
  JSON.stringify(value, (_key, v) =>
    v instanceof Map
      ? Object.fromEntries([...v.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
      : v instanceof Set
        ? [...v].sort()
        : v,
  )

// --- the classifier ---------------------------------------------------------

/** Paths a projection spec is responsible for at a given revision. */
function pathsCovered(spec, revision) {
  if (spec.projection === 'tree-bytes') return new Set(revision.list(spec.path))
  return new Set([spec.path])
}

function changedPaths(predecessor, candidate, universe) {
  const changed = []
  for (const p of universe) {
    if (predecessor.read(p) !== candidate.read(p)) changed.push(p)
  }
  return changed.sort()
}

/**
 * Classify a candidate against a trusted predecessor.
 *
 * `predecessor` and `candidate` are supplied by the caller, together with the
 * complete path universe to compare. This function never widens that universe
 * from the candidate's own content.
 */
export function classifyMaintenance({ classId, predecessor, candidate, universe }) {
  if (!predecessor || !candidate) {
    refuse('UNRESOLVED_PREDECESSOR', 'both a predecessor and a candidate revision are required')
  }
  if (Array.isArray(classId)) {
    refuse(
      'CLASS_COMPOSITION_REFUSED',
      'maintenance classes are a closed set and cannot be unioned; a coupled change needs a ' +
        'single named composite class',
    )
  }

  // The PREDECESSOR's policy governs. Reading the class from the candidate is
  // the whole attack: an edited copy would authorize itself.
  const policy = parseJson(predecessor, BOUNDARIES_PATH, 'toolchain boundary policy')
  const classes = policy?.maintenanceClasses
  if (!Array.isArray(classes) || classes.length === 0) {
    refuse('MALFORMED_AUTHORITY', `no maintenance classes at predecessor ${predecessor.id}`)
  }
  const klass = classes.find((c) => c?.id === classId)
  if (!klass) {
    refuse(
      'UNKNOWN_CLASS',
      `"${classId}" is not one of the closed maintenance classes at ${predecessor.id}: ` +
        classes.map((c) => c.id).join(', '),
    )
  }
  if (!Array.isArray(klass.allowedProjections) || klass.allowedProjections.length === 0) {
    refuse('MALFORMED_AUTHORITY', `maintenance class "${classId}" declares no allowed projections`)
  }

  const verifierAuthorities = new Set(policy.maintenanceVerifierAuthorities ?? [])
  if (verifierAuthorities.size === 0) {
    refuse('MALFORMED_AUTHORITY', 'the policy names no maintenance-verifier authorities')
  }

  // BOOTSTRAP. The executable authority that judges a claim must EXIST at the
  // predecessor. The landing that creates the boundary is judged against a
  // predecessor that does not yet contain it, so it cannot admit itself; once
  // that landing merges, the next candidate's predecessor does contain it and
  // the first real run becomes possible.
  //
  // This deliberately replaces a `genesisState` flag. A flag says the state is
  // GENESIS_ONLY until something flips it, and no accepted task defines that
  // transition -- so the flag would refuse the first real candidate forever,
  // deadlocking the authority it exists to protect. Presence of the verifier is
  // the same condition expressed as a fact that becomes true by merging.
  const missingVerifier = [...verifierAuthorities]
    .filter((p) => predecessor.read(p) === null)
    .sort()
  if (missingVerifier.length > 0) {
    refuse(
      'PREDECESSOR_LACKS_VERIFIER',
      `the predecessor at ${predecessor.id} does not contain the executable maintenance ` +
        `authority, so it cannot judge a maintenance claim: ${missingVerifier.join(', ')}`,
    )
  }

  const floor = policy.protectedProjections ?? []
  if (floor.length === 0) refuse('MALFORMED_AUTHORITY', 'the policy declares no protected floor')

  // A class may not admit a change to the authority that judges it.
  for (const spec of klass.allowedProjections) {
    for (const covered of pathsCovered(spec, candidate)) {
      if (verifierAuthorities.has(covered)) {
        refuse(
          'CLASS_TOUCHES_VERIFIER',
          `class "${classId}" would admit a change to ${covered}, which is the authority that ` +
            'judges it',
        )
      }
    }
  }

  // 1. Every changed path must be covered by an allowed projection.
  const allowedPaths = new Set()
  for (const spec of klass.allowedProjections) {
    for (const p of pathsCovered(spec, candidate)) allowedPaths.add(p)
    for (const p of pathsCovered(spec, predecessor)) allowedPaths.add(p)
  }
  const uncovered = changedPaths(predecessor, candidate, universe).filter(
    (p) => !allowedPaths.has(p),
  )
  if (uncovered.length > 0) {
    refuse(
      'UNDECLARED_CHANGE',
      `class "${classId}" does not admit changes to: ${uncovered.join(', ')}`,
    )
  }

  // 2. Every protected projection must be identical. The verifier authorities
  //    are protected whatever the policy's floor happens to list.
  const protectedSpecs = [
    ...floor,
    ...(klass.protectedProjections ?? []),
    ...[...verifierAuthorities].map((p) => ({ path: p, projection: 'bytes' })),
  ]
  for (const spec of protectedSpecs) {
    const before = project(predecessor, spec)
    const after = project(candidate, spec)
    if (stable(before.value) !== stable(after.value)) {
      refuse(
        'PROTECTED_DRIFT',
        `${spec.projection} of ${spec.path} differs from the trusted predecessor` +
          (spec.note ? ` (${spec.note})` : ''),
      )
    }
  }

  // 3. Resolved-graph movement is limited to the derived closure of the
  //    selected roots. The closure is derived from the PREDECESSOR graph as
  //    well as the candidate's, so a candidate cannot enlarge it by adding
  //    edges to its own lockfile.
  const lockSpec = klass.allowedProjections.find((s) => s.projection === 'lock-closure')
  if (lockSpec && predecessor.read(lockSpec.path) !== candidate.read(lockSpec.path)) {
    const roots = klass.lockRoots ?? lockSpec.packages ?? []
    if (roots.length === 0) {
      refuse('MALFORMED_AUTHORITY', `class "${classId}" allows lock movement but selects no roots`)
    }
    const beforeGraph = parseLockGraph(predecessor.read(lockSpec.path), predecessor.id)
    const afterGraph = parseLockGraph(candidate.read(lockSpec.path), candidate.id)
    const closure = new Set([
      ...deriveLockClosure(beforeGraph, roots),
      ...deriveLockClosure(afterGraph, roots),
    ])
    // A root that resolves to nothing is a broken reader or a broken claim, not
    // a permissive one. Left unchecked, an empty closure marks EVERY lock
    // movement as out-of-closure, or -- with the comparison inverted -- none of
    // it; either way the bound is not the one the class declared.
    if (closure.size === 0) {
      refuse(
        'MALFORMED_AUTHORITY',
        `class "${classId}" selects roots that resolve to no packages in either lockfile: ` +
          roots.join(', '),
      )
    }
    const moved = []
    for (const key of new Set([...beforeGraph.keys(), ...afterGraph.keys()])) {
      const b = beforeGraph.get(key)
      const a = afterGraph.get(key)
      if (stable(b ?? null) !== stable(a ?? null) && !closure.has(key)) moved.push(key)
    }
    if (moved.length > 0) {
      refuse(
        'LOCK_MOVEMENT_OUTSIDE_CLOSURE',
        `resolved graph moved outside the derived closure of ${roots.join(', ')}: ` +
          moved.sort().join(', '),
      )
    }
  }

  return {
    classified: true,
    classId,
    predecessor: predecessor.id,
    candidate: candidate.id,
    composite: klass.composite === true,
  }
}

// --- the canonical instance must satisfy its own schema ---------------------

export const SCHEMA_PATH = 'scripts/toolchain-boundaries.schema.json'

/**
 * Validate an instance against the subset of JSON Schema this schema uses.
 *
 * Driven BY the schema file rather than restating it, so this is not a second
 * authority -- it is the same one, enforced on a host with no workspace
 * installed. `pnpm test` additionally validates the same committed instance
 * with Ajv, which covers the full vocabulary; the two are independent and
 * either one alone still proves the binding.
 *
 * This exists because the canonical document carried a stale top-level
 * `protectedAuthorities` from the superseded path-level model for an entire
 * landing. The schema forbade it (`additionalProperties: false`) and every gate
 * stayed green, because nothing ever checked the instance against the schema.
 */
export function validateAgainstSchema(instance, schema, root = schema, at = '') {
  const problems = []
  const where = at || '(root)'

  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/')
    let resolved = root
    for (const segment of target) resolved = resolved?.[segment]
    if (!resolved) return [`${where}: unresolvable $ref ${schema.$ref}`]
    return validateAgainstSchema(instance, resolved, root, at)
  }

  if (schema.const !== undefined && instance !== schema.const) {
    problems.push(`${where}: must be ${JSON.stringify(schema.const)}`)
  }
  if (schema.enum && !schema.enum.includes(instance)) {
    problems.push(`${where}: ${JSON.stringify(instance)} is not one of ${schema.enum.join(', ')}`)
  }

  if (schema.type === 'string') {
    if (typeof instance !== 'string') return [`${where}: must be a string`]
    if (schema.minLength !== undefined && instance.length < schema.minLength) {
      problems.push(`${where}: shorter than ${schema.minLength}`)
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(instance)) {
      problems.push(`${where}: does not match ${schema.pattern}`)
    }
  }

  if (schema.type === 'array') {
    if (!Array.isArray(instance)) return [`${where}: must be an array`]
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      problems.push(`${where}: needs at least ${schema.minItems} item(s)`)
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      problems.push(`${where}: allows at most ${schema.maxItems} item(s)`)
    }
    if (schema.uniqueItems) {
      const seen = new Set(instance.map((item) => JSON.stringify(item)))
      if (seen.size !== instance.length) problems.push(`${where}: items must be unique`)
    }
    if (schema.items) {
      instance.forEach((item, index) => {
        problems.push(...validateAgainstSchema(item, schema.items, root, `${where}[${index}]`))
      })
    }
  }

  if (schema.type === 'object') {
    if (instance === null || typeof instance !== 'object' || Array.isArray(instance)) {
      return [`${where}: must be an object`]
    }
    for (const required of schema.required ?? []) {
      if (!(required in instance)) problems.push(`${where}: missing required "${required}"`)
    }
    const declared = new Set(Object.keys(schema.properties ?? {}))
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(instance)) {
        if (!declared.has(key)) {
          problems.push(`${where}: unknown property "${key}" is not declared by the schema`)
        }
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (key in instance) {
        problems.push(
          ...validateAgainstSchema(instance[key], subSchema, root, at ? `${at}.${key}` : key),
        )
      }
    }
  }

  return problems
}

// --- the three-domain maintenance boundary (task 1.16) ----------------------
//
// TRUSTED CONTROL builds a content-addressed plan from PREDECESSOR bytes.
// The UNTRUSTED SUBJECT runs candidate binaries behind two independent
// boundaries and returns data. TRUSTED VERDICT verifies identity and digests
// and then re-runs the predecessor's own classification.
//
// The subject's claimed success carries NO authority. It reports what happened;
// it does not decide what that means.

export const PLAN_SCHEMA_VERSION = 1
export const ENVELOPE_SCHEMA_VERSION = 1

const SHA_RE = /^[0-9a-f]{40}$/

/** Stable digest over canonical JSON, so a plan has one identity. */
export function digestOf(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`
}

/**
 * TRUSTED CONTROL. Build the subject plan.
 *
 * Commands come from the predecessor's policy, never from the candidate: a
 * candidate that could choose the commands would be setting its own exam. The
 * plan is content-addressed so the verdict can prove the subject ran THIS plan
 * and not one it preferred.
 */
export function buildSubjectPlan({ predecessorSha, candidateSha, classId, policy }) {
  for (const [label, sha] of [
    ['predecessor', predecessorSha],
    ['candidate', candidateSha],
  ]) {
    if (!SHA_RE.test(String(sha ?? ''))) {
      refuse(
        'UNRESOLVED_IDENTITY',
        `${label} identity must be a full 40-hex commit sha, got ${sha}`,
      )
    }
  }
  if (predecessorSha === candidateSha) {
    refuse('UNRESOLVED_IDENTITY', 'the candidate cannot be its own predecessor')
  }
  const classes = policy?.maintenanceClasses ?? []
  if (!classes.some((c) => c?.id === classId)) {
    refuse('UNKNOWN_CLASS', `"${classId}" is not one of the closed maintenance classes`)
  }
  const commands = policy?.subjectCommands ?? []
  if (commands.length === 0) {
    refuse('MALFORMED_AUTHORITY', 'the predecessor policy names no subject commands')
  }
  const plan = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    predecessorSha,
    candidateSha,
    classId,
    commands: commands.map((c) => ({ id: c.id, argv: [...c.argv] })),
    isolation: policy.subjectIsolation,
    expectedArtifacts: commands.map((c) => `${c.id}.json`),
  }
  return { ...plan, digest: digestOf(plan) }
}

/**
 * Two INDEPENDENT boundaries, checked before the subject runs.
 *
 * Boundary 1 withholds credentials and trusted state. Boundary 2 is an OS
 * boundary between the launcher and the candidate. A perfect boundary 1 does
 * not substitute for boundary 2: a process running as the launcher's own UID in
 * the launcher's filesystem can reach the launcher's plan, its artifacts, and
 * its verdict, whatever the environment was cleaned of. That topology must be
 * refused BEFORE execution, not audited afterwards.
 */
export function checkSubjectIsolation(spec, policy) {
  const problems = []
  const contract = policy?.subjectIsolation
  if (!contract) return ['the policy declares no subject-isolation contract']

  for (const denied of contract.deniedToSubject ?? []) {
    if ((spec?.grantedToSubject ?? []).includes(denied)) {
      problems.push(`boundary 1: the subject was granted "${denied}"`)
    }
  }
  if (spec?.canWriteTrustedWorkspace === true) {
    problems.push('boundary 1: the subject can write the trusted workspace')
  }
  if (spec?.scratch !== 'isolated') {
    problems.push(`boundary 1: subject scratch must be isolated, got ${spec?.scratch}`)
  }

  // Boundary 2 is structural. `same-uid` is the launcher's own context and is
  // never admissible, however clean boundary 1 is.
  const boundary = spec?.processBoundary
  if (boundary !== 'container' && boundary !== 'separate-uid') {
    problems.push(
      `boundary 2: "${boundary}" is not an OS boundary -- the candidate would run in the ` +
        "launcher's own execution context",
    )
  }
  if (boundary === 'container') {
    const applied = new Set(spec?.containerControls ?? [])
    for (const control of contract.containerControls ?? []) {
      if (!applied.has(control)) problems.push(`boundary 2: container control "${control}" missing`)
    }
  }
  return problems
}

/**
 * TRUSTED VERDICT. Verify the subject's envelope as DATA.
 *
 * Everything the subject could have chosen is checked against what the trusted
 * control decided: identities, plan digest, command identities, artifact
 * digests. A subject that reports success it did not earn changes nothing,
 * because the caller re-runs classification afterwards regardless.
 */
export function verifyResultEnvelope({ envelope, plan, artifactDigests }) {
  const problems = []
  if (envelope?.schemaVersion !== ENVELOPE_SCHEMA_VERSION) {
    return [
      `envelope schemaVersion must be ${ENVELOPE_SCHEMA_VERSION}, got ${envelope?.schemaVersion}`,
    ]
  }
  if (envelope.planDigest !== plan.digest) {
    problems.push('the subject did not run the plan it was given (plan digest mismatch)')
  }
  if (envelope.predecessorSha !== plan.predecessorSha) {
    problems.push('envelope predecessor identity does not match the plan')
  }
  if (envelope.candidateSha !== plan.candidateSha) {
    problems.push('envelope candidate identity does not match the plan')
  }

  const ran = envelope.results ?? []
  const expected = plan.commands.map((c) => c.id)
  const actual = ran.map((r) => r?.id)
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    problems.push(
      `command identities differ: expected ${expected.join(', ')}, got ${actual.join(', ')}`,
    )
  }
  for (const [index, result] of ran.entries()) {
    const planned = plan.commands[index]
    if (planned && canonicalJson(result?.argv ?? []) !== canonicalJson(planned.argv)) {
      problems.push(`command "${planned.id}" ran different arguments than planned`)
    }
    if (typeof result?.exitCode !== 'number') {
      problems.push(`command "${result?.id}" reported no exit code`)
    }
  }

  for (const artifact of plan.expectedArtifacts) {
    const claimed = envelope.artifacts?.[artifact]
    const measured = artifactDigests?.[artifact]
    if (!claimed) problems.push(`the envelope claims no digest for ${artifact}`)
    else if (!measured) problems.push(`${artifact} was not produced`)
    else if (claimed !== measured) problems.push(`${artifact} digest does not match its bytes`)
  }
  return problems
}

/**
 * Both identities are re-resolved at the end of the run and must not have moved
 * INDEPENDENTLY. Evidence is point-in-time; a candidate or base that moved
 * during the run was not the thing that was proved.
 */
export function checkRunFreshness({ start, end }) {
  const problems = []
  if (start?.candidateSha !== end?.candidateSha) {
    problems.push(
      `the candidate moved during the run: ${start?.candidateSha} -> ${end?.candidateSha}`,
    )
  }
  if (start?.predecessorSha !== end?.predecessorSha) {
    problems.push(
      `the predecessor moved during the run: ${start?.predecessorSha} -> ${end?.predecessorSha}`,
    )
  }
  return problems
}

// --- static invariants over the policy itself -------------------------------

/**
 * Properties the policy must hold at rest, independent of any candidate. These
 * run in the ordinary aggregate check, so a contradictory class is caught when
 * it is written rather than when it is first relied upon.
 */
export function checkBoundaryPolicy(policy) {
  const problems = []
  const classes = policy.maintenanceClasses ?? []
  const ids = new Set(classes.map((c) => c.id))
  const verifiers = new Set(policy.maintenanceVerifierAuthorities ?? [])

  if (verifiers.size === 0) problems.push('no maintenance-verifier authorities are named')

  for (const klass of classes) {
    for (const spec of klass.allowedProjections ?? []) {
      if (verifiers.has(spec.path)) {
        problems.push(`class "${klass.id}" admits a change to verifier authority ${spec.path}`)
      }
    }
    // A composite must preserve every protected projection of its parts;
    // coupling two classes is not a way to escape either one's protections.
    for (const parent of klass.composedOf ?? []) {
      if (!ids.has(parent)) {
        problems.push(`composite class "${klass.id}" names unknown class "${parent}"`)
        continue
      }
      const source = classes.find((c) => c.id === parent)
      for (const spec of source.protectedProjections ?? []) {
        const kept = (klass.protectedProjections ?? []).some(
          (s) => s.path === spec.path && s.projection === spec.projection,
        )
        if (!kept) {
          problems.push(
            `composite class "${klass.id}" drops ${spec.projection} of ${spec.path}, which ` +
              `"${parent}" protects`,
          )
        }
      }
    }
  }

  // The floor must not protect a file wholesale that a class needs to move,
  // which is the contradiction this design exists to prevent.
  for (const floorSpec of policy.protectedProjections ?? []) {
    if (floorSpec.projection !== 'bytes') continue
    for (const klass of classes) {
      for (const spec of klass.allowedProjections ?? []) {
        if (spec.path === floorSpec.path) {
          problems.push(
            `the protected floor holds ${floorSpec.path} byte-identical while class ` +
              `"${klass.id}" admits changing it; express the difference as two projections`,
          )
        }
      }
    }
  }

  return problems
}

// --- CLI --------------------------------------------------------------------

/**
 * Classify a candidate from a PLAN file.
 *
 * The plan carries both revisions as explicit file maps, which is what makes
 * two-revision behaviour testable and what the trusted boundary (task 1.16)
 * will hand over: candidate content arrives as inert data, never as something
 * checked out or executed.
 */
function classifyFromPlan(planPath) {
  let plan
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf8'))
  } catch (error) {
    console.error(JSON.stringify({ refused: true, code: 'MALFORMED_PLAN', message: error.message }))
    process.exit(1)
  }
  try {
    const verdict = classifyMaintenance({
      classId: plan.classId,
      predecessor: revisionFromMap(
        plan.predecessor?.id ?? 'predecessor',
        plan.predecessor?.files ?? {},
      ),
      candidate: revisionFromMap(plan.candidate?.id ?? 'candidate', plan.candidate?.files ?? {}),
      universe: plan.universe ?? [],
    })
    console.log(JSON.stringify(verdict))
    process.exit(0)
  } catch (error) {
    if (error instanceof MaintenanceRefusal) {
      console.error(JSON.stringify({ refused: true, code: error.code, message: error.message }))
      process.exit(1)
    }
    throw error
  }
}

/**
 * Report what the lockfile reader actually sees.
 *
 * Kept as a real entry point because the reader is hand-rolled: two defects in
 * it (a skipped inline-empty snapshot form, an aliased edge pointing at a key
 * that does not exist) survived synthetic fixtures and showed up only against
 * the repository's own lockfile.
 */
function inspectLock(lockPath, roots) {
  const graph = parseLockGraph(readFileSync(lockPath, 'utf8'), lockPath)
  const dangling = [...graph.values()].flat().filter((dep) => !graph.has(dep))
  console.log(
    JSON.stringify({
      snapshots: graph.size,
      dangling: [...new Set(dangling)].sort(),
      closure: Object.fromEntries(
        roots.map((root) => [root, [...deriveLockClosure(graph, [root])].sort()]),
      ),
    }),
  )
}

/**
 * The boundary operations, driven as data.
 *
 * Each reads one JSON request and writes one JSON response. The maintenance
 * workflow calls these from PREDECESSOR bytes; nothing here reads the
 * candidate's copy of this file.
 */
function runBoundaryOp(op, requestPath, repoRoot) {
  const request = JSON.parse(readFileSync(requestPath, 'utf8'))
  const policy = JSON.parse(readFileSync(path.join(repoRoot, BOUNDARIES_PATH), 'utf8'))
  const emit = (problems, payload = {}) => {
    if (problems.length > 0) {
      console.error(JSON.stringify({ refused: true, op, problems }))
      process.exit(1)
    }
    console.log(JSON.stringify({ ok: true, op, ...payload }))
    process.exit(0)
  }

  try {
    switch (op) {
      case 'plan-subject':
        return emit([], {
          plan: buildSubjectPlan({
            predecessorSha: request.predecessorSha,
            candidateSha: request.candidateSha,
            classId: request.classId,
            policy,
          }),
        })
      case 'check-isolation':
        return emit(checkSubjectIsolation(request, policy))
      case 'verify-envelope':
        return emit(
          verifyResultEnvelope({
            envelope: request.envelope,
            plan: request.plan,
            artifactDigests: request.artifactDigests,
          }),
        )
      case 'check-freshness':
        return emit(checkRunFreshness(request))
      default:
        console.error(JSON.stringify({ refused: true, problems: [`unknown operation "${op}"`] }))
        return process.exit(1)
    }
  } catch (error) {
    if (error instanceof MaintenanceRefusal) {
      console.error(
        JSON.stringify({ refused: true, op, code: error.code, problems: [error.message] }),
      )
      process.exit(1)
    }
    throw error
  }
}

function main() {
  const repoRootEarly = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

  const opFlag = process.argv.indexOf('--boundary')
  if (opFlag !== -1) {
    return runBoundaryOp(process.argv[opFlag + 1], process.argv[opFlag + 2], repoRootEarly)
  }

  const planFlag = process.argv.indexOf('--plan')
  if (planFlag !== -1) return classifyFromPlan(process.argv[planFlag + 1])

  const lockFlag = process.argv.indexOf('--inspect-lock')
  if (lockFlag !== -1) {
    const rootsFlag = process.argv.indexOf('--roots')
    return inspectLock(
      process.argv[lockFlag + 1],
      rootsFlag === -1 ? [] : process.argv[rootsFlag + 1].split(','),
    )
  }

  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const policy = JSON.parse(readFileSync(path.join(repoRoot, BOUNDARIES_PATH), 'utf8'))
  const schema = JSON.parse(readFileSync(path.join(repoRoot, SCHEMA_PATH), 'utf8'))
  // The COMMITTED instance, not a synthetic minimal document. A stale field
  // survived a whole landing because only synthetic documents were validated.
  const problems = [
    ...validateAgainstSchema(policy, schema).map((p) => `${BOUNDARIES_PATH} ${p}`),
    ...checkBoundaryPolicy(policy),
  ]
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`)
    process.exit(1)
  }
  console.log(
    `✓ toolchain boundary policy: ${policy.maintenanceClasses.length} closed maintenance classes, ` +
      `${policy.protectedProjections.length} protected floor projections`,
  )
}

if (process.argv[1] && process.argv[1] === new URL(import.meta.url).pathname) main()
