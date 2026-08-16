/**
 * COMPILE: OKF v0.2 source bytes → an internal representation.
 *
 * Two invariants, both from ADR-0015:
 *
 *  - **Bytes are retained beside the parse.** Everything downstream that needs
 *    identity uses `bytes`; everything that needs meaning uses `frontmatter`.
 *    They never cross.
 *  - **Source is never rewritten.** Not to normalize newlines, not to add a
 *    trailing newline, not to canonicalize YAML. Envelope violations are an
 *    admission REFUSAL (§6), because a helpful rewrite changes the bytes the
 *    digest identifies — reintroducing at the other end the defect the raw-byte
 *    rule exists to prevent.
 */
import { parse as parseYaml } from 'yaml'
import type { Compiled, CompiledDocument, Refusal, SourceFile } from './types.js'

const DELIMITER = '---'

/** `index.md` and `log.md` are OKF's only reserved names. */
export const RESERVED = new Set(['index.md', 'log.md'])

const decoder = new TextDecoder('utf-8', { fatal: true })

const isConceptPath = (path: string): boolean =>
  path.endsWith('.md') && !RESERVED.has(path.split('/').pop() ?? '')

/**
 * Split a document into its frontmatter block and body.
 *
 * Returns `undefined` when there is no frontmatter at all, which the caller
 * turns into a typed refusal — OKF conformance requires every non-reserved
 * `.md` file to carry a parseable block.
 */
const splitFrontmatter = (
  text: string,
): { readonly yaml: string; readonly body: string; readonly line: number } | undefined => {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== DELIMITER) return undefined
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === DELIMITER)
  if (end === -1) return undefined
  return {
    yaml: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
    line: 1,
  }
}

/**
 * Compile a member set.
 *
 * Non-`.md` members are carried through untouched: they are an ADMISSION
 * concern (a media indicator), not a parse concern, and dropping them here
 * would hide them from the check that exists to catch them.
 */
export const compile = (members: readonly SourceFile[]): Compiled => {
  const refusals: Refusal[] = []
  const documents: CompiledDocument[] = []
  let okfVersion: string | undefined

  for (const member of members) {
    if (!member.path.endsWith('.md')) continue

    let text: string
    try {
      text = decoder.decode(member.bytes)
    } catch {
      refusals.push({
        kind: 'malformed_source',
        path: member.path,
        rule: 'source.utf8',
        detail: 'source is not valid UTF-8',
      })
      continue
    }

    const split = splitFrontmatter(text)
    const reserved = RESERVED.has(member.path.split('/').pop() ?? '')

    if (split === undefined) {
      // A reserved file without frontmatter is permitted by OKF; a concept
      // document without one is not.
      if (!reserved) {
        refusals.push({
          kind: 'malformed_source',
          path: member.path,
          rule: 'okf.frontmatter.present',
          detail: 'no parseable YAML frontmatter block',
        })
      }
      continue
    }

    let parsed: unknown
    try {
      parsed = parseYaml(split.yaml) as unknown
    } catch (error) {
      refusals.push({
        kind: 'malformed_source',
        path: member.path,
        rule: 'okf.frontmatter.parses',
        detail: `frontmatter is not parseable YAML: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      refusals.push({
        kind: 'malformed_source',
        path: member.path,
        rule: 'okf.frontmatter.mapping',
        detail: 'frontmatter is not a YAML mapping',
      })
      continue
    }

    const frontmatter = parsed as Record<string, unknown>
    // `okf_version` is declared in the bundle-root index.md and nowhere else.
    if (member.path === 'index.md' && typeof frontmatter['okf_version'] === 'string') {
      okfVersion = frontmatter['okf_version']
    }
    if (!isConceptPath(member.path)) continue

    documents.push({
      path: member.path,
      bytes: member.bytes,
      frontmatter: Object.freeze({ ...frontmatter }),
      body: split.body,
      frontmatterLine: split.line,
    })
  }

  if (refusals.length > 0) return { ok: false, refusals }
  return { ok: true, bundle: { documents, members, okfVersion } }
}
