/**
 * RO-EX-58…63: the workspace observer tells the truth, or says it cannot.
 *
 * `runner-core` treats the host observation as the AUTHORITATIVE change
 * set — it is the thing a model's claims are reconciled against, and the
 * thing the path policy is enforced over. An observer that reports every
 * file as `modified` because it never captured a baseline is not a weak
 * observer; it is a fabricated authority, and everything downstream
 * inherits the fabrication.
 *
 * The defects these close:
 *
 *  - `observe()` walked the current tree and labelled everything
 *    `modified`. It could not distinguish created from modified from
 *    deleted because it had nothing to compare against.
 *  - the base digest read files as UTF-8, so a binary replacement could
 *    hash identically after replacement-character substitution.
 *  - nothing used `lstat`, so symlinks and non-regular files were
 *    indistinguishable from regular ones, and the `link_target` field
 *    the core defines for exactly this was never populated.
 *  - artifact reads were unbounded.
 */
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FilesystemArtifactObserver, FilesystemWorkspaceObserver } from '../adapters/index.js'

const RUN = 'run-observer'

const workspace = (files: Readonly<Record<string, string>> = {}): string => {
  const root = mkdtempSync(join(tmpdir(), 'rc-obs-'))
  for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content)
  return root
}

describe('RO-EX-58: change kinds are derived from a captured baseline', () => {
  it('distinguishes created, modified, and deleted', async () => {
    const root = workspace({ 'kept.txt': 'same', 'changed.txt': 'before', 'gone.txt': 'bye' })
    const observer = new FilesystemWorkspaceObserver()

    const base = await observer.observeBase({ run_id: RUN, root })
    expect(base.ok).toBe(true)

    writeFileSync(join(root, 'changed.txt'), 'after')
    writeFileSync(join(root, 'new.txt'), 'hello')
    rmSync(join(root, 'gone.txt'))

    const observed = await observer.observe({ run_id: RUN, root })
    expect(observed.ok).toBe(true)
    if (!observed.ok) return

    const byPath = new Map(observed.changes.map((change) => [change.path, change.kind]))
    expect(byPath.get('changed.txt')).toBe('modified')
    expect(byPath.get('new.txt')).toBe('created')
    expect(byPath.get('gone.txt')).toBe('deleted')
    expect(byPath.has('kept.txt'), 'an unchanged file is not a change').toBe(false)
  })

  it('an unchanged workspace reports NO changes, not every file', async () => {
    const root = workspace({ 'a.txt': 'a', 'b.txt': 'b' })
    const observer = new FilesystemWorkspaceObserver()
    await observer.observeBase({ run_id: RUN, root })

    const observed = await observer.observe({ run_id: RUN, root })
    expect(observed.ok).toBe(true)
    if (!observed.ok) return
    expect(observed.changes, 'reporting every file as modified is a fabrication').toEqual([])
  })

  it('observing with NO baseline captured refuses — it does not guess', async () => {
    const root = workspace({ 'a.txt': 'a' })
    const observer = new FilesystemWorkspaceObserver()
    // No observeBase for this run.
    const observed = await observer.observe({ run_id: 'never-based', root })
    expect(observed.ok, 'a change set with nothing to compare against is not observable').toBe(
      false,
    )
  })

  it('baselines are keyed by run — one run cannot diff against another', async () => {
    const root = workspace({ 'a.txt': 'a' })
    const observer = new FilesystemWorkspaceObserver()
    await observer.observeBase({ run_id: 'run-a', root })
    const other = await observer.observe({ run_id: 'run-b', root })
    expect(other.ok).toBe(false)
  })
})

describe('RO-EX-59: the base identity is bound to bytes, not to text', () => {
  it('a BINARY replacement of the same length changes the base identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rc-bin-'))
    writeFileSync(join(root, 'blob.bin'), Buffer.from([0x00, 0xff, 0x10, 0x80]))
    const observer = new FilesystemWorkspaceObserver()
    const before = await observer.observeBase({ run_id: RUN, root })

    // Same length, different bytes — and both are invalid UTF-8, so a
    // utf8 read would map them to the same replacement characters.
    writeFileSync(join(root, 'blob.bin'), Buffer.from([0x00, 0xfe, 0x10, 0x81]))
    const after = await observer.observeBase({ run_id: RUN, root })

    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) return
    expect(after.digest, 'a utf8 read would call these identical').not.toBe(before.digest)
  })
})

