/**
 * IMMUTABLE SET RELEASES, EXACTLY AS ADR-0019 FIXES THEM.
 *
 * A set FAMILY is mutable authoring intent. A set RELEASE is an immutable,
 * digest-identified revision of it, and a profile pins the release. The point is
 * that a family row which has moved on cannot explain a version it moved past,
 * so identity lives on the release and nowhere else.
 *
 * ```text
 * release_manifest :=
 *   "okf-set-release-v1"                              LF
 *   "family"             SP <family-id>               LF
 *   "version"            SP <release-version>         LF
 *   "runnerClass"        SP <runner-class>            LF
 *   "allowTaskAdditions" SP <bool>                    LF
 *   "allowTaskNarrowing" SP <bool>                    LF
 *   "maxBytes"           SP <int>                     LF
 *   "maxFreshnessDays"   SP <int>                     LF
 *   "requiredFailure"    SP <token>                   LF
 *   "optionalFailure"    SP <token>                   LF
 *   "overrideAuthority"  SP <token>                   LF
 *   ( "deny"     SP <pattern>                            LF )*
 *   ( "required" SP <id> NUL <version> NUL <sha256-hex>  LF )*
 *   ( "optional" SP <id> NUL <version> NUL <sha256-hex>  LF )*
 *
 * releaseDigest := "sha256:" || hex(sha256(release_manifest))
 * ```
 *
 * **No escaping, deliberately.** SP, NUL, and LF are structural, so a value
 * containing one is REFUSED rather than escaped: an escape mechanism is a second
 * grammar over the same bytes, and two grammars is how one byte sequence
 * acquires two readings.
 *
 * **Sorting is normative and non-semantic.** deny, required, and optional are
 * sets, so reordering a JSON array must not move the digest.
 *
 * Repository and release infrastructure. **Not** the runtime knowledge resolver:
 * nothing here reads a path, and nothing here delivers context to a run.
 */
import { createHash } from 'node:crypto'

export const SET_RELEASE_FORMAT = 'okf-set-release-v1'
export const TASK_DELTA_FORMAT = 'okf-set-task-delta-v1'
export const RESOLVED_KNOWLEDGE_FORMAT = 'okf-resolved-knowledge-v1'
export const RELEASE_REVIEW_POLICY = 'knowledge-set-release-review-v1'

/** Syntax only. ADR-0019 section 5 declines to infer SemVer compatibility meaning. */
export const RELEASE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/
const BARE_SHA256 = /^[0-9a-f]{64}$/
/** The REPOSITORY module-id grammar. A weaker local copy would admit ids the
 * registry refuses, so the release could pin something that cannot exist. */
const MODULE_ID = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/
/** The repository set-family grammar, for the same reason. */
const SET_FAMILY_ID = /^[a-z][a-z0-9-]*$/
/** A catalog attestation, before the prefix is stripped into a manifest. */
const PREFIXED_SHA256 = /^sha256:[0-9a-f]{64}$/

export type ReleaseState = 'Released' | 'Deprecated' | 'Retired'
export const RELEASE_STATES: readonly ReleaseState[] = ['Released', 'Deprecated', 'Retired']

/** One pinned member. `digest` is the module's reviewed source digest, bare hex. */
export interface ReleaseMember {
  readonly id: string
  readonly version: string
  readonly digest: string
}

/** The logical content a manifest serializes. Array order is irrelevant. */
export interface LogicalRelease {
  readonly family: string
  readonly version: string
  readonly runnerClass: string
  readonly allowTaskAdditions: boolean
  readonly allowTaskNarrowing: boolean
  readonly maxBytes: number
  readonly maxFreshnessDays: number
  readonly requiredFailure: string
  readonly optionalFailure: string
  readonly overrideAuthority: string
  readonly deny: readonly string[]
  readonly required: readonly ReleaseMember[]
  readonly optional: readonly ReleaseMember[]
}

export interface ReleaseRefusal {
  readonly rule: string
  readonly detail: string
}

export type ReleaseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusals: readonly ReleaseRefusal[] }

const refuse = (rule: string, detail: string): ReleaseRefusal => ({ rule, detail })

const NUL_BYTE = 0x00
const LF_BYTE = 0x0a
const encoder = new TextEncoder()

/** Ascending by UTF-8 bytes -- never UTF-16 code units, never locale collation. */
const byBytes = (a: string, b: string): number => {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  const shared = Math.min(x.length, y.length)
  for (let i = 0; i < shared; i += 1) {
    const l = x[i] as number
    const r = y[i] as number
    if (l !== r) return l - r
  }
  return x.length - y.length
}

/**
 * A value that may appear anywhere in the manifest.
 *
 * NFC is REQUIRED rather than applied: normalizing silently would let two
 * different logical inputs collapse to one identity with nobody noticing.
 */
const stringProblem = (value: string): string | undefined => {
  if (value.length === 0) return 'is empty'
  if (value.normalize('NFC') !== value) return 'is not NFC-normalized'
  if (value.includes('\u0000')) return 'contains NUL'
  if (value.includes('\n')) return 'contains LF'
  if (value.includes('\r')) return 'contains CR'
  return undefined
}

