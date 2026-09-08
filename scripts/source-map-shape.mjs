#!/usr/bin/env node
/**
 * WHAT A SOURCE MAP ACTUALLY ATTRIBUTES.
 *
 * P2-001. "The map is present, parses, and lists the right `sources[]`" is not
 * preservation. Every one of those can hold while a mapping points a generated
 * line at the WRONG original line — which is the whole thing a map is for. A
 * checker that stopped at structure would pass a map that had become useless.
 *
 * So the projection is the attribution RELATION itself: which original file and
 * original line each generated line resolves to. Comparison is then a subset
 * question rather than a byte question, which is what lets the new compiler
 * refine columns and split segments — the two things it may legitimately do —
 * while a changed source file or a changed original line still fails.
 *
 * VALIDITY comes from Node's own `node:module` `SourceMap`, not from a private
 * opinion about the format: it parses the payload and answers `findEntry`. The
 * VLQ decoding below exists because validity is not enumeration — `findEntry`
 * answers about a position you already know, and the question here is which
 * positions exist at all. The decoder is cross-checked against `findEntry` on
 * every map it reads, so it can never quietly become a second, disagreeing
 * reader of the same bytes.
 */
import { createHash } from 'node:crypto'
import { SourceMap } from 'node:module'
import path from 'node:path'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const CHAR = new Map([...B64].map((c, index) => [c, index]))

/** Base64 VLQ, as the Source Map v3 specification defines it. */
export function decodeMappings(mappings) {
  const entries = []
  let genLine = 0
  let srcIdx = 0
  let srcLine = 0
  let srcCol = 0
  let nameIdx = 0

  for (const lineText of mappings.split(';')) {
    let genCol = 0
    if (lineText !== '') {
      for (const segment of lineText.split(',')) {
        if (segment === '') continue
        const values = []
        let shift = 0
        let value = 0
        for (const ch of segment) {
          const digit = CHAR.get(ch)
          if (digit === undefined) throw new Error(`invalid VLQ character ${JSON.stringify(ch)}`)
          value += (digit & 31) << shift
          if (digit & 32) {
            shift += 5
            continue
          }
          const negative = value & 1
          value >>= 1
          values.push(negative ? -value : value)
          shift = 0
          value = 0
        }
        genCol += values[0]
        if (values.length === 1) continue
        srcIdx += values[1]
        srcLine += values[2]
        srcCol += values[3]
        if (values.length > 4) nameIdx += values[4]
        entries.push({ genLine, genCol, srcIdx, srcLine, srcCol })
      }
    }
    genLine += 1
  }
  void nameIdx
  return entries
}

/**
 * Prove the decoder agrees with Node about the same bytes.
 *
 * Sampled rather than exhaustive: `findEntry` is a lookup, and running it for
 * every segment of every map would cost far more than it proves. What matters
 * is that the two readers cannot disagree about the format.
 */
function crossCheck(map, entries, sources, label) {
  const step = Math.max(1, Math.floor(entries.length / 16))
  for (let i = 0; i < entries.length; i += step) {
    const mine = entries[i]
    const theirs = map.findEntry(mine.genLine, mine.genCol)
    // The source INDEX is checked too, not only line and column. Node reports
    // the RAW `sources[]` string it read from the same bytes, so comparing it
    // against `sources[srcIdx]` is the only thing that validates the index --
    // and `mapProjection` builds the whole effective-source identity from that
    // index. Without this a decoder could attribute every segment to the wrong
    // FILE, agree about line and column, and cross-check clean.
    const mineSource = sources[mine.srcIdx]
    if (
      theirs.originalLine !== mine.srcLine ||
      theirs.originalColumn !== mine.srcCol ||
      theirs.originalSource === undefined ||
      theirs.originalSource !== mineSource
    ) {
      throw new Error(
        `${label}: the VLQ decoder disagrees with node:module at ` +
          `${mine.genLine}:${mine.genCol} — decoded ${JSON.stringify(mineSource)} ` +
          `${mine.srcLine}:${mine.srcCol}, node reported ` +
          `${JSON.stringify(theirs.originalSource)} ` +
          `${theirs.originalLine}:${theirs.originalColumn}`,
      )
    }
  }
}

