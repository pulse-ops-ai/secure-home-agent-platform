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
 * **This is not the content admission validator.** That is
 * `@secure-home/knowledge-toolchain`, which owns every REAL-CONTENT rule:
 * the OKF version pin, the repository metadata profile, the catalog/frontmatter
 * mirror, execution-bearing refusal, reference integrity, envelope rules, the
 * prohibited-content indicators, and Proof A. This file owns REGISTRY and
 * SCAFFOLD concerns only, and the two do not implement the same rule twice.
 *
 * **Prohibited content is not established by machine inspection alone**, and
 * saying otherwise was a falsified claim that ADR-0016 corrected. The accepted
 * model:
 *
 *   deterministic A/B indicators → machine checks, in the toolchain
 *   the semantic remainder       → a human content-review attestation
 *   Proof A                      → the toolchain validates exact-byte binding
 *   Proof B                      → governed human-review evidence, which no
 *                                  mechanism in this repository produces
 *   publication                  → admission + Proof B
 *
 * There are currently **no A classes**: every implemented indicator is B —
 * deterministic, useful, and incomplete, with its blind spot named in the
 * toolchain's coverage table.
 *
 * What this file checks is that the repository's *specification* is coherent —
 * that every registered module exists, carries its metadata, is reachable from
 * the index, is not claiming a status it has not earned, and carries the two
 * structural gates. Confusing the two would be the worst outcome here, because a
 * green run could be mistaken for evidence that content was admitted. It is not.
 *
 * The division, precisely: while a module's toolchain gate is closed, check 6
 * below enforces README-only, so no authored source can exist there. Once that
 * gate opens — as it now has — authored source is expected, and whether those
 * real bytes are ADMISSIBLE is decided by `check-knowledge-content.mjs` and the
 * toolchain it invokes, never here. This file owns specification and gate
 * coherence; it owns no content rules at all.
 *
 * The address scanning that remains here is a SCAFFOLD concern over
 * specification READMEs, not content admission: network and hardware addresses
 * have unambiguous shapes and must not appear in the specification either.
 * Credential-shaped strings are covered repository-wide by `scan-secrets.sh`.
 *
 * ## Checks
 *
 *   1. the catalog parses, and its vocabularies are self-consistent;
 *   2. module and set IDs are unique, well-shaped, and carry every required field;
 *   3. every module ID maps to a specification directory that exists and
 *      explains itself, and every such directory is registered — both directions;
 *   4. every set FAMILY carries its own metadata contract — composition and
 *      policy, and no version, lifecycle, or rollout gate (ADR-0019) — references
 *      registered module IDs only and never a file path, keeps its deny entries
 *      as patterns, and does not carry a version while selecting an unversioned
 *      module — a pin to nothing would make two different resolutions look
 *      identical in run evidence;
 *   5. the README registry block of each module agrees with the catalog, so the
 *      prose view cannot drift from the machine-readable one;
 *   6. while a module's blockedByToolchain gate is TRUE, its directory holds
 *      only its README. Once that gate is discharged — as it now is — authored
 *      source is expected there, and whether the content is ACCEPTABLE is
 *      `check-knowledge-content.mjs`'s question for MODULES, and
 *      `check-set-releases.mjs`'s for RELEASES — not this checker's. This file
 *      owns registry coherence and never content rules;
 *   7. no module or set claims a status it has not earned, and every entry
 *      carries blockedByToolchain: false — discharged 2026-08-16, and pinned so
 *      that re-blocking is as visible a transition as opening was;
 *   7b. every entry carries the blockedByRollout value ADR-0016 §7a fixes —
 *      an INDEPENDENT fact from toolchain readiness;
 *   8. INDEX.md and the catalog correspond in BOTH directions, for modules and
 *      for sets. Module IDs are recognised by shape, since they always contain a
 *      slash. Set IDs cannot be — `Planned`, `warn`, and `catalog.json` are
 *      backticked in that document too — so set correspondence is checked
 *      against the rows of the `## Sets` table, which is the place the index
 *      actually makes the claim;
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