/** A scalar written after SP additionally admits no ASCII whitespace at all. */
/**
 * ASCII whitespace, by code point rather than by regex.
 *
 * Deliberately not `/\s/`: that matches Unicode whitespace, which would refuse
 * values the accepted grammar permits and make the admissible domain depend on
 * the language rather than on ADR-0019.
 */
const ASCII_WHITESPACE_CODES = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20])
const hasAsciiWhitespace = (value: string): boolean => {
  for (const ch of value) {
    const code = ch.codePointAt(0)
    if (code !== undefined && ASCII_WHITESPACE_CODES.has(code)) return true
  }
  return false
}
const tokenProblem = (value: string): string | undefined =>
  stringProblem(value) ?? (hasAsciiWhitespace(value) ? 'contains ASCII whitespace' : undefined)

const intProblem = (value: number): string | undefined =>
  !Number.isInteger(value) || value < 0
    ? 'is not a non-negative integer'
    : !Number.isSafeInteger(value)
      ? 'is not a safe integer; its decimal spelling would not round-trip'
      : undefined

const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

const scalarLine = (name: string, value: string): Uint8Array =>
  concat([encoder.encode(`${name} ${value}`), new Uint8Array([LF_BYTE])])

const memberLine = (kind: 'required' | 'optional', m: ReleaseMember): Uint8Array =>
  concat([
    encoder.encode(`${kind} ${m.id}`),
    new Uint8Array([NUL_BYTE]),
    encoder.encode(m.version),
    new Uint8Array([NUL_BYTE]),
    encoder.encode(m.digest),
    new Uint8Array([LF_BYTE]),
  ])

/**
 * The canonical manifest bytes for one logical release.
 *
 * Refuses rather than repairs: an input that cannot be canonically serialized is
 * a defect in the release, not a formatting problem to paper over.
 */
export const canonicalSetReleaseManifest = (release: LogicalRelease): ReleaseResult<Uint8Array> => {
  const refusals: ReleaseRefusal[] = []
  const token = (field: string, value: string): void => {
    const problem = tokenProblem(value)
    if (problem !== undefined) refusals.push(refuse('manifest.token', `"${field}" ${problem}`))
  }
  token('family', release.family)
  token('runnerClass', release.runnerClass)
  token('requiredFailure', release.requiredFailure)
  token('optionalFailure', release.optionalFailure)
  token('overrideAuthority', release.overrideAuthority)

  if (!RELEASE_VERSION.test(release.version))
    refusals.push(refuse('manifest.version', `"${release.version}" is not DIGIT+.DIGIT+.DIGIT+`))

  for (const [field, value] of [
    ['maxBytes', release.maxBytes],
    ['maxFreshnessDays', release.maxFreshnessDays],
  ] as const) {
    const problem = intProblem(value)
    if (problem !== undefined) refusals.push(refuse('manifest.integer', `"${field}" ${problem}`))
  }

  const denySeen = new Set<string>()
  for (const pattern of release.deny) {
    const problem = tokenProblem(pattern)
    if (problem !== undefined)
      refusals.push(refuse('manifest.deny', `deny "${pattern}" ${problem}`))
    if (denySeen.has(pattern)) refusals.push(refuse('manifest.deny', `deny "${pattern}" repeats`))
    denySeen.add(pattern)
  }

  const checkMembers = (kind: 'required' | 'optional', members: readonly ReleaseMember[]): void => {
    const seen = new Set<string>()
    for (const m of members) {
      for (const [field, value] of [
        ['id', m.id],
        ['version', m.version],
        ['digest', m.digest],
      ] as const) {
        // tokenProblem, not stringProblem: the PARSER applies the token rule to
        // these, so a serializer using the weaker rule could emit bytes it would
        // then refuse to read. Total means A can always parse what A writes.
        const problem = tokenProblem(value)
        if (problem !== undefined)
          refusals.push(refuse(`manifest.${kind}`, `${kind} "${m.id}" ${field} ${problem}`))
      }
      if (!MODULE_ID.test(m.id))
        refusals.push(refuse(`manifest.${kind}`, `${kind} "${m.id}" is not a module id`))
      if (!BARE_SHA256.test(m.digest))
        refusals.push(
          refuse(
            `manifest.${kind}`,
            `${kind} "${m.id}" digest must be bare lowercase 64-hex, not "${m.digest}"`,
          ),
        )
      if (seen.has(m.id)) refusals.push(refuse(`manifest.${kind}`, `${kind} "${m.id}" repeats`))
      seen.add(m.id)
    }
  }
  checkMembers('required', release.required)
  checkMembers('optional', release.optional)

  // A module cannot be both required and optional: one member would carry two
  // dispositions and no resolution rule could choose between them.
  const requiredIds = new Set(release.required.map((m) => m.id))
  for (const m of release.optional) {
    if (requiredIds.has(m.id))
      refusals.push(refuse('manifest.overlap', `"${m.id}" is both required and optional`))
  }

  if (refusals.length > 0) return { ok: false, refusals }

  const chunks: Uint8Array[] = [
    concat([encoder.encode(SET_RELEASE_FORMAT), new Uint8Array([LF_BYTE])]),
    scalarLine('family', release.family),
    scalarLine('version', release.version),
    scalarLine('runnerClass', release.runnerClass),
    scalarLine('allowTaskAdditions', String(release.allowTaskAdditions)),
    scalarLine('allowTaskNarrowing', String(release.allowTaskNarrowing)),
    scalarLine('maxBytes', String(release.maxBytes)),
    scalarLine('maxFreshnessDays', String(release.maxFreshnessDays)),
    scalarLine('requiredFailure', release.requiredFailure),
    scalarLine('optionalFailure', release.optionalFailure),
    scalarLine('overrideAuthority', release.overrideAuthority),
  ]
  for (const pattern of [...release.deny].sort(byBytes)) chunks.push(scalarLine('deny', pattern))
  for (const m of [...release.required].sort((a, b) => byBytes(a.id, b.id)))
    chunks.push(memberLine('required', m))
  for (const m of [...release.optional].sort((a, b) => byBytes(a.id, b.id)))
    chunks.push(memberLine('optional', m))
  return { ok: true, value: concat(chunks) }
}

