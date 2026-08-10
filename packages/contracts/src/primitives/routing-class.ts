import { z } from 'zod'

/** Routing class (ADR-0007) — platform-owned closed vocabulary. */
export const RoutingClass = z.enum(['R0', 'R1', 'R2', 'R3'])
