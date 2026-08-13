import type { EarlyTerminationRecordT, EvidenceBundleT } from '@secure-home/events'

/**
 * Principal and profile-reference types, derived from the authored L2
 * contracts' inferred types. This service declares no zod dependency
 * (RO-INV-01) and so cannot infer them itself — deriving them from the
 * contract types keeps a single source of truth and makes a contract
 * change surface here as a type error rather than as drift.
 */
export type PrincipalT = EvidenceBundleT['principal']
export type ProfileRefT = NonNullable<EarlyTerminationRecordT['requested_profile']>
