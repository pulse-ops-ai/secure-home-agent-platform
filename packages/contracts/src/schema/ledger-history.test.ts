/**
 * C-ADV-007A/B and C-MUT-006 kill at the REAL integration seam: the full
 * base-resolution → accepted-ledger → comparison path runs against
 * deterministic temporary git repositories, so bypassing the historical
 * comparison is caught even while the production repository sits at
 * genesis (implementation review, blocker 3). Covers: rewritten accepted
 * row → fail; deleted accepted row → fail; unresolvable base → throw;
 * ledger genuinely absent at a resolved base → genesis allowed; append →
 * allowed; the CI event-path branch resolves the exact base SHA.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { verifyLedgerHistory, type Ledger } from './ledger-history.js'

const LEDGER_PATH = 'schemas/identity-ledger.json'

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync('git', ['-c', 'user.email=fixture@test', '-c', 'user.name=fixture', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim()

const writeLedger = (repo: string, entries: Ledger): void => {
  mkdirSync(join(repo, 'schemas'), { recursive: true })
  writeFileSync(join(repo, LEDGER_PATH), `${JSON.stringify({ entries }, null, 2)}\n`)
}

const tempDirs: string[] = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/**
 * A repo whose main branch commits `baseEntries` (or omits the ledger
 * when null), then a feature branch commits `headEntries`.
 */
const fixtureRepo = (
  baseEntries: Ledger | null,
  headEntries: Ledger,
): { repo: string; baseSha: string } => {
  const repo = mkdtempSync(join(tmpdir(), 'ledger-fixture-'))
  tempDirs.push(repo)
  git(repo, ['init', '-q', '-b', 'main'])
  writeFileSync(join(repo, 'README.md'), 'fixture\n')
  if (baseEntries !== null) writeLedger(repo, baseEntries)
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-q', '-m', 'base'])
  const baseSha = git(repo, ['rev-parse', 'HEAD'])
  git(repo, ['checkout', '-q', '-b', 'feature'])
  writeLedger(repo, headEntries)
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-q', '-m', 'head'])
  return { repo, baseSha }
}

const options = (repo: string) => ({
  cwd: repo,
  eventPath: undefined,
  fallbackRef: 'main',
  ledgerPath: LEDGER_PATH,
})

describe('historical ledger guard at the git seam (C-ADV-007B, C-MUT-006 kill)', () => {
  const A: Ledger = { 'foo@1.0.0': 'sha256:aaaa' }

  it('a rewritten accepted row fails despite head self-consistency', () => {
    const { repo } = fixtureRepo(A, { 'foo@1.0.0': 'sha256:bbbb' })
    expect(verifyLedgerHistory(options(repo), { 'foo@1.0.0': 'sha256:bbbb' })).toEqual([
      'accepted ledger entry rewritten: foo@1.0.0',
    ])
  })

  it('a deleted accepted row fails', () => {
    const { repo } = fixtureRepo(A, {})
    expect(verifyLedgerHistory(options(repo), {})).toEqual([
      'accepted ledger entry disappeared: foo@1.0.0',
    ])
  })

  it('an appended new identity passes', () => {
    const head: Ledger = { 'foo@1.0.0': 'sha256:aaaa', 'foo@1.1.0': 'sha256:bbbb' }
    const { repo } = fixtureRepo(A, head)
    expect(verifyLedgerHistory(options(repo), head)).toEqual([])
  })

  it('an unresolvable trusted base is a failure, never a skip', () => {
    const head: Ledger = { ...A, 'bar@1.0.0': 'sha256:cccc' }
    const { repo } = fixtureRepo(A, head)
    expect(() =>
      verifyLedgerHistory({ ...options(repo), fallbackRef: 'refs/does-not-exist' }, head),
    ).toThrow()
  })

  it('genesis is ONLY a ledger absent at a resolved base', () => {
    const { repo } = fixtureRepo(null, A)
    expect(verifyLedgerHistory(options(repo), A)).toEqual([])
  })

  it('the CI event-path branch resolves the exact base SHA', () => {
    const { repo, baseSha } = fixtureRepo(A, { 'foo@1.0.0': 'sha256:bbbb' })
    const eventPath = join(repo, 'event.json')
    writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: baseSha } } }))
    expect(
      verifyLedgerHistory({ ...options(repo), eventPath }, { 'foo@1.0.0': 'sha256:bbbb' }),
    ).toEqual(['accepted ledger entry rewritten: foo@1.0.0'])
  })
})