import { readFileSync, existsSync, readdirSync, statSync, lstatSync } from 'node:fs'
import { join, posix } from 'node:path'
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
  'blockedByToolchain',
  'blockedByRollout',
]

/**
 * A set FAMILY carries composition and policy. It deliberately carries NO
 * version, status, asOf, or rollout gate: those belong to immutable release
 * records under ADR-0019, because a mutable row cannot explain a version it has
 * moved past. `runnerClass` is a set's intended-consumer field.
 *
 * `version` is load-bearing rather than decorative: the selection model pins a
 * profile's base set as `name@version`, and run evidence records requested and
 * resolved set versions. A registry that cannot express a set version cannot
 * support either.
 */
const REQUIRED_SET_FIELDS = [
  'id',
  'purpose',
  'runnerClass',
  'owner',
  'limitations',
  'governingSources',
  'sensitivity',
  'freshnessPolicy',
  'blockedByToolchain',
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

/**
 * PROVIDER ADAPTERS ARE NEVER CANONICAL GOVERNING SOURCES.
 *
 * ADR-0014 makes provider-specific instruction surfaces SUBORDINATE: they adapt
 * governed contracts for one tool, and they never own a platform truth. A
 * catalog entry naming one as a governing source inverts that — the portable
 * projection would then cite a provider adapter as the origin of a rule, and
 * the rule would live in exactly one vendor's file.
 *
 * Rejected by IDENTITY, not by shape. `.github/agents/**` is a provider adapter;
 * `agents/**` is this product's own content, and the two differ by one path
 * prefix. A pattern loose enough to catch both would reject the repository's own
 * agent implementations, so the surfaces are named.
 *
 * The canonical home for a rule found only in an adapter is a provider-neutral
 * governed contract — `AGENTS.md`, `CONTRIBUTING.md`, an ADR — and moving it
 * there is the fix. Removing the citation while leaving the rule stranded is not.
 */
/**
 * A GOVERNING SOURCE IS A CANONICAL REPOSITORY FILE PATH.
 *
 * Provider classification compared the raw catalog string while existence used a
 * resolving `join`. So `./CLAUDE.md` and `docs/../CLAUDE.md` denoted a provider
 * adapter, existed happily, and matched no provider pattern — the SPELLING
 * decided rather than the identity, and a rule keyed on one spelling of a path
 * is not a rule about that path.
 *
 * One canonical form removes the alias space, and provider classification then
 * runs on an identity that has exactly one spelling.
 */
/**
 * The FIRST aliased component of a repository-relative path, or undefined.
 *
 * `lstatSync` declines to follow only the LAST component; the operating system
 * still resolves every parent. So `alias -> .` with a source of
 * `alias/CLAUDE.md` reached a regular CLAUDE.md, while provider classification
 * read a string beginning `alias/` and saw nothing provider-shaped. Checking the
 * final component alone cannot establish "this is a real repository file".
 *
 * Walks from the trusted repository root, one component at a time, with
 * no-follow metadata. A missing component is not this rule's business — the
 * existence rule reports that — so it stops rather than refusing.
 *
 * Resolving the alias and accepting an in-repository target is deliberately NOT
 * the rule: two spellings of one file is the whole defect.
 */
const aliasedComponent = (root, source) => {
  let current = root
  for (const segment of source.split('/')) {
    current = join(current, segment)
    let stats
    try {
      stats = lstatSync(current)
    } catch {
      return undefined
    }
    if (stats.isSymbolicLink()) return current.slice(root.length + 1)
  }
  return undefined
}

/**
 * THE README'S GOVERNING SOURCES MUST EQUAL THE CATALOG'S.
 *
 * `catalog.json` is the metadata authority, but every module README repeats the
 * list for a human reader, and a duplicated statement drifts silently. It did:
 * one landing added governing sources to the catalog and left six READMEs
 * behind, so the human-facing page named a governing set the machine did not
 * agree with, and a reader had no way to tell which was current.
 *
 * Compared as resolved repository identities and as a SET. Never as display
 * labels — a link's text is arbitrary and says nothing about what it points at —
 * and never as a sequence, because order carries no meaning here.
 */
const GOVERNING_HEADING = /^##\s+Governing sources\s*$/im
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/** The section's own body: from its heading to the next heading of any depth. */
const governingSection = (text) => {
  const heading = GOVERNING_HEADING.exec(text)
  if (!heading) return undefined
  const rest = text.slice(heading.index + heading[0].length)
  const next = /^#{1,6}\s/m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

/** Local link destinations, resolved from the README to repository-relative. */
const readmeGoverningSources = (section, moduleId) => {
  const from = `knowledge/${moduleId}`
  const found = new Set()
  for (const match of section.matchAll(MARKDOWN_LINK)) {
    const destination = match[1]
    // An external URL or a bare in-page anchor is not a repository source.
    if (EXTERNAL.test(destination) || destination.startsWith('#')) continue
    const withoutFragment = destination.split('#')[0]
    if (withoutFragment === '') continue
    found.add(posix.normalize(posix.join(from, withoutFragment)))
  }
  return found
}

/**
 * RUNBOOK ROLLOUT IS PER MODULE, NEVER PER DIRECTORY.
 *
 * ADR-0016 §7a: "Runbooks are allowlisted individually, never by directory. A
 * new runbook is ineligible on creation and becomes eligible only when a
 * reviewed change adds it to the allowlist — so a household-oriented runbook
 * cannot become eligible because of where it was filed."
 *
 * The previous derivation — platform/** false, everything else true — encoded
 * the INITIAL state exactly and could express nothing after it. This reads the
 * allowlist the ADR names, and validates it hard: an entry that names no
 * registered module, that is not a runbook, that is a directory or wildcard, or
 * that repeats, is refused rather than silently releasing nothing (or something).
 *
 * The key is REQUIRED. An absent policy would fail closed, but it would also be
 * invisible, and a rollout policy nobody can see is not reviewable.
 */
const readRunbookAllowlist = (catalog, moduleIds, fail) => {
  const raw = catalog['runbookRolloutAllowlist']
  if (raw === undefined) {
    fail(
      'catalog: "runbookRolloutAllowlist" is missing. ADR-0016 §7a releases a runbook ' +
        'only by explicit per-module entry, so the list must be stated even when empty',
    )
    return new Set()
  }
  if (!Array.isArray(raw)) {
    fail('catalog: "runbookRolloutAllowlist" must be an array of module IDs')
    return new Set()
  }
  const allowed = new Set()
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      fail('catalog: "runbookRolloutAllowlist" must be an array of strings')
      continue
    }
    if (allowed.has(entry)) {
      fail(`catalog: "runbookRolloutAllowlist" repeats "${entry}"`)
      continue
    }
    allowed.add(entry)
    if (entry.includes('*') || entry.endsWith('/')) {
      fail(
        `catalog: "runbookRolloutAllowlist" entry "${entry}" is a directory or wildcard. ` +
          'ADR-0016 §7a allowlists runbooks individually, never by directory',
      )
      continue
    }
    if (!entry.startsWith('runbooks/')) {
      fail(
        `catalog: "runbookRolloutAllowlist" entry "${entry}" is not a runbook. The list ` +
          'releases runbooks/** modules only; every other class has its own reviewed route',
      )
      continue
    }
    if (!moduleIds.has(entry)) {
      fail(`catalog: "runbookRolloutAllowlist" entry "${entry}" names no registered module`)
    }
  }
  return allowed
}

