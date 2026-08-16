/**
 * ADMISSION — strict repository policy, and NOT OKF consumer conformance.
 *
 * OKF says a consumer "MUST NOT reject a bundle because of: Missing optional
 * frontmatter fields, Unknown `type` values, Unknown additional frontmatter
 * keys, Broken cross-links, Missing `index.md` files." Every field this
 * repository requires is optional there. The two postures are not in conflict
 * because they act at different moments (ADR-0015 §4): admission runs BEFORE a
 * module is knowledge; consumer tolerance runs after. `query.ts` is the tolerant
 * half.
 *
 * `admitted` and `publishable` are separate outcomes (ADR-0016 §9a). There is no
 * single boolean here, deliberately: a module can be admitted and unpublishable,
 * and today every module would be, because no governed Proof B producer exists.
 */
import { compile } from './compile.js'
import { bundleDigest } from './identity.js'
import { scanDocument, scanMembers } from './indicators.js'
import { linkTargets } from './links.js'
import { checkProofA, checkProofB } from './attestation.js'
import { sealAdmitted } from './admitted.js'
import type {
  AdmissionOutcome,
  CatalogEntry,
  CompiledDocument,
  Refusal,
  ReviewEvidence,
  SourceFile,
} from './types.js'

export const OKF_VERSION = '0.2'

const decoder = new TextDecoder('utf-8', { fatal: true })

/** Execution-bearing OKF fields, refused REGARDLESS of declared `type`. */
const EXECUTION_FIELDS = ['runtime', 'computation', 'executor', 'attester'] as const
const ATTESTED_COMPUTATION = 'Attested Computation'

/** The repository profile beyond OKF's single required `type` (ADR-0015 §5). */
const REQUIRED_FIELDS = [
  'type',
  'owner',
  'as_of',
  'limitations',
  'status',
  'stale_after',
  'governs',
] as const

