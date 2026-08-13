/**
 * The INERT NestJS application shell (design D2).
 *
 * This is the module tree and composition boundary that a later
 * operational act will start. It is shipped now, typed and built, so the
 * wiring is reviewed as code rather than improvised at activation time —
 * and it is inert now, so shipping it grants nothing.
 *
 * What "inert" means here, precisely:
 *
 *  - no `main`, no `NestFactory.create`, no `listen` — this repository
 *    contains no call that starts this application;
 *  - importing this module registers Nest metadata on the class and does
 *    nothing else: no socket, no process, no connection, no timer;
 *  - the service's public surface (`src/index.ts`) does NOT re-export
 *    this module, so importing the service cannot even reach the
 *    framework by accident.
 *
 * `reflect-metadata` is imported here because Nest's decorators need it,
 * and only here. It installs metadata helpers on the global `Reflect`; it
 * starts nothing, binds nothing, and is deliberately kept off the
 * framework-free orchestration modules' import graph.
 *
 * Activation — actually starting the process, triggering, placement — is
 * a later operational act on this landed shell, gated on its own
 * decision. It is not a new landing and it is not this change.
 */
import 'reflect-metadata'
import { Module } from '@nestjs/common'
import {
  DeterministicAdapterInvocation,
  DeterministicExecution,
  InMemoryExecutionSession,
  InMemoryRunJournal,
  InMemoryRunLease,
  RecordingEventSink,
  RecordingEvidenceSink,
  SteppingClock,
} from '../adapters/index.js'
import { Runner } from '../runner.js'
import { PORT_TOKENS } from './tokens.js'

/**
 * The composition boundary.
 *
 * The execution and adapter providers are the DETERMINISTIC
 * implementations, because those are the only implementations of those
 * ports that exist in this repository. That is not a placeholder to be
 * swapped in a hurry: the concrete launcher is a later landing with its
 * own authorization, and until then this shell literally cannot be
 * configured into starting anything.
 *
 * The filesystem-backed source and observer providers are deliberately
 * NOT registered here. They need a workspace root and a source→path map,
 * which are deployment inputs; binding them to invented defaults would
 * make the shell look configured when it is not.
 */
@Module({
  providers: [
    { provide: PORT_TOKENS.execution, useClass: DeterministicExecution },
    { provide: PORT_TOKENS.adapter, useClass: DeterministicAdapterInvocation },
    { provide: PORT_TOKENS.events, useClass: RecordingEventSink },
    { provide: PORT_TOKENS.evidence, useClass: RecordingEvidenceSink },
    { provide: PORT_TOKENS.clock, useClass: SteppingClock },
    { provide: PORT_TOKENS.journal, useClass: InMemoryRunJournal },
    { provide: PORT_TOKENS.lease, useClass: InMemoryRunLease },
    { provide: PORT_TOKENS.session, useClass: InMemoryExecutionSession },
  ],
  exports: [
    PORT_TOKENS.execution,
    PORT_TOKENS.adapter,
    PORT_TOKENS.events,
    PORT_TOKENS.evidence,
    PORT_TOKENS.clock,
    PORT_TOKENS.journal,
    PORT_TOKENS.lease,
    PORT_TOKENS.session,
  ],
})
export class RunnerControlModule {}

export { Runner }
