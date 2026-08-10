/**
 * The identity-ledger guard's two layers (design D5), as injectable
 * functions so the REAL base-resolution/verification path is provable
 * against deterministic git fixtures — not only as pure in-memory
 * comparisons (implementation review, C-MUT-006).
 *
 * Node builtins only; internal module — never exported from the package
 * index, so nothing here enters the runtime import graph of consumers.
 *
 * Fail-closed contract: resolving the trusted base commit MUST succeed
 * (any git failure throws). Only at a RESOLVED base commit may a missing
 * ledger mean genesis; that is recognized solely by git's not-in-tree
 * error, and every other failure propagates.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export type Ledger = Readonly<Record<string, string>>

export interface LedgerHistoryOptions {
  /** Repository to interrogate. */
  readonly cwd: string
  /** GitHub event payload path (CI): PR base SHA wins when present. */
  readonly eventPath?: string | undefined
  /** Fallback base ref for local runs, e.g. "origin/main". */
  readonly fallbackRef: string
  /** Repository-relative path of the ledger file. */
  readonly ledgerPath: string
}

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim()

/** Resolve the trusted base commit or throw — never a silent skip. */
export const resolveBaseSha = (options: LedgerHistoryOptions): string => {
  if (options.eventPath !== undefined) {
    const event = JSON.parse(readFileSync(options.eventPath, 'utf8')) as {
      pull_request?: { base?: { sha?: string } }
    }
    const sha = event.pull_request?.base?.sha
    if (sha !== undefined) {
      try {
        git(options.cwd, ['cat-file', '-e', `${sha}^{commit}`])
      } catch {
        git(options.cwd, ['fetch', '--depth=1', 'origin', sha])
      }
      return sha
    }
  }
  return git(options.cwd, ['merge-base', 'HEAD', options.fallbackRef])
}

/**
 * The accepted ledger at the trusted base, or null ONLY when the ledger
 * file does not exist at a successfully resolved base commit (genesis).
 */
export const acceptedLedgerAt = (options: LedgerHistoryOptions, baseSha: string): Ledger | null => {
  try {
    const text = git(options.cwd, ['show', `${baseSha}:${options.ledgerPath}`])
    return (JSON.parse(text) as { entries: Ledger }).entries
  } catch (error) {
    const stderrRaw = (error as { stderr?: string | Buffer }).stderr
    const detail = [
      error instanceof Error ? error.message : String(error),
      typeof stderrRaw === 'string' ? stderrRaw : (stderrRaw?.toString('utf8') ?? ''),
    ].join('\n')
    if (/exists on disk, but not in|does not exist in/.test(detail)) return null
    throw error
  }
}

/** Layer 1: committed bytes match the ledger; every identity has an entry. */
export const checkLedgerCurrentState = (
  ledger: Ledger,
  files: ReadonlyMap<string, string>,
  digest: (content: string) => string,
): string[] => {
  const failures: string[] = []
  for (const [relPath, content] of files) {
    const [id, file] = relPath.split('/')
    const identity = `${id}@${(file ?? '').replace(/\.json$/, '')}`
    const recorded = ledger[identity]
    if (recorded === undefined) {
      failures.push(`no ledger entry for ${identity}`)
    } else if (recorded !== digest(content)) {
      failures.push(`bytes do not match ledger digest for ${identity}`)
    }
  }
  return failures
}

/** Layer 2: accepted entries never change or disappear; only appends. */
export const checkLedgerHistory = (accepted: Ledger, proposed: Ledger): string[] => {
  const failures: string[] = []
  for (const [identity, acceptedDigest] of Object.entries(accepted)) {
    const now = proposed[identity]
    if (now === undefined) {
      failures.push(`accepted ledger entry disappeared: ${identity}`)
    } else if (now !== acceptedDigest) {
      failures.push(`accepted ledger entry rewritten: ${identity}`)
    }
  }
  return failures
}

/**
 * The full historical guard: resolve the base (throws on failure), read
 * the accepted ledger (null = genesis, allowed), compare the proposal.
 */
export const verifyLedgerHistory = (options: LedgerHistoryOptions, proposed: Ledger): string[] => {
  const baseSha = resolveBaseSha(options)
  const accepted = acceptedLedgerAt(options, baseSha)
  if (accepted === null) return []
  return checkLedgerHistory(accepted, proposed)
}
