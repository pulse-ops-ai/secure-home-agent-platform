/**
 * Canonical ordering so set-shaped results are independent of input
 * presentation order (RC-PROP-02). Deterministic, decision-free.
 */

/** Stable lexicographic sort without mutating the input. */
export const canonicalSort = <T>(items: readonly T[], keyOf: (item: T) => string): readonly T[] =>
  [...items].sort((a, b) => {
    const ka = keyOf(a)
    const kb = keyOf(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
