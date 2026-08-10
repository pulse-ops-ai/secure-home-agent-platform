import { z } from 'zod'

/** Content digest. The only digest form any runner contract carries. */
export const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'digest: sha256:<64 lowercase hex>')

export type DigestT = z.infer<typeof Digest>
