/**
 * The single bound comparison (design D10). No parameter, option, or
 * return shape expresses a truncated, sampled, or partial result: a
 * caller wanting "as much as fits" cannot express the request. A measured
 * value EQUAL to its declared bound proceeds; strictly greater refuses.
 */
import { type Decision, proceed, refuse } from '../decision/index.js'

export interface InBounds {
  readonly bound: string
  readonly measured: number
  readonly declared: number
}

export const enforceBound = (
  bound: string,
  measured: number,
  declared: number,
): Decision<InBounds> => {
  if (!Number.isFinite(measured) || !Number.isFinite(declared)) {
    return refuse(
      'undecidable',
      { element: bound, observed: String(measured) },
      'bound comparison over a non-finite value cannot be established',
    )
  }
  if (measured > declared) {
    return refuse(
      'over_bound',
      { element: bound, observed: String(measured) },
      `measured ${String(measured)} exceeds the declared bound ${String(declared)}`,
    )
  }
  return proceed({ bound, measured, declared })
}