export const digestSetReleaseManifest = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`

const SCALARS = [
  'family',
  'version',
  'runnerClass',
  'allowTaskAdditions',
  'allowTaskNarrowing',
  'maxBytes',
  'maxFreshnessDays',
  'requiredFailure',
  'optionalFailure',
  'overrideAuthority',
] as const

const INT_TOKEN = /^(0|[1-9][0-9]*)$/

/**
 * Parse stored manifest bytes STRICTLY.
 *
 * Writing a canonical form is half the contract. Refusing a stored file that is
 * merely parseable is the other half: a manifest that parses but is not
 * canonical is refused, so parse then serialize reproduces the input exactly.
 */
export const parseSetReleaseManifest = (bytes: Uint8Array): ReleaseResult<LogicalRelease> => {
  const bad = (rule: string, detail: string): ReleaseResult<LogicalRelease> => ({
    ok: false,
    refusals: [refuse(rule, detail)],
  })

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return bad('manifest.bom', 'manifest starts with a byte-order mark')
  if (bytes.includes(0x0d)) return bad('manifest.cr', 'manifest contains CR; LF only')
  if (bytes.length === 0 || bytes[bytes.length - 1] !== LF_BYTE)
    return bad('manifest.final-lf', 'manifest does not end with LF')

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return bad('manifest.encoding', 'manifest is not valid UTF-8')
  }
  const rows = text.slice(0, -1).split('\n')
  if (rows[0] !== SET_RELEASE_FORMAT)
    return bad('manifest.prefix', `first line must be "${SET_RELEASE_FORMAT}"`)

  const scalars = new Map<string, string>()
  let i = 1
  for (const name of SCALARS) {
    const row = rows[i]
    if (row === undefined) return bad('manifest.scalar-missing', `"${name}" is missing`)
    const at = row.indexOf(' ')
    const key = at === -1 ? row : row.slice(0, at)
    if (key !== name)
      return bad('manifest.scalar-order', `expected "${name}" at line ${i + 1}, found "${key}"`)
    const value = row.slice(at + 1)
    const problem = tokenProblem(value)
    if (problem !== undefined) return bad('manifest.token', `"${name}" ${problem}`)
    scalars.set(name, value)
    i += 1
  }

  const bool = (name: string): boolean | undefined => {
    const v = scalars.get(name)
    return v === 'true' ? true : v === 'false' ? false : undefined
  }
  const additions = bool('allowTaskAdditions')
  const narrowing = bool('allowTaskNarrowing')
  if (additions === undefined)
    return bad('manifest.boolean', '"allowTaskAdditions" is not true or false')
  if (narrowing === undefined)
    return bad('manifest.boolean', '"allowTaskNarrowing" is not true or false')

  for (const name of ['maxBytes', 'maxFreshnessDays'] as const) {
    if (!INT_TOKEN.test(scalars.get(name) as string))
      return bad('manifest.integer', `"${name}" is not a shortest unsigned decimal`)
  }
  if (!RELEASE_VERSION.test(scalars.get('version') as string))
    return bad('manifest.version', 'version is not DIGIT+.DIGIT+.DIGIT+')

  const deny: string[] = []
  const required: ReleaseMember[] = []
  const optional: ReleaseMember[] = []
  const ORDER = { deny: 0, required: 1, optional: 2 } as const
  let section: 'deny' | 'required' | 'optional' = 'deny'

  for (; i < rows.length; i += 1) {
    const row = rows[i] as string
    const at = row.indexOf(' ')
    if (at === -1) return bad('manifest.row', `line ${i + 1} has no field name`)
    const kind = row.slice(0, at)
    const rest = row.slice(at + 1)
    if (kind !== 'deny' && kind !== 'required' && kind !== 'optional')
      return bad('manifest.unknown-field', `unknown field "${kind}" at line ${i + 1}`)
    if (ORDER[kind] < ORDER[section])
      return bad('manifest.section-order', `"${kind}" appears after "${section}"`)
    section = kind
    if (kind === 'deny') {
      const problem = tokenProblem(rest)
      if (problem !== undefined) return bad('manifest.deny', `deny value ${problem}`)
      deny.push(rest)
      continue
    }
    const parts = rest.split('\u0000')
    if (parts.length !== 3)
      return bad('manifest.member', `${kind} row must be id NUL version NUL digest`)
    const [id, version, digest] = parts as [string, string, string]
    if (!MODULE_ID.test(id)) return bad('manifest.member', `${kind} "${id}" is not a module id`)
    if (!BARE_SHA256.test(digest))
      return bad('manifest.member', `${kind} "${id}" digest is not bare lowercase 64-hex`)
    const vProblem = tokenProblem(version)
    if (vProblem !== undefined) return bad('manifest.member', `${kind} "${id}" version ${vProblem}`)
    if (kind === 'required') required.push({ id, version, digest })
    else optional.push({ id, version, digest })
  }

  const strictlySorted = (values: readonly string[]): boolean =>
    values.every((v, n) => n === 0 || byBytes(values[n - 1] as string, v) < 0)
  if (!strictlySorted(deny)) return bad('manifest.sort', 'deny is unsorted or repeats')
  if (!strictlySorted(required.map((m) => m.id)))
    return bad('manifest.sort', 'required is unsorted or repeats')
  if (!strictlySorted(optional.map((m) => m.id)))
    return bad('manifest.sort', 'optional is unsorted or repeats')
  const requiredIds = new Set(required.map((m) => m.id))
  for (const m of optional)
    if (requiredIds.has(m.id))
      return bad('manifest.overlap', `"${m.id}" is both required and optional`)

  return {
    ok: true,
    value: {
      family: scalars.get('family') as string,
      version: scalars.get('version') as string,
      runnerClass: scalars.get('runnerClass') as string,
      allowTaskAdditions: additions,
      allowTaskNarrowing: narrowing,
      maxBytes: Number(scalars.get('maxBytes')),
      maxFreshnessDays: Number(scalars.get('maxFreshnessDays')),
      requiredFailure: scalars.get('requiredFailure') as string,
      optionalFailure: scalars.get('optionalFailure') as string,
      overrideAuthority: scalars.get('overrideAuthority') as string,
      deny,
      required,
      optional,
    },
  }
}

/** Stored bytes must be exactly what canonical serialization would produce. */
export const isCanonicalSetReleaseManifest = (bytes: Uint8Array): ReleaseResult<Uint8Array> => {
  const parsed = parseSetReleaseManifest(bytes)
  if (!parsed.ok) return { ok: false, refusals: parsed.refusals }
  const round = canonicalSetReleaseManifest(parsed.value)
  if (!round.ok) return round
  if (round.value.length !== bytes.length || !round.value.every((b, n) => b === bytes[n]))
    return {
      ok: false,
      refusals: [
        refuse(
          'manifest.noncanonical',
          'stored bytes parse but are not the canonical serialization of what they mean',
        ),
      ],
    }
  return { ok: true, value: round.value }
}

// --- release creation preconditions -----------------------------------------

/**
 * Module lifecycle states a NEW release may select, per ADR-0019 section 6.
 *
 * Semantic, not a single status name. Pinning `Validated` exactly would make a
 * module ineligible FOR PROGRESSING to Packaged or Published while its identity
 * and review are unchanged and strictly stronger.
 */
export const COMPOSABLE_MODULE_STATES: readonly string[] = ['Validated', 'Packaged', 'Published']

/** The catalog facts a member must supply for a release to pin it. */
export interface MemberCandidate {
  readonly id: string
  readonly version: string | null
  readonly sourceDigest: string | null
  readonly status: string
  readonly blockedByToolchain: boolean
  readonly blockedByRollout: boolean
}

/** The mutable family a candidate is built from. */
export interface SetFamily {
  readonly id: string
  readonly runnerClass: string
  readonly required: readonly string[]
  readonly optional: readonly string[]
  readonly deny: readonly string[]
  readonly allowTaskAdditions: boolean
  readonly allowTaskNarrowing: boolean
  readonly maxBytes: number
  readonly maxFreshnessDays: number
  readonly requiredFailure: string
  readonly optionalFailure: string
  readonly overrideAuthority: string
}

export interface SetReleaseCandidate {
  readonly release: LogicalRelease
  readonly manifest: Uint8Array
  readonly releaseDigest: string
}

const memberProblems = (
  kind: 'required' | 'optional',
  id: string,
  m: MemberCandidate | undefined,
): ReleaseRefusal[] => {
  if (m === undefined)
    return [refuse('release.member-unknown', `${kind} "${id}" names no registered module`)]
  const out: ReleaseRefusal[] = []
  if (m.version === null || m.version === undefined)
    out.push(refuse('release.member-unversioned', `${kind} "${id}" has no version`))
  if (m.sourceDigest === null || m.sourceDigest === undefined)
    out.push(refuse('release.member-unreviewed', `${kind} "${id}" has no reviewed digest`))
  else if (!/^sha256:[0-9a-f]{64}$/.test(m.sourceDigest))
    // It represents the catalog's contentReview.sourceDigest, so it must arrive
    // in that form. Accepting a bare hex string would let something that is not
    // a catalog attestation be pinned as though it were one.
    out.push(
      refuse(
        'release.member-digest-form',
        `${kind} "${id}" sourceDigest must be "sha256:" + 64 lowercase hex`,
      ),
    )
  if (m.blockedByToolchain)
    out.push(refuse('release.member-toolchain-blocked', `${kind} "${id}" is toolchain-blocked`))
  if (m.blockedByRollout)
    out.push(
      refuse(
        'release.member-rollout-blocked',
        `${kind} "${id}" is rollout-blocked; a set release is not a rollout back door`,
      ),
    )
  if (!COMPOSABLE_MODULE_STATES.includes(m.status))
    out.push(
      refuse(
        'release.member-lifecycle',
        `${kind} "${id}" is "${m.status}"; a new release may select only ${COMPOSABLE_MODULE_STATES.join(', ')}`,
      ),
    )
  return out
}

/**
 * Build a candidate release from a family and the modules it selects.
 *
 * Every precondition is evaluated for required AND optional members alike:
 * optional governs omission at run time, never looseness of identity.
 */
export const buildSetReleaseCandidate = (
  family: SetFamily,
  version: string,
  modules: readonly MemberCandidate[],
): ReleaseResult<SetReleaseCandidate> => {
  const byId = new Map(modules.map((m) => [m.id, m]))
  const refusals: ReleaseRefusal[] = []
  if (!RELEASE_VERSION.test(version))
    refusals.push(refuse('release.version', `"${version}" is not DIGIT+.DIGIT+.DIGIT+`))

  const pin = (kind: 'required' | 'optional', ids: readonly string[]): ReleaseMember[] => {
    const out: ReleaseMember[] = []
    for (const id of ids) {
      const m = byId.get(id)
      const problems = memberProblems(kind, id, m)
      refusals.push(...problems)
      if (problems.length === 0 && m !== undefined)
        out.push({
          id,
          version: m.version as string,
          digest: (m.sourceDigest as string).slice('sha256:'.length),
        })
    }
    return out
  }
  const required = pin('required', family.required)
  const optional = pin('optional', family.optional)
  if (refusals.length > 0) return { ok: false, refusals }

  const release: LogicalRelease = {
    family: family.id,
    version,
    runnerClass: family.runnerClass,
    allowTaskAdditions: family.allowTaskAdditions,
    allowTaskNarrowing: family.allowTaskNarrowing,
    maxBytes: family.maxBytes,
    maxFreshnessDays: family.maxFreshnessDays,
    requiredFailure: family.requiredFailure,
    optionalFailure: family.optionalFailure,
    overrideAuthority: family.overrideAuthority,
    deny: family.deny,
    required,
    optional,
  }
  const manifest = canonicalSetReleaseManifest(release)
  if (!manifest.ok) return manifest
  return {
    ok: true,
    value: {
      release,
      manifest: manifest.value,
      releaseDigest: digestSetReleaseManifest(manifest.value),
    },
  }
}

// --- release records ---------------------------------------------------------

export interface ReleaseReview {
  readonly policy: string
  readonly by: string
  readonly at: string
  readonly releaseDigest: string
}

export interface SetReleaseRecord {
  readonly familyId: string
  readonly version: string
  readonly manifestPath: string
  readonly releaseDigest: string
  readonly releaseReview: ReleaseReview
  readonly state: ReleaseState
}

/** The one derived path a record may name. Computed, never accepted as given. */
export const releaseManifestPath = (familyId: string, version: string): string =>
  `knowledge/releases/${familyId}@${version}.manifest`

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

/**
 * A real UTC instant, not merely a well-shaped string.
 *
 * The shape regex accepts `2026-13-01T00:00:00Z` and `2026-02-30T00:00:00Z`.
 * A review timestamped on a date that never happened is not a review event, so
 * the value must also round-trip: parsed and re-rendered, it must be the same
 * instant, which rejects both out-of-range fields and silent normalization.
 */
const isRealUtcInstant = (value: string): boolean => {
  if (!ISO_INSTANT.test(value)) return false
  const parsed = new Date(value)
  const time = parsed.getTime()
  if (Number.isNaN(time)) return false
  return `${parsed.toISOString().slice(0, 19)}Z` === value
}
const REVIEW_ACTOR = /^human:[A-Za-z0-9._-]+$/

/**
 * Validate ONE stored release record against its stored manifest bytes.
 *
 * Deliberately takes the manifest bytes rather than a path: this package never
 * reads the filesystem, so a caller supplies what it read and the rules here
 * decide. It also never consults the CURRENT module rows -- a historical release
 * is exact on its own terms, and comparing it against today's catalog would make
 * old releases fail as the catalog advances.
 */
export const validateSetReleaseRecord = (
  record: SetReleaseRecord,
  manifestBytes: Uint8Array,
  knownFamilyIds: ReadonlySet<string>,
): ReleaseResult<LogicalRelease> => {
  const refusals: ReleaseRefusal[] = []
  const add = (rule: string, detail: string): void => {
    refusals.push(refuse(rule, detail))
  }

  if (!knownFamilyIds.has(record.familyId))
    add('record.family-unknown', `"${record.familyId}" names no registered set family`)
  if (!RELEASE_VERSION.test(record.version))
    add('record.version', `"${record.version}" is not DIGIT+.DIGIT+.DIGIT+`)
  const expectedPath = releaseManifestPath(record.familyId, record.version)
  if (record.manifestPath !== expectedPath)
    add('record.manifest-path', `manifestPath must be "${expectedPath}"`)
  if (!RELEASE_STATES.includes(record.state))
    add('record.state', `state must be one of ${RELEASE_STATES.join(', ')}`)

  const canonical = isCanonicalSetReleaseManifest(manifestBytes)
  if (!canonical.ok) return { ok: false, refusals: [...refusals, ...canonical.refusals] }
  const parsed = parseSetReleaseManifest(manifestBytes)
  if (!parsed.ok) return { ok: false, refusals: [...refusals, ...parsed.refusals] }

  if (parsed.value.family !== record.familyId)
    add('record.manifest-family', 'manifest family does not match the record')
  if (parsed.value.version !== record.version)
    add('record.manifest-version', 'manifest version does not match the record')

  const actual = digestSetReleaseManifest(manifestBytes)
  if (actual !== record.releaseDigest)
    add(
      'record.digest',
      `releaseDigest is ${record.releaseDigest}; the manifest bytes hash to ${actual}`,
    )

  const review = record.releaseReview
  if (review === undefined || review === null)
    add('record.review-missing', 'releaseReview is absent')
  else {
    if (review.policy !== RELEASE_REVIEW_POLICY)
      add('record.review-policy', `policy must be "${RELEASE_REVIEW_POLICY}"`)
    if (typeof review.by !== 'string' || !REVIEW_ACTOR.test(review.by))
      add('record.review-actor', 'releaseReview.by is not a governed human actor')
    if (typeof review.at !== 'string' || !isRealUtcInstant(review.at))
      add('record.review-at', 'releaseReview.at is not a real UTC instant')
    if (review.releaseDigest !== record.releaseDigest)
      add('record.review-binding', 'releaseReview.releaseDigest does not bind this release')
  }

  if (refusals.length > 0) return { ok: false, refusals }
  return { ok: true, value: parsed.value }
}

/**
 * (familyId, version) resolves to at most one record, forever.
 *
 * Throws on a duplicate rather than returning the first match. A registry with
 * two records for one version has no single answer, and silently picking one
 * would let the ambiguity reach run evidence — the exact thing release identity
 * exists to prevent.
 */
export const lookupSetRelease = (
  records: readonly SetReleaseRecord[],
  familyId: string,
  version: string,
): SetReleaseRecord | undefined => {
  const found = records.filter((r) => r.familyId === familyId && r.version === version)
  if (found.length > 1)
    throw new Error(
      `registry is ambiguous: ${found.length} records for ${familyId}@${version}. ` +
        'A version resolves to exactly one release digest, forever',
    )
  return found[0]
}

/**
 * May a NEW release be recorded for this family and version?
 *
 * The rule ADR-0019 §5 states and a digest comparison cannot enforce: an
 * already-used version is **never** reused. Not with different content, not with
 * identical content, and not because the earlier one was deprecated or retired —
 * reuse would make an old run's evidence ambiguous.
 */
export const validateNewSetReleaseAgainstRegistry = (
  candidate: {
    readonly familyId: string
    readonly version: string
    readonly releaseDigest: string
  },
  existing: readonly SetReleaseRecord[],
): ReleaseResult<true> => {
  const clash = existing.find(
    (r) => r.familyId === candidate.familyId && r.version === candidate.version,
  )
  if (clash !== undefined)
    return {
      ok: false,
      refusals: [
        refuse(
          'release.version-reused',
          `${candidate.familyId}@${candidate.version} already exists (state ${clash.state}, ` +
            `digest ${clash.releaseDigest}). A used version is never reused — publish a new version`,
        ),
      ],
    }
  if (!RELEASE_VERSION.test(candidate.version))
    return {
      ok: false,
      refusals: [refuse('release.version', `"${candidate.version}" is not DIGIT+.DIGIT+.DIGIT+`)],
    }
  return { ok: true, value: true }
}

/**
 * May a release move from one state to another?
 *
 * ADR-0019 §8 fixes the order and gives no reverse. Reactivation is not invented
 * here: a retired release becoming requestable again is a decision, not an
 * implementation detail.
 */
export const releaseTransitionDecision = (
  from: ReleaseState,
  to: ReleaseState,
): ReleaseDecision => {
  if (from === to) return { allowed: true }
  if (from === 'Released' && to === 'Deprecated') return { allowed: true }
  if (from === 'Deprecated' && to === 'Retired') return { allowed: true }
  return {
    allowed: false,
    because:
      `${from} -> ${to} is not a governed transition. ADR-0019 §8 fixes ` +
      'Released -> Deprecated -> Retired and defines no reverse or skipping step',
  }
}

// --- state semantics ---------------------------------------------------------

export type ReleaseDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly because: string }

/** May a NEW profile revision adopt this release? */
export const releaseAdoptionDecision = (state: ReleaseState): ReleaseDecision =>
  state === 'Released'
    ? { allowed: true }
    : { allowed: false, because: `a ${state} release may not be newly adopted` }

/** May this release service a new run for a profile revision already pinning it? */
export const releaseRunDecision = (state: ReleaseState): ReleaseDecision =>
  state === 'Retired'
    ? { allowed: false, because: 'a Retired release may not service a new run' }
    : { allowed: true }

// --- task delta and resolved selection --------------------------------------
//
// ADR-0019 section 11: a task-modified composition is NOT a registered release,
// so it gets a DIGEST rather than a version. These two canonical forms are the
// smallest pure seam that makes that mechanical. Neither is a runtime resolver,
// and neither is a profile schema.

export interface TaskDelta {
  readonly add: readonly string[]
  readonly narrow: readonly string[]
}

export const canonicalTaskDelta = (delta: TaskDelta): ReleaseResult<Uint8Array> => {
  const refusals: ReleaseRefusal[] = []
  const check = (kind: 'add' | 'narrow', ids: readonly string[]): void => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (!MODULE_ID.test(id))
        refusals.push(refuse('delta.id', `${kind} "${id}" is not a module id`))
      if (seen.has(id)) refusals.push(refuse('delta.duplicate', `${kind} "${id}" repeats`))
      seen.add(id)
    }
  }
  check('add', delta.add)
  check('narrow', delta.narrow)
  const adds = new Set(delta.add)
  for (const id of delta.narrow)
    if (adds.has(id))
      refusals.push(refuse('delta.contradiction', `"${id}" is both added and narrowed`))
  if (refusals.length > 0) return { ok: false, refusals }

  const chunks: Uint8Array[] = [
    concat([encoder.encode(TASK_DELTA_FORMAT), new Uint8Array([LF_BYTE])]),
  ]
  for (const id of [...delta.add].sort(byBytes)) chunks.push(scalarLine('add', id))
  for (const id of [...delta.narrow].sort(byBytes)) chunks.push(scalarLine('narrow', id))
  return { ok: true, value: concat(chunks) }
}

export const digestTaskDelta = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`

