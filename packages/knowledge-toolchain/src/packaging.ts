/**
 * PACKAGE — an immutable, digest-addressed artifact.
 *
 * Two properties the first version claimed and did not have.
 *
 * **It requires PROOF OF ADMISSION**, not a `CompiledBundle`. Accepting any
 * compiled input meant `compile(anything) → packageBundle → query` produced the
 * same artifact type repository knowledge flows through, so admission was
 * advisory: a comment said the input had been admitted and nothing enforced it.
 * `AdmittedBundle` is branded and only `admit()` mints one.
 *
 * **It is immutable in the way a digest needs.** `Object.freeze` is shallow: it
 * does not stop `bytes[0] = 0x58` on a `Uint8Array`, and it does not reach
 * nested frontmatter. So every buffer is COPIED at construction, `manifest()`
 * hands back a fresh copy per call, and frontmatter is deep-frozen. Otherwise
 * package state could drift from the digest that identifies it — silently,
 * because the digest is computed once.
 */
import { bundleDigest, manifestBytes } from './identity.js'
import { openAdmitted } from './admitted.js'
import type { AdmittedBundle, CompiledDocument } from './types.js'

/** A packaged document. `bytes()` returns a copy; the frontmatter is frozen. */
export interface PackagedDocument {
  readonly path: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly body: string
  bytes(): Uint8Array
}

export interface PackagedMember {
  readonly path: string
  bytes(): Uint8Array
}

export interface PackagedBundle {
  readonly digest: string
  /** A FRESH copy each call — a returned buffer is the caller's to ruin. */
  manifest(): Uint8Array
  readonly documents: readonly PackagedDocument[]
  readonly members: readonly PackagedMember[]
}

/** Freeze through nested plain objects and arrays, not merely the top level. */
const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') return value
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return Object.freeze(value)
}

const copy = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes)

const packDocument = (document: CompiledDocument): PackagedDocument => {
  const owned = copy(document.bytes)
  const frontmatter = deepFreeze(structuredClone(document.frontmatter) as Record<string, unknown>)
  return Object.freeze({
    path: document.path,
    frontmatter,
    body: document.body,
    bytes: () => copy(owned),
  })
}

/**
 * Package an ADMITTED bundle.
 *
 * The digest is computed from the copies this function owns, so a caller
 * mutating the source it handed in afterwards cannot change what was packaged.
 */
export const packageBundle = (admitted: AdmittedBundle): PackagedBundle => {
  const bundle = openAdmitted(admitted)
  const owned = bundle.members.map((member) => ({
    path: member.path,
    bytes: copy(member.bytes),
  }))
  const manifest = manifestBytes(owned)
  return Object.freeze({
    digest: bundleDigest(owned),
    manifest: () => copy(manifest),
    documents: Object.freeze(bundle.documents.map(packDocument)),
    members: Object.freeze(
      owned.map((member) => Object.freeze({ path: member.path, bytes: () => copy(member.bytes) })),
    ),
  })
}
