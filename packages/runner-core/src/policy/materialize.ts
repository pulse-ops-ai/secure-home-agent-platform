/**
 * Materialization eligibility over the observed change set (requirements
 * "Write eligibility derives from captured policy alone", "Paths are
 * decided after normalization, and escapes refuse", "Governing material
 * is never writable by the run", "Security-relevant bounds refuse, never
 * truncate"; design D8, D9, D10; the materialization decision table).
 *
 * Refusal precedence: protected material outranks everything (a policy
 * that widens a root must not silently unprotect the judge material);
 * then root membership; then bounds. A refusal refuses the WHOLE change
 * set — nothing is dropped, truncated, or partially reported.
 *
 * Prohibited rules arrive TYPED from the L2 contract (path-policy 2.0.0).
 * Defense in depth (RC-INV-08): a rule whose kind lies outside this
 * core's implemented vocabulary — possible only if a future contract
 * version adds one — refuses the whole policy rather than being skipped:
 * a protection rule silently ignored is a protection silently removed.
 */
import type { PathPolicyT } from '@secure-home/contracts'
import { coerceRefusal, type Decision, proceed, refuse } from '../decision/index.js'
import { canonicalSort, isPathPrefix, normalizePath } from '../primitives/index.js'
import type { CapturedAuthority } from '../authority/index.js'
import type { AuthoritativeChangeSet, ObservedChange } from '../workspace/index.js'

const IMPLEMENTED_RULE_KINDS = new Set(['path_prefix'])

export interface Materializable {
  readonly changes: readonly ObservedChange[]
  /** The bound names checked, for refusal-evidence completeness. */
  readonly bounds_checked: readonly string[]
}

