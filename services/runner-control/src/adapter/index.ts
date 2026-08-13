/**
 * The adapter SPI, frozen to ADR-0013 — invocation and observation
 * shapes, and nothing that decides. Re-exported from the port value
 * module where the shapes are authored alongside the other port values.
 */
export type {
  AdapterCall,
  AdapterInvocation,
  AdapterInvocationPort,
  AdapterInvocationRequest,
  AdapterObservation,
  AdapterReport,
  NormalizedProviderEvent,
  RunInput,
  TerminalObservations,
  UntrustedClaim,
  UsageMeasure,
} from '../ports/index.js'
export { DeterministicAdapterInvocation } from '../adapters/deterministic.js'
