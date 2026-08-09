/**
 * The launch assertion (capability `runner-execution`): the composed launch
 * as data. No field is designated for credential-value transport, and the
 * secret-presence field admits only `false` — a secret-bearing assertion is
 * unrepresentable, never redacted.
 */
import { z } from 'zod'
import { CredentialRef, Digest, SemVer } from './primitives.js'

export const LAUNCH_ASSERTION_ID = 'launch-assertion' as const
export const LAUNCH_ASSERTION_VERSION = '1.0.0' as const

export const LaunchAssertion = z.strictObject({
  contract_id: z.literal(LAUNCH_ASSERTION_ID),
  contract_version: z.literal(LAUNCH_ASSERTION_VERSION),
  argv: z.array(z.string()).min(1),
  argv_digest: Digest,
  environment_names: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'environment-variable name')),
  credentials: z.array(CredentialRef),
  contains_secret_values: z.literal(false),
})

export type LaunchAssertionT = z.infer<typeof LaunchAssertion>

SemVer.parse(LAUNCH_ASSERTION_VERSION)
