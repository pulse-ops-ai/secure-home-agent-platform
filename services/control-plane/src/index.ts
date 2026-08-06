/**
 * Household control plane service (ADR-0012 §5).
 *
 * BOUNDARY ONLY. No NestJS module, no Fastify adapter, no HTTP surface, no
 * enforcement path — that is issue #26. This file exists so the deployable
 * boundary is discoverable and compiles.
 */

export {}
