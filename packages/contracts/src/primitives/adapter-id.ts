import { z } from 'zod'

/** Opaque adapter identity. Never an enum, discriminator, or branch. */
export const AdapterId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/, 'adapter id: lowercase kebab, <=64 chars')

export type AdapterIdT = z.infer<typeof AdapterId>
