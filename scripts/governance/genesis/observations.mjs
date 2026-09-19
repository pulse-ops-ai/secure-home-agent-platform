/** Rules-free, exact-revision observations for genesis and freshness. */
import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { resolve } from 'node:path'

import { createHistoryReader, PRESENT } from '../history/index.mjs'
import { readContainedBytes } from '../git-tree/contained-read.mjs'

export function sourceManifestPath(statePath) {
  if (statePath === 'governance/state.json') return 'governance/genesis-source-manifest.json'
  const slash = statePath.lastIndexOf('/')
  return statePath.slice(0, slash + 1) + 'source-manifest.json'
}

/** Immutable commit/path observations can be shared within one evaluation. */
export function cacheTreeObservations(observer) {
  const wrapped = { ...observer }
  for (const method of ['treeAt', 'pathExistsAt', 'commitExists', 'isReachable']) {
    const cache = new Map()
    wrapped[method] = (...args) => {
      const key = JSON.stringify(args)
      if (!cache.has(key)) cache.set(key, observer[method](...args))
      return cache.get(key)
    }
  }
  return wrapped
}

/** Preparation-only view, including not-yet-added candidate files. It carries
 * NO commit identity and is never an activation-base/freshness observation.
 */
export function readCheckoutSnapshot(root) {
  const listing = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const entries = new Map()
  for (const path of [...new Set(listing.split('\0').filter(Boolean))].sort()) {
    const bytes = readContainedBytes(root, path)
    if (!bytes) continue // A tracked deletion is absent from the preparation view.
    const stats = lstatSync(resolve(root, path))
    entries.set(path, { path, mode: (stats.mode & 0o111) === 0 ? '100644' : '100755', bytes })
  }
  return { entries }
}

export function createGenesisReader(root) {
  const history = createHistoryReader(root)
  const cache = new Map()
  return function readSnapshot(revision) {
    const resolved = history.resolveCommit(revision)
    if (resolved.status !== PRESENT)
      throw new Error('source revision is not observable: ' + revision)
    if (cache.has(resolved.oid)) return cache.get(resolved.oid)
    const listing = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', resolved.oid], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    const rows = listing
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf('\t')
        const [mode, type, oid] = line.slice(0, tab).split(' ')
        return { path: line.slice(tab + 1), mode, type, oid }
      })
    const oids = [...new Set(rows.filter((row) => row.type === 'blob').map((row) => row.oid))]
    const batch = execFileSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: oids.join('\n') + '\n',
      maxBuffer: 128 * 1024 * 1024,
    })
    const blobs = new Map()
    let offset = 0
    for (const oid of oids) {
      const end = batch.indexOf(10, offset)
      if (end < 0) throw new Error('truncated source observation')
      const [actual, type, sizeText] = batch.subarray(offset, end).toString('utf8').split(' ')
      const size = Number(sizeText)
      if (
        actual !== oid ||
        type !== 'blob' ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        end + size + 1 >= batch.length ||
        batch[end + size + 1] !== 10
      )
        throw new Error('invalid source observation')
      blobs.set(oid, new Uint8Array(batch.subarray(end + 1, end + size + 1)))
      offset = end + size + 2
    }
    if (offset !== batch.length) throw new Error('extra source observation bytes')
    const snapshot = {
      commit: resolved.oid,
      entries: new Map(rows.map((row) => [row.path, { ...row, bytes: blobs.get(row.oid) }])),
    }
    cache.set(resolved.oid, snapshot)
    return snapshot
  }
}

/** Metadata is supporting provenance, never proof that a named human acted. */
export function readPathHistory(root, revision, path) {
  const output = execFileSync(
    'git',
    ['log', '--reverse', '--format=%H%x09%cI%x09%s', revision, '--', path],
    { cwd: root, encoding: 'utf8' },
  )
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [commit, recordedAt, subject] = line.split('\t')
      return {
        commit,
        recordedAt: new Date(recordedAt).toISOString().replace('.000Z', 'Z'),
        subject,
      }
    })
}
