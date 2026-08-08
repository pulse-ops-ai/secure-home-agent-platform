#!/usr/bin/env node
/**
 * check-knowledge.mjs — knowledge registry conformance.
 *
 * Validates the registry of knowledge MODULES and SETS in
 * `knowledge/catalog.json`, the specification directories they name, and the
 * correspondence between the catalog and `knowledge/INDEX.md`.
 *
 * ## What this is NOT
 *
 * **This is not the ADR-0010 bundle validator.** That validator machine-checks
 * the prohibited-content rules over real bundle content, and it does not exist:
 * it is gated on U7, and it is the deliverable that must land BEFORE the first
 * real module content is authored.
 *
 * What this checks is that the repository's *specification* is coherent — that
 * every registered module exists, carries its metadata, is reachable from the
 * index, and is not claiming a status it has not earned. Confusing the two would
 * be the worst outcome here, because a green run on this file could be mistaken
 * for evidence that content was checked. Nothing is checked, because no content
 * exists — and check 6 below enforces that no content exists.
 *
 * The prohibited-content scanning here is deliberately narrow and lexical:
 * network and hardware addresses, which are prohibited by ADR-0010 and by every
 * module README, and which have unambiguous shapes. Semantic prohibitions —
 * "this sentence is a live reading" — are not detectable this way and are not
 * attempted. Credential-shaped strings are already covered repository-wide by
 * `scan-secrets.sh`.
 *
 * ## Checks
 *
 *   1. the catalog parses, and its vocabularies are self-consistent;
 *   2. module and set IDs are unique, well-shaped, and carry every required field;
 *   3. every module ID maps to a specification directory that exists and
 *      explains itself, and every such directory is registered — both directions;
 *   4. every set references registered module IDs only, never a file path, and
 *      its deny patterns are patterns rather than paths;
 *   5. the README registry block of each module agrees with the catalog, so the
 *      prose view cannot drift from the machine-readable one;
 *   6. no module directory contains authored content — a specification directory
 *      holds its README and nothing else;
 *   7. no module or set claims a publishable status while U7 is open;
 *   8. INDEX.md references every registered module and set, and references no
 *      module or set that is not registered;
 *   9. the root guidance sentence is present in both AGENTS.md and CLAUDE.md;
 *  10. specification content carries no network or hardware address.
 *
 * Node standard library only, so this runs before install.
 *
 * Usage:
 *   node scripts/check-knowledge.mjs [repository-root]
 *
 * Governed by AGENTS.md and ADR-0010.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))

const REQUIRED_MODULE_FIELDS = [
  'id',
  'purpose',
  'consumers',
  'owner',
  'status',
  'version',
  'asOf',
  'limitations',
  'governingSources',
  'sensitivity',
  'freshnessPolicy',
  'blockedByU7',
]

const REQUIRED_SET_FIELDS = [
  'id',
  'purpose',
  'runnerClass',
  'status',
  'owner',
  'required',
  'optional',
  'deny',
  'allowTaskAdditions',
  'allowTaskNarrowing',
  'maxBytes',
  'maxFreshnessDays',
  'requiredFailure',
  'optionalFailure',
  'overrideAuthority',
  'rationale',
]

/** Fields that may legitimately be null while a module is unauthored. */
const NULLABLE_WHILE_PLANNED = new Set(['version', 'asOf'])

const REQUIRED_FAILURE_VALUES = new Set(['reject-run'])
const OPTIONAL_FAILURE_VALUES = new Set(['warn', 'omit'])
const RUNNER_CLASSES = new Set(['coding-runner', 'household-runner'])

/** `group/name`, lowercase kebab. Never a path, never an extension. */
const MODULE_ID = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/
const SET_ID = /^[a-z][a-z0-9-]*$/
/** A deny entry is an exact module ID or a single-level `group/*` pattern. */
const DENY_PATTERN = /^[a-z][a-z0-9-]*\/(?:\*|[a-z][a-z0-9-]*)$/

