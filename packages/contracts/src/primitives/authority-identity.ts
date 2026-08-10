import { z } from 'zod'
import { Digest } from './digest.js'
import { SemVer } from './semver.js'

/**
 * The digest-bound identity of a captured authority document: which
 * contract validated it, at which exact version, over which bytes
 * (runner-contract-corrections D2). Authored once here; `@secure-home/
 * events` imports this instance for the evidence identity group.
 */
export const AuthorityIdentity = z.strictObject({
  contract_id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  contract_version: SemVer,
  digest: Digest,
})

export type AuthorityIdentityT = z.infer<typeof AuthorityIdentity>