const ACTOR = /^(?:human:[A-Za-z0-9._-]+|process:[A-Za-z0-9._-]+|[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const STATUSES = new Set(['draft', 'stable', 'deprecated'])

/**
 * ENVELOPE: rejected, never normalized (ADR-0015 §6).
 *
 * Normalizing would change the bytes the digest identifies, so a "helpful"
 * rewrite would make the artifact's identity depend on the tool version — the
 * defect raw-byte identity exists to prevent, reintroduced at the other end.
 */
export const checkEnvelope = (members: readonly SourceFile[]): readonly Refusal[] => {
  const refusals: Refusal[] = []
  const seen = new Set<string>()

  for (const member of members) {
    const path = member.path
    const bad = (rule: string, detail: string): void => {
      refusals.push({ kind: 'envelope', path, rule, detail })
    }

    if (path.includes('\\')) bad('envelope.path.posix', 'path uses a backslash separator')
    if (path.startsWith('/')) bad('envelope.path.absolute', 'path is absolute')
    if (path.split('/').some((segment) => segment === '.' || segment === '..'))
      bad('envelope.path.traversal', 'path contains a "." or ".." segment')
    if (path.normalize('NFC') !== path) bad('envelope.path.nfc', 'path is not NFC-normalized')
    if (seen.has(path)) bad('envelope.path.duplicate', 'duplicate normalized path')
    seen.add(path)

    const bytes = member.bytes
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
      bad('envelope.bom', 'source begins with a UTF-8 byte-order mark')

    try {
      decoder.decode(bytes)
    } catch {
      bad('envelope.utf8', 'source is not valid UTF-8')
      continue
    }

    // ANY carriage return, not only the CR/LF pair. ADR-0015 requires LF, and
    // testing for the pair let a classic bare-CR line ending through the
    // envelope entirely — a different byte sequence that is equally not LF.
    if (bytes.includes(0x0d))
      bad('envelope.line-endings', 'source contains a carriage return; ADR-0015 requires LF')
    if (bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a)
      bad('envelope.trailing-newline', 'source does not end with a newline')
  }
  return refusals
}

/** Resolve `link` against the directory of `from`, POSIX-style, no escapes. */
const resolveRelative = (from: string, link: string): string | undefined => {
  const base = from.split('/').slice(0, -1)
  const parts = link.split('/')
  const out = [...base]
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return undefined
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

const missingOrEmpty = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

const checkDocument = (document: CompiledDocument): readonly Refusal[] => {
  const refusals: Refusal[] = []
  const fm = document.frontmatter
  const path = document.path
  const bad = (kind: Refusal['kind'], rule: string, detail: string): void => {
    refusals.push({ kind, path, rule, detail })
  }

  for (const field of REQUIRED_FIELDS) {
    const value = fm[field]
    if (missingOrEmpty(value)) {
      bad('metadata_missing', `profile.${field}`, `required field "${field}" is missing or empty`)
      continue
    }
    // TYPE BEFORE MEANING. A wrong-typed field used to slip past every rule
    // that guarded on `typeof === 'string'` — including the catalog mirror,
    // which then SKIPPED the comparison it exists to make. `owner: [human:mike]`
    // parses to an array and was silently unchecked.
    const wrongType =
      field === 'governs'
        ? // An EMPTY list is not a governing source: `[]` is "present" and
          // vacuously all-strings, so it slipped past both the missing check
          // and the element check — a module projecting nothing.
          !(
            typeof value === 'string' ||
            (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string'))
          )
        : typeof value !== 'string'
    if (wrongType)
      bad(
        'metadata_shape',
        `profile.${field}.type`,
        `field "${field}" must be ${field === 'governs' ? 'a string or a list of strings' : 'a string'}, not ${Array.isArray(value) ? 'a list' : typeof value}`,
      )
  }

  // `generated.at` is production provenance and is REQUIRED alongside `as_of`,
  // which is factual currency. Conflating them would let regeneration assert
  // that stale facts are current (ADR-0015 §5).
  const generated = fm['generated']
  if (generated === undefined || typeof generated !== 'object' || generated === null) {
    bad('metadata_missing', 'profile.generated.at', 'required field "generated.at" is missing')
  } else {
    const at = (generated as Record<string, unknown>)['at']
    if (typeof at !== 'string' || !ISO_INSTANT.test(at))
      bad('metadata_shape', 'profile.generated.at', '"generated.at" is not an ISO-8601 instant')
  }

  const owner = fm['owner']
  if (typeof owner === 'string' && !ACTOR.test(owner))
    bad('metadata_shape', 'profile.owner.actor', `"owner" is not a valid actor: ${owner}`)

  const asOf = fm['as_of']
  if (typeof asOf === 'string' && !ISO_DATE.test(asOf))
    bad('metadata_shape', 'profile.as_of.date', '"as_of" is not a YYYY-MM-DD date')

  const staleAfter = fm['stale_after']
  if (typeof staleAfter === 'string' && !ISO_DATE.test(staleAfter))
    bad('metadata_shape', 'profile.stale_after.date', '"stale_after" is not a YYYY-MM-DD date')

  // `status` must be stated, never defaulted — OKF defaults it to `stable`,
  // which would let a draft be admitted as though someone had decided.
  const status = fm['status']
  if (typeof status === 'string' && !STATUSES.has(status))
    bad(
      'metadata_shape',
      'profile.status.vocabulary',
      `"status" is not a declared value: ${status}`,
    )

  if (fm['type'] === ATTESTED_COMPUTATION)
    bad(
      'execution_bearing',
      'execution.attested-computation',
      'type "Attested Computation" carries a sanctioned computation and is refused',
    )
  for (const field of EXECUTION_FIELDS) {
    if (fm[field] !== undefined)
      bad(
        'execution_bearing',
        `execution.${field}`,
        `execution-bearing field "${field}" is refused whatever the declared type`,
      )
  }
  return refusals
}

/** Catalog is authoritative; frontmatter mirrors it (ADR-0015 §5a). */
const checkMirror = (document: CompiledDocument, entry: CatalogEntry): readonly Refusal[] => {
  const fm = document.frontmatter
  const mismatch = (field: string, catalog: string, front: string): Refusal => ({
    kind: 'catalog_mirror',
    path: document.path,
    rule: `mirror.${field}`,
    detail: `catalog "${field}" is ${catalog}; frontmatter is ${front}. The catalog is authoritative and this is not merged`,
  })
  // Only compares what the SHAPE rules above have already accepted. A
  // wrong-typed field is refused there and is not silently skipped here.
  const refusals: Refusal[] = []
  if (typeof fm['owner'] === 'string' && fm['owner'] !== entry.owner)
    refusals.push(mismatch('owner', entry.owner, fm['owner']))
  if (typeof fm['as_of'] === 'string' && fm['as_of'] !== entry.asOf)
    refusals.push(mismatch('asOf', entry.asOf, fm['as_of']))
  if (typeof fm['limitations'] === 'string' && fm['limitations'] !== entry.limitations)
    refusals.push(mismatch('limitations', entry.limitations, fm['limitations']))
  const governs = fm['governs']
  const declared =
    typeof governs === 'string'
      ? [governs]
      : Array.isArray(governs) && governs.every((v) => typeof v === 'string')
        ? [...governs]
        : undefined
  const expected = [...entry.governingSources]
  if (
    declared !== undefined &&
    JSON.stringify([...declared].sort()) !== JSON.stringify([...expected].sort())
  )
    refusals.push(mismatch('governingSources', expected.join(','), declared.join(',')))
  return refusals
}

export interface AdmitRequest {
  readonly members: readonly SourceFile[]
  readonly entry: CatalogEntry
  /** Paths that a `governs` reference may resolve against. */
  readonly repositoryPaths: ReadonlySet<string>
  /** Supplied by governed review machinery; absent in this repository today. */
  readonly reviewEvidence?: ReviewEvidence
}

/**
 * Admit a candidate module, and separately decide whether it may publish.
 *
 * The two are never one boolean. A deterministic finding refuses admission
 * outright and no attestation waives it (ADR-0016 §6).
 */
export const admit = (request: AdmitRequest): AdmissionOutcome => {
  const refusals: Refusal[] = [...checkEnvelope(request.members)]

  const compiled = compile(request.members)
  if (!compiled.ok) {
    return { admitted: false, publishable: false, refusals: [...refusals, ...compiled.refusals] }
  }
  const bundle = compiled.bundle

  if (bundle.okfVersion !== OKF_VERSION) {
    refusals.push({
      kind: 'okf_version',
      rule: 'okf.version.pin',
      detail: `okf_version must be exactly "${OKF_VERSION}"; found ${bundle.okfVersion ?? 'none'}`,
    })
  }
  if (bundle.documents.length === 0) {
    refusals.push({
      kind: 'okf_baseline',
      rule: 'okf.concepts.present',
      detail: 'bundle declares no concept document',
    })
  }

  refusals.push(...scanMembers(request.members.map((member) => member.path)))

  const internal = new Set(request.members.map((member) => member.path))
  for (const document of bundle.documents) {
    refusals.push(...checkDocument(document))
    refusals.push(...checkMirror(document, request.entry))
    // Already proven decodable by the envelope check above; the guard is for
    // the type, not for a case that can reach here.
    const text = decoder.decode(document.bytes)
    refusals.push(...scanDocument(document.path, text, document.frontmatter))

    // Bundle-internal references must resolve AT ADMISSION. Once admitted they
    // are frozen inside the immutable package and cannot later break; external
    // and `governs` references can, which is why reading stays tolerant.
    // A CLOSED LINK GRAMMAR (`links.ts`), not a regex over Markdown. The
    // previous inline pattern missed reference-style links and inline titles,
    // and read code samples as real references. Anything link-shaped the
    // grammar cannot read is REFUSED, so its completeness is checkable.
    for (const target of linkTargets(text)) {
      if (target.kind === 'external') continue
      if (target.kind === 'unreadable') {
        refusals.push({
          kind: 'reference_integrity',
          path: document.path,
          rule: 'reference.unreadable',
          detail: `link construct "${target.raw}" is outside the admitted link grammar`,
        })
        continue
      }
      const resolved = target.raw.startsWith('/')
        ? target.raw.slice(1)
        : resolveRelative(document.path, target.raw)
      if (resolved !== undefined && !internal.has(resolved))
        refusals.push({
          kind: 'reference_integrity',
          path: document.path,
          rule: 'reference.internal',
          detail: `bundle-internal reference "${target.raw}" does not resolve within the source`,
        })
    }
  }

  for (const source of request.entry.governingSources) {
    if (!request.repositoryPaths.has(source))
      refusals.push({
        kind: 'reference_integrity',
        rule: 'reference.governs',
        detail: `governing source "${source}" does not resolve; the module projects nothing`,
      })
  }

  // PROOF A. Never a waiver: a deterministic finding above already refuses.
  const digest = bundleDigest(request.members)
  refusals.push(...checkProofA(request.entry.contentReview, digest))

  const admitted = refusals.length === 0
  if (!admitted) return { admitted: false, publishable: false, refusals }

  // ADMISSION OWNS THE BYTES IT ADMITTED, and puts them out of reach.
  // See `admitted.ts` for why reachable-but-frozen was not enough.
  const proof = sealAdmitted(bundle)

  // PROOF B — a DIFFERENT question, and one this repository cannot answer.
  const proofB = checkProofB(request.entry.contentReview, request.reviewEvidence, digest)
  return {
    admitted: true,
    publishable: proofB === undefined,
    refusals: [],
    proof,
    ...(proofB === undefined ? {} : { publicationBlockReason: proofB }),
  }
}
