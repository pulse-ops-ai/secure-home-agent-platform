/**
 * Real, READ-ONLY filesystem implementations (design D3, OQ1's
 * resolution).
 *
 * Acquisition and observation are reads, so this landing ships them for
 * real. Every function here reads and returns an L3 value type; none
 * writes, creates, deletes, spawns, or resolves anything outside the root
 * it is given. There is no write API on this module — not a private one,
 * not a disabled one — so "the observer wrote something" is not a bug
 * this code could have.
 *
 * A read failure becomes `ok: false` carrying the reason. It never
 * becomes an empty result: the core is entitled to know the difference
 * between an empty workspace and an unreadable one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type {
  ArtifactObservation,
  ArtifactObserveRequest,
  ArtifactObserverPort,
  AuthorityBytes,
  AuthorityReadRequest,
  AuthoritySourcePort,
  WorkspaceObservation,
  WorkspaceObserveRequest,
  WorkspaceObserverPort,
} from '../ports/index.js'

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Whether `candidate` stays inside `root`. Containment is decided on
 * resolved paths so a `..` segment or an absolute path cannot walk out,
 * and the separator suffix stops `/srv/run` from admitting `/srv/runner`.
 */
const within = (root: string, candidate: string): boolean => {
  const rel = relative(root, candidate)
  return (
    rel !== '' &&
    !rel.startsWith('..') &&
    !rel.startsWith(sep) &&
    !resolve(candidate).includes('\0')
  )
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

export class FilesystemWorkspaceObserver implements WorkspaceObserverPort {
  observe(request: WorkspaceObserveRequest): Promise<WorkspaceObservation> {
    const root = resolve(request.root)
    try {
      const changes = []
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue
        const absolute = join(entry.parentPath, entry.name)
        if (!within(root, absolute)) continue
        changes.push({
          path: relative(root, absolute),
          kind: 'modified' as const,
          bytes: statSync(absolute).size,
        })
      }
      return Promise.resolve({ ok: true, changes })
    } catch (error) {
      return Promise.resolve({ ok: false, failure: reason(error) })
    }
  }
}

export class FilesystemArtifactObserver implements ArtifactObserverPort {
  readonly #root: string

  constructor(root: string) {
    this.#root = resolve(root)
  }

  observe(request: ArtifactObserveRequest): Promise<ArtifactObservation> {
    try {
      const artifacts = []
      for (const path of request.paths) {
        const absolute = resolve(this.#root, path)
        if (!within(this.#root, absolute)) {
          return Promise.resolve({
            ok: false,
            failure: `artifact path "${path}" resolves outside the observation root`,
          })
        }
        artifacts.push({ path, content: readFileSync(absolute, 'utf8') })
      }
      return Promise.resolve({ ok: true, artifacts })
    } catch (error) {
      return Promise.resolve({ ok: false, failure: reason(error) })
    }
  }
}
