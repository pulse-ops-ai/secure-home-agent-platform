/**
 * Shared runner primitives (runner-domain-contracts D2/D6/D7).
 *
 * Authored exactly once. `@secure-home/events` imports these instances —
 * never redefines them — so one shape flows from the profile's capability
 * group through `capability.granted` payloads into evidence.
 *
 * Open identities are constrained strings, never enums: adding an adapter
 * (or any provider) must change no schema (ADR-0003; runner-adoption).
 */
import { z } from 'zod'

/** Opaque adapter identity. Never an enum, discriminator, or branch. */
export const AdapterId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/, 'adapter id: lowercase kebab, <=64 chars')

/** Unique gate identity within a registry or result set. */
export const GateId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/, 'gate id: lowercase, <=64 chars')

/** Content digest. The only digest form any runner contract carries. */
export const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'digest: sha256:<64 lowercase hex>')

/** Exact semantic revision, e.g. "1.0.0". */
export const SemVer = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'exact semver')

/**
 * Credential reference: an environment-variable NAME. There is no field in
 * any runner contract designated for credential-value transport.
 */
export const CredentialRef = z.strictObject({
  env_var: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'environment-variable name'),
})

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

/** Filesystem mount posture — platform-owned closed vocabulary. */
export const MountPosture = z.enum(['read_only', 'read_write'])

/** Routing class (ADR-0007) — platform-owned closed vocabulary. */
export const RoutingClass = z.enum(['R0', 'R1', 'R2', 'R3'])

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

export type AdapterIdT = z.infer<typeof AdapterId>
export type GateIdT = z.infer<typeof GateId>
export type DigestT = z.infer<typeof Digest>
export type CredentialRefT = z.infer<typeof CredentialRef>
export type ProfileIdentityT = z.infer<typeof ProfileIdentity>
export type CapabilityGrantT = z.infer<typeof CapabilityGrant>
