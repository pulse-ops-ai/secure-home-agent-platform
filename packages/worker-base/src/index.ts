/**
 * Standard worker runtime contract (ADR-0012 §18).
 *
 * BOUNDARY ONLY. Lifecycle, graceful shutdown, Zod config parsing, health,
 * cancellation, retry and dead-letter, concurrency, metrics, idempotency, and
 * the error taxonomy are NOT implemented here — issue #24 establishes the
 * package, a later issue implements it. There is no `createWorker` yet.
 */

export {}
