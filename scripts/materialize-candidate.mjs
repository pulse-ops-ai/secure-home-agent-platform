#!/usr/bin/env node
/**
 * Materialize a candidate revision as INERT DATA.
 *
 * `git archive | tar -x` is not this. Tar restores whatever the archive
 * describes, and the archive is candidate-controlled: a symlink entry, a
 * gitlink, or a path that walks out of the destination are all things the
 * candidate gets to choose. Fixing the modes afterwards does not help, because
 * by then the entry already exists.
 *
 * So the tree is enumerated first and every entry is judged BEFORE anything is
 * written. Only regular blobs are admitted, every destination is proved to stay
 * under the materialization root, and each file is written 0644 by this
 * program rather than restored by an unpacker. Nothing is executed, and a
 * single inadmissible entry refuses the whole materialization -- a partial
 * tree is not a safe subset of a hostile one.
 *
 * Node standard library plus git. Governed by AGENTS.md and ADR-0022 (D14).
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REGULAR_BLOB = new Set(['100644', '100755'])

const MODE_NAMES = {
  120000: 'a symlink',
  160000: 'a submodule (gitlink)',
  '040000': 'a directory entry',
}

const git = (args, quiet = false) =>
  execFileSync('git', args, {
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'],
  })

/** Every entry in the revision, with the mode git actually recorded. */
export function readTree(revision) {
  const raw = git(['ls-tree', '-r', '-z', revision]).toString('utf8')
  return raw
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const [meta, filePath] = entry.split('\t')
      const [mode, type, object] = meta.split(' ')
      return { mode, type, object, path: filePath }
    })
}

/**
 * Decide admissibility for the whole tree.
 *
 * Returns every reason, not the first: a report that stops at the first
 * symlink hides how much else is wrong with the candidate.
 */
export function inadmissibleEntries(entries, root = '/candidate') {
  const problems = []
  for (const entry of entries) {
    if (!REGULAR_BLOB.has(entry.mode)) {
      const what = MODE_NAMES[entry.mode] ?? `mode ${entry.mode}`
      problems.push(`${entry.path}: ${what} is not a regular blob`)
      continue
    }
    if (entry.type !== 'blob') {
      problems.push(`${entry.path}: object type "${entry.type}" is not a blob`)
      continue
    }
    if (path.isAbsolute(entry.path)) {
      problems.push(`${entry.path}: absolute paths escape the materialization root`)
      continue
    }
    if (entry.path.split('/').includes('..')) {
      problems.push(`${entry.path}: contains a parent-directory segment`)
      continue
    }
    // Belt and braces: prove the resolved destination is still inside root.
    const destination = path.resolve(root, entry.path)
    if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) {
      problems.push(`${entry.path}: resolves outside the materialization root`)
    }
  }
  return problems
}

function main() {
  const revision = process.argv[2]
  const root = process.argv[3]
  if (!revision || !root) {
    console.error('usage: materialize-candidate.mjs <revision> <destination>')
    process.exit(1)
  }
  const destinationRoot = path.resolve(root)

  const entries = readTree(revision)
  if (entries.length === 0) {
    console.error(JSON.stringify({ refused: true, problems: [`${revision} has no tree entries`] }))
    process.exit(1)
  }

  const problems = inadmissibleEntries(entries, destinationRoot)
  if (problems.length > 0) {
    console.error(JSON.stringify({ refused: true, problems }))
    process.exit(1)
  }

  for (const entry of entries) {
    const destination = path.join(destinationRoot, entry.path)
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 })
    // Written by this program, at a mode this program chose. The candidate's
    // recorded exec bit is deliberately discarded.
    writeFileSync(destination, git(['cat-file', 'blob', entry.object]), { mode: 0o644 })
  }

  console.log(JSON.stringify({ ok: true, revision, root: destinationRoot, files: entries.length }))
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  main()
}
