/**
 * Pure, decision-free path normalization. String computation only — the
 * filesystem is never consulted (the core performs no I/O), so
 * normalization is deterministic and identical for producer and verifier.
 */

export type NormalizedPath =
  | { readonly ok: true; readonly normalized: string }
  | { readonly ok: false; readonly reason: string }

/**
 * Normalize a repository-relative path: resolve `.` and empty segments,
 * refuse absolute forms, schemes, backslashes, and any `..` traversal
 * that is present at all — a change-set path has no legitimate traversal
 * use, and resolving traversal against an unconsulted filesystem would be
 * a guess. Undecidable forms report `ok: false`; the caller refuses.
 */
export const normalizePath = (raw: string): NormalizedPath => {
  if (raw.length === 0) return { ok: false, reason: 'empty path' }
  if (raw.includes('\\')) return { ok: false, reason: 'backslash separator' }
  if (raw.startsWith('/')) return { ok: false, reason: 'absolute path' }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) return { ok: false, reason: 'scheme-qualified path' }
  if (raw.includes('\0')) return { ok: false, reason: 'NUL byte' }
  const segments = raw.split('/').filter((segment) => segment !== '' && segment !== '.')
  if (segments.length === 0) return { ok: false, reason: 'no path components' }
  if (segments.includes('..')) return { ok: false, reason: 'traversal segment' }
  return { ok: true, normalized: segments.join('/') }
}

/**
 * Component-wise prefix: `docs` covers `docs/a.md`, never `docs-2/a.md`.
 * Both inputs must already be normalized.
 */
export const isPathPrefix = (prefix: string, path: string): boolean =>
  path === prefix || path.startsWith(`${prefix}/`)
