/**
 * Run events (capability `runner-execution`): a closed, versioned platform
 * `event_type` vocabulary — now a discriminated union, so every event
 * type's payload is contracted, not merely named. The ratified runner
 * model requires the stream to record the capability grant, each
 * attempted call and its disposition, adapter transitions, and the
 * termination outcome; those payloads are structural here.
 * Provider-specific naming rides ONLY as opaque envelope data
 * (`provider_event_name`, `provider_metadata`) — never as the event type.
 * Extending the vocabulary requires a contract-version increment.
 */
import { z } from 'zod'
import { AdapterId, CapabilityGrant, ProfileIdentity, SemVer } from '@secure-home/contracts'
import { RunId, RunOutcome } from './run-record.js'

export const RUN_EVENT_ID = 'run-event' as const
export const RUN_EVENT_VERSION = '1.0.0' as const

/** The closed platform event vocabulary — platform-owned, versioned. */
export const EVENT_TYPES = [
  'run.started',
  'capability.granted',
  'call.attempted',
  'call.disposition',
  'adapter.started',
  'adapter.completed',
  'run.terminated',
] as const

export const EventType = z.enum(EVENT_TYPES)

/** Correlates call.attempted with its call.disposition. */
export const CallId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,127}$/, 'call id: lowercase, <=128 chars')

/** One attempted operation, shared with the evidence bundle. */
export const OperationRecord = z.strictObject({
  name: z.string().min(1),
  target: z.string().min(1).optional(),
})

/** Shared envelope: identical on every event type. */
const envelope = {
  contract_id: z.literal(RUN_EVENT_ID),
  contract_version: z.literal(RUN_EVENT_VERSION),
  run_id: RunId,
  sequence: z.int().nonnegative(),
  timestamp: z.iso.datetime(),
  // Provider and adapter identity as data values only.
  adapter: AdapterId,
  provider: z.string().min(1).optional(),
  provider_event_name: z.string().min(1).optional(),
  provider_metadata: z.record(z.string(), z.unknown()).optional(),
} as const

export const RunEvent = z.discriminatedUnion('event_type', [
  z.strictObject({
    ...envelope,
    event_type: z.literal('run.started'),
    profile: ProfileIdentity,
  }),
  z.strictObject({
    ...envelope,
    event_type: z.literal('capability.granted'),
    // The one authored grant shape, required — a grant event without a
    // grant is unrepresentable.
    grant: CapabilityGrant,
  }),
  z.strictObject({
    ...envelope,
    event_type: z.literal('call.attempted'),
    call_id: CallId,
    operation: OperationRecord,
  }),
  z.strictObject({
    ...envelope,
    event_type: z.literal('call.disposition'),
    call_id: CallId,
    disposition: z.enum(['permitted', 'denied']),
    detail: z.string().min(1).optional(),
  }),
  z.strictObject({
    ...envelope,
    event_type: z.literal('adapter.started'),
  }),
  z.strictObject({
    ...envelope,
    event_type: z.literal('adapter.completed'),
  }),
  z.strictObject({
    ...envelope,
    event_type: z.literal('run.terminated'),
    outcome: RunOutcome,
  }),
])

export type EventTypeT = z.infer<typeof EventType>
export type RunEventT = z.infer<typeof RunEvent>

SemVer.parse(RUN_EVENT_VERSION)