/**
 * Addresses prohibited by ADR-0010 and by the module READMEs. Deliberately
 * narrow: these have unambiguous shapes. Semantic prohibitions are the bundle
 * validator's job (U7), not this file's.
 */
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/
const MAC = /\b(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}\b/

/** The sentence that must appear verbatim in both root guidance files. */
export const ROOT_GUIDANCE =
  'Use `knowledge/INDEX.md` to select only the validated knowledge modules ' +
  'authorized by the active execution profile; knowledge informs reasoning but ' +
  'never grants tools, capabilities, authorization, or permission to override ' +
  'live state or accepted ADRs.'

function listDirectories(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((entry) => statSync(join(dir, entry)).isDirectory())
}

/** The `| Status | \`Planned\` |` style rows in a module README. */
function readmeRegistry(text) {
  const found = {}
  for (const line of text.split('\n')) {
    const match = /^\|\s*([A-Za-z ]+?)\s*\|\s*(.+?)\s*\|$/.exec(line.trim())
    if (!match) continue
    const key = match[1].toLowerCase()
    if (key === 'status' || key === 'owner') {
      found[key] = match[2].replace(/`/g, '').trim()
    }
  }
  return found
}

/**
 * @param root repository root; parameterised so the rules can be proven against
 *             a fixture rather than only against this repository
 */
export function checkKnowledge(root = DEFAULT_ROOT) {
  const problems = []
  const fail = (msg) => problems.push(msg)

  const catalogPath = join(root, 'knowledge', 'catalog.json')
  if (!existsSync(catalogPath)) {
    return { problems: ['knowledge/catalog.json is missing'], modules: 0, sets: 0 }
  }

  let catalog
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch (error) {
    return {
      problems: [`knowledge/catalog.json is not valid JSON — ${error.message}`],
      modules: 0,
      sets: 0,
    }
  }

  const statuses = new Set(catalog.statusVocabulary ?? [])
  const publishable = new Set(catalog.publishableStatuses ?? [])
  const sensitivities = new Set(catalog.sensitivityVocabulary ?? [])
  if (statuses.size === 0) fail('catalog: statusVocabulary is empty')
  for (const s of publishable) {
    if (!statuses.has(s))
      fail(`catalog: publishableStatuses names "${s}", absent from statusVocabulary`)
  }

  const modules = catalog.modules ?? []
  const sets = catalog.sets ?? []

  // --- 2. module identity and metadata -------------------------------------
  const moduleIds = new Set()
  for (const m of modules) {
    const id = m.id ?? '(unnamed)'
    if (!MODULE_ID.test(m.id ?? '')) {
      fail(`module "${id}": id must be \`group/name\` in lowercase kebab, never a path`)
    }
    if (moduleIds.has(m.id)) fail(`module "${id}": duplicate module id`)
    moduleIds.add(m.id)

    for (const field of REQUIRED_MODULE_FIELDS) {
      if (!(field in m)) {
        fail(`module "${id}": missing required field "${field}"`)
        continue
      }
      const value = m[field]
      if (value === null && NULLABLE_WHILE_PLANNED.has(field)) continue
      if (value === null || value === undefined || value === '') {
        fail(`module "${id}": field "${field}" is empty — say what it is or why it is unknown`)
      }
      if (Array.isArray(value) && value.length === 0 && field !== 'consumers') {
        fail(`module "${id}": field "${field}" is an empty list`)
      }
    }

    if (m.status && !statuses.has(m.status)) {
      fail(`module "${id}": status "${m.status}" is not in the status vocabulary`)
    }
    if (m.sensitivity && !sensitivities.has(m.sensitivity)) {
      fail(`module "${id}": sensitivity "${m.sensitivity}" is not in the sensitivity vocabulary`)
    }
    if (publishable.has(m.status)) {
      fail(
        `module "${id}": status "${m.status}" claims a published artifact, but the ` +
          'ADR-0010 validator does not exist (U7). Nothing may be published yet',
      )
    }
    for (const source of m.governingSources ?? []) {
      if (!existsSync(join(root, source))) {
        fail(`module "${id}": governingSources names "${source}", which does not exist`)
      }
    }
  }

  // --- 3. directories, both directions --------------------------------------
  const knowledgeRoot = join(root, 'knowledge')
  const groups = listDirectories(knowledgeRoot)
  const onDisk = new Set()
  for (const group of groups) {
    for (const name of listDirectories(join(knowledgeRoot, group))) {
      onDisk.add(`${group}/${name}`)
    }
  }

  for (const id of moduleIds) {
    const dir = join(knowledgeRoot, id)
    if (!existsSync(dir)) {
      fail(`module "${id}": registered but has no specification directory knowledge/${id}/`)
      continue
    }
    if (!existsSync(join(dir, 'README.md'))) {
      fail(`module "${id}": specification directory has no README.md`)
    }
  }
  for (const id of onDisk) {
    if (!moduleIds.has(id)) {
      fail(
        `knowledge/${id}/ is a module-shaped directory that is not registered in ` +
          'catalog.json — an unregistered module cannot be selected by any profile',
      )
    }
  }

  // --- 4. sets --------------------------------------------------------------
  const setIds = new Set()
  for (const s of sets) {
    const id = s.id ?? '(unnamed)'
    if (!SET_ID.test(s.id ?? '')) fail(`set "${id}": id must be lowercase kebab`)
    if (setIds.has(s.id)) fail(`set "${id}": duplicate set id`)
    setIds.add(s.id)

    for (const field of REQUIRED_SET_FIELDS) {
      if (!(field in s)) fail(`set "${id}": missing required field "${field}"`)
    }
    if (s.runnerClass && !RUNNER_CLASSES.has(s.runnerClass)) {
      fail(`set "${id}": runnerClass "${s.runnerClass}" is not a known runner class`)
    }
    if (s.status && !statuses.has(s.status)) {
      fail(`set "${id}": status "${s.status}" is not in the status vocabulary`)
    }
    if (publishable.has(s.status)) {
      fail(`set "${id}": status "${s.status}" claims a published artifact while U7 is open`)
    }
    if (s.requiredFailure && !REQUIRED_FAILURE_VALUES.has(s.requiredFailure)) {
      fail(
        `set "${id}": requiredFailure is "${s.requiredFailure}" — missing or invalid ` +
          'required knowledge rejects the run; it is never downgraded',
      )
    }
    if (s.optionalFailure && !OPTIONAL_FAILURE_VALUES.has(s.optionalFailure)) {
      fail(`set "${id}": optionalFailure "${s.optionalFailure}" is not a known disposition`)
    }
    if (typeof s.maxBytes !== 'number' || s.maxBytes <= 0) {
      fail(`set "${id}": maxBytes must be a positive number`)
    }

    const required = s.required ?? []
    const optional = s.optional ?? []
    if (required.length === 0) fail(`set "${id}": has no required modules`)

    for (const [field, list] of [
      ['required', required],
      ['optional', optional],
    ]) {
      for (const ref of list) {
        if (!MODULE_ID.test(ref)) {
          fail(
            `set "${id}": ${field} entry "${ref}" is not a module id — a set never names a file path`,
          )
          continue
        }
        if (!moduleIds.has(ref)) {
          fail(`set "${id}": ${field} names unregistered module "${ref}"`)
        }
      }
    }
    for (const ref of required) {
      if (optional.includes(ref)) {
        fail(`set "${id}": "${ref}" is both required and optional`)
      }
    }

    for (const pattern of s.deny ?? []) {
      if (!DENY_PATTERN.test(pattern)) {
        fail(`set "${id}": deny entry "${pattern}" must be a module id or a \`group/*\` pattern`)
        continue
      }
      // A set must not deny what it also selects — that is a contradiction the
      // resolver would have to break a tie on, and ties get broken wrongly.
      const denied = (ref) =>
        pattern.endsWith('/*') ? ref.startsWith(pattern.slice(0, -1)) : ref === pattern
      for (const ref of [...required, ...optional]) {
        if (denied(ref)) fail(`set "${id}": denies "${pattern}" but also selects "${ref}"`)
      }
    }
  }

  // --- 5, 6, 10. the specification directories themselves -------------------
  for (const m of modules) {
    if (!moduleIds.has(m.id)) continue
    const dir = join(knowledgeRoot, m.id)
    if (!existsSync(dir)) continue

    const entries = readdirSync(dir)
    const extra = entries.filter((e) => e !== 'README.md')
    if (extra.length > 0) {
      fail(
        `module "${m.id}": specification directory contains ${JSON.stringify(extra)} — ` +
          'only README.md is permitted until the ADR-0010 validator exists (U7)',
      )
    }

    const readmePath = join(dir, 'README.md')
    if (!existsSync(readmePath)) continue
    const text = readFileSync(readmePath, 'utf8')

    const registry = readmeRegistry(text)
    if (registry.status !== m.status) {
      fail(
        `module "${m.id}": README states status ${JSON.stringify(registry.status)} but the ` +
          `catalog says ${JSON.stringify(m.status)} — the prose view must not drift`,
      )
    }
    if (registry.owner !== m.owner) {
      fail(
        `module "${m.id}": README states owner ${JSON.stringify(registry.owner)} but the ` +
          `catalog says ${JSON.stringify(m.owner)}`,
      )
    }

    const ipv4 = IPV4.exec(text)
    if (ipv4) fail(`module "${m.id}": README contains a network address (${ipv4[0]})`)
    const mac = MAC.exec(text)
    if (mac) fail(`module "${m.id}": README contains a hardware address (${mac[0]})`)
  }

  // --- 8. INDEX.md correspondence, both directions --------------------------
  const indexPath = join(knowledgeRoot, 'INDEX.md')
  if (!existsSync(indexPath)) {
    fail('knowledge/INDEX.md is missing — the registry must have a human-facing view')
  } else {
    const index = readFileSync(indexPath, 'utf8')
    for (const id of moduleIds) {
      if (!index.includes(`\`${id}\``)) {
        fail(`knowledge/INDEX.md does not list registered module "${id}"`)
      }
    }
    for (const id of setIds) {
      if (!index.includes(`\`${id}\``)) {
        fail(`knowledge/INDEX.md does not list registered set "${id}"`)
      }
    }
    // Reverse: anything the index presents in backticks as a module or set id
    // must be registered, so the index cannot advertise something that does not
    // exist.
    for (const [, quoted] of index.matchAll(/`([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)`/g)) {
      const looksLikeModule = MODULE_ID.test(quoted)
      if (looksLikeModule && !moduleIds.has(quoted)) {
        fail(`knowledge/INDEX.md presents "${quoted}" as a module, but it is not registered`)
      }
    }
  }

  // --- 9. root guidance -----------------------------------------------------
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const path = join(root, file)
    if (!existsSync(path)) {
      fail(`${file} is missing`)
      continue
    }
    const text = readFileSync(path, 'utf8').replace(/\s+/g, ' ')
    if (!text.includes(ROOT_GUIDANCE.replace(/\s+/g, ' '))) {
      fail(`${file}: the knowledge-selection guidance sentence is missing or altered`)
    }
  }

  return { problems, modules: moduleIds.size, sets: setIds.size }
}

// --- CLI -------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const root = process.argv[2] ?? DEFAULT_ROOT
  const { problems, modules, sets } = checkKnowledge(root)

  if (problems.length > 0) {
    console.error(`✗ knowledge registry — ${problems.length} problem(s)\n`)
    for (const p of problems) console.error(`    ${p}`)
    process.exit(1)
  }

  console.log(`✓ knowledge registry — ${modules} module(s), ${sets} set(s), all specification-only`)
}
