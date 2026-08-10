import { z } from 'zod'

/** Unique gate identity within a registry or result set. */
export const GateId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/, 'gate id: lowercase, <=64 chars')

export type GateIdT = z.infer<typeof GateId>