export interface ResolvedSelection {
  readonly family: string
  readonly version: string
  readonly releaseDigest: string
  readonly taskDeltaDigest: string
  readonly modules: readonly ReleaseMember[]
}

/**
 * The resolved selection carries the SAME admissibility rules as the release
 * manifest, and for the same reason: it is the identity of what a run actually
 * saw. A malformed value here would produce ambiguous bytes in exactly the place
 * evidence is supposed to be unambiguous.
 */
export const canonicalResolvedSelection = (
  resolved: ResolvedSelection,
): ReleaseResult<Uint8Array> => {
  const refusals: ReleaseRefusal[] = []

  const familyProblem = tokenProblem(resolved.family)
  if (familyProblem !== undefined)
    refusals.push(refuse('resolved.family', `family ${familyProblem}`))
  else if (!SET_FAMILY_ID.test(resolved.family))
    refusals.push(refuse('resolved.family', `"${resolved.family}" is not a set family id`))

  // The logical contract is the prefixed catalog/release form. Stripping a bare
  // value silently would accept something that was never a digest of ours.
  const bare = (value: string, field: string): string => {
    if (!PREFIXED_SHA256.test(value)) {
      refusals.push(
        refuse('resolved.digest', `${field} must be "sha256:" + 64 lowercase hex, not "${value}"`),
      )
      return ''
    }
    return value.slice('sha256:'.length)
  }
  const releaseHex = bare(resolved.releaseDigest, 'releaseDigest')
  const deltaHex = bare(resolved.taskDeltaDigest, 'taskDeltaDigest')

  if (!RELEASE_VERSION.test(resolved.version))
    refusals.push(refuse('resolved.version', 'version is not DIGIT+.DIGIT+.DIGIT+'))

  const seen = new Set<string>()
  for (const m of resolved.modules) {
    if (!MODULE_ID.test(m.id)) refusals.push(refuse('resolved.id', `"${m.id}" is not a module id`))
    const versionProblem = tokenProblem(m.version)
    if (versionProblem !== undefined)
      refusals.push(refuse('resolved.version', `"${m.id}" version ${versionProblem}`))
    if (!BARE_SHA256.test(m.digest))
      refusals.push(refuse('resolved.digest', `"${m.id}" digest is not bare lowercase 64-hex`))
    if (seen.has(m.id)) refusals.push(refuse('resolved.duplicate', `"${m.id}" repeats`))
    seen.add(m.id)
  }
  if (refusals.length > 0) return { ok: false, refusals }

  const chunks: Uint8Array[] = [
    concat([encoder.encode(RESOLVED_KNOWLEDGE_FORMAT), new Uint8Array([LF_BYTE])]),
    scalarLine('family', resolved.family),
    scalarLine('version', resolved.version),
    scalarLine('releaseDigest', releaseHex),
    scalarLine('taskDeltaDigest', deltaHex),
  ]
  for (const m of [...resolved.modules].sort((a, b) => byBytes(a.id, b.id)))
    chunks.push(
      concat([
        encoder.encode(`module ${m.id}`),
        new Uint8Array([NUL_BYTE]),
        encoder.encode(m.version),
        new Uint8Array([NUL_BYTE]),
        encoder.encode(m.digest),
        new Uint8Array([LF_BYTE]),
      ]),
    )
  return { ok: true, value: concat(chunks) }
}

