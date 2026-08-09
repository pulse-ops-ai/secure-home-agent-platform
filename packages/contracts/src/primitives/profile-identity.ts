import { z } from 'zod'
import { Digest } from './digest.js'
import { SemVer } from './semver.js'

/** Profile identity as recorded in runs and evidence. */
export const ProfileIdentity = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  version: SemVer,
  digest: Digest,
})

/** Profile reference (pre-resolution: no digest yet). */
export const ProfileRef = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  version: SemVer,
})

export type ProfileIdentityT = z.infer<typeof ProfileIdentity>
