#!/usr/bin/env node
/**
 * BuildKit Bake planning and OCI digest collection for governed images.
 *
 * The lock remains the one image inventory/dependency/platform authority.
 * This script projects a selected transitive closure into two deterministic
 * Bake phases:
 *
 *   independent roots (parallel) -> verify parent -> derived leaves (parallel)
 *
 * A derived-only selection materializes its locked parent as support, but does
 * not add siblings. Cache scopes are one-per-image because the GHA backend
 * otherwise overwrites the previous image's cache under its default scope.
 */

import { createHash } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkImages, parsePlainLock } from '../../../scripts/check-images.mjs'

const DEFAULT_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const DEFAULT_OUT =
  process.env.IMAGES_OUT ??
  (process.env.RUNNER_TEMP === undefined
    ? undefined
    : join(process.env.RUNNER_TEMP, 'secure-home-images'))
const LOCK_PATH = 'deploy/images/image-lock.yaml'
const DIGEST = /^sha256:[0-9a-f]{64}$/
const SENTINEL = 'pending-first-governed-build'

const graphFromLock = (lock) => {
  const ordered = lock.images.map((image) => image.name)
  const byName = new Map(lock.images.map((image) => [image.name, image]))
  if (byName.size !== ordered.length) throw new Error('image lock contains duplicate names')
  const children = new Map(ordered.map((name) => [name, []]))
  for (const image of lock.images) {
    if (image.lineage !== 'runner-derived') continue
    if (!byName.has(image.parent)) {
      throw new Error(`${image.name} names missing governed dependency ${image.parent}`)
    }
    children.get(image.parent).push(image.name)
  }

  const visiting = new Set()
  const visited = new Set()
  const visit = (name, path) => {
    if (visiting.has(name))
      throw new Error(`image dependency cycle: ${[...path, name].join(' -> ')}`)
    if (visited.has(name)) return
    visiting.add(name)
    for (const child of children.get(name)) visit(child, [...path, name])
    visiting.delete(name)
    visited.add(name)
  }
  for (const name of ordered) visit(name, [])
  return { ordered, byName, children }
}

const closure = (graph, requested) => {
  const selected = new Set(requested)
  const queue = [...requested]
  while (queue.length > 0) {
    const parent = queue.shift()
    for (const child of graph.children.get(parent) ?? []) {
      if (selected.has(child)) continue
      selected.add(child)
      queue.push(child)
    }
  }
  return graph.ordered.filter((name) => selected.has(name))
}

const supportAncestors = (graph, selected) => {
  const selectedSet = new Set(selected)
  const support = new Set()
  for (const name of selected) {
    let image = graph.byName.get(name)
    while (image.lineage === 'runner-derived') {
      const parent = graph.byName.get(image.parent)
      if (parent === undefined)
        throw new Error(`${image.name} has no registered parent ${image.parent}`)
      if (!selectedSet.has(parent.name)) support.add(parent.name)
      image = parent
    }
  }
  return graph.ordered.filter((name) => support.has(name))
}

const cacheScope = (name) => `secure-home-images-v1-${name}`

const targetFor = ({ image, root, out, cacheBackend, parentContext }) => {
  const definition = image.definition
  const target = {
    context: dirname(definition),
    dockerfile: basename(definition),
    platforms: image.platforms,
    args: {
      SOURCE_DATE_EPOCH: '0',
    },
    output: [`type=oci,dest=${join(out, image.name)},tar=false,rewrite-timestamp=true`],
  }
  if (parentContext !== undefined) target.contexts = { [image.parent]: parentContext }
  if (cacheBackend === 'gha') {
    const scope = cacheScope(image.name)
    target['cache-from'] = [`type=gha,scope=${scope}`]
    target['cache-to'] = [`type=gha,scope=${scope},mode=max`]
  } else if (cacheBackend !== 'none') {
    throw new Error(`unsupported cache backend ${JSON.stringify(cacheBackend)}`)
  }
  // Bake resolves relative context paths from its source directory. Keeping
  // the root in the function signature makes that assumption explicit and
  // guards accidental generation from a different checkout.
  if (!resolve(root, target.context).startsWith(`${resolve(root)}/`)) {
    throw new Error(`${image.name} build context escapes the repository`)
  }
  return target
}

const bakeDefinition = (targets) => ({
  group: {
    selected: {
      targets: Object.keys(targets),
    },
  },
  target: targets,
})

const loadValidatedLock = (root) => {
  const validation = checkImages(root)
  if (validation.problems.length > 0) {
    throw new Error(`image governance metadata is invalid: ${validation.problems.join('; ')}`)
  }
  const parsed = parsePlainLock(readFileSync(join(root, LOCK_PATH), 'utf8'))
  if (parsed.problems !== undefined) {
    throw new Error(`${LOCK_PATH} is malformed: ${parsed.problems.join('; ')}`)
  }
  return parsed.lock
}

