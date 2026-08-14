/**
 * PROOF CONTROLS — narrowing only, and off the public request surface.
 *
 * A proof needs to narrow the transition table (to observe that effects
 * downstream of a removed transition stop happening) and to shorten the
 * wall clock (so a hung call times out in milliseconds rather than
 * minutes). Both were fields on `RunSignals`, which `Runner.run()`
 * accepts and the package exports.
 *
 * That made them runtime authority. A caller could hand in a table
 * mapping `ELIGIBLE.commit_spend` straight to `COMPLETED`, and the
 * machine trusted it — and because a phase's effects run BEFORE the
 * transition they earn is applied, the effects downstream of a forged
 * table execute against a lifecycle nobody authorized.
 *
 * Two changes, because either alone is thin:
 *
 *  - they moved off the request. They are constructor-time controls, not
 *    something a run request can carry, so an untrusted caller
 *    submitting a run cannot reach them at all.
 *  - they are VALIDATED as narrowings regardless. A control that could
 *    only be supplied by trusted composition is still not licence to
 *    widen, and defence that depends on nobody finding the seam is not
 *    defence.
 */
import { TRANSITIONS, type TransitionTable } from '../lifecycle/index.js'

export interface RunControls {
  /**
   * A NARROWED transition table. Entries may be removed; none may be
   * added, and none may point somewhere the canonical table does not.
   */
  readonly transitions?: TransitionTable
  /** Shorten the wall clock. Never lengthens it — see `boundedDeadlineMs`. */
  readonly deadline_ms?: number
  /** Raise cancellation after this many milliseconds, mid-flight. */
  readonly cancelAfterMs?: number
}

export type TableCheck =
  | { readonly ok: true; readonly table: TransitionTable }
  | { readonly ok: false; readonly detail: string }

/**
 * Accept a table only if it is a subset of the canonical one.
 *
 * Every declared pair must exist in `TRANSITIONS` and lead to the SAME
 * state. Removing a pair is the whole point of the control; adding one,
 * or redirecting one, is forging lifecycle authority.
 */
/**
 * Every string key REACHABLE by plain lookup — own or inherited,
 * enumerable or not.
 *
 * `Object.entries` sees own enumerable properties; `for...in` adds
 * inherited ones but still skips non-enumerable. `declaredNext` reads
 * `table[state]?.[kind]`, which honours none of those distinctions. A
 * validator that looks through a narrower window than its consumer is
 * not a validator — it is a second, more optimistic reader.
 */
const reachableKeys = (value: object): readonly string[] => {
  const keys = new Set<string>()
  let node: object | null = value
  while (node !== null && node !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(node)) keys.add(key)
    node = Object.getPrototypeOf(node) as object | null
  }
  return [...keys]
}

/**
 * Validate a table AND materialize a fresh one.
 *
 * Returning the caller's object was a time-of-check/time-of-use hole:
 * the machine retained the reference, so a table that validated clean
 * could widen at any later moment — mid-run mutable authority, which is
 * exactly what the runner model exists to remove.
 *
 * So nothing the caller supplied is retained. What comes back is a new
 * null-prototype object holding only validated values, deeply frozen.
 * The machine never sees the original.
 */
export const narrowingOnly = (candidate: TransitionTable | undefined): TableCheck => {
  // The canonical table is deep-frozen at its source, so this branch
  // hands back immutable authority rather than a mutable default — the
  // hole the supplied-table path closed while the default kept open.
  if (candidate === undefined) return { ok: true, table: TRANSITIONS }
  const canonical = TRANSITIONS as unknown as Record<string, Record<string, string>>
  const supplied = candidate as unknown as Record<string, Record<string, string> | undefined>

  const table = Object.create(null) as Record<string, Record<string, string>>
  for (const state of reachableKeys(candidate)) {
    const row = supplied[state]
    if (row === undefined || typeof row !== 'object') continue
    const declared = canonical[state]
    if (declared === undefined) {
      return {
        ok: false,
        detail: `the table declares state ${state}, which the lifecycle does not`,
      }
    }
    const copied = Object.create(null) as Record<string, string>
    for (const kind of reachableKeys(row)) {
      const to: string | undefined = (row as Record<string, string | undefined>)[kind]
      if (to === undefined) continue
      if (!(kind in declared)) {
        return {
          ok: false,
          detail: `the table adds transition ${kind} from ${state}, which the lifecycle does not declare`,
        }
      }
      if (declared[kind] !== to) {
        return {
          ok: false,
          detail: `the table redirects ${state}.${kind} to ${to}; the lifecycle declares ${String(declared[kind])}`,
        }
      }
      copied[kind] = to
    }
    table[state] = Object.freeze(copied)
  }
  return { ok: true, table: Object.freeze(table) as unknown as TransitionTable }
}

/**
 * The run's wall clock: the profile's grant, never more.
 *
 * The session port reports a deadline, and that port is an
 * implementation someone else supplies — so arming the timer from it
 * made the run's budget whatever the sandbox asserted. The captured
 * profile is the authority; a session may offer less, never more, and a
 * proof control may only shorten.
 */
export const boundedDeadlineMs = (
  profileWallClockSeconds: number,
  sessionWallClockSeconds: number,
  override?: number,
): number => {
  const granted = profileWallClockSeconds * 1000
  const offered = Math.min(granted, sessionWallClockSeconds * 1000)
  return override === undefined ? offered : Math.min(offered, override)
}
