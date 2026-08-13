/**
 * Real, READ-ONLY filesystem observation (design D3, OQ1's resolution).
 *
 * `runner-core` treats the host observation as the AUTHORITATIVE change
 * set — it is what a model's claims are reconciled against and what the
 * path policy is enforced over. So an observer that cannot tell created
 * from modified from deleted is not a weak observer; it is a fabricated
 * authority, and everything downstream inherits the fabrication.
 *
 * The change set is therefore derived from a BASELINE MANIFEST captured
 * when the run's base identity is observed, and a run with no baseline
 * gets a refusal rather than a guess. "We could not look" and "nothing
 * changed" are different facts, and this module never conflates them.
 *
 * SCOPE, STATED HONESTLY. This is the real observer for a plain
 * directory: a creation-time manifest of path, entry kind, mode, size,
 * and a digest over RAW BYTES, diffed later against the same walk. It is
 * NOT a Git-native observer. For coding workspaces a base commit plus a
 * worktree/index diff is the better instrument — it distinguishes
 * renames, honours what the repository ignores, and does not walk the
 * tree twice — and that is a named later refinement rather than
 * something this landing claims to have shipped.
 *
 * There is no write API here. Not a private one, not a disabled one.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type {
  ArtifactObservation,
  ArtifactObserveRequest,
  ArtifactObserverPort,
  AuthorityBytes,
  AuthorityReadRequest,
  AuthoritySourcePort,
  BaseObservation,
  WorkspaceObservation,
  WorkspaceObserveRequest,
  WorkspaceObserverPort,
} from '../ports/index.js'

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * The digest of an observation, over RAW BYTES.
 *
 * Reading as UTF-8 first was a real defect: two different binary files
 * of the same length both become replacement characters and hash
 * identically, so a substitution could pass the pinned-base check.
 * Hashing bytes cannot be fooled that way.
 */
const digestOf = (value: Buffer | string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

/**
 * Whether `candidate` stays inside `root`, decided on LINK-RESOLVED
 * paths. Lexical containment is not containment: a symlink inside the
 * root can point anywhere, and following it would read a file the root
 * was supposed to exclude.
 */
const within = (root: string, candidate: string): boolean => {
  if (candidate.includes('\0')) return false
  let real: string
  let realRoot: string
  try {
    real = realpathSync(candidate)
    realRoot = realpathSync(root)
  } catch {
    return false
  }
  const rel = relative(realRoot, real)
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep)
}

/** One entry as the workspace was found. */
interface ManifestEntry {
  readonly kind: 'file' | 'symlink'
  readonly mode: number
  readonly bytes: number
  readonly digest: string
  readonly link_target?: string
}

type Manifest = ReadonlyMap<string, ManifestEntry>

/**
 * Walk the root with `lstat`, so a symlink is observed AS a symlink
 * rather than as whatever it points at. Non-regular, non-link entries —
 * devices, sockets, fifos — are skipped: they are not workspace content
 * and reading them can block.
 */
const manifestOf = (root: string): Manifest => {
  const entries = new Map<string, ManifestEntry>()
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const absolute = join(entry.parentPath, entry.name)
    const path = relative(root, absolute)
    if (path === '' || path.startsWith('..')) continue
    const stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) {
      // The target is RECORDED rather than followed. The core defines
      // `link_target` for exactly this, and its decisions treat the
      // TARGET as the effective location — a judgement it cannot make
      // if the observation hides that a link was involved at all.
      let target: string
      try {
        target = realpathSync(absolute)
      } catch {
        target = '(unresolvable)'
      }
      entries.set(path, {
        kind: 'symlink',
        mode: stat.mode,
        bytes: 0,
        digest: digestOf(`symlink:${target}`),
        link_target: target,
      })
      continue
    }
    if (!stat.isFile()) continue
    entries.set(path, {
      kind: 'file',
      mode: stat.mode,
      bytes: stat.size,
      digest: digestOf(readFileSync(absolute)),
    })
  }
  return entries
}

const manifestDigest = (manifest: Manifest): string =>
  digestOf(
    [...manifest.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([path, entry]) => `${path}:${entry.kind}:${String(entry.mode)}:${entry.digest}`)
      .join('\n'),
  )

const changeOf = (
  path: string,
  kind: 'created' | 'modified' | 'deleted',
  bytes: number,
  link_target: string | undefined,
) => ({ path, kind, bytes, ...(link_target === undefined ? {} : { link_target }) })

export class FilesystemWorkspaceObserver implements WorkspaceObserverPort {
  /**
   * Baselines, keyed by run. A single observer instance is shared by
   * concurrent runs, so an unkeyed baseline would let one run diff
   * against another's starting point (RO-INV-10).
   */
  readonly #baselines = new Map<string, Manifest>()

  /**
   * Capture the base and its identity.
   *
   * This is the only point at which a baseline exists, which is why the
   * pinned-base comparison and the later change set are the same
   * observation seen twice rather than two unrelated walks.
   */
  observeBase(request: WorkspaceObserveRequest): Promise<BaseObservation> {
    try {
      const manifest = manifestOf(resolve(request.root))
      this.#baselines.set(request.run_id, manifest)
      return Promise.resolve({ ok: true, digest: manifestDigest(manifest) })
    } catch (error) {
      return Promise.resolve({ ok: false, failure: reason(error) })
    }
  }