export function createBuildPlan({
  root = DEFAULT_ROOT,
  out,
  selectionMode = 'all',
  requested = [],
  cacheBackend = 'none',
} = {}) {
  if (out === undefined || out === '') throw new Error('an output directory is required')
  const absoluteRoot = resolve(root)
  const absoluteOut = resolve(out)
  if (absoluteOut === absoluteRoot || absoluteOut.startsWith(`${absoluteRoot}/`)) {
    throw new Error('build outputs must live outside the repository')
  }
  const lock = loadValidatedLock(absoluteRoot)
  const graph = graphFromLock(lock)

  let requestedNames
  if (selectionMode === 'all') {
    requestedNames = [...graph.ordered]
  } else if (selectionMode === 'selected') {
    if (!Array.isArray(requested) || requested.length === 0) {
      throw new Error('selected mode requires at least one image')
    }
    const unique = new Set()
    for (const name of requested) {
      if (typeof name !== 'string' || !graph.byName.has(name)) {
        throw new Error(`unknown governed image ${JSON.stringify(name)}`)
      }
      unique.add(name)
    }
    requestedNames = graph.ordered.filter((name) => unique.has(name))
  } else {
    throw new Error(`unsupported selection mode ${JSON.stringify(selectionMode)}`)
  }

  const selected = closure(graph, requestedNames)
  const support = supportAncestors(graph, selected)
  const outputSet = new Set([...selected, ...support])
  const outputs = graph.ordered.filter((name) => outputSet.has(name))
  const roots = outputs.filter((name) => graph.byName.get(name).lineage !== 'runner-derived')
  const derived = selected.filter((name) => graph.byName.get(name).lineage === 'runner-derived')
  const parentSet = new Set(derived.map((name) => graph.byName.get(name).parent))
  const parents = graph.ordered.filter((name) => parentSet.has(name))

  for (const name of derived) {
    const parent = graph.byName.get(graph.byName.get(name).parent)
    if (parent.lineage === 'runner-derived') {
      throw new Error(
        `${name} has a derived parent; the current two-phase governed builder cannot verify it before use`,
      )
    }
  }

  const rootTargets = {}
  for (const name of roots) {
    const image = graph.byName.get(name)
    rootTargets[name] = targetFor({
      image,
      root: absoluteRoot,
      out: absoluteOut,
      cacheBackend,
    })
  }
  const derivedTargets = {}
  for (const name of derived) {
    const image = graph.byName.get(name)
    const parent = graph.byName.get(image.parent)
    if (image.parent_digest !== SENTINEL && !DIGEST.test(image.parent_digest)) {
      throw new Error(
        `${name} parent_digest must be a recorded sha256 identity before a partial/parallel build`,
      )
    }
    const parentReference =
      image.parent_digest === SENTINEL
        ? `oci-layout://${join(absoluteOut, parent.name)}`
        : `oci-layout://${join(absoluteOut, parent.name)}@${image.parent_digest}`
    derivedTargets[name] = targetFor({
      image,
      root: absoluteRoot,
      out: absoluteOut,
      cacheBackend,
      parentContext: parentReference,
    })
  }

  return {
    version: 1,
    selectionMode,
    requested: requestedNames,
    selected,
    support,
    outputs,
    phases: { roots, parents, derived },
    platforms: Object.fromEntries(outputs.map((name) => [name, graph.byName.get(name).platforms])),
    cacheScopes: Object.fromEntries(outputs.map((name) => [name, cacheScope(name)])),
    lock,
    bake: {
      roots: bakeDefinition(rootTargets),
      derived: bakeDefinition(derivedTargets),
    },
  }
}

const descriptorBlob = (layout, digest, label) => {
  if (!DIGEST.test(digest)) throw new Error(`${label} has invalid digest ${JSON.stringify(digest)}`)
  const path = join(layout, 'blobs', 'sha256', digest.slice('sha256:'.length))
  const bytes = readFileSync(path)
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  if (actual !== digest)
    throw new Error(`${label} blob hashes to ${actual}, not descriptor ${digest}`)
  return JSON.parse(bytes.toString('utf8'))
}

const collectOne = (image, layout) => {
  const index = JSON.parse(readFileSync(join(layout, 'index.json'), 'utf8'))
  if (!Array.isArray(index.manifests) || index.manifests.length !== 1) {
    throw new Error(`${image.name} OCI layout must contain exactly one top-level index descriptor`)
  }
  const digest = index.manifests[0].digest
  const builtIndex = descriptorBlob(layout, digest, `${image.name} index`)
  if (!Array.isArray(builtIndex.manifests)) {
    throw new Error(`${image.name} top-level descriptor does not contain platform manifests`)
  }
  const manifests = {}
  for (const manifest of builtIndex.manifests) {
    if (manifest.platform === undefined || manifest.platform.os === 'unknown') continue
    const platform = `${manifest.platform.os}/${manifest.platform.architecture}`
    descriptorBlob(layout, manifest.digest, `${image.name} ${platform} manifest`)
    manifests[platform] = manifest.digest
  }
  const builtPlatforms = Object.keys(manifests)
  if (builtPlatforms.join(',') !== image.platforms.join(',')) {
    throw new Error(
      `${image.name} built platforms [${builtPlatforms.join(', ')}] do not equal lock platforms ` +
        `[${image.platforms.join(', ')}]`,
    )
  }
  return { digest, manifests }
}

