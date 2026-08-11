/**
 * Observation VALUE types (design D3). L4 physically observes the
 * workspace and artifact surface and supplies the results as these
 * immutable values; "we could not look" arrives as `ok: false` and
 * classifies as operational failure — never as an empty set, because
 * "nothing changed" and "we could not look" are different facts.
 */

export interface ObservedChange {
  readonly path: string
  readonly kind: 'created' | 'modified' | 'deleted'
  /** Size of the changed file as observed; 0 for a deletion. */
  readonly bytes: number
  /**
   * Where the host observation reports the path is reached through a
   * link or alias: the resolved target. Decisions treat the TARGET as
   * the effective location — an alias whose target escapes its root
   * refuses with both names recorded (RC-ADV-05).
   */
  readonly link_target?: string
}

export type WorkspaceObservation =
  | { readonly ok: true; readonly changes: readonly ObservedChange[] }
  | { readonly ok: false; readonly failure: string }

export interface ObservedArtifact {
  readonly path: string
  /** The observed content — the core recomputes the digest itself. */
  readonly content: string
}

export type ArtifactObservation =
  | { readonly ok: true; readonly artifacts: readonly ObservedArtifact[] }
  | { readonly ok: false; readonly failure: string }
