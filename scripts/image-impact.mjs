#!/usr/bin/env node
/**
 * Deterministic governed-image impact analysis.
 *
 * The GitHub workflow's path filter is deliberately broad. This classifier is
 * the narrower proof: compare a trusted commit with the candidate, derive image
 * definitions/parents/platforms from image-lock.yaml, derive local build inputs
 * from Dockerfile COPY/ADD instructions, and compare the few repository-wide
 * semantic values named by the gates-toolchain inventory.
 *
 * A path is skippable only when the derived model proves that no governed image
 * consumes it. Anything unreadable, malformed, unresolved, or ambiguous emits
 * IMAGE_IMPACT_UNKNOWN and selects the full candidate inventory.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, realpathSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  dockerfileInstructions,
  gatePinsFromSources,
  parseCopySources,
  parsePlainLock,
} from './check-images.mjs'

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const LOCK_PATH = 'deploy/images/image-lock.yaml'
const CLOSURE_PATH = 'deploy/images/debian-closure.lock.json'
const CHECKS_PATH = '.github/workflows/checks.yml'
const PACKAGE_PATH = 'package.json'
const SENTINEL = 'pending-first-governed-build'
const DIGEST = /^sha256:[0-9a-f]{64}$/
const PLATFORMS = new Set(['linux/amd64', 'linux/arm64'])

const GLOBAL_BUILD_INPUTS = new Set([
  '.github/workflows/images.yml',
  'scripts/check-images.mjs',
  'scripts/image-impact.mjs',
  'deploy/images/scripts/build.sh',
  'deploy/images/scripts/build-plan.mjs',
  'deploy/images/scripts/verify.sh',
])

const KNOWN_NON_BUILD_IMAGE_FILES = new Set([
  'deploy/images/scripts/inspect.sh',
  'deploy/images/scripts/README.md',
])

const GATE_SOURCE_KEYS = new Map([
  ['checks.yml NODE_VERSION', 'node'],
  ['checks.yml UV_VERSION', 'uv'],
  ['package.json packageManager', 'pnpm'],
])

class ImpactUnknown extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImpactUnknown'
  }
}

const gitExecutable = () => process.env.IMAGE_IMPACT_GIT ?? 'git'

const git = (root, args, options = {}) =>
  execFileSync(gitExecutable(), args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })

const normalizeRepoPath = (path) => {
  const normalized = posix.normalize(String(path).replaceAll('\\', '/'))
  return normalized === '.' ? '' : normalized.replace(/^\.\/+/, '')
}

const resolveCommit = (root, ref, label) => {
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new ImpactUnknown(`${label} is empty`)
  }
  try {
    const sha = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim()
    if (!/^[0-9a-f]{40,64}$/.test(sha)) {
      throw new Error(`unexpected rev-parse output ${JSON.stringify(sha)}`)
    }
    return sha
  } catch (error) {
    throw new ImpactUnknown(`${label} "${ref}" cannot be resolved to a commit: ${error.message}`)
  }
}

const objectAtRevision = (root, revision, path) => {
  try {
    git(root, ['cat-file', '-e', `${revision}:${path}`])
  } catch {
    return undefined
  }
  try {
    return git(root, ['show', `${revision}:${path}`])
  } catch (error) {
    throw new ImpactUnknown(`cannot read ${path} at ${revision}: ${error.message}`)
  }
}

const objectTypeAtRevision = (root, revision, path) => {
  try {
    return git(root, ['cat-file', '-t', `${revision}:${path}`]).trim()
  } catch {
    return undefined
  }
}

const readLockAtRevision = (root, revision) => {
  const text = objectAtRevision(root, revision, LOCK_PATH)
  if (text === undefined) throw new ImpactUnknown(`${LOCK_PATH} is missing at ${revision}`)
  const parsed = parsePlainLock(text)
  if (parsed.problems !== undefined) {
    throw new ImpactUnknown(
      `${LOCK_PATH} is malformed at ${revision}: ${parsed.problems.join('; ')}`,
    )
  }
  return parsed.lock
}

const graphFromLock = (lock, revision) => {
  if (
    lock === null ||
    typeof lock !== 'object' ||
    Object.keys(lock).join(',') !== 'version,images' ||
    lock.version !== '1' ||
    !Array.isArray(lock.images) ||
    lock.images.length === 0
  ) {
    throw new ImpactUnknown(`${LOCK_PATH} at ${revision} has no governed image inventory`)
  }

  const ordered = []
  const byName = new Map()
  for (const image of lock.images) {
    const expectedKeys = {
      'runner-base': [
        'name',
        'lineage',
        'definition',
        'platforms',
        'external_base',
        'digest',
        'manifests',
      ],
      'runner-derived': [
        'name',
        'lineage',
        'definition',
        'platforms',
        'parent',
        'parent_digest',
        'runtime',
        'digest',
        'manifests',
      ],
      'gates-toolchain': [
        'name',
        'lineage',
        'definition',
        'platforms',
        'external_base',
        'digest',
        'manifests',
      ],
    }[image?.lineage]
    if (
      image === null ||
      typeof image !== 'object' ||
      typeof image.name !== 'string' ||
      typeof image.definition !== 'string' ||
      expectedKeys === undefined ||
      Object.keys(image).join(',') !== expectedKeys.join(',') ||
      !Array.isArray(image.platforms) ||
      image.platforms.length === 0 ||
      !image.platforms.every((platform) => PLATFORMS.has(platform)) ||
      typeof image.digest !== 'string' ||
      (image.digest !== SENTINEL && !DIGEST.test(image.digest)) ||
      !Array.isArray(image.manifests) ||
      image.manifests.length !== image.platforms.length ||
      !image.manifests.every(
        (manifest, index) =>
          manifest !== null &&
          typeof manifest === 'object' &&
          Object.keys(manifest).join(',') === 'platform,digest' &&
          manifest.platform === image.platforms[index] &&
          typeof manifest.digest === 'string' &&
          (manifest.digest === SENTINEL || DIGEST.test(manifest.digest)),
      )
    ) {
      throw new ImpactUnknown(`${LOCK_PATH} at ${revision} has a malformed image entry`)
    }
    if (image.lineage === 'runner-derived') {
      if (
        typeof image.parent !== 'string' ||
        typeof image.parent_digest !== 'string' ||
        (image.parent_digest !== SENTINEL && !DIGEST.test(image.parent_digest)) ||
        image.runtime === null ||
        typeof image.runtime !== 'object' ||
        Object.keys(image.runtime).join(',') !== 'name,package,version,integrity' ||
        !Object.values(image.runtime).every((value) => typeof value === 'string')
      ) {
        throw new ImpactUnknown(`${LOCK_PATH} at ${revision} has malformed derived metadata`)
      }
    } else if (
      image.external_base === null ||
      typeof image.external_base !== 'object' ||
      Object.keys(image.external_base).join(',') !== 'reference,digest' ||
      typeof image.external_base.reference !== 'string' ||
      !DIGEST.test(image.external_base.digest)
    ) {
      throw new ImpactUnknown(`${LOCK_PATH} at ${revision} has malformed external-base metadata`)
    }
    if (byName.has(image.name)) {
      throw new ImpactUnknown(`${LOCK_PATH} at ${revision} registers ${image.name} more than once`)
    }
    ordered.push(image.name)
    byName.set(image.name, image)
  }

  const children = new Map(ordered.map((name) => [name, []]))
  for (const image of lock.images) {
    if (image.lineage !== 'runner-derived') continue
    if (typeof image.parent !== 'string' || !byName.has(image.parent)) {
      throw new ImpactUnknown(
        `${image.name} names missing governed dependency ${JSON.stringify(image.parent)}`,
      )
    }
    children.get(image.parent).push(image.name)
  }

  const visiting = new Set()
  const visited = new Set()
  const visit = (name, path) => {
    if (visiting.has(name)) {
      throw new ImpactUnknown(`image dependency cycle: ${[...path, name].join(' -> ')}`)
    }
    if (visited.has(name)) return
    visiting.add(name)
    for (const child of children.get(name)) visit(child, [...path, name])
    visiting.delete(name)
    visited.add(name)
  }
  for (const name of ordered) visit(name, [])

  return { lock, ordered, byName, children }
}

const parseChangedEntries = (output) => {
  const fields = output.split('\0')
  if (fields.at(-1) === '') fields.pop()
  const entries = []
  for (let at = 0; at < fields.length;) {
    const status = fields[at]
    at += 1
    if (!/^[ACDMRTUXB][0-9]*$/.test(status)) {
      throw new ImpactUnknown(`git diff returned unrecognized status ${JSON.stringify(status)}`)
    }
    if (/^[RC]/.test(status)) {
      const before = fields[at]
      const after = fields[at + 1]
      if (before === undefined || after === undefined) {
        throw new ImpactUnknown(`git diff returned an incomplete ${status} record`)
      }
      entries.push({ status, before: normalizeRepoPath(before), after: normalizeRepoPath(after) })
      at += 2
    } else {
      const path = fields[at]
      if (path === undefined)
        throw new ImpactUnknown(`git diff returned an incomplete ${status} record`)
      const normalized = normalizeRepoPath(path)
      entries.push({ status, before: normalized, after: normalized })
      at += 1
    }
  }
  return entries
}

const changedEntries = (root, base, head) => {
  try {
    return parseChangedEntries(
      git(root, ['diff', '--name-status', '-z', '--find-renames', base, head, '--']),
    )
  } catch (error) {
    if (error instanceof ImpactUnknown) throw error
    throw new ImpactUnknown(`git diff ${base} ${head} failed: ${error.message}`)
  }
}

const localBuildInputs = (root, revision, graph) => {
  const inputs = new Map()
  for (const name of graph.ordered) {
    const image = graph.byName.get(name)
    const definition = normalizeRepoPath(image.definition)
    const context = normalizeRepoPath(posix.dirname(definition))
    const dockerfile = objectAtRevision(root, revision, definition)
    if (dockerfile === undefined) {
      throw new ImpactUnknown(`${name} definition ${definition} is missing at ${revision}`)
    }

    const exact = new Set([definition, `${context}/.dockerignore`])
    const prefixes = new Set()
    for (const instruction of dockerfileInstructions(dockerfile)) {
      const logical = instruction.trim()
      if (!/^(COPY|ADD)\s/i.test(logical)) continue
      const parsed = parseCopySources(logical)
      if (parsed.error !== undefined) {
        throw new ImpactUnknown(`${definition} has an unclassifiable ${logical}: ${parsed.error}`)
      }
      if (parsed.fromValue !== undefined) continue
      for (const rawSource of parsed.sources) {
        let source = normalizeRepoPath(rawSource)
        if (source === '') {
          prefixes.add(`${context}/`)
          continue
        }
        if (
          source.startsWith('/') ||
          source.split('/').includes('..') ||
          /^[a-z][a-z0-9+.-]*:\/\//i.test(source)
        ) {
          throw new ImpactUnknown(
            `${definition} has ambiguous local input ${JSON.stringify(rawSource)}`,
          )
        }
        const full = normalizeRepoPath(posix.join(context, source))
        if (/[*?[]/.test(source)) {
          // A glob is still classifiable without implementing a second
          // Dockerignore/glob engine: every change in this image's context is
          // conservatively treated as input.
          prefixes.add(`${context}/`)
          continue
        }
        const type = objectTypeAtRevision(root, revision, full)
        if (type === undefined) {
          throw new ImpactUnknown(`${definition} copies missing input ${full} at ${revision}`)
        }
        if (type === 'tree') prefixes.add(`${full}/`)
        else exact.add(full)
      }
    }

    if (image.lineage === 'gates-toolchain') {
      exact.add(definition.replace(/Dockerfile$/, 'toolchain.json'))
    }
    inputs.set(name, { context, exact, prefixes })
  }
  return inputs
}

const toolchainSources = (root, revision, graph) => {
  const sources = new Set()
  const gates = []
  for (const name of graph.ordered) {
    const image = graph.byName.get(name)
    if (image.lineage !== 'gates-toolchain') continue
    gates.push(name)
    const inventoryPath = image.definition.replace(/Dockerfile$/, 'toolchain.json')
    const inventoryText = objectAtRevision(root, revision, inventoryPath)
    if (inventoryText === undefined) {
      throw new ImpactUnknown(`${inventoryPath} is missing at ${revision}`)
    }
    let inventory
    try {
      inventory = JSON.parse(inventoryText)
    } catch (error) {
      throw new ImpactUnknown(`${inventoryPath} is malformed at ${revision}: ${error.message}`)
    }
    if (!Array.isArray(inventory.tools)) {
      throw new ImpactUnknown(`${inventoryPath} has no tools list at ${revision}`)
    }
    if (inventory.tools.length === 0) {
      throw new ImpactUnknown(`${inventoryPath} has an empty tools list at ${revision}`)
    }
    for (const tool of inventory.tools) {
      if (tool === null || typeof tool !== 'object') {
        throw new ImpactUnknown(`${inventoryPath} has a malformed tool entry at ${revision}`)
      }
      if (tool.versionSource === undefined) continue
      if (typeof tool.versionSource !== 'string') {
        throw new ImpactUnknown(`${inventoryPath} has a malformed versionSource at ${revision}`)
      }
      if (!GATE_SOURCE_KEYS.has(tool.versionSource)) {
        throw new ImpactUnknown(
          `${inventoryPath} names unknown semantic source ${JSON.stringify(tool.versionSource)}`,
        )
      }
      sources.add(tool.versionSource)
    }
  }
  return { sources, gates }
}

const gatePinsAtRevision = (root, revision) => {
  const checks = objectAtRevision(root, revision, CHECKS_PATH)
  const manifest = objectAtRevision(root, revision, PACKAGE_PATH)
  if (checks === undefined || manifest === undefined) {
    throw new ImpactUnknown(
      `cannot extract governed gate pins at ${revision}: ${CHECKS_PATH} or ${PACKAGE_PATH} is missing`,
    )
  }
  const pins = gatePinsFromSources(checks, manifest)
  if (pins === undefined) {
    throw new ImpactUnknown(
      `semantic extraction failed at ${revision}: NODE_VERSION, UV_VERSION, or packageManager is unparseable`,
    )
  }
  return pins
}

const validateClosureAtRevision = (root, revision) => {
  const text = objectAtRevision(root, revision, CLOSURE_PATH)
  if (text === undefined) throw new ImpactUnknown(`${CLOSURE_PATH} is missing at ${revision}`)
  let closure
  try {
    closure = JSON.parse(text)
  } catch (error) {
    throw new ImpactUnknown(`${CLOSURE_PATH} is malformed at ${revision}: ${error.message}`)
  }
  if (closure?.version !== 1 || !Array.isArray(closure.artifacts)) {
    throw new ImpactUnknown(`${CLOSURE_PATH} has no version-1 artifacts list at ${revision}`)
  }
  const fields = [
    'package',
    'version',
    'architecture',
    'component',
    'filename',
    'url',
    'sha256',
    'size',
  ]
  if (
    closure.artifacts.length === 0 ||
    !closure.artifacts.every(
      (artifact) =>
        artifact !== null &&
        typeof artifact === 'object' &&
        fields.every((field) => Object.hasOwn(artifact, field)) &&
        fields
          .filter((field) => field !== 'size')
          .every((field) => typeof artifact[field] === 'string') &&
        Number.isInteger(artifact.size) &&
        artifact.size > 0,
    )
  ) {
    throw new ImpactUnknown(`${CLOSURE_PATH} has malformed artifact metadata at ${revision}`)
  }
}

const matchesInput = (path, input) =>
  input.exact.has(path) || [...input.prefixes].some((prefix) => path.startsWith(prefix))

const inImageContext = (path, inputs) =>
  [...inputs.values()].some(({ context }) => path === context || path.startsWith(`${context}/`))

const addReason = (reasons, name, reason) => {
  if (!reasons.has(name)) reasons.set(name, new Set())
  reasons.get(name).add(reason)
}

const lockEntryImpacts = (baseGraph, headGraph, reasons) => {
  const baseNames = new Set(baseGraph.ordered)
  const headNames = new Set(headGraph.ordered)
  if (baseNames.size !== headNames.size || [...baseNames].some((name) => !headNames.has(name))) {
    for (const name of headGraph.ordered) addReason(reasons, name, 'governed inventory changed')
    return
  }
  for (const name of headGraph.ordered) {
    const before = baseGraph.byName.get(name)
    const after = headGraph.byName.get(name)
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      addReason(reasons, name, `${LOCK_PATH} entry changed`)
    }
  }
}

const transitiveClosure = (graph, directReasons) => {
  const selected = new Set(directReasons.keys())
  const transitive = new Map()
  const queue = [...directReasons.keys()]
  while (queue.length > 0) {
    const parent = queue.shift()
    for (const child of graph.children.get(parent) ?? []) {
      if (selected.has(child)) continue
      selected.add(child)
      transitive.set(child, parent)
      queue.push(child)
    }
  }
  return {
    affected: graph.ordered.filter((name) => selected.has(name)),
    transitive,
  }
}

const validateCandidateCheckout = (root, head) => {
  const checkout = resolveCommit(root, 'HEAD', 'candidate checkout')
  if (checkout !== head) {
    throw new ImpactUnknown(
      `candidate checkout ${checkout} does not equal requested head ${head}; refusing mixed-revision analysis`,
    )
  }
}

const allResult = ({ base, head, graph, changed = [], reason }) => ({
  decision: 'unknown',
  marker: 'IMAGE_IMPACT_UNKNOWN',
  selectionMode: 'all',
  buildRequired: true,
  base,
  head,
  changed,
  direct: [],
  affected: graph?.ordered ?? [],
  inventory: graph?.ordered ?? [],
  platforms:
    graph === undefined
      ? {}
      : Object.fromEntries(graph.ordered.map((name) => [name, graph.byName.get(name).platforms])),
  reasons: {},
  unknownReasons: [reason],
  pathNotes: [],
})

export function analyzeImageImpact({ root = DEFAULT_ROOT, base, head = 'HEAD', forceAll } = {}) {
  const absoluteRoot = resolve(root)
  let headSha
  let headGraph
  let entries = []

  try {
    headSha = resolveCommit(absoluteRoot, head, 'candidate head')
    const headLock = readLockAtRevision(absoluteRoot, headSha)
    headGraph = graphFromLock(headLock, headSha)
    validateCandidateCheckout(absoluteRoot, headSha)

    if (forceAll !== undefined) {
      return allResult({
        base: base ?? '(none)',
        head: headSha,
        graph: headGraph,
        reason: forceAll,
      })
    }

    const baseSha = resolveCommit(absoluteRoot, base, 'comparison base')
    const baseLock = readLockAtRevision(absoluteRoot, baseSha)
    const baseGraph = graphFromLock(baseLock, baseSha)
    const baseInputs = localBuildInputs(absoluteRoot, baseSha, baseGraph)
    const headInputs = localBuildInputs(absoluteRoot, headSha, headGraph)
    const baseToolchain = toolchainSources(absoluteRoot, baseSha, baseGraph)
    const headToolchain = toolchainSources(absoluteRoot, headSha, headGraph)
    entries = changedEntries(absoluteRoot, baseSha, headSha)

    const changedPaths = new Set()
    for (const entry of entries) {
      changedPaths.add(entry.before)
      changedPaths.add(entry.after)
    }

    const directReasons = new Map()
    const pathNotes = []
    const unknownReasons = []
    const allNames = headGraph.ordered
    const allDirect = (reason) => {
      for (const name of allNames) addReason(directReasons, name, reason)
    }

    if (changedPaths.has(LOCK_PATH)) {
      lockEntryImpacts(baseGraph, headGraph, directReasons)
      if (directReasons.size === 0) {
        pathNotes.push(`${LOCK_PATH}: comments/representation changed; semantic lock unchanged`)
      }
    }

    const semanticSources = new Set([...baseToolchain.sources, ...headToolchain.sources])
    let basePins
    let headPins
    const semanticPins = () => {
      basePins ??= gatePinsAtRevision(absoluteRoot, baseSha)
      headPins ??= gatePinsAtRevision(absoluteRoot, headSha)
      return { basePins, headPins }
    }

    for (const entry of entries) {
      for (const path of new Set([entry.before, entry.after])) {
        if (path === LOCK_PATH) continue

        if (GLOBAL_BUILD_INPUTS.has(path)) {
          allDirect(`${path} changes governed build or verification behavior`)
          continue
        }
        if (path === CLOSURE_PATH) {
          try {
            validateClosureAtRevision(absoluteRoot, baseSha)
            validateClosureAtRevision(absoluteRoot, headSha)
            allDirect(`${CLOSURE_PATH} changes the shared reviewed package authority`)
          } catch (error) {
            unknownReasons.push(error.message)
          }
          continue
        }
        if (path === PACKAGE_PATH) {
          if (!semanticSources.has('package.json packageManager')) {
            pathNotes.push(`${path}: no governed tool declares it as a version source`)
            continue
          }
          try {
            const pins = semanticPins()
            if (pins.basePins.pnpm !== pins.headPins.pnpm) {
              for (const name of headToolchain.gates) {
                addReason(
                  directReasons,
                  name,
                  `packageManager pnpm version changed ${pins.basePins.pnpm} -> ${pins.headPins.pnpm}`,
                )
              }
            } else {
              pathNotes.push(
                `${path}: consumed pnpm version unchanged (${pins.headPins.pnpm}); other fields are not image inputs`,
              )
            }
          } catch (error) {
            unknownReasons.push(error.message)
          }
          continue
        }
        if (path === CHECKS_PATH) {
          try {
            const pins = semanticPins()
            const changedPins = []
            for (const source of semanticSources) {
              if (!source.startsWith('checks.yml ')) continue
              const key = GATE_SOURCE_KEYS.get(source)
              if (pins.basePins[key] !== pins.headPins[key]) {
                changedPins.push(`${source}: ${pins.basePins[key]} -> ${pins.headPins[key]}`)
              }
            }
            if (changedPins.length > 0) {
              for (const name of headToolchain.gates) {
                for (const reason of changedPins) addReason(directReasons, name, reason)
              }
            } else {
              pathNotes.push(
                `${path}: consumed NODE_VERSION/UV_VERSION values unchanged; other workflow bytes are not image inputs`,
              )
            }
          } catch (error) {
            unknownReasons.push(error.message)
          }
          continue
        }
        if (path === 'scripts/check.sh') {
          pathNotes.push(
            `${path}: gate behavior is mounted at execution time and is not copied into the gates image`,
          )
          continue
        }

        const matched = new Set()
        for (const [name, input] of baseInputs) if (matchesInput(path, input)) matched.add(name)
        for (const [name, input] of headInputs) if (matchesInput(path, input)) matched.add(name)
        if (matched.size > 0) {
          for (const name of matched) {
            if (headGraph.byName.has(name))
              addReason(directReasons, name, `${path} is a derived build input`)
            else allDirect(`${path} belonged to removed governed image ${name}`)
          }
          continue
        }

        if (KNOWN_NON_BUILD_IMAGE_FILES.has(path) || path.endsWith('/README.md')) {
          pathNotes.push(
            `${path}: documentation/inspection only; not consumed by image construction`,
          )
          continue
        }
        if (path.startsWith('deploy/images/scripts/')) {
          unknownReasons.push(`${path} is unclassified governed image tooling`)
          continue
        }
        if (path.startsWith('deploy/images/')) {
          if (inImageContext(path, baseInputs) || inImageContext(path, headInputs)) {
            pathNotes.push(
              `${path}: inside an image context but not selected by Dockerfile COPY/ADD`,
            )
          } else {
            unknownReasons.push(`${path} is an unclassified shared governed-image input`)
          }
          continue
        }

        pathNotes.push(`${path}: outside every derived governed-image input boundary`)
      }
    }

    if (unknownReasons.length > 0) {
      return {
        ...allResult({
          base: baseSha,
          head: headSha,
          graph: headGraph,
          changed: entries,
          reason: unknownReasons[0],
        }),
        unknownReasons,
        pathNotes,
      }
    }

    const { affected, transitive } = transitiveClosure(headGraph, directReasons)
    const reasons = {}
    for (const name of headGraph.ordered) {
      if (directReasons.has(name)) reasons[name] = [...directReasons.get(name)]
      else if (transitive.has(name)) reasons[name] = [`depends on impacted ${transitive.get(name)}`]
    }

    return {
      decision: affected.length === 0 ? 'none' : 'affected',
      marker:
        affected.length === 0 ? 'IMAGE_IMPACT_NONE' : `IMAGE_IMPACT_AFFECTED=${affected.join(',')}`,
      selectionMode: affected.length === 0 ? 'none' : 'selected',
      buildRequired: affected.length > 0,
      base: baseSha,
      head: headSha,
      changed: entries,
      direct: headGraph.ordered.filter((name) => directReasons.has(name)),
      affected,
      inventory: headGraph.ordered,
      platforms: Object.fromEntries(
        affected.map((name) => [name, headGraph.byName.get(name).platforms]),
      ),
      reasons,
      unknownReasons: [],
      pathNotes,
    }
  } catch (error) {
    const reason =
      error instanceof ImpactUnknown ? error.message : `classifier failure: ${error.stack}`
    if (headGraph === undefined && typeof base === 'string' && base !== '') {
      try {
        const fallbackBase = resolveCommit(absoluteRoot, base, 'comparison base')
        headGraph = graphFromLock(readLockAtRevision(absoluteRoot, fallbackBase), fallbackBase)
      } catch {
        // The selection mode remains `all`; an unavailable fallback inventory
        // is diagnostic only and can never turn UNKNOWN into a skip.
      }
    }
    return allResult({
      base: base ?? '(unresolved)',
      head: headSha ?? head,
      graph: headGraph,
      changed: entries,
      reason,
    })
  }
}

const displayChanged = (entry) =>
  entry.before === entry.after
    ? `${entry.status} ${entry.after}`
    : `${entry.status} ${entry.before} -> ${entry.after}`

export function renderImageImpact(result) {
  const lines = [
    'Image impact analysis',
    '',
    'Comparison:',
    `  base: ${result.base}`,
    `  head: ${result.head}`,
    '',
    'Changed repository paths:',
  ]
  if (result.changed.length === 0) lines.push('  (none)')
  else for (const entry of result.changed) lines.push(`  ${displayChanged(entry)}`)

  if (result.pathNotes.length > 0) {
    lines.push('', 'Path classifications:')
    for (const note of result.pathNotes) lines.push(`  ${note}`)
  }

  lines.push('', 'Semantic impacts:')
  const imageNames = new Set(result.inventory)
  if (imageNames.size === 0) lines.push('  (governed inventory unavailable)')
  else {
    for (const name of imageNames) {
      const reasons = result.reasons[name]
      const verdict =
        reasons !== undefined
          ? reasons.join('; ')
          : result.decision === 'unknown'
            ? 'UNKNOWN (selected fail-closed)'
            : 'NO'
      lines.push(`  ${name}: ${verdict}`)
    }
  }

  if (result.unknownReasons.length > 0) {
    lines.push('', 'Fail-closed reasons:')
    for (const reason of result.unknownReasons) lines.push(`  ${reason}`)
  }

  lines.push('', 'Decision:', `  ${result.marker}`)
  if (result.decision === 'none') {
    lines.push('  Governed container build not required.')
  } else {
    lines.push(`  Direct impact: ${result.direct.join(', ') || '(unknown/full)'}`)
    lines.push(`  Transitive closure: ${result.affected.join(', ') || '(metadata unavailable)'}`)
    const platforms = [...new Set(Object.values(result.platforms).flat())]
    lines.push(`  Platforms: ${platforms.join(', ') || '(from candidate lock at build time)'}`)
  }
  return `${lines.join('\n')}\n`
}

const markdownSummary = (result) => {
  const lines = [
    '## Image impact analysis',
    '',
    `- **Comparison base:** \`${result.base}\``,
    `- **Candidate head:** \`${result.head}\``,
    `- **Decision:** \`${result.marker}\``,
  ]
  if (result.decision === 'none') {
    lines.push('- **Build:** skipped by positive semantic proof')
  } else {
    lines.push(
      `- **Selected:** ${result.affected.map((name) => `\`${name}\``).join(', ') || 'full'}`,
    )
    lines.push(
      `- **Platforms:** ${
        [...new Set(Object.values(result.platforms).flat())]
          .map((platform) => `\`${platform}\``)
          .join(', ') || 'from candidate lock'
      }`,
    )
  }
  if (result.unknownReasons.length > 0) {
    lines.push('', '### Fail-closed reasons', '')
    for (const reason of result.unknownReasons) lines.push(`- ${reason}`)
  }
  return `${lines.join('\n')}\n`
}

const appendOutputs = (path, result) => {
  const outputs = {
    decision: result.decision,
    selection_mode: result.selectionMode,
    build_required: String(result.buildRequired),
    affected_json: JSON.stringify(result.affected),
    direct_json: JSON.stringify(result.direct),
    platforms_json: JSON.stringify(result.platforms),
    comparison_base: result.base,
    candidate_head: result.head,
  }
  appendFileSync(
    path,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  )
}

const invokedDirectly = (() => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const options = new Map()
  const usage = (message) => {
    console.error(`✗ image impact — ${message}`)
    console.error(
      '    usage: image-impact.mjs --base <ref> [--head <ref>] [--root <path>] ' +
        '[--force-all <reason>] [--github-output <path>] [--summary <path>] [--json]',
    )
    process.exit(1)
  }

  for (let at = 0; at < args.length; at += 1) {
    const flag = args[at]
    if (flag === '--json') {
      if (options.has(flag)) usage(`${flag} was supplied twice`)
      options.set(flag, true)
      continue
    }
    if (
      !['--base', '--head', '--root', '--force-all', '--github-output', '--summary'].includes(flag)
    ) {
      usage(`unknown option ${JSON.stringify(flag)}`)
    }
    const value = args[at + 1]
    if (value === undefined || value.startsWith('--')) usage(`${flag} requires a value`)
    if (options.has(flag)) usage(`${flag} was supplied twice`)
    options.set(flag, value)
    at += 1
  }

  if (!options.has('--base') && !options.has('--force-all')) {
    usage('--base is required unless --force-all is supplied')
  }

  const result = analyzeImageImpact({
    root: options.get('--root') ?? DEFAULT_ROOT,
    base: options.get('--base'),
    head: options.get('--head') ?? 'HEAD',
    forceAll: options.get('--force-all'),
  })
  if (options.get('--json') === true) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else process.stdout.write(renderImageImpact(result))
  if (options.has('--github-output')) appendOutputs(options.get('--github-output'), result)
  if (options.has('--summary')) appendFileSync(options.get('--summary'), markdownSummary(result))
}