/**
 * The reviewed rollout value for one module, ASSERTED rather than accepted.
 *
 * The allowlist is consulted only for `runbooks/**`, so even a validation slip
 * above cannot release `household/**` — the smaller claim, structurally.
 */
const expectedRollout = (id, allowlist) => {
  if (id.startsWith('platform/')) return false
  if (id.startsWith('runbooks/')) return !allowlist.has(id)
  return true
}

const canonicalPathProblem = (source) => {
  if (typeof source !== 'string' || source === '') return 'is empty'
  if (source.includes('\\')) return 'uses a backslash separator; paths are POSIX'
  if (source.startsWith('/')) return 'is an absolute path'
  const segments = source.split('/')
  if (segments.includes('.')) return 'contains a "." segment'
  if (segments.includes('..')) return 'contains a ".." segment and may escape the repository'
  if (segments.includes('')) return 'contains an empty segment'
  if (posix.normalize(source) !== source) return 'is not normalized'
  return undefined
}

/** ADR-0019 release identity vocabulary. Syntax only — no SemVer meaning. */
const RELEASE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/
const RELEASE_STATES = new Set(['Released', 'Deprecated', 'Retired'])
const RELEASE_REVIEW_POLICY = 'knowledge-set-release-review-v1'
/** A release review is a human act, recorded as one. */
const RELEASE_ACTOR = /^human:[A-Za-z0-9._-]+$/
const RELEASE_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

