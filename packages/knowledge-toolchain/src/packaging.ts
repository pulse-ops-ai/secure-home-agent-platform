/**
 * PACKAGE — an immutable, digest-addressed artifact.
 *
 * No store, no database, no persistence. ADR-0015 §7 defines `package` as
 * "manifest + digest; immutable, addressable", and none of that needs a place
 * to live: addressability is the digest, and immutability is enforced here by
 * freezing what the caller receives.
 *
 * The digest comes from `identity.ts` and therefore from raw bytes. Nothing in
 * this module re-serializes anything.
 */
import { bundleDigest, manifestBytes } from './identity.js'
import type { CompiledBundle, CompiledDocument, SourceFile } from './types.js'

export interface PackagedBundle {
  readonly digest: string
  readonly manifest: Uint8Array
  readonly documents: readonly CompiledDocument[]
  readonly members: readonly SourceFile[]
}

/**
 * Package an admitted bundle.
 *
 * Frozen at every level the caller can reach — the object, the arrays, and each
 * document. `readonly` is erased at runtime, and a packaged artifact that a
 * caller can edit is not immutable in any sense that matters to a digest.
 */
export const packageBundle = (bundle: CompiledBundle): PackagedBundle => {
  const members = Object.freeze(bundle.members.map((member) => Object.freeze({ ...member })))
  const documents = Object.freeze(
    bundle.documents.map((document) => Object.freeze({ ...document })),
  )
  return Object.freeze({
    digest: bundleDigest(bundle.members),
    manifest: manifestBytes(bundle.members),
    documents,
    members,
  })
}
