/**
 * Consent to spend (design D5; requirement "Consent gates spend and is
 * never authority").
 *
 * Consent is a recorded INPUT on one transition, and this module is
 * deliberately small because consent deserves no more power than that.
 * It cannot widen a capability, substitute for a missing profile, or
 * satisfy any authority requirement — the spend gate below needs BOTH an
 * affirmative consent record and an eligibility decision the trusted core
 * made, and it reports the two conditions separately so a refusal can
 * name the right one.
 *
 * The failure this shape prevents: a run with enthusiastic consent and no
 * profile refusing "for lack of consent", which would send an operator
 * looking in exactly the wrong place.
 */

export interface ConsentRecord {
  readonly run_id: string
  readonly granted: boolean
  /** Who recorded it — an operator identity, never a capability. */
  readonly by: string
  readonly recorded_at: string
}

export type SpendGate =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly held: 'consent_absent' | 'consent_withheld'
      readonly detail: string
    }

/**
 * Whether the spend transition may proceed, given the consent record the
 * orchestrator holds. Eligibility is decided by the core and checked by
 * the caller BEFORE this — the two are separate conditions on purpose.
 *
 * An absent consent record HOLDS the run at `ELIGIBLE`. It is not a
 * refusal: nothing has gone wrong, the run simply has not been permitted
 * to spend yet, and the pending state is recorded rather than dropped.
 */
export const decideSpendGate = (consent: ConsentRecord | undefined): SpendGate => {
  if (consent === undefined) {
    return {
      ok: false,
      held: 'consent_absent',
      detail: 'no consent record for this run; the run holds at ELIGIBLE without spending',
    }
  }
  if (!consent.granted) {
    return {
      ok: false,
      held: 'consent_withheld',
      detail: `consent was recorded by ${consent.by} and withheld; the run holds at ELIGIBLE`,
    }
  }
  return { ok: true }
}
