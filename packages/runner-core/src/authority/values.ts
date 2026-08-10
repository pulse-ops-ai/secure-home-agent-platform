/**
 * Input VALUE types (design D3). The core defines the shape of what it
 * consumes — never a reader, observer, source, or port interface. L4 owns
 * every real acquisition and passes results in as these immutable values;
 * a reported acquisition failure travels as data and classifies as
 * operational failure, never as a contract refusal (INV-003).
 */

/** Identifies where authority bytes came from — opaque to the core. */
export interface SourceIdentity {
  readonly source: string
}

/** One authority input as acquired by the orchestrator. */
export type AuthorityBytes =
  | { readonly ok: true; readonly source: SourceIdentity; readonly bytes: string }
  | { readonly ok: false; readonly source: SourceIdentity; readonly failure: string }
