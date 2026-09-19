#!/usr/bin/env node
/** Read-only historical acceptance audit. Never infers a time from main delivery. */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { contentDigest, parseGenesisAdrHeader } from '../model/index.mjs'
import { createGenesisReader } from './observations.mjs'

const INDEX = 'docs/decisions/INDEX.md'
const RULE = 'exact-decision-transition-committer-v1'
const headerOf = (text) => text.split(/^\s*---\s*$/mu)[0]
const statusOf = (text) => /^- \*\*Status:\*\* (\w+)$/mu.exec(headerOf(text))?.[1]

function one(values, description) {
  const distinct = [...new Set(values)]
  if (distinct.length !== 1) throw new Error('missing or conflicting ' + description)
  return distinct[0]
}

/** Parse declarations, never Git author/committer names as human identity. */
export function decisionDeclaration(path, bytes, indexBytes) {
  const text = headerOf(Buffer.from(bytes).toString('utf8'))
  const id = /^# (ADR-\d{4}): /mu.exec(text)?.[1]
  const lifecycle = statusOf(text)
  if (!id || !['Accepted', 'Rejected'].includes(lifecycle))
    throw new Error('not an Accepted/Rejected ADR: ' + path)
  const dates = [
    ...text.matchAll(
      new RegExp('^- \\*\\*' + lifecycle + ':\\*\\* (\\d{4}-\\d{2}-\\d{2})$', 'gmu'),
    ),
  ].map((m) => m[1])
  const actors = [
    ...text.matchAll(/^- \*\*(?:Deciders?|Accepted by|Rejected by):\*\* (.+)$/gmu),
  ].flatMap((m) => [...m[1].matchAll(/@[A-Za-z0-9][A-Za-z0-9-]*/gu)].map((a) => a[0]))
  const index = Buffer.from(indexBytes).toString('utf8')
  const headings = [...index.matchAll(/^#{2,3} (.+)$/gmu)]
  const records = []
  for (let i = 0; i < headings.length; i += 1) {
    const title = headings[i][1]
    const section = index.slice(headings[i].index, headings[i + 1]?.index ?? index.length)
    const scope = /^\| \*\*Scope\*\* \| (.+) \|$/mu.exec(section)?.[1] ?? ''
    const range = /^ADR-(\d{4}) (?:…|through) ADR-(\d{4}), as one set$/u.exec(scope)
    const number = Number(id.slice(4))
    const applies =
      title === id + ' ' + (lifecycle === 'Accepted' ? 'acceptance' : 'rejection') + ' record' ||
      (title === 'Acceptance record' &&
        range &&
        number >= Number(range[1]) &&
        number <= Number(range[2]))
    if (!applies) continue
    const date = new RegExp(
      '^\\| \\*\\*' + lifecycle + '\\*\\* \\| (\\d{4}-\\d{2}-\\d{2}) \\|$',
      'mu',
    ).exec(section)?.[1]
    const actor = new RegExp('^\\| \\*\\*' + lifecycle + ' by\\*\\* \\| (.+) \\|$', 'mu').exec(
      section,
    )?.[1]
    if (!date || !actor) throw new Error('incomplete structured INDEX record: ' + id)
    dates.push(date)
    actors.push(...[...actor.matchAll(/@[A-Za-z0-9][A-Za-z0-9-]*/gu)].map((m) => m[0]))
    records.push(title)
  }
  const authoritativeDate = one(dates, id + ' decision date')
  // Calendar validity only. This value never supplies an acceptance instant.
  if (new Date(authoritativeDate).toISOString().slice(0, 10) !== authoritativeDate)
    throw new Error('invalid authoritative calendar date: ' + id)
  return {
    id,
    lifecycle,
    authoritativeDate,
    actor: one(actors, id + ' declared actor'),
    indexRecords: records,
  }
}

export function auditHistoricalAcceptances({ root, sourceRevision }) {
  if (!/^[0-9a-f]{40}$/u.test(sourceRevision))
    throw new Error('explicit full source commit required')
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
  const snapshot = createGenesisReader(root)(sourceRevision)
  const index = snapshot.entries.get(INDEX)
  if (!index?.bytes) throw new Error('authoritative INDEX is unavailable')
  const observations = []
  const problems = []
  // Main's first-parent history is delivery evidence, never a fallback for an
  // original reviewed transition. Do not infer that boundary from a subject's
  // spelling, a PR-number suffix, or the date of the first Accepted occurrence.
  const deliveries = new Set(git('rev-list', '--first-parent', sourceRevision).split('\n'))
  // Original squashed-away transitions can be present without any surviving
  // branch/ref. Observe the local object database, not just reachable main.
  const localCommits = git(
    'cat-file',
    '--batch-all-objects',
    '--batch-check=%(objectname) %(objecttype)',
  )
    .split('\n')
    .filter((line) => line.endsWith(' commit'))
    .map((line) => line.split(' ')[0])
  for (const [path, entry] of [...snapshot.entries].sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^docs\/decisions\/ADR-\d{4}-.+\.md$/u.test(path)) continue
    const id = /ADR-\d{4}/u.exec(path)[0]
    try {
      const adr = parseGenesisAdrHeader(path, entry.bytes)
      if (!['Accepted', 'Rejected'].includes(adr.lifecycle)) continue
      if (entry.mode !== '100644') throw new Error('decision is not a regular source file')
      const declaration = decisionDeclaration(path, entry.bytes, index.bytes)
      const candidates = []
      const excludedDeliveryCommits = []
      const records = execFileSync(
        'git',
        ['log', '--stdin', '--full-history', '--format=%H%x09%P%x09%cI', '--', path],
        {
          cwd: root,
          encoding: 'utf8',
          input: localCommits.join('\n') + '\n',
          maxBuffer: 64 * 1024 * 1024,
        },
      ).trim()
      for (const line of records.split('\n').filter(Boolean)) {
        const [revision, parentText, committerTimestamp] = line.split('\t')
        const parents = parentText.split(' ').filter(Boolean)
        if (deliveries.has(revision) || parents.length !== 1) {
          excludedDeliveryCommits.push(revision)
          continue
        }
        // ls-tree distinguishes a deleted path from a failed observation.
        if (git('ls-tree', revision, '--', path).split('\t')[0] !== '100644 blob ' + entry.oid)
          continue
        const previous = execFileSync('git', ['show', parents[0] + ':' + path], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
        })
        if (statusOf(previous) !== 'Proposed') continue
        const transitionIndex = execFileSync('git', ['show', revision + ':' + INDEX], { cwd: root })
        const observed = decisionDeclaration(path, entry.bytes, transitionIndex)
        if (
          observed.authoritativeDate !== declaration.authoritativeDate ||
          observed.actor !== declaration.actor
        )
          throw new Error('transition declaration differs from the authoritative source')
        const at = new Date(committerTimestamp).toISOString().replace('.000Z', 'Z')
        candidates.push({
          revision,
          predecessor: parents[0],
          committerTimestamp,
          at,
          source: {
            path,
            revision,
            contentSha256: contentDigest(entry.bytes),
            extractionRule: RULE,
          },
          indexSource: { path: INDEX, revision, contentSha256: contentDigest(transitionIndex) },
          dateMatches: at.slice(0, 10) === declaration.authoritativeDate,
        })
      }
      const unique = [...new Map(candidates.map((item) => [item.revision, item])).values()]
      const selected = unique.length === 1 && unique[0].dateMatches ? unique[0] : null
      const observation = {
        ...declaration,
        path,
        contentSha256: contentDigest(entry.bytes),
        classification: 'locally-verified',
        extractionRule: RULE,
        declarationSource: {
          path,
          revision: sourceRevision,
          contentSha256: contentDigest(entry.bytes),
        },
        indexSource: {
          path: INDEX,
          revision: sourceRevision,
          contentSha256: contentDigest(index.bytes),
        },
        candidates: unique,
        excludedDeliveryCommits,
        selected,
        manualProvenance:
          'Git metadata proves a machine-observed recording instant, not human identity or owner authorship.',
      }
      observations.push(observation)
      if (!selected)
        problems.push({
          id: adr.id,
          reason:
            unique.length === 0
              ? 'NO_EXACT_TRANSITION'
              : unique.length > 1
                ? 'AMBIGUOUS_TRANSITION'
                : 'UTC_DATE_MISMATCH',
        })
    } catch (error) {
      problems.push({ id, reason: 'SOURCE_OBSERVATION_FAILED', message: error.message })
    }
  }
  return {
    schemaVersion: 1,
    sourceSnapshotIdentity: { class: 'local-git-commit', value: sourceRevision },
    ok: problems.length === 0,
    observations,
    problems,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: { root: { type: 'string' }, source: { type: 'string' } },
    })
    if (!values.root || !values.source) throw new Error('explicit --root and --source required')
    const result = auditHistoricalAcceptances({
      root: resolve(values.root),
      sourceRevision: values.source,
    })
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