  observe(request: WorkspaceObserveRequest): Promise<WorkspaceObservation> {
    const baseline = this.#baselines.get(request.run_id)
    if (baseline === undefined) {
      // No baseline means nothing to compare against, and a change set
      // derived from nothing is a fabrication. The core classifies this
      // as an operational failure, which is exactly what it is.
      return Promise.resolve({
        ok: false,
        failure: `no workspace baseline was captured for run ${request.run_id}; the change set is not derivable`,
      })
    }
    try {
      const current = manifestOf(resolve(request.root))
      const changes = []
      for (const [path, entry] of current) {
        const before = baseline.get(path)
        if (before === undefined) {
          changes.push(changeOf(path, 'created', entry.bytes, entry.link_target))
          continue
        }
        if (before.digest !== entry.digest || before.mode !== entry.mode) {
          changes.push(changeOf(path, 'modified', entry.bytes, entry.link_target))
        }
      }
      for (const [path, entry] of baseline) {
        if (current.has(path)) continue
        // A deletion's size is 0: the file is not there to measure, and
        // reporting its former size would describe a file that no longer
        // exists.
        changes.push(changeOf(path, 'deleted', 0, entry.link_target))
      }
      return Promise.resolve({ ok: true, changes })
    } catch (error) {
      return Promise.resolve({ ok: false, failure: reason(error) })
    }
  }
}

export interface ArtifactBounds {
  readonly max_files?: number
  readonly max_file_bytes?: number
}

const DEFAULT_BOUNDS = { max_files: 256, max_file_bytes: 1_048_576 } as const

/**
 * Whether these bytes are text this observation can carry faithfully.
 *
 * The L3 artifact value carries `content: string`. Reading bytes that
 * are not text into it would corrupt them and then digest the
 * corruption, so a binary artifact is REFUSED by name. Carrying bytes
 * would take an L2 contract amendment, which is not this landing's to
 * make — and a disclosed refusal beats a silent mangling.
 */
const isText = (bytes: Buffer): boolean => {
  if (bytes.includes(0)) return false
  return Buffer.compare(Buffer.from(bytes.toString('utf8'), 'utf8'), bytes) === 0
}

export class FilesystemArtifactObserver implements ArtifactObserverPort {
  readonly #root: string
  readonly #bounds: Required<ArtifactBounds>

  constructor(root: string, bounds: ArtifactBounds = {}) {
    this.#root = resolve(root)
    this.#bounds = { ...DEFAULT_BOUNDS, ...bounds }
  }

  observe(request: ArtifactObserveRequest): Promise<ArtifactObservation> {
    const refuse = (failure: string): Promise<ArtifactObservation> =>
      Promise.resolve({ ok: false, failure })

    if (request.paths.length > this.#bounds.max_files) {
      return refuse(
        `${String(request.paths.length)} artifacts requested; the bound is ${String(this.#bounds.max_files)}`,
      )
    }
    try {
      const artifacts = []
      for (const path of request.paths) {
        const absolute = resolve(this.#root, path)
        if (!within(this.#root, absolute)) {
          return refuse(`artifact path "${path}" resolves outside the observation root`)
        }
        // lstat, not stat: the artifact must BE the named path. A
        // symlink is a different file wearing this name, and reading
        // through it would attribute one file's bytes to another.
        const stat = lstatSync(absolute)
        if (stat.isSymbolicLink()) {
          return refuse(`artifact path "${path}" is a symbolic link; the named path is not read`)
        }
        if (!stat.isFile()) {
          return refuse(`artifact path "${path}" is not a regular file`)
        }
        if (stat.size > this.#bounds.max_file_bytes) {
          return refuse(
            `artifact "${path}" is ${String(stat.size)} bytes; the bound is ${String(this.#bounds.max_file_bytes)}`,
          )
        }
        const bytes = readFileSync(absolute)
        if (!isText(bytes)) {
          return refuse(
            `artifact "${path}" is not text; this observation carries text content only`,
          )
        }
        artifacts.push({ path, content: bytes.toString('utf8') })
      }
      return Promise.resolve({ ok: true, artifacts })
    } catch (error) {
      return refuse(reason(error))
    }
  }
}

/**
 * Reads authority documents from a fixed source→path map. The map is
 * supplied at construction: a caller cannot ask this port for an
 * arbitrary path, only for a source name the composition root declared.
 */
export class FilesystemAuthoritySource implements AuthoritySourcePort {
  readonly #paths: ReadonlyMap<string, string>

  constructor(paths: Readonly<Record<string, string>>) {
    this.#paths = new Map(Object.entries(paths))
  }

  read(request: AuthorityReadRequest): Promise<AuthorityBytes> {
    const source = { source: request.source }
    const path = this.#paths.get(request.source)
    if (path === undefined) {
      return Promise.resolve({
        ok: false,
        source,
        failure: `no declared path for authority source "${request.source}"`,
      })
    }
    try {
      return Promise.resolve({ ok: true, source, bytes: readFileSync(path, 'utf8') })
    } catch (error) {
      return Promise.resolve({ ok: false, source, failure: reason(error) })
    }
  }
}
