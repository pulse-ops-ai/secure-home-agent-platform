#!/usr/bin/env node
/** Test setup only: retrieve missing pinned Git objects, never execute them.
 * Production extraction/validation stays offline and refuses missing evidence.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const root = resolve(process.argv[2])
const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
const git = (args) =>
  execFileSync('git', args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
const source = 'c82fda72927464d813ec769aee53f4079ebe3b20'
const plan = 'openspec/changes/governance-state-substrate/design.md'
const identities = new Set([source])
// Source bytes are read as inert data at the authorized immutable source.
const design = git(['show', source + ':' + plan])
for (const row of design.matchAll(/^\| ADR-\d{4}[^\n]* \| `([0-9a-f]{40})` \| `[^`]+` \|$/gmu))
  identities.add(row[1])
function collect(value) {
  if (!value || typeof value !== 'object') return
  if (value.class === 'local-git-commit') identities.add(value.value)
  if (typeof value.revision === 'string') identities.add(value.revision)
  for (const item of Object.values(value)) collect(item)
}
for (const member of ['state.json', 'source-manifest.json'])
  collect(JSON.parse(readFileSync(resolve(root, 'tests/fixtures/governance/candidate', member))))
const missing = []
for (const identity of [...identities].sort()) {
  if (!/^[0-9a-f]{40}$/u.test(identity)) throw new Error('non-exact historical fixture identity')
  try {
    git(['cat-file', '-e', identity + '^{commit}'])
  } catch {
    missing.push(identity)
  }
}
if (missing.length) {
  // Existing origin only; no candidate-supplied URL or executable checkout.
  git(['fetch', '--no-tags', '--no-write-fetch-head', 'origin', ...missing])
  for (const identity of missing) git(['cat-file', '-e', identity + '^{commit}'])
}
console.log(JSON.stringify({ exactHistoricalObjects: identities.size, fetched: missing }))
