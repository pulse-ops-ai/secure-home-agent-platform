/**
 * A CLOSED LINK GRAMMAR, so completeness is enforceable rather than claimed.
 *
 * The previous check was one inline regex over raw Markdown. It missed
 * reference-style links, missed inline titles, and treated code samples as real
 * references. Replacing it with *more* regexes would have the same defect in a
 * larger form: a pattern set that silently ignores whatever it does not match.
 *
 * So this defines the link forms admission ACCEPTS, and refuses anything
 * link-shaped that falls outside them. The completeness argument is therefore
 * checkable: an unrecognised construct is a refusal, not a gap.
 *
 * ```text
 * DESTINATIONS — the only two forms that name a target
 *   inline, after `](`   [text](dest)  [text](dest "title")  [text](<dest>)
 *                        ![alt](dest), and nested ones too
 *   definition line      [label]: dest ["title"]
 *
 * NOT DESTINATIONS — they name a definition, never a target
 *   reference use        [text][label]  ·  [label][]  ·  [label]
 *   autolink             <scheme:…>     — a scheme is required, so never internal
 *
 * NOT LINKS — removed before parsing
 *   fenced code          ``` … ```   ~~~ … ~~~
 *   inline code          `…`
 *   escaped bracket      \\[
 *
 * REFUSED
 *   a destination this grammar cannot read — `reference.unreadable`
 * ```
 *
 * Destinations are classified, not resolved, here: the caller decides what an
 * internal target means, because only it knows the bundle's member set.
 */

export type LinkTarget =
  | { readonly kind: 'internal'; readonly raw: string; readonly line: number }
  | { readonly kind: 'external'; readonly raw: string; readonly line: number }
  | { readonly kind: 'unreadable'; readonly raw: string; readonly line: number }

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** Strip fenced blocks, keeping line numbers by blanking rather than deleting. */
const withoutFences = (lines: readonly string[]): string[] => {
  const out: string[] = []
  let fence: string | undefined
  for (const line of lines) {
    const opener = FENCE.exec(line)
    if (fence === undefined && opener?.[1] !== undefined) {
      fence = opener[1][0]
      out.push('')
      continue
    }
    if (fence !== undefined) {
      // A closing fence is the same character, at least as long.
      if (opener?.[1] !== undefined && opener[1][0] === fence) fence = undefined
      out.push('')
      continue
    }
    out.push(line)
  }
  return out
}

/** Blank inline code spans so their contents cannot read as links. */
const withoutCodeSpans = (line: string): string => {
  let out = ''
  let index = 0
  while (index < line.length) {
    if (line[index] === '\\') {
      // An escaped character is literal — including `\[`, which is not a link.
      out += '  '
      index += 2
      continue
    }
    if (line[index] !== '`') {
      out += line[index]
      index += 1
      continue
    }
    let run = 0
    while (line[index + run] === '`') run += 1
    const marker = '`'.repeat(run)
    const close = line.indexOf(marker, index + run)
    if (close === -1) {
      // Unterminated: treat the backticks as literal text and continue.
      out += ' '.repeat(run)
      index += run
      continue
    }
    out += ' '.repeat(close + run - index)
    index = close + run
  }
  return out
}

const classify = (raw: string, line: number): LinkTarget => {
  const trimmed = raw.trim().replace(/^<(.*)>$/, '$1')
  if (trimmed === '') return { kind: 'unreadable', raw, line }
  if (trimmed.startsWith('#')) return { kind: 'external', raw, line } // same-document anchor
  if (SCHEME.test(trimmed) || trimmed.startsWith('//')) return { kind: 'external', raw, line }
  return { kind: 'internal', raw: trimmed.split('#')[0] ?? trimmed, line }
}

/** A reference definition line: `[label]: dest ["title"]`. */
const DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*(\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/
const DEFINITION_START = /^\s{0,3}\[[^\]]+\]:/
/** An inline destination: `dest` · `dest "title"` · `<dest>`. */
const DESTINATION = /^\s*(<[^>]*>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/

/**
 * Read every link destination a document declares.
 *
 * There are exactly TWO places a destination can appear, which is what makes
 * this closed:
 *
 *   1. a reference DEFINITION line — `[label]: dest`
 *   2. immediately after the two characters `](` — every inline link and every
 *      image, including ones nested inside another link's text
 *
 * Reference USES (`[text][label]`, `[label][]`, `[label]`) are deliberately not
 * walked. A use introduces no destination of its own; it names a definition
 * whose destination rule 1 already collected. Walking them would only re-report
 * the same broken target once per use — and a mutation test proved that branch
 * could be deleted without any test noticing, which is the signature of code
 * carrying no weight.
 *
 * Anchoring on `](` rather than on `[` also removes a real blind spot: in
 * `[![alt](img.md)](dest.md)` the outer destination follows a `]` that a
 * bracket walk has already consumed, so the outer link went unread.
 */
export const linkTargets = (text: string): readonly LinkTarget[] => {
  const lines = withoutFences(text.split('\n')).map(withoutCodeSpans)
  const found: LinkTarget[] = []

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    if (DEFINITION_START.test(line)) {
      const definition = DEFINITION.exec(line)
      found.push(
        definition?.[1] === undefined
          ? { kind: 'unreadable', raw: line.trim(), line: lineNumber }
          : classify(definition[1], lineNumber),
      )
      return
    }

    let at = 0
    for (;;) {
      const open = line.indexOf('](', at)
      if (open === -1) break
      const close = line.indexOf(')', open + 2)
      if (close === -1) {
        found.push({ kind: 'unreadable', raw: line.slice(open + 1), line: lineNumber })
        break
      }
      // A destination containing an unescaped `)` ends early and then fails to
      // resolve — a refusal, not a silent miss. This grammar fails closed.
      const inner = line.slice(open + 2, close)
      const destination = DESTINATION.exec(inner)
      found.push(
        destination?.[1] === undefined
          ? { kind: 'unreadable', raw: inner, line: lineNumber }
          : classify(destination[1], lineNumber),
      )
      at = close + 1
    }
  })

  return found
}
