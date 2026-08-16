/**
 * The public facade.
 *
 * `Runner` is the engine's entry point and these are its types. Both
 * live in `orchestration/`; this file exists so that consumers keep one
 * stable import path while the orchestration behind it is free to be
 * several modules rather than one procedure.
 *
 * It used to BE the procedure — 1,391 lines holding every phase, every
 * terminator, and the run's whole state in closures. Four separate
 * defects came out of that shape, each found one review at a time and
 * every one of them caused by state nothing could see: an exception
 * handler that could not reach the run it was recovering, a failure
 * terminal that skipped the machine, a trust decision that had drifted
 * out of the core, and a duplicate authority for the durable walk.
 */
export { Runner } from './orchestration/run.js'
export type { RunConclusion, RunRequest, RunSignals } from './orchestration/result.js'