export function collectDigests({ out, phase = 'all' }) {
  const absoluteOut = resolve(out)
  const plan = JSON.parse(readFileSync(join(absoluteOut, 'build-plan.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(absoluteOut, 'lock.json'), 'utf8'))
  const required =
    phase === 'roots'
      ? plan.phases.roots
      : phase === 'parents'
        ? plan.phases.parents
        : phase === 'all'
          ? plan.outputs
          : undefined
  if (required === undefined)
    throw new Error(`unsupported collection phase ${JSON.stringify(phase)}`)
  const byName = new Map(lock.images.map((image) => [image.name, image]))
  const built = {}
  for (const name of required) {
    const image = byName.get(name)
    if (image === undefined) throw new Error(`build plan names unknown image ${name}`)
    built[name] = collectOne(image, join(absoluteOut, name))
  }
  writeFileSync(join(absoluteOut, 'digests.json'), `${JSON.stringify(built, null, 2)}\n`)
  return built
}

const writePlan = (out, plan) => {
  mkdirSync(out, { recursive: true })
  for (const name of plan.outputs) rmSync(join(out, name), { recursive: true, force: true })
  writeFileSync(join(out, 'lock.json'), `${JSON.stringify(plan.lock, null, 2)}\n`)
  const serializable = { ...plan }
  delete serializable.lock
  delete serializable.bake
  writeFileSync(join(out, 'build-plan.json'), `${JSON.stringify(serializable, null, 2)}\n`)
  writeFileSync(join(out, 'roots-bake.json'), `${JSON.stringify(plan.bake.roots, null, 2)}\n`)
  writeFileSync(join(out, 'derived-bake.json'), `${JSON.stringify(plan.bake.derived, null, 2)}\n`)
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
  const command = args.shift() ?? 'plan'
  const options = new Map()
  const usage = (message) => {
    console.error(`✗ governed image build plan — ${message}`)
    console.error(
      '    usage: build-plan.mjs plan --out <path> [--root <path>] ' +
        '[--selection all|selected] [--images-json <json>] [--cache none|gha] ' +
        '[--github-output <path>]\n' +
        '           build-plan.mjs collect --out <path> [--phase roots|parents|all]',
    )
    process.exit(1)
  }
  for (let at = 0; at < args.length; at += 1) {
    const flag = args[at]
    if (
      ![
        '--out',
        '--root',
        '--selection',
        '--images-json',
        '--cache',
        '--github-output',
        '--phase',
      ].includes(flag)
    ) {
      usage(`unknown option ${JSON.stringify(flag)}`)
    }
    const value = args[at + 1]
    if (value === undefined || value.startsWith('--')) usage(`${flag} requires a value`)
    if (options.has(flag)) usage(`${flag} was supplied twice`)
    options.set(flag, value)
    at += 1
  }
  const out = options.get('--out') ?? DEFAULT_OUT
  if (out === undefined) usage('--out is required when RUNNER_TEMP/IMAGES_OUT is unavailable')

  try {
    if (command === 'plan') {
      let requested = []
      if (options.has('--images-json')) {
        try {
          requested = JSON.parse(options.get('--images-json'))
        } catch (error) {
          usage(`--images-json is not valid JSON: ${error.message}`)
        }
      }
      const plan = createBuildPlan({
        root: options.get('--root') ?? DEFAULT_ROOT,
        out,
        selectionMode: options.get('--selection') ?? 'all',
        requested,
        cacheBackend: options.get('--cache') ?? 'none',
      })
      writePlan(out, plan)
      console.log('Governed image build plan')
      console.log(`  selected: ${plan.selected.join(', ')}`)
      console.log(`  support: ${plan.support.join(', ') || '(none)'}`)
      console.log(`  root phase: ${plan.phases.roots.join(', ') || '(none)'}`)
      console.log(`  verified parents: ${plan.phases.parents.join(', ') || '(none)'}`)
      console.log(`  derived phase: ${plan.phases.derived.join(', ') || '(none)'}`)
      for (const [name, scope] of Object.entries(plan.cacheScopes)) {
        console.log(`  cache ${name}: ${scope}`)
      }
      if (options.has('--github-output')) {
        appendFileSync(
          options.get('--github-output'),
          [
            `roots_file=${join(resolve(out), 'roots-bake.json')}`,
            `derived_file=${join(resolve(out), 'derived-bake.json')}`,
            `has_derived=${String(plan.phases.derived.length > 0)}`,
            `selected_json=${JSON.stringify(plan.selected)}`,
            `outputs_json=${JSON.stringify(plan.outputs)}`,
          ].join('\n') + '\n',
        )
      }
    } else if (command === 'collect') {
      const built = collectDigests({ out, phase: options.get('--phase') ?? 'all' })
      console.log(JSON.stringify(built, null, 2))
      console.error(`digest evidence written to ${join(resolve(out), 'digests.json')}`)
    } else {
      usage(`unknown command ${JSON.stringify(command)}`)
    }
  } catch (error) {
    console.error(`✗ governed image build plan — ${error.message}`)
    process.exit(1)
  }
}