export const digestResolvedSelection = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`

/**
 * Apply a task delta to a release, producing the exact resolved selection.
 *
 * Pure identity mechanism, not runtime resolution: it neither reads bytes nor
 * delivers context. Deny beats every addition, additions and narrowings each
 * require the release to permit them, and every added module resolves to an
 * exact (id, version, digest) -- there is no floating reference.
 */
export const applyTaskDelta = (
  release: LogicalRelease,
  delta: TaskDelta,
  catalogue: readonly MemberCandidate[],
): ReleaseResult<ResolvedSelection> => {
  const refusals: ReleaseRefusal[] = []
  const denied = (id: string): boolean =>
    release.deny.some((p) => (p.endsWith('/*') ? id.startsWith(p.slice(0, -1)) : p === id))

  if (delta.add.length > 0 && !release.allowTaskAdditions)
    refusals.push(refuse('delta.additions-forbidden', 'this release does not allow task additions'))
  if (delta.narrow.length > 0 && !release.allowTaskNarrowing)
    refusals.push(refuse('delta.narrowing-forbidden', 'this release does not allow task narrowing'))

  const selected = new Map<string, ReleaseMember>()
  for (const m of [...release.required, ...release.optional]) selected.set(m.id, m)

  for (const id of delta.narrow) {
    if (!selected.has(id))
      refusals.push(refuse('delta.narrow-unknown', `"${id}" is not selected by this release`))
    selected.delete(id)
  }

  const byId = new Map(catalogue.map((m) => [m.id, m]))
  // What the RELEASE pinned, before any narrowing removed it. An addition is
  // checked against this rather than against what narrowing left behind, so
  // narrow-then-add cannot launder a substitution.
  const pinnedIds = new Set([...release.required, ...release.optional].map((m) => m.id))
  for (const id of delta.add) {
    // A task addition adds context the release does not carry. It must NEVER
    // swap a newer revision in for an id the release already pinned: that would
    // make "optional" mean "whatever version exists later", which is exactly
    // what ADR-0019 §2 forbids.
    if (pinnedIds.has(id)) {
      refusals.push(
        refuse(
          'delta.add-already-selected',
          `"${id}" is already pinned by this release; a task addition may not substitute ` +
            'a different revision for a pinned member',
        ),
      )
      continue
    }
    if (denied(id)) {
      refusals.push(
        refuse('delta.denied', `"${id}" is denied by this release; deny beats addition`),
      )
      continue
    }
    const m = byId.get(id)
    const problems = memberProblems('required', id, m)
    if (problems.length > 0) {
      refusals.push(...problems)
      continue
    }
    const found = m as MemberCandidate
    // A catalog version carrying a separator would produce ambiguous resolved
    // bytes. Refuse at the point of addition rather than at serialization, so
    // the refusal names the module that caused it.
    const versionProblem = tokenProblem(found.version as string)
    if (versionProblem !== undefined) {
      refusals.push(refuse('delta.add-version', `added "${id}" version ${versionProblem}`))
      continue
    }
    selected.set(id, {
      id,
      version: found.version as string,
      digest: (found.sourceDigest as string).slice('sha256:'.length),
    })
  }
  if (refusals.length > 0) return { ok: false, refusals }

  const deltaBytes = canonicalTaskDelta(delta)
  if (!deltaBytes.ok) return { ok: false, refusals: deltaBytes.refusals }
  const manifest = canonicalSetReleaseManifest(release)
  if (!manifest.ok) return { ok: false, refusals: manifest.refusals }

  return {
    ok: true,
    value: {
      family: release.family,
      version: release.version,
      releaseDigest: digestSetReleaseManifest(manifest.value),
      taskDeltaDigest: digestTaskDelta(deltaBytes.value),
      modules: [...selected.values()],
    },
  }
}
