/**
 * @secure-home/adapter-copilot-cli — the GitHub Copilot CLI adapter.
 *
 * Pure translation between the frozen adapter SPI (mirrored in
 * `./spi.js`; frozen in runner-control at L4) and the pinned
 * `@github/copilot@1.0.79` CLI, every mapping traced to the L6 spike
 * evidence. Importing this package has no side effects; the process
 * entry is `./bin.js`, exercised only by the framework-conformance suite
 * until a launcher exists (L9).
 */
export { ISOLATION_ENV, planLaunch, PROVIDER } from './plan.js'
export type { LaunchPlan, PlanResult } from './plan.js'
export { observeRun } from './observe.js'
export type { CapturedRun } from './observe.js'
export { parseWireInvocation } from './spi.js'
export type {
  AdapterCall,
  AdapterObservation,
  AdapterReport,
  NormalizedProviderEvent,
  RunInput,
  TerminalObservations,
  UntrustedClaim,
  UsageMeasure,
  WireInvocation,
} from './spi.js'
