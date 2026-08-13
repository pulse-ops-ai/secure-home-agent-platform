/**
 * RO-EX-95: a run that throws BEFORE authority still writes its record.
 *
 * `runner-lifecycle` requires a run terminating in `REQUESTED` to
 * produce the governed early-terminal record — it has no identities for
 * a bundle, so that record is the only thing it can produce, and
 * producing nothing means the run left no governed trace at all.
 *
 * The decomposition broke it. `#recover()` terminalizes the machine and
 * THEN calls `terminateEarly()`, which tries to terminalize again; the
 * machine is already terminal, the second transition is refused, and the
 * function concludes `none` before it ever builds the record.
 *
 * RO-EX-86 did not catch this because its fixture throws from the
 * authority source, which the acquisition epoch catches and converts
 * into an ordinary operational outcome — so it exercises the normal
 * `terminateEarly()` path and never enters `#recover()` at all.
 *
 * These fixtures throw from OUTSIDE that catch boundary.
 */
import { describe, expect, it } from 'vitest'
import { EarlyTerminationRecord } from '@secure-home/events'
import { Runner } from '../runner.js'
import { InMemoryRunLease } from '../adapters/index.js'
import { runRequest, testPorts } from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

/** A lease whose renew throws — outside acquisition's catch. */
const throwingRenew = () => {
  const lease = new InMemoryRunLease()
  return {
    claim: lease.claim.bind(lease),
    release: lease.release.bind(lease),
    renew: () => {
      throw new Error('the lease store exploded')
    },
  }
}

/** A journal whose acquisition append throws, mid-production-epoch. */
const throwingAcquisitionJournal = (base: ReturnType<typeof testPorts>['journal']) => ({
  ...base,
  appendTransition: base.appendTransition.bind(base),
  appendRejection: base.appendRejection.bind(base),
  appendHold: base.appendHold.bind(base),
  stageTransitions: base.stageTransitions.bind(base),
  readCurrentState: base.readCurrentState.bind(base),
  appendAcquisition: () => {
    throw new Error('the journal exploded while recording an acquisition')
  },
})

describe('RO-EX-95: recovery before authority produces the governed record', () => {
  it('a lease renew that throws before the first phase still records the terminal', async () => {
    const ports = testPorts({ lease: throwingRenew() })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('INDETERMINATE')
    const early = ports.evidence.all.filter(
      (write) => write.kind === 'early_termination_record' && write.run_id === RUN,
    )
    expect(early, 'a run with no identities must still leave its governed record').toHaveLength(1)
    expect(conclusion.produced).toBe('early_termination_record')
    expect(EarlyTerminationRecord.safeParse(early[0]?.payload).success).toBe(true)
  })

  it('a journal that throws mid-acquisition records exactly one terminal', async () => {
    const base = testPorts()
    const ports = testPorts({ journal: throwingAcquisitionJournal(base.journal) })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('INDETERMINATE')
    expect(
      ports.evidence.all.filter((write) => write.kind === 'early_termination_record'),
      'exactly one — terminalizing twice must not write twice either',
    ).toHaveLength(1)
  })
})
