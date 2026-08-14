/**
 * The key a proof needs to move a lease, and production does not.
 *
 * `InMemoryRunLease.steal()` was an ordinary public method: `claim()`
 * with the refusal removed. It seized any run by id — no claim, no
 * generation to present, no fence — from production source exported at
 * the package root. That is authority no composition granted, and
 * "it's only for tests" is the reason to keep it off the shipped
 * surface rather than a reason it is safe there.
 *
 * A symbol is not secrecy; it is ABSENCE FROM THE SURFACE. The lease
 * port declares three methods and the exported type has exactly those,
 * so a consumer reading the contract cannot find this and a consumer
 * enumerating the port does not meet it.
 */
export const SEIZE: unique symbol = Symbol('runner-control.test.seize-lease')
