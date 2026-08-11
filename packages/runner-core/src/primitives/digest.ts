/**
 * Deterministic digest computation, shared by producer and verifier
 * (design § Shared vs Independent Logic: two independent SHA-256
 * implementations would prove nothing and add divergence risk).
 * `node:crypto` is computation, not I/O — RC-INV-04 governs I/O modules.
 */
import { createHash } from 'node:crypto'

/** `sha256:<64 lowercase hex>` over the UTF-8 bytes of `content`. */
export const digestOf = (content: string): string =>
  `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
