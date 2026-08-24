/**
 * @secure-home/adapter-claude-code — the Claude Code reference adapter.
 *
 * Pure translation between the frozen adapter SPI (mirrored in
 * `./spi.js`; frozen in runner-control at L4) and the pinned
 * `@anthropic-ai/claude-code@2.1.241` CLI. Importing this package has no
 * side effects; the process entry is `./bin.js`, exercised only by the
 * framework-conformance suite until a launcher exists (L9).
 */
export { childEnvironment, planLaunch, PROVIDER } from './plan.js'
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
