/**
 * Run events (capability `runner-execution`): a closed, versioned platform
 * `event_type` vocabulary, identical in shape across every adapter.
 * Provider-specific naming rides ONLY as opaque data
 * (`provider_event_name`, `provider_metadata`) — never as the event type.
 * Extending the vocabulary requires a contract-version increment.
 */
import { z } from 'zod'
import { AdapterId, CapabilityGrant, SemVer } from '@secure-home/contracts'
import { RunId } from './run-record.js'

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

export const RunEvent = z.strictObject({
  contract_id: z.literal(RUN_EVENT_ID),
  contract_version: z.literal(RUN_EVENT_VERSION),
  event_type: EventType,
  run_id: RunId,
  sequence: z.int().nonnegative(),
  timestamp: z.iso.datetime(),
  // Provider and adapter identity as data values only.
  adapter: AdapterId,
  provider: z.string().min(1).optional(),
  provider_event_name: z.string().min(1).optional(),
  provider_metadata: z.record(z.string(), z.unknown()).optional(),
  // The one authored grant shape, reused: present on capability.granted.
  grant: CapabilityGrant.optional(),
  detail: z.string().min(1).optional(),
})

export type EventTypeT = z.infer<typeof EventType>
export type RunEventT = z.infer<typeof RunEvent>

SemVer.parse(RUN_EVENT_VERSION)