/**
 * The emitted file a map is the map FOR, derived from the map's own path.
 *
 * `file` is the map's CLAIM about what it describes. Comparing it only against
 * the previous compiler's `file` value proves the claim did not change; it
 * never proves the claim is true. A map at `dist/index.js.map` naming
 * `other.js` mis-identifies its target in both projections equally, and every
 * before/after comparison passes.
 */
export function expectedEmittedTarget(mapPath) {
  const base = mapPath.split('/').pop() ?? mapPath
  return base.endsWith('.map') ? base.slice(0, -'.map'.length) : base
}

/**
 * The EFFECTIVE source a map entry attributes to.
 *
 * ECMA-426 resolves a source against `sourceRoot` and then against the map's
 * own location. Comparing raw `sources[]` alone therefore compares a spelling,
 * not an identity: a map can keep `sources: ["index.ts"]` and identical
 * mappings, change `sourceRoot`, and now point at a completely different file
 * while every raw comparison still passes.
 *
 * Returned repository-relative, so the identity survives being read from a
 * different absolute checkout and two spellings that resolve to the same file
 * compare equal.
 */
export function effectiveSource(mapPath, sourceRoot, source, repoRoot) {
  const base = path.dirname(path.resolve(repoRoot, mapPath))
  const rooted = sourceRoot ? path.resolve(base, sourceRoot) : base
  const absolute = path.resolve(rooted, source)
  return path.relative(repoRoot, absolute).split(path.sep).join('/')
}

/**
 * The comparable projection of one map.
 *
 * `attribution` is the set of (generated line -> EFFECTIVE original file,
 * original line) pairs. `coverage` is the set of original lines reached at all,
 * per effective source. Generated and original COLUMNS are deliberately
 * absent: refining them is the change the new compiler is allowed to make.
 *
 * @param mapPath repository-relative path of the map itself, needed to resolve
 * its sources the way a consumer would.
 */
export function mapProjection(text, label = 'map', mapPath = label, repoRoot = process.cwd()) {
  const json = JSON.parse(text)
  const map = new SourceMap(json)
  if (json.version !== 3) throw new Error(`${label}: not a Source Map v3 document`)
  if (!Array.isArray(json.sources)) throw new Error(`${label}: no sources array`)
  if (typeof json.mappings !== 'string') throw new Error(`${label}: no mappings string`)

  const entries = decodeMappings(json.mappings)
  crossCheck(map, entries, json.sources, label)

  const effective = json.sources.map((source) =>
    effectiveSource(mapPath, json.sourceRoot ?? '', source, repoRoot),
  )

  const attribution = new Set()
  const coverage = new Map()
  for (const entry of entries) {
    const source = effective[entry.srcIdx]
    if (source === undefined) {
      throw new Error(`${label}: mapping references source index ${entry.srcIdx}, which is absent`)
    }
    // The source INDEX, not the path: the path is already in `effectiveSources`,
    // and repeating it per entry multiplies the artifact by an order of
    // magnitude. Comparison resolves the index back to the EFFECTIVE path, so
    // neither a reordered `sources` array nor a changed `sourceRoot` can make
    // two different files compare equal.
    attribution.add(`${entry.genLine}|${entry.srcIdx}|${entry.srcLine}`)
    if (!coverage.has(source)) coverage.set(source, new Set())
    coverage.get(source).add(entry.srcLine)
  }

  return {
    file: json.file ?? null,
    sources: [...json.sources],
    sourceRoot: json.sourceRoot ?? '',
    effectiveSources: effective,
    attribution: [...attribution].sort(),
    coverage: Object.fromEntries(
      [...coverage].sort().map(([source, lines]) => [source, [...lines].sort((a, b) => a - b)]),
    ),
    mappedSegments: entries.length,
  }
}

export const digestOf = (value) =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')

/**
 * Compare one map against its projection under the previous compiler.
 *
 * @param strictLines when true (`.js.map`, whose generated `.js` is required
 * byte-identical) every generated line must keep its exact original file and
 * line. When false (`.d.ts.map`, whose generated positions may legitimately
 * move because declaration serialization may move) only original-line COVERAGE
 * must survive.
 */
