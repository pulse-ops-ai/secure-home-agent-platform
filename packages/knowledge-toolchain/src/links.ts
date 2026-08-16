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

const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Strip fenced blocks, keeping line numbers by blanking rather than deleting.
 *
 * A fence closes only on the SAME character, a run AT LEAST AS LONG, and
 * nothing after it. The comment used to claim the length rule while comparing
 * only the character, so a three-backtick line closed a four-backtick fence —
 * which is exactly how one quotes Markdown inside Markdown, and it made the
 * quoted sample's links visible as real references.
 */
const withoutFences = (lines: readonly string[]): string[] => {
  const out: string[] = []
  let fence: { char: string; length: number } | undefined
  for (const line of lines) {
    const run = FENCE.exec(line)?.[1]
    if (fence === undefined) {
      if (run === undefined) {
        out.push(line)
        continue
      }
      fence = { char: run[0] as string, length: run.length }
      out.push('')
      continue
    }
    const closes =
      run !== undefined &&
      run[0] === fence.char &&
      run.length >= fence.length &&
      (FENCE.exec(line)?.[2] ?? '').trim() === ''
    if (closes) fence = undefined
    out.push('')
  }
  return out
}

/**
 * RAW HTML IS OUTSIDE THE ADMITTED SUBSET.
 *
 * `<a href="missing.md">model</a>` named a target the Markdown grammar never
 * looked at, so it passed reference integrity in silence — the precise failure
 * the closed grammar exists to prevent.
 *
 * The rule refuses ANY raw HTML tag rather than the URL-bearing ones, because
 * "the URL-bearing ones" is not a closed set: href, src, srcset, poster, cite,
 * data, action, formaction, ping, background, longdesc, usemap, and whatever
 * the next specification adds. Enumerating them would reproduce the original
 * defect in a new costume. The admitted subset is Markdown without raw HTML,
 * which is a claim a reader can check.
 *
 * An autolink — `<https://example.test>` — is not a tag: it requires a scheme,
 * so it is always external and can never name a bundle-internal document. The
 * lookahead is what separates the two.
 */
const RAW_HTML = /<\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>]|$)|<!|<\?/

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

/**
 * The index of the `)` that closes a destination opened at `from`, or -1.
 *
 * Stopping at the FIRST `)` did not merely truncate — it could re-point a
 * reference at a different file. Given a bundle containing `foo(bar.md` and a
 * document writing `[x](foo(bar.md))`, the real destination is `foo(bar.md)`,
 * which does not exist; the truncated one does, so a broken reference was
 * admitted as a sound reference to somewhere the author never named.
 *
 * A misread that RESOLVES is worse than one that fails, because nothing
 * downstream can tell it happened.
 *
 * Parentheses inside the angle form are literal, so that span is skipped before
 * depth counting begins.
 */
const destinationEnd = (line: string, from: number): number => {
  let at = from
  if (line[at] === '<') {
    const shut = line.indexOf('>', at + 1)
    if (shut === -1) return -1
    at = shut + 1
  }
  let depth = 0
  for (; at < line.length; at += 1) {
    if (line[at] === '(') depth += 1
    else if (line[at] === ')') {
      if (depth === 0) return at
      depth -= 1
    }
  }
  return -1
}

/**
 * A destination the closed subset can read, or an explicit refusal.
 *
 * A BARE destination containing a parenthesis is outside the admitted subset.
 * CommonMark does allow balanced parentheses there, so this is narrower than
 * the specification on purpose: the initial subset takes the unambiguous form
 * and refuses the rest rather than guessing. `<...>` is the supported way to
 * write one, and it is delimited, so it cannot be misread.
 *
 * The rule does not ask whether the target is internal or external. It could
 * not: classification depends on having parsed the destination, which is the
 * step in question.
 */
const readDestination = (raw: string, line: number): LinkTarget =>
  !raw.startsWith('<') && /[()]/.test(raw) ? { kind: 'unreadable', raw, line } : classify(raw, line)

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
 * A destination is read only where a MATCHED, UNESCAPED `[` … `]` pair is
 * followed by `(`. Matching with a stack rather than scanning for the two
 * characters `](` is what makes `\[model](missing.md)` literal text: the escape
 * has already been blanked, so no `[` was ever opened and the `]` closes
 * nothing. It still reads the outer destination of `[![alt](img.md)](dest.md)`,
 * where a naive "nearest bracket" rule sees the image's `]` and gives up.
 */
export const linkTargets = (text: string): readonly LinkTarget[] => {
  const lines = withoutFences(text.split('\n')).map(withoutCodeSpans)
  const found: LinkTarget[] = []

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    const html = RAW_HTML.exec(line)
    if (html !== null) {
      found.push({ kind: 'unreadable', raw: html[0], line: lineNumber })
      return
    }

    if (DEFINITION_START.test(line)) {
      const definition = DEFINITION.exec(line)
      found.push(
        definition?.[1] === undefined
          ? { kind: 'unreadable', raw: line.trim(), line: lineNumber }
          : readDestination(definition[1], lineNumber),
      )
      return
    }

    const open: number[] = []
    let at = 0
    while (at < line.length) {
      if (line[at] === '[') {
        open.push(at)
        at += 1
        continue
      }
      if (line[at] !== ']' || open.pop() === undefined || line[at + 1] !== '(') {
        at += 1
        continue
      }
      const close = destinationEnd(line, at + 2)
      if (close === -1) {
        found.push({ kind: 'unreadable', raw: line.slice(at + 1), line: lineNumber })
        break
      }
      const inner = line.slice(at + 2, close)
      const destination = DESTINATION.exec(inner)
      found.push(
        destination?.[1] === undefined
          ? { kind: 'unreadable', raw: inner, line: lineNumber }
          : readDestination(destination[1], lineNumber),
      )
      at = close + 1
    }
  })

  return found
}
