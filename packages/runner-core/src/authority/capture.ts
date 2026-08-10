/**
 * Immutable, digest-bound snapshot construction (design D4; requirement
 * "Captured authority is an immutable, digest-bound snapshot").
 *
 * `captureAuthority` is the single constructor that accepts raw bytes; no
 * DECISION signature does. The snapshot's digest is computed over the
 * supplied bytes BEFORE parsing, so the recorded identity is of the bytes
 * that actually governed. A capture succeeds only when the bytes validate
 * against the declared contract for the source; bytes valid against a
 * DIFFERENT contract than the source declares refuse, naming both
 * identities (RC-ADV-11). A reported acquisition failure is an
 * operational failure — never an empty snapshot, never a refusal.
 *
 * The acquire-once half of INV-007 — that L4 physically read the source
 * exactly once and never re-reads it — is L4's obligation and is not
 * claimed here.
 */
import {
  operationalFailure,
  type OperationalFailure,
  type Refusal,
  refuse,
} from '../decision/index.js'
import { digestOf } from '../primitives/index.js'
import type { AuthorityBytes, SourceIdentity } from './values.js'

/**
 * The validation surface a contract schema must offer — STRUCTURAL, so
 * the Zod schemas exported by `@secure-home/contracts` satisfy it without
 * this package importing zod: the runtime dependency set stays exactly
 * the two workspace packages (RC-INV-01).
 */
export interface ContractIssue {
  readonly path: ReadonlyArray<PropertyKey>
  readonly message: string
}

export interface ContractSchema<T> {
  safeParse(
    input: unknown,
  ):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: { readonly issues: readonly ContractIssue[] } }
}

/** The contract a source is DECLARED to satisfy. */
export interface ExpectedContract<T extends ContractDocument> {
  readonly contract_id: string
  readonly schema: ContractSchema<T>
}

/** Every authority document carries its own contract identity. */
export interface ContractDocument {
  readonly contract_id: string
  readonly contract_version: string
}

/** The digest-bound identity of the captured document. */
export interface CapturedIdentity {
  readonly contract_id: string
  readonly contract_version: string
  readonly digest: string
}

export type CapturedAuthority<T extends ContractDocument> =
  | {
      readonly ok: true
      readonly source: SourceIdentity
      readonly digest: string
      readonly contract: CapturedIdentity
      readonly value: T
    }
  | { readonly ok: false; readonly source: SourceIdentity; readonly refusal: Refusal }

export const captureAuthority = <T extends ContractDocument>(
  input: AuthorityBytes,
  expected: ExpectedContract<T>,
): CapturedAuthority<T> | OperationalFailure => {
  // Fail closed against untyped callers: an unestablishable input value
  // refuses — it never crashes and never becomes an empty snapshot.
  if (
    input === null ||
    typeof input !== 'object' ||
    typeof (input as { ok?: unknown }).ok !== 'boolean' ||
    typeof (input as { source?: { source?: unknown } }).source?.source !== 'string'
  ) {
    return {
      ok: false,
      source: { source: '(unestablished)' },
      refusal: refuse(
        'undecidable',
        { element: 'authority input' },
        'the authority input value shape cannot be established',
      ),
    }
  }
  if (!input.ok) {
    return operationalFailure(input.source.source, `acquisition reported failed: ${input.failure}`)
  }
  const digest = digestOf(input.bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(input.bytes)
  } catch (error) {
    return {
      ok: false,
      source: input.source,
      refusal: refuse(
        'invalid_authority',
        { element: input.source.source },
        `authority bytes are not JSON: ${error instanceof Error ? error.message : String(error)}`,
      ),
    }
  }
  const observedId =
    parsed !== null && typeof parsed === 'object' && 'contract_id' in parsed
      ? String((parsed as Record<string, unknown>)['contract_id'])
      : '(none)'
  if (observedId !== expected.contract_id) {
    return {
      ok: false,
      source: input.source,
      refusal: refuse(
        'contract_mismatch',
        { element: input.source.source, observed: observedId },
        `source declares contract "${expected.contract_id}" but bytes carry "${observedId}"`,
      ),
    }
  }
  const result = expected.schema.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      source: input.source,
      refusal: refuse(
        'invalid_authority',
        { element: input.source.source },
        `authority bytes fail contract validation for "${expected.contract_id}": ${result.error.issues
          .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
          .join('; ')}`,
      ),
    }
  }
  return {
    ok: true,
    source: input.source,
    digest,
    contract: {
      contract_id: result.data.contract_id,
      contract_version: result.data.contract_version,
      digest,
    },
    value: result.data,
  }
}
