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
export * from './adapter-id.js'
export * from './capability-grant.js'
export * from './credential-ref.js'
export * from './digest.js'
export * from './gate-id.js'
export * from './profile-identity.js'
export * from './routing-class.js'
export * from './semver.js'
