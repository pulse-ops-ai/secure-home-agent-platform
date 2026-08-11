/**
 * Authoritative change-set derivation (requirement "The authoritative
 * change set derives from host observation"; INV-006). The interface
 * accepts the host observation ONLY — claims are structurally unable to
 * reach it; they enter solely through reconciliation, after derivation.
 */
import { type ObservedDecision, operationalFailure, proceed, refuse } from '../decision/index.js'
import { canonicalSort, normalizePath } from '../primitives/index.js'
import type { ObservedChange, WorkspaceObservation } from './values.js'

export interface AuthoritativeChangeSet {
  /** Normalized, canonically ordered; exactly the observed changes. */
  readonly changes: readonly ObservedChange[]
}

export const deriveAuthoritativeChangeSet = (
  observation: WorkspaceObservation,
): ObservedDecision<AuthoritativeChangeSet> => {
  if (!observation.ok) {
    return operationalFailure('workspace', `observation reported failed: ${observation.failure}`)
  }
  const observedChanges: readonly ObservedChange[] | undefined = Array.isArray(observation.changes)
    ? observation.changes
    : undefined
  if (observedChanges === undefined) {
    return refuse(
      'undecidable',
      { element: 'workspace observation' },
      'the observation value shape cannot be established',
    )
  }
  const normalized: ObservedChange[] = []
  for (const change of observedChanges) {
    const path = normalizePath(change.path)
    if (!path.ok) {
      return refuse(
        'path_undecidable',
        { element: change.path },
        `observed path cannot be normalized: ${path.reason}`,
      )
    }
    normalized.push({ ...change, path: path.normalized })
  }
  return proceed({ changes: canonicalSort(normalized, (change) => change.path) })
}
