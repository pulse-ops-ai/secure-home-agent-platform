import { z } from 'zod'
import { CredentialRef } from './credential-ref.js'

/** Filesystem mount posture — platform-owned closed vocabulary. */
export const MountPosture = z.enum(['read_only', 'read_write'])

export const Mount = z.strictObject({
  path: z.string().regex(/^\//, 'absolute path'),
  posture: MountPosture,
})

/**
 * Network policy: default deny with explicitly granted destinations. An
 * "open" posture is inexpressible — `default` admits only "deny".
 */
export const NetworkPolicy = z.strictObject({
  default: z.literal('deny'),
  granted_destinations: z.array(
    z.strictObject({
      host: z.string().regex(/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/, 'hostname'),
      port: z.int().min(1).max(65535),
    }),
  ),
})

/**
 * The capability grant — the profile's capability group, reused verbatim as
 * the `capability.granted` event payload and `evidence.granted_capabilities`.
 */
export const CapabilityGrant = z.strictObject({
  tools: z.array(z.string().min(1)),
  mounts: z.array(Mount),
  network: NetworkPolicy,
  credentials: z.array(CredentialRef),
})

export type CapabilityGrantT = z.infer<typeof CapabilityGrant>