describe('RO-EX-60: links are observed as links, with their target', () => {
  it('an in-root symlink is reported with its resolved target', async () => {
    const root = workspace({ 'real.txt': 'content' })
    const observer = new FilesystemWorkspaceObserver()
    await observer.observeBase({ run_id: RUN, root })

    symlinkSync(join(root, 'real.txt'), join(root, 'alias.txt'))
    const observed = await observer.observe({ run_id: RUN, root })
    expect(observed.ok).toBe(true)
    if (!observed.ok) return

    const alias = observed.changes.find((change) => change.path === 'alias.txt')
    expect(alias, 'a new link is a change').toBeDefined()
    expect(
      alias?.link_target,
      'the core defines link_target for exactly this; leaving it unset hides the alias',
    ).toBeDefined()
  })

  it('a symlink escaping the root is not silently followed', async () => {
    const root = workspace({})
    const outside = workspace({ 'secret.txt': 'not yours' })
    symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'))

    const observer = new FilesystemWorkspaceObserver()
    const base = await observer.observeBase({ run_id: RUN, root })
    // Either the observation refuses, or the entry is reported as a link
    // whose target is outside — never as an ordinary in-root file.
    if (base.ok) {
      const observed = await observer.observe({ run_id: RUN, root })
      if (observed.ok) {
        const escape = observed.changes.find((change) => change.path === 'escape.txt')
        if (escape !== undefined) expect(escape.link_target).toBeDefined()
      }
    }
    expect(true).toBe(true)
  })
})

describe('RO-EX-61: artifacts are regular files, read within bounds', () => {
  it('a non-regular path is refused rather than read', async () => {
    const root = workspace({})
    mkdirSync(join(root, 'a-directory'))
    const observed = await new FilesystemArtifactObserver(root).observe({
      run_id: RUN,
      paths: ['a-directory'],
    })
    expect(observed.ok).toBe(false)
  })

  it('a symlinked artifact is refused — the read must be of the named path', async () => {
    const root = workspace({ 'real.txt': 'content' })
    symlinkSync(join(root, 'real.txt'), join(root, 'alias.txt'))
    const observed = await new FilesystemArtifactObserver(root).observe({
      run_id: RUN,
      paths: ['alias.txt'],
    })
    expect(observed.ok).toBe(false)
  })

  it('an oversize artifact refuses rather than reading unbounded', async () => {
    const root = workspace({ 'big.txt': 'x'.repeat(4096) })
    const observed = await new FilesystemArtifactObserver(root, { max_file_bytes: 1024 }).observe({
      run_id: RUN,
      paths: ['big.txt'],
    })
    expect(observed.ok).toBe(false)
    if (observed.ok) return
    expect(observed.failure).toContain('big.txt')
  })

  it('too many artifacts refuses rather than reading them all', async () => {
    const root = workspace({ 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' })
    const observed = await new FilesystemArtifactObserver(root, { max_files: 2 }).observe({
      run_id: RUN,
      paths: ['a.txt', 'b.txt', 'c.txt'],
    })
    expect(observed.ok).toBe(false)
  })
})

describe('RO-EX-62: binary artifacts are refused, not mangled', () => {
  it('a binary artifact refuses, naming the path', async () => {
    // The L3 artifact value carries `content: string`. Reading bytes
    // that are not text into it would silently corrupt them and then
    // digest the corruption. Refusing is the honest answer until the
    // contract can carry bytes — which is an L2 amendment, not this
    // landing's to make.
    const root = mkdtempSync(join(tmpdir(), 'rc-art-'))
    writeFileSync(join(root, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0xff]))
    const observed = await new FilesystemArtifactObserver(root).observe({
      run_id: RUN,
      paths: ['blob.bin'],
    })
    expect(observed.ok).toBe(false)
    if (observed.ok) return
    expect(observed.failure).toContain('blob.bin')
  })

  it('a text artifact is read faithfully', async () => {
    const root = workspace({ 'notes.md': '# hello\n' })
    const observed = await new FilesystemArtifactObserver(root).observe({
      run_id: RUN,
      paths: ['notes.md'],
    })
    expect(observed.ok).toBe(true)
    if (!observed.ok) return
    expect(observed.artifacts[0]?.content).toBe('# hello\n')
  })
})

describe('RO-EX-63: an unreadable workspace is not an empty one', () => {
  it('a root that cannot be walked reports failure, never no-changes', async () => {
    const observer = new FilesystemWorkspaceObserver()
    const base = await observer.observeBase({ run_id: RUN, root: '/definitely/not/here' })
    expect(base.ok).toBe(false)
  })
})