/**
 * Compare one map against its projection under the previous compiler.
 *
 * Identity is the EFFECTIVE source — resolved through `sourceRoot` and the
 * map's own location — never the raw `sources[]` spelling. A changed spelling
 * that resolves to the same file is not a difference; an unchanged spelling
 * that resolves somewhere else is.
 *
 * @param strictLines when true (`.js.map`, whose generated `.js` is required
 * byte-identical) the SET of (effective file, original line) pairs must be
 * EQUAL for every generated line. Set equality rather than containment: a
 * one-way subset admits a new segment on an existing generated line that
 * resolves to a DIFFERENT original line, which is a divergent attribution
 * wearing the clothes of a refinement. An extra segment resolving to a pair
 * already present changes no set and still passes, which is the refinement the
 * new compiler is allowed to make.
 *
 * When false (`.d.ts.map`, whose generated positions may legitimately move
 * because declaration serialization may move) only original-line COVERAGE must
 * survive, and additional coverage is permitted.
 *
 * @param scope repository-relative prefix every effective source must sit
 * inside — the member that owns the map.
 *
 * @param expectedFile the emitted target this map's own path implies. Checked
 * against the CURRENT map, because it is an absolute claim rather than a
 * comparison between two compilers.
 */
export function compareMap(
  label,
  before,
  after,
  { strictLines, scope = undefined, expectedFile = undefined },
) {
  const problems = []

  if (before.file !== after.file) {
    problems.push(`${label}: emitted target changed, ${before.file} -> ${after.file}`)
  }
  // Equality above is agreement between two projections; this is agreement with
  // the map's own path. Both are needed: a map that named the wrong target
  // under BOTH compilers is stable and still wrong.
  if (expectedFile !== undefined && after.file !== expectedFile) {
    problems.push(
      `${label}: the map names "${after.file}" as its emitted target, but a map at this path ` +
        `describes "${expectedFile}"`,
    )
  }

  // Effective identities, so a `sourceRoot` change that redirects attribution
  // is caught even when `sources[]` is untouched.
  const beforeSources = new Set(before.effectiveSources ?? [])
  const afterSources = new Set(after.effectiveSources ?? [])
  for (const source of beforeSources) {
    if (!afterSources.has(source)) {
      problems.push(`${label}: effective source "${source}" is no longer mapped`)
    }
  }
  for (const source of afterSources) {
    if (!beforeSources.has(source)) {
      problems.push(`${label}: maps a new effective source "${source}"`)
    }
    if (scope !== undefined && scope !== null && !source.startsWith(scope)) {
      problems.push(
        `${label}: effective source "${source}" resolves outside the expected scope "${scope}"`,
      )
    }
  }

  /** Attribution resolved to effective paths and grouped by generated line. */
  const byLine = (record) => {
    const lines = new Map()
    for (const entry of record.attribution ?? []) {
      const [genLine, index, srcLine] = entry.split('|')
      const source = (record.effectiveSources ?? [])[Number(index)]
      if (!lines.has(genLine)) lines.set(genLine, new Set())
      lines.get(genLine).add(`${source}|${srcLine}`)
    }
    return lines
  }

  if (strictLines) {
    if (before.attribution === null || after.attribution === null) {
      problems.push(`${label}: per-line attribution is required for this surface but absent`)
      return problems
    }
    const was = byLine(before)
    const now = byLine(after)
    for (const [genLine, pairs] of was) {
      const current = now.get(genLine) ?? new Set()
      for (const pair of pairs) {
        if (!current.has(pair)) {
          const [source, srcLine] = pair.split('|')
          problems.push(
            `${label}: generated line ${genLine} no longer attributes to ${source}:${srcLine}`,
          )
        }
      }
      for (const pair of current) {
        if (!pairs.has(pair)) {
          const [source, srcLine] = pair.split('|')
          problems.push(
            `${label}: generated line ${genLine} gained an attribution to ${source}:${srcLine}, ` +
              'which is a different origin rather than a refinement of the same one',
          )
        }
      }
    }
    for (const genLine of now.keys()) {
      if (!was.has(genLine)) {
        problems.push(`${label}: generated line ${genLine} is newly attributed`)
      }
    }
  }

  for (const [source, lines] of Object.entries(before.coverage)) {
    const now = new Set(after.coverage[source] ?? [])
    const lost = lines.filter((line) => !now.has(line))
    if (lost.length > 0) {
      problems.push(
        `${label}: lost source-line coverage for ${source} — line${lost.length === 1 ? '' : 's'} ` +
          `${lost.slice(0, 5).join(', ')}${lost.length > 5 ? `, +${lost.length - 5} more` : ''}`,
      )
    }
  }

  return problems
}