export const decideMaterialization = (
  policy: CapturedAuthority<PathPolicyT> | undefined,
  observed: AuthoritativeChangeSet,
  protectedSources: readonly string[] = [],
): Decision<Materializable> => {
  if (policy === undefined || policy === null || typeof policy !== 'object') {
    return refuse(
      'missing_authority',
      { element: 'path-policy' },
      'no captured path policy — materialization has no authority to decide from',
    )
  }
  const okFlag = (policy as { ok?: unknown }).ok
  if (okFlag === false) {
    return coerceRefusal((policy as { refusal?: unknown }).refusal, 'path-policy')
  }
  const doc = (policy as { value?: unknown }).value as PathPolicyT | undefined
  if (
    okFlag !== true ||
    doc === undefined ||
    typeof doc !== 'object' ||
    !Array.isArray(doc.prohibited_rules) ||
    !Array.isArray(doc.allowed_write_roots)
  ) {
    return refuse(
      'undecidable',
      { element: 'path-policy' },
      'the captured path-policy value shape cannot be established',
    )
  }
  for (const rule of doc.prohibited_rules) {
    if (!IMPLEMENTED_RULE_KINDS.has(rule.kind)) {
      return refuse(
        'unrecognized_rule',
        { element: String(rule.kind) },
        'prohibited rule kind is outside the implemented vocabulary — the whole policy refuses rather than skipping a protection',
      )
    }
  }

  const protectedPrefixes: string[] = doc.prohibited_rules.map((rule) => rule.prefix)
  for (const source of protectedSources) {
    const normalized = normalizePath(source)
    if (!normalized.ok) {
      // Fail closed at the judge-protection boundary (review P2 on
      // d749da7): a protected path that cannot be established must not
      // silently become "not protected".
      return refuse(
        'path_undecidable',
        { element: source },
        `protected authority source cannot be normalized: ${normalized.reason} — an unestablishable protection refuses rather than lapsing`,
      )
    }
    protectedPrefixes.push(normalized.normalized)
  }

  const roots: string[] = []
  for (const root of doc.allowed_write_roots) {
    const normalized = normalizePath(root)
    if (!normalized.ok) {
      return refuse(
        'path_undecidable',
        { element: root },
        `declared write root cannot be normalized: ${normalized.reason}`,
      )
    }
    roots.push(normalized.normalized)
  }

  const observedChanges: unknown = (observed as { changes?: unknown } | null | undefined)?.changes
  if (!Array.isArray(observedChanges)) {
    return refuse(
      'undecidable',
      { element: 'observed change set' },
      'the observed change-set value shape cannot be established',
    )
  }

  const changes: ObservedChange[] = []
  for (const change of observedChanges as readonly ObservedChange[]) {
    const normalized = normalizePath(change.path)
    if (!normalized.ok) {
      return refuse(
        'path_undecidable',
        { element: change.path },
        `path cannot be normalized: ${normalized.reason}`,
      )
    }
    changes.push({ ...change, path: normalized.normalized })
  }

  // A path reached through a link is decided at its reported TARGET: an
  // alias must not launder an escape or a protected write (RC-ADV-05).
  const effectivePaths = new Map<string, string>()
  for (const change of changes) {
    if (change.link_target === undefined) {
      effectivePaths.set(change.path, change.path)
      continue
    }
    const target = normalizePath(change.link_target)
    if (!target.ok) {
      return refuse(
        'path_undecidable',
        { element: change.path, observed: change.link_target },
        `path is reached through a link whose reported target cannot be normalized: ${target.reason}`,
      )
    }
    effectivePaths.set(change.path, target.normalized)
  }
  const effectiveOf = (path: string): string => effectivePaths.get(path) ?? path

  // Protection outranks the roots and the bounds: report it first.
  for (const change of changes) {
    const effective = effectiveOf(change.path)
    const protection = protectedPrefixes.find(
      (prefix) => isPathPrefix(prefix, change.path) || isPathPrefix(prefix, effective),
    )
    if (protection !== undefined) {
      const admittedByRoot = roots.some((root) => isPathPrefix(root, change.path))
      return refuse(
        'protected_path',
        { element: change.path, observed: protection },
        admittedByRoot
          ? `change touches protected governing material (rule "${protection}") — protection outranks the allowed write root that would otherwise admit it; the whole change set refuses`
          : `change touches protected governing material (rule "${protection}"); the whole change set refuses`,
      )
    }
  }

  for (const change of changes) {
    if (!roots.some((root) => isPathPrefix(root, change.path))) {
      return refuse(
        'path_outside_roots',
        { element: change.path },
        'path resolves under no declared allowed write root',
      )
    }
    const effective = effectiveOf(change.path)
    if (effective !== change.path && !roots.some((root) => isPathPrefix(root, effective))) {
      return refuse(
        'path_outside_roots',
        { element: change.path, observed: effective },
        `path is reached through a link whose target "${effective}" resolves outside every declared allowed write root`,
      )
    }
  }

  // Bounds: refuse, never truncate. Exactly at the bound proceeds (D10).
  const fileCount = changes.length
  if (fileCount > doc.max_files) {
    return refuse(
      'over_bound',
      { element: 'max_files', observed: String(fileCount) },
      `change set carries ${String(fileCount)} files against a declared bound of ${String(doc.max_files)}`,
    )
  }
  let totalBytes = 0
  for (const change of changes) {
    if (change.bytes > doc.max_file_bytes) {
      return refuse(
        'over_bound',
        { element: 'max_file_bytes', observed: String(change.bytes) },
        `"${change.path}" carries ${String(change.bytes)} bytes against a declared per-file bound of ${String(doc.max_file_bytes)}`,
      )
    }
    totalBytes += change.bytes
  }
  if (totalBytes > doc.max_total_bytes) {
    return refuse(
      'over_bound',
      { element: 'max_total_bytes', observed: String(totalBytes) },
      `change set carries ${String(totalBytes)} bytes against a declared total bound of ${String(doc.max_total_bytes)}`,
    )
  }

  return proceed({
    changes: canonicalSort(changes, (change) => change.path),
    bounds_checked: ['max_files', 'max_file_bytes', 'max_total_bytes'],
  })
}