const PROVIDER_SURFACES = new Set(['CLAUDE.md', '.github/copilot-instructions.md'])
const PROVIDER_PREFIXES = ['.github/agents/', '.claude/']

const isProviderSurface = (source) =>
  PROVIDER_SURFACES.has(source) || PROVIDER_PREFIXES.some((p) => source.startsWith(p))

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
 * narrow: these have unambiguous shapes. Content admission — indicators,
 * attestation, and everything else over real module content — belongs to
 * `@secure-home/knowledge-toolchain`, not to this file.
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
  // THREE STAGES, NOT ONE FLAG.
  //
  //   authoring -> admission/validation -> packaging -> publication
  //
  // `publishableStatuses` had named all three of Validated, Packaged, and
  // Published, so the absent Proof B producer refused all three — which said
  // that a module could not even be VALIDATED until a governed human-review
  // mechanism existed. Proof B gates publication and nothing earlier. Admission
  // and `packageBundle()` never require it, and must not start.
  //
  //   postToolchainStatuses  unreachable while blockedByToolchain is true,
  //                          because the reviewed obligation is still open
  //   publishableStatuses    additionally requires Proof B, which has no
  //                          producer — so Published stays refused after the
  //                          readiness gate opens
  const publishable = new Set(catalog.publishableStatuses ?? [])
  const postToolchain = new Set(catalog.postToolchainStatuses ?? [])
  const sensitivities = new Set(catalog.sensitivityVocabulary ?? [])
  if (statuses.size === 0) fail('catalog: statusVocabulary is empty')
  for (const s of publishable) {
    if (!statuses.has(s))
      fail(`catalog: publishableStatuses names "${s}", absent from statusVocabulary`)
  }
  for (const s of postToolchain) {
    if (!statuses.has(s))
      fail(`catalog: postToolchainStatuses names "${s}", absent from statusVocabulary`)
  }
  for (const s of publishable) {
    if (!postToolchain.has(s))
      fail(
        `catalog: publishableStatuses names "${s}" but postToolchainStatuses does not — ` +
          'publication is downstream of readiness, so it cannot be reachable earlier',
      )
  }

  const modules = catalog.modules ?? []
  const sets = catalog.sets ?? []

  // Every declared module id, needed before the allowlist can be validated:
  // an entry naming no registered module is a typo that releases nothing while
  // reading as though it released something.
  const declaredModuleIds = new Set(modules.map((m) => m.id).filter((id) => typeof id === 'string'))
  const runbookAllowlist = readRunbookAllowlist(catalog, declaredModuleIds, fail)

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
    // TWO DIFFERENT REFUSALS, so the reason is never guessed from the state.
    if (m.blockedByToolchain === true && postToolchain.has(m.status)) {
      fail(
        `module "${id}": status "${m.status}" is a post-toolchain lifecycle state, but ` +
          'blockedByToolchain is true — readiness has not been discharged',
      )
    } else if (publishable.has(m.status)) {
      fail(
        `module "${id}": status "${m.status}" claims publication, which additionally ` +
          'requires Proof B, and no governed producer exists (ADR-0016 §5a)',
      )
    }
    // THE AUTHORING GATE, ASSERTED RATHER THAN MERELY PRESENT — NOW DISCHARGED.
    //
    // U7 asked whether the format architecture was decided; ADR-0015 answered
    // it and U7 is RESOLVED. Authoring readiness is a DIFFERENT fact, and this
    // is where it lives. Requiring only that the field exist would have let
    // `false` pass on the day U7 closed — turning "the question is answered"
    // into "the work is done" by omission.
    //
    // The ADR-0015 §12 obligation was discharged on 2026-08-16, after the
    // toolchain, its conformance suite, and repository content admission passed
    // independent review. The assertion is INVERTED rather than deleted: the
    // reason it existed — that a gate flipping silently is indistinguishable
    // from a gate nobody read — applies in both directions. Re-blocking must
    // also be a diff someone signed.
    if (m.blockedByToolchain !== false) {
      fail(
        `module "${id}": blockedByToolchain must be false — the ADR-0015 §12 obligation ` +
          'was discharged on 2026-08-16 after independent review of the toolchain and its ' +
          'integration. Re-blocking authoring is an explicit reviewed transition too, and ' +
          'must show as one',
      )
    }
    // ROLLOUT ELIGIBILITY, A DIFFERENT FACT FROM TOOLCHAIN READINESS.
    //
    // ADR-0016 §7a fixes the initial value by scope, and acceptance of that ADR
    // is what set it — not the toolchain gate, which is why the two are checked
    // independently here. A `platform/**` module being rollout-eligible says
    // nothing about whether the toolchain exists, and `blockedByToolchain`
    // above still refuses it.
    const rollout = expectedRollout(id, runbookAllowlist)
    if (m.blockedByRollout !== rollout) {
      fail(
        `module "${id}": blockedByRollout must be ${String(rollout)} — ` +
          'ADR-0016 §7a sets platform/** false, household/** true, and runbooks/** true ' +
          'unless the module appears in "runbookRolloutAllowlist"',
      )
    }
    for (const source of m.governingSources ?? []) {
      const pathProblem = canonicalPathProblem(source)
      if (pathProblem !== undefined) {
        fail(
          `module "${id}": governingSources names "${source}", which ${pathProblem}. ` +
            'It must be a canonical repository path — repository-relative, POSIX, ' +
            'normalized — so one file has exactly one spelling and cannot evade ' +
            'classification by alias',
        )
        continue
      }
      const absolute = join(root, source)
      const aliased = aliasedComponent(root, source)
      if (aliased !== undefined) {
        fail(
          `module "${id}": governingSources names "${source}", whose component ` +
            `"${aliased}" is a symbolic link. A governing source must be a real repository ` +
            'file in every component: an alias is classified by its own spelling, so a ' +
            'neutral-looking path could resolve to a provider adapter or outside the ' +
            'repository entirely',
        )
        continue
      }
      if (existsSync(absolute) && !lstatSync(absolute).isFile()) {
        fail(
          `module "${id}": governingSources names "${source}", which is not a regular file. ` +
            'A directory governs nothing',
        )
        continue
      }
      if (isProviderSurface(source)) {
        fail(
          `module "${id}": governingSources names "${source}", a provider-specific ` +
            'instruction surface. ADR-0014 makes those subordinate projections, never ' +
            'canonical sources — promote the rule to a provider-neutral governed ' +
            'contract and cite that instead',
        )
      }
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
      if (!(field in s)) {
        fail(`set "${id}": missing required field "${field}"`)
        continue
      }
      const value = s[field]
      if (value === null && NULLABLE_WHILE_PLANNED.has(field)) continue
      if (value === null || value === undefined || value === '') {
        fail(`set "${id}": field "${field}" is empty — say what it is or why it is unknown`)
      }
    }
    if (s.runnerClass && !RUNNER_CLASSES.has(s.runnerClass)) {
      fail(`set "${id}": runnerClass "${s.runnerClass}" is not a known runner class`)
    }
    // POST-ADR-0019: a family carries no lifecycle, version, or rollout authority.
    //
    // A mutable row holding "the current release version" stops representing
    // 1.0.0 the moment 1.1.0 exists, which is the historical-identity defect
    // ADR-0019 exists to prevent. Lifecycle and eligibility belong to immutable
    // release records; the family is authoring intent.
    for (const legacy of ['status', 'version', 'asOf', 'blockedByRollout']) {
      if (legacy in s) {
        fail(
          `set "${id}": carries legacy family field "${legacy}". Under ADR-0019 a set ` +
            'family holds no lifecycle, version, or rollout authority — those live on ' +
            'immutable release records in knowledge/set-releases.json',
        )
      }
    }
    if (s.sensitivity && !sensitivities.has(s.sensitivity)) {
      fail(`set "${id}": sensitivity "${s.sensitivity}" is not in the sensitivity vocabulary`)
    }
    // A NON-IDENTITY READINESS MIRROR (ADR-0019 §10a option A).
    //
    // It is repository-wide toolchain readiness reflected onto the family, never
    // release identity and never per-release eligibility. It does not enter a
    // release manifest and it authorizes nothing.
    if (s.blockedByToolchain !== false) {
      fail(
        `set "${id}": blockedByToolchain must be false — the ADR-0015 §12 obligation was ` +
          'discharged on 2026-08-16. Re-blocking is an explicit reviewed transition too',
      )
    }
    for (const source of s.governingSources ?? []) {
      const pathProblem = canonicalPathProblem(source)
      if (pathProblem !== undefined) {
        fail(
          `set "${id}": governingSources names "${source}", which ${pathProblem}. ` +
            'It must be a canonical repository path — repository-relative, POSIX, ' +
            'normalized — so one file has exactly one spelling and cannot evade ' +
            'classification by alias',
        )
        continue
      }
      const absolute = join(root, source)
      const aliased = aliasedComponent(root, source)
      if (aliased !== undefined) {
        fail(
          `set "${id}": governingSources names "${source}", whose component ` +
            `"${aliased}" is a symbolic link. A governing source must be a real repository ` +
            'file in every component: an alias is classified by its own spelling, so a ' +
            'neutral-looking path could resolve to a provider adapter or outside the ' +
            'repository entirely',
        )
        continue
      }
      if (existsSync(absolute) && !lstatSync(absolute).isFile()) {
        fail(
          `set "${id}": governingSources names "${source}", which is not a regular file. ` +
            'A directory governs nothing',
        )
        continue
      }
      if (isProviderSurface(source)) {
        fail(
          `set "${id}": governingSources names "${source}", a provider-specific ` +
            'instruction surface. ADR-0014 makes those subordinate projections, never ' +
            'canonical sources — promote the rule to a provider-neutral governed ' +
            'contract and cite that instead',
        )
      }
      if (!existsSync(join(root, source))) {
        fail(`set "${id}": governingSources names "${source}", which does not exist`)
      }
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

    // A set version is what a profile pins (`name@version`) and what run
    // evidence records. Pinning a version whose modules have none would be a
    // pin to nothing: two runs of `set@1` could resolve to different content
    // and both look correct in evidence. So a set may carry a version only once
    // everything it selects has one.
    // The member-identity precondition now lives where releases are built
    // (ADR-0019 §6): a family carries no version, so there is nothing here that
    // could pin an unversioned module.

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

    // SCOPED TO THIS MODULE'S GATE, not to the repository's era.
    //
    // While `blockedByToolchain` is true the directory is specification-only
    // and authored content is a finding. Once that gate is discharged, candidate
    // source is exactly what belongs here — and `check-knowledge-content.mjs` is
    // what evaluates it, because a registry checker owns no content rules and
    // must not pretend to. Leaving this unconditional would make the registry a
    // second, weaker authority over content the moment authoring opened.
    const entries = readdirSync(dir)
    const extra = entries.filter((e) => e !== 'README.md')
    if (m.blockedByToolchain === true && extra.length > 0) {
      fail(
        `module "${m.id}": specification directory contains ${JSON.stringify(extra)} — ` +
          'only README.md is permitted while blockedByToolchain is true',
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

    const section = governingSection(text)
    if (section === undefined) {
      fail(
        `module "${m.id}": README has no "## Governing sources" section. The catalog ` +
          'names what governs this module; the README must state the same thing',
      )
    } else {
      const stated = readmeGoverningSources(section, m.id)
      const declared = new Set(m.governingSources ?? [])
      for (const source of declared) {
        if (!stated.has(source)) {
          fail(
            `module "${m.id}": README "Governing sources" omits "${source}", which the ` +
              'catalog declares. The prose view must not understate what governs the module',
          )
        }
      }
      for (const source of stated) {
        if (!declared.has(source)) {
          fail(
            `module "${m.id}": README "Governing sources" links "${source}", which the ` +
              'catalog does not declare. The catalog is the metadata authority',
          )
        }
      }
    }

    const ipv4 = IPV4.exec(text)
    if (ipv4) fail(`module "${m.id}": README contains a network address (${ipv4[0]})`)
    const mac = MAC.exec(text)
    if (mac) fail(`module "${m.id}": README contains a hardware address (${mac[0]})`)
  }

  // --- 7c. SET RELEASE REGISTRY (ADR-0019) -----------------------------------
  //
  // A THIRD vocabulary, deliberately kept apart from module registry rules and
  // set-family rules. One vocabulary silently serving all three is how a rule
  // written for modules ends up deciding a composition.
  //
  // This validates REGISTRY COHERENCE only. Whether the manifest bytes are
  // canonical, and whether the digest is right, is the toolchain's question —
  // `check-knowledge-content.mjs` asks it, exactly as content admission is
  // asked there rather than here.
  const releasesPath = join(knowledgeRoot, 'set-releases.json')
  const releaseDir = join(knowledgeRoot, 'releases')
  if (!existsSync(releasesPath)) {
    fail('knowledge/set-releases.json is missing — the set release registry must exist, even empty')
  } else {
    let registry
    try {
      registry = JSON.parse(readFileSync(releasesPath, 'utf8'))
    } catch (error) {
      fail(`knowledge/set-releases.json is not valid JSON — ${error.message}`)
      registry = undefined
    }
    if (registry !== undefined) {
      if (registry.version !== 1) {
        fail('knowledge/set-releases.json: "version" must be exactly 1')
      }
      const releases = registry.releases
      if (!Array.isArray(releases)) {
        fail('knowledge/set-releases.json: "releases" must be an array')
      } else {
        const seen = new Set()
        for (const r of releases) {
          const rid = `${r?.familyId ?? '(unnamed)'}@${r?.version ?? '?'}`
          if (!setIds.has(r?.familyId)) {
            fail(`release "${rid}": familyId names no registered set family`)
          }
          if (typeof r?.version !== 'string' || !RELEASE_VERSION.test(r.version)) {
            fail(`release "${rid}": version must be DIGIT+.DIGIT+.DIGIT+`)
          }
          // (familyId, version) is unique and immutable FOREVER — a reused
          // version would make an old run's evidence ambiguous, which is the one
          // thing release identity exists to prevent.
          if (seen.has(rid)) fail(`release "${rid}": (familyId, version) is already used`)
          seen.add(rid)
          const expected = `knowledge/releases/${r?.familyId}@${r?.version}.manifest`
          if (r?.manifestPath !== expected) {
            fail(`release "${rid}": manifestPath must be "${expected}"`)
          }
          const abs = join(root, expected)
          if (aliasedComponent(root, expected) !== undefined) {
            fail(`release "${rid}": manifest path resolves through a symbolic link`)
          } else if (!existsSync(abs)) {
            fail(`release "${rid}": manifest "${expected}" does not exist`)
          } else if (!statSync(abs).isFile()) {
            fail(`release "${rid}": manifest "${expected}" is not a regular file`)
          }
          if (
            typeof r?.releaseDigest !== 'string' ||
            !/^sha256:[0-9a-f]{64}$/.test(r.releaseDigest)
          ) {
            fail(`release "${rid}": releaseDigest must be "sha256:" + 64 lowercase hex`)
          }
          if (!RELEASE_STATES.has(r?.state)) {
            fail(`release "${rid}": state must be Released, Deprecated, or Retired`)
          }
          if ('blockedByRollout' in (r ?? {}) || 'blockedByToolchain' in (r ?? {})) {
            fail(
              `release "${rid}": carries a gate boolean. Under ADR-0019 "Released" IS the ` +
                'eligibility; a second authority could disagree with the state',
            )
          }
          const review = r?.releaseReview
          if (review === undefined || review === null) {
            fail(`release "${rid}": releaseReview is absent`)
          } else {
            if (review.policy !== RELEASE_REVIEW_POLICY) {
              fail(`release "${rid}": releaseReview.policy must be "${RELEASE_REVIEW_POLICY}"`)
            }
            if (typeof review.by !== 'string' || !RELEASE_ACTOR.test(review.by)) {
              fail(`release "${rid}": releaseReview.by is not a governed human actor`)
            }
            // SHAPE only. Whether it is a real instant is the package's rule,
            // reported by check-set-releases.mjs — one calendar authority.
            if (typeof review.at !== 'string' || !RELEASE_INSTANT.test(review.at)) {
              fail(`release "${rid}": releaseReview.at is not a UTC timestamp`)
            }
            if (review.releaseDigest !== r?.releaseDigest) {
              fail(`release "${rid}": releaseReview.releaseDigest does not bind this release`)
            }
          }
        }
        // BOTH DIRECTIONS. A manifest with no record is a release nobody
        // reviewed; a record with no manifest is an identity with no content.
        if (existsSync(releaseDir)) {
          for (const entry of readdirSync(releaseDir)) {
            // The directory README is its specification, exactly as a module
            // directory's README is. It is never a release.
            if (entry === 'README.md') continue
            if (!entry.endsWith('.manifest')) {
              fail(`knowledge/releases/${entry} is not a .manifest file`)
              continue
            }
            const wanted = `knowledge/releases/${entry}`
            if (!releases.some((r) => r?.manifestPath === wanted)) {
              fail(`knowledge/releases/${entry} has no release record in set-releases.json`)
            }
          }
        }
      }
    }
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
    // Reverse, module-shaped: a `group/name` token anywhere in the index must
    // be registered. Unambiguous, because a module id always contains a slash.
    for (const [, quoted] of index.matchAll(/`([a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)`/g)) {
      if (!moduleIds.has(quoted)) {
        fail(`knowledge/INDEX.md presents "${quoted}" as a module, but it is not registered`)
      }
    }

    // Reverse, set-shaped: a set id has NO slash, so it cannot be recognised by
    // shape — `Planned`, `warn`, and `catalog.json` are all backticked in this
    // document too. Scanning the whole file for bare identifiers would either
    // miss fake sets or reject ordinary prose.
    //
    // So the check is scoped to the table that presents them. Inside the
    // `## Sets` section, the first cell of every table row names a set, and
    // that is the claim being validated: nothing may be advertised there that
    // is not registered, and nothing registered may be missing from it.
    const sections = new Map()
    let current = null
    for (const line of index.split('\n')) {
      const heading = /^##\s+(.+?)\s*$/.exec(line)
      if (heading) {
        current = heading[1]
        sections.set(current, [])
        continue
      }
      if (current) sections.get(current).push(line)
    }

    const setsSection = sections.get('Sets')
    if (!setsSection) {
      fail(
        'knowledge/INDEX.md has no "## Sets" section — registered sets must be presented somewhere checkable',
      )
    } else {
      const advertised = new Set()
      for (const line of setsSection) {
        // `| \`set-id\` | ... |`, optionally wrapped in a link.
        const row = /^\|\s*\[?`([a-z][a-z0-9-]*)`/.exec(line)
        if (row) advertised.add(row[1])
      }
      for (const advertisedId of advertised) {
        if (!setIds.has(advertisedId)) {
          fail(
            `knowledge/INDEX.md advertises set "${advertisedId}" in its Sets table, ` +
              'but it is not registered in catalog.json',
          )
        }
      }
      for (const id of setIds) {
        if (!advertised.has(id)) {
          fail(
            `knowledge/INDEX.md does not present registered set "${id}" as a row in its Sets table`,
          )
        }
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

  console.log(`✓ knowledge registry — ${modules} module(s), ${sets} set(s)`)
}
