/**
 * THE ASYNC PORT BOUNDARY, guarded once — and CLASSIFIED once.
 *
 * The earlier implementation raced the whole walk against the deadline.
 * That bounded the caller's wait by abandoning a still-running JavaScript
 * continuation. Once the port eventually answered, that continuation
 * resumed and started the rest of the phase for a run that had already
 * concluded.
 *
 * Here every asynchronous port method is reached through one proxy, and
 * every method crosses under its EFFECT CLASS from `PORT_EFFECTS` — the
 * table the owner decision requires, computed from the `Ports` type so an
 * unclassified method cannot compile, and refused at runtime so one
 * cannot cross under type erasure either.
 *
 * The class decides the boundary semantics. Ordinary classes cross
 * through `boundary.call`, which rejects the awaiting continuation on
 * interrupt and rejects a result that resolves after the absolute expiry
 * — safe because those classes discard nothing that matters: reads are
 * discardable, acknowledged effects account their facts before their
 * acknowledgements and resolve maybe-performed work through teardown,
 * and acquisitions carry a resource-side resolution protocol. The
 * `finalization` class crosses through `boundary.commit`, which accepts
 * a resolved acknowledgement — an irreversible publication that already
 * happened cannot be discarded — and the boundary stamps the commit's
 * absolute expiry and the BOUND that expiry belongs to.
 *
 * `clock.now()` is synchronous and deliberately unwrapped. It cannot hold
 * the run open, and keeping it direct preserves the clock port's contract.
 */
import type { FinalizationPort, Ports } from '../ports/index.js'
import type { CallGuard } from './deadline.js'
import { PORT_EFFECTS, type EffectClass } from './effects.js'

const classified = <T extends object>(
  port: T,
  boundary: CallGuard,
  classes: Readonly<Partial<Record<PropertyKey, EffectClass>>>,
): T =>
  new Proxy(port, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (typeof value !== 'function') return value
      const effectClass = classes[property]
      return (...args: unknown[]) => {
        // NO METHOD CROSSES UNCLASSIFIED. The table's type makes this
        // unreachable for the declared surface; this guard is for what
        // types cannot see — a double with an extra method, an erased
        // cast — and it refuses rather than guessing a class.
        if (effectClass === undefined) {
          return Promise.reject(
            new Error(`unclassified asynchronous port method: ${String(property)}`),
          )
        }
        const run =
          effectClass === 'finalization'
            ? boundary.commit.bind(boundary)
            : boundary.call.bind(boundary)
        return run(() =>
          Promise.resolve(Reflect.apply(value as (...input: unknown[]) => unknown, target, args)),
        )
      }
    },
  })

/**
 * The finalization port crosses the boundary as an ACKNOWLEDGED,
 * IRREVERSIBLE effect — `boundary.commit`, never `boundary.call`. A late
 * read is discarded; a late acknowledgement describes a publication that
 * already happened, and discarding it invents a second terminal for a
 * run whose first is visible.
 *
 * The boundary also STAMPS what it alone knows: the absolute expiry the
 * commit must enforce synchronously at its publication point, and the
 * BOUND that expiry belongs to — the governed run clock, or an
 * attempt-scoped settlement/recovery ceiling. The distinction is what
 * keeps expiry provenance honest downstream: a governed expiry is the
 * run's timeout; an attempt bound expiring is a recording failure that
 * must never relabel the intended terminal.
 */
const committed = (port: FinalizationPort, boundary: CallGuard): FinalizationPort => ({
  commit: (request) => {
    // THE BOUNDARY IS THE ONLY AUTHORITY FOR EXPIRY METADATA. Both
    // stamps come UNCONDITIONALLY from the one winning-expiry value —
    // caller-supplied expiry fields are STRIPPED, never preferred, so a
    // pre-boundary caller cannot widen the budget or forge the
    // provenance the refusal will carry. One value, two projections: a
    // governed deadline that wins the minimum is refused as the run's
    // timeout, and an attempt ceiling that wins is refused as the
    // attempt's bound.
    const winning = boundary.expiry()
    const { expires_at_epoch_ms: _caller_at, expires_at_bound: _caller_bound, ...intent } = request
    return boundary.commit(() =>
      port.commit({
        ...intent,
        ...(winning === undefined
          ? {}
          : {
              expires_at_epoch_ms: winning.at,
              expires_at_bound: winning.source === 'governed' ? 'governed' : ('attempt' as const),
            }),
      }),
    )
  },
})

/**
 * Decorate the complete asynchronous port set.
 *
 * Adding a method to an existing port fails `PORT_EFFECTS`' type until
 * it is classified. Adding a new port to `Ports` makes both the table
 * and this object fail to type-check until the new boundary is
 * explicitly admitted here.
 */
export const guardPorts = (ports: Ports, boundary: CallGuard): Ports => ({
  authority: classified(ports.authority, boundary, PORT_EFFECTS.authority),
  journal: classified(ports.journal, boundary, PORT_EFFECTS.journal),
  lease: classified(ports.lease, boundary, PORT_EFFECTS.lease),
  finalization: committed(ports.finalization, boundary),
  session: classified(ports.session, boundary, PORT_EFFECTS.session),
  workspace: classified(ports.workspace, boundary, PORT_EFFECTS.workspace),
  observer: classified(ports.observer, boundary, PORT_EFFECTS.observer),
  artifacts: classified(ports.artifacts, boundary, PORT_EFFECTS.artifacts),
  execution: classified(ports.execution, boundary, PORT_EFFECTS.execution),
  adapter: classified(ports.adapter, boundary, PORT_EFFECTS.adapter),
  events: classified(ports.events, boundary, PORT_EFFECTS.events),
  evidence: classified(ports.evidence, boundary, PORT_EFFECTS.evidence),
  clock: ports.clock,
})
