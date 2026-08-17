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

/**
 * **OPAQUE ON PURPOSE**, like `AdmittedBundle` and `ReviewEvidence`.
 *
 * The admission chain was guarded up to its last link and open at it. `admit()`
 * mints an opaque proof and `packageBundle()` demands one — but the artifact
 * that came out was an ordinary exported interface, and the public `query()`
 * accepts it. So a consumer could write the four visible members by hand,
 * around content admission had refused, and read it through the public seam.
 * Every guarantee upstream was optional for anyone who skipped to the end.
 *
 * The brand below is an unexported `unique symbol`: no code outside this
 * package can name that key, so matching the visible shape is not enough and
 * `packageBundle()` is the only production minting boundary. Consumers still
 * read `digest`, `manifest()`, `documents`, and `members` — the artifact
 * contract is unchanged; only its forgeability is.
 *
 * The threat model is ordinary structural typing. A caller who reaches for an
 * unsafe cast has left the type system, and `openAdmitted` still refuses a
 * handle it never minted.
 */
declare const PACKAGED: unique symbol

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
  /** Unforgeable outside this package: the symbol is not exported. */
  readonly [PACKAGED]: true
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
  // The single minting boundary. The brand has no runtime representation, so
  // the cast is how it is applied — confined to this one line, in the only
  // function permitted to produce the artifact.
  return Object.freeze({
    digest: bundleDigest(owned),
    manifest: () => copy(manifest),
    documents: Object.freeze(bundle.documents.map(packDocument)),
    members: Object.freeze(
      owned.map((member) => Object.freeze({ path: member.path, bytes: () => copy(member.bytes) })),
    ),
  }) as unknown as PackagedBundle
}
