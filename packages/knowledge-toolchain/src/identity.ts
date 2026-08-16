/**
 * PACKAGE IDENTITY, EXACTLY AS ADR-0015 §6 FIXES IT.
 *
 * ```text
 * file_digest    := sha256(raw file bytes)
 * line           := <normalized-path> NUL <lowercase-hex sha256> LF
 * order          := ascending by the UTF-8 bytes of the NFC-normalized path
 * prefix         := "okf-package-v1" LF
 * manifest_bytes := prefix || line*
 * bundle_digest  := sha256(manifest_bytes)
 * ```
 *
 * Two things are deliberately absent, and their absence is the design. **No
 * JSON** — delimiter and encoding choices would move the digest without the
 * knowledge moving. **No parsed YAML** — a spike re-serialized one frontmatter
 * block three defensible ways and produced three different digests, none
 * matching the original bytes, which would make identity a function of a
 * dependency's dump settings.
 *
 * The prefix carries a version, so a future change to this serialization is a
 * visible, governed break rather than a silent re-identification of unchanged
 * knowledge.
 */
import { createHash } from 'node:crypto'
import type { SourceFile } from './types.js'

export const PACKAGE_FORMAT = 'okf-package-v1'

const NUL = 0x00
const LF = 0x0a

export const fileDigest = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

/**
 * Compare by the UTF-8 BYTES of the path, never by locale collation.
 *
 * A bare `sort()` orders by UTF-16 code units and `localeCompare` depends on
 * the host's locale data. Either would make identity environment-dependent,
 * which is the property this whole module exists to deny.
 */
const byPathBytes = (a: Uint8Array, b: Uint8Array): number => {
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i += 1) {
    const left = a[i] as number
    const right = b[i] as number
    if (left !== right) return left - right
  }
  return a.length - b.length
}

/**
 * The canonical manifest bytes for a member set.
 *
 * Enumeration order of the input does not matter: rows are sorted here, so a
 * filesystem yielding files in a different order still produces identical
 * bytes.
 */
export const manifestBytes = (members: readonly SourceFile[]): Uint8Array => {
  const encoder = new TextEncoder()
  const rows = members
    .map((member) => ({
      path: encoder.encode(member.path),
      digest: encoder.encode(fileDigest(member.bytes)),
    }))
    .sort((a, b) => byPathBytes(a.path, b.path))

  const prefix = encoder.encode(`${PACKAGE_FORMAT}\n`)
  const size =
    prefix.length +
    rows.reduce((total, row) => total + row.path.length + 1 + row.digest.length + 1, 0)
  const out = new Uint8Array(size)
  out.set(prefix, 0)
  let at = prefix.length
  for (const row of rows) {
    out.set(row.path, at)
    at += row.path.length
    out[at] = NUL
    at += 1
    out.set(row.digest, at)
    at += row.digest.length
    out[at] = LF
    at += 1
  }
  return out
}

export const bundleDigest = (members: readonly SourceFile[]): string =>
  createHash('sha256').update(manifestBytes(members)).digest('hex')
