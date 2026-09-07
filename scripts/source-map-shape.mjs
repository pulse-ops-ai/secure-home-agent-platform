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
function crossCheck(map, entries, label) {
  const step = Math.max(1, Math.floor(entries.length / 16))
  for (let i = 0; i < entries.length; i += step) {
    const mine = entries[i]
    const theirs = map.findEntry(mine.genLine, mine.genCol)
    if (
      theirs.originalLine !== mine.srcLine ||
      theirs.originalColumn !== mine.srcCol ||
      theirs.originalSource === undefined
    ) {
      throw new Error(
        `${label}: the VLQ decoder disagrees with node:module at ` +
          `${mine.genLine}:${mine.genCol} — decoded ${mine.srcLine}:${mine.srcCol}, ` +
          `node reported ${theirs.originalLine}:${theirs.originalColumn}`,
      )
    }
  }
}

/**
 * The comparable projection of one map.
 *
 * `attribution` is the set of (generated line -> original file, original line)
 * pairs. `coverage` is the set of original lines reached at all, per source.
 * Generated and original COLUMNS are deliberately absent: refining them is the
 * change the new compiler is allowed to make.
 */
export function mapProjection(text, label = 'map') {
  const json = JSON.parse(text)
  const map = new SourceMap(json)
  if (json.version !== 3) throw new Error(`${label}: not a Source Map v3 document`)
  if (!Array.isArray(json.sources)) throw new Error(`${label}: no sources array`)
  if (typeof json.mappings !== 'string') throw new Error(`${label}: no mappings string`)

  const entries = decodeMappings(json.mappings)
  crossCheck(map, entries, label)

  const attribution = new Set()
  const coverage = new Map()
  for (const entry of entries) {
    const source = json.sources[entry.srcIdx]
    if (source === undefined) {
      throw new Error(`${label}: mapping references source index ${entry.srcIdx}, which is absent`)
    }
    // The source INDEX, not the path: the path is already in `sources`, and
    // repeating it per entry multiplies the artifact by an order of magnitude.
    // Comparison resolves the index back through `sources`, so a reordered
    // `sources` array cannot make two different files compare equal.
    attribution.add(`${entry.genLine}|${entry.srcIdx}|${entry.srcLine}`)
    if (!coverage.has(source)) coverage.set(source, new Set())
    coverage.get(source).add(entry.srcLine)
  }

  return {
    file: json.file ?? null,
    sources: [...json.sources],
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
export function compareMap(label, before, after, { strictLines }) {
  const problems = []

  if (before.file !== after.file) {
    problems.push(`${label}: emitted target changed, ${before.file} -> ${after.file}`)
  }
  const beforeSources = new Set(before.sources)
  const afterSources = new Set(after.sources)
  for (const source of beforeSources) {
    if (!afterSources.has(source)) problems.push(`${label}: source "${source}" is no longer mapped`)
  }
  for (const source of afterSources) {
    if (!beforeSources.has(source)) problems.push(`${label}: maps a new source "${source}"`)
  }

  if (strictLines) {
    if (before.attribution === null || after.attribution === null) {
      problems.push(`${label}: per-line attribution is required for this surface but absent`)
      return problems
    }
    // Resolved to source PATHS on both sides before comparing, so a reordered
    // `sources` array cannot make two different files compare equal.
    const resolve = (entries, sources) =>
      entries.map((entry) => {
        const [genLine, index, srcLine] = entry.split('|')
        return `${genLine}|${sources[Number(index)]}|${srcLine}`
      })
    const now = new Set(resolve(after.attribution, after.sources))
    const lost = resolve(before.attribution, before.sources).filter((entry) => !now.has(entry))
    if (lost.length > 0) {
      const [genLine, source, srcLine] = lost[0].split('|')
      problems.push(
        `${label}: generated line ${genLine} no longer attributes to ${source}:${srcLine}` +
          (lost.length > 1 ? ` (and ${lost.length - 1} more)` : ''),
      )
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
