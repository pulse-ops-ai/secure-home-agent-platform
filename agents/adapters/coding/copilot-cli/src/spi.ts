/**
 * The adapter-side mirror of the frozen adapter SPI.
 *
 * The SPI is frozen in `services/runner-control/src/ports/values.ts`
 * ("THE ADAPTER SPI, frozen to ADR-0013"). Nothing may import a
 * deployable — the source-import gate enforces that in every zone — so
 * this package declares the shapes it exchanges structurally, and the
 * framework-conformance tether derives both field inventories from
 * source at test time and refuses on any difference. This mirror never
 * adds, removes, or renames a frozen field.
 *
 * The one deliberate difference is the wire form of the invocation:
 * `AdapterInvocationRequest.signal` is an `AbortSignal`, which does not
 * serialize across a process boundary. Cancellation reaches an adapter
 * process as SIGTERM (ADR-0013 decision 8: substrate-effected), so the
 * wire invocation is the frozen request minus `signal`, exactly.
 */
import type { CapabilityGrantT } from '@secure-home/contracts'

/** The frozen `RunInput`, mirrored. */
export interface RunInput {
  readonly kind: 'task'
  readonly task: string
  readonly parameters: Readonly<Record<string, string>>
}

/**
 * The frozen `AdapterInvocationRequest` minus `signal` — the form that
 * crosses the process boundary. Field-for-field otherwise, including the
 * fence (`run_id`, `generation`): the wire carries it so the report
 * grammar downstream stays the frozen one.
 */
export interface WireInvocation {
  readonly run_id: string
  readonly generation: number
  readonly adapter: string
  readonly profile: { readonly name: string; readonly version: string; readonly digest: string }
  readonly input: RunInput
  readonly grant: CapabilityGrantT
  readonly routing: {
    readonly routing_class: string
    readonly model_route: string
    readonly fallback: string
  }
  readonly limits: {
    readonly wall_clock_seconds: number
    readonly cpu_cores: number
    readonly memory_bytes: number
    readonly pids: number
    readonly output_bytes: number
  }
  readonly credentials: readonly { readonly env_var: string }[]
  readonly workspace: { readonly session_ref: string; readonly root_ref: string }
}

/** The frozen `AdapterCall`, mirrored. */
export interface AdapterCall {
  readonly tool: string
  readonly disposition: 'permitted' | 'denied'
}

/** The frozen `UntrustedClaim`, mirrored. */
export interface UntrustedClaim {
  readonly kind: 'text' | 'structured'
  readonly content: string
}

/** The frozen `NormalizedProviderEvent`, mirrored. */
export interface NormalizedProviderEvent {
  readonly name: string
  readonly at: string
  readonly data: Readonly<Record<string, string>>
}

/** The frozen `TerminalObservations`, mirrored — fields that may DISAGREE. */
export interface TerminalObservations {
  readonly exit_code?: number
  readonly reported_outcome?: string
  readonly transcript_terminal?: string
  readonly signalled?: string
}

/** The frozen `UsageMeasure`, mirrored — native units, never money. */
export interface UsageMeasure {
  readonly unit: string
  readonly amount: number
}

/** The frozen `AdapterObservation`, mirrored. */
export interface AdapterObservation {
  readonly calls: readonly AdapterCall[]
  readonly claims: readonly UntrustedClaim[]
  readonly events: readonly NormalizedProviderEvent[]
  readonly terminal: TerminalObservations
  readonly usage: readonly UsageMeasure[]
  readonly transcript?: { readonly ref: string; readonly digest: string }
}

/** The frozen `AdapterReport`, mirrored: observed / environmental_fault / stale_fence. */
export type AdapterReport =
  | { readonly outcome: 'observed'; readonly observation: AdapterObservation }
  | { readonly outcome: 'environmental_fault'; readonly detail: string }
  | { readonly outcome: 'stale_fence'; readonly detail: string }

// ---------------------------------------------------------------------------
// Closed wire validation.
//
// Hand-rolled on purpose: the compiled adapter must resolve nothing but
// `node:` builtins, so the wire boundary cannot lean on a schema library.
// The posture matches every other platform boundary: strict, unknown keys
// refused, one refusal reason per failure, fail-closed.
// ---------------------------------------------------------------------------

type Refusal = { readonly ok: false; readonly refusal: string }
type Parsed = { readonly ok: true; readonly invocation: WireInvocation }

const refuse = (refusal: string): Refusal => ({ ok: false, refusal })

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Exact-key check: every listed key present (unless optional), none extra. */
function checkKeys(
  value: Record<string, unknown>,
  where: string,
  required: readonly string[],
  optional: readonly string[] = [],
): string | undefined {
  for (const k of Object.keys(value)) {
    if (!required.includes(k) && !optional.includes(k)) {
      return `${where} carries unknown key "${k}"`
    }
  }
  for (const k of required) {
    if (!(k in value)) return `${where} is missing required key "${k}"`
  }
  return undefined
}

const isString = (v: unknown): v is string => typeof v === 'string'
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Same grammar as the contracts `CredentialRef`: a NAME, never a value slot. */
const ENV_VAR = /^[A-Z][A-Z0-9_]*$/

function checkCredentialList(v: unknown, where: string): string | undefined {
  if (!Array.isArray(v)) return `${where} must be an array`
  for (const [i, entry] of v.entries()) {
    if (!isRecord(entry)) return `${where}[${i}] must be an object`
    const keys = checkKeys(entry, `${where}[${i}]`, ['env_var'])
    if (keys !== undefined) return keys
    if (!isString(entry['env_var']) || !ENV_VAR.test(entry['env_var'])) {
      return `${where}[${i}].env_var must be an environment-variable name`
    }
  }
  return undefined
}

/** Structural check of the contracts `CapabilityGrant` shape, closed. */
function checkGrant(v: unknown): string | undefined {
  if (!isRecord(v)) return 'grant must be an object'
  const keys = checkKeys(v, 'grant', ['tools', 'mounts', 'network', 'credentials'])
  if (keys !== undefined) return keys

  const tools = v['tools']
  if (!Array.isArray(tools) || tools.some((t) => !isString(t) || t.length === 0)) {
    return 'grant.tools must be an array of non-empty strings'
  }

  const mounts = v['mounts']
  if (!Array.isArray(mounts)) return 'grant.mounts must be an array'
  for (const [i, mount] of mounts.entries()) {
    if (!isRecord(mount)) return `grant.mounts[${i}] must be an object`
    const mountKeys = checkKeys(mount, `grant.mounts[${i}]`, ['path', 'posture'])
    if (mountKeys !== undefined) return mountKeys
    if (!isString(mount['path']) || !mount['path'].startsWith('/')) {
      return `grant.mounts[${i}].path must be an absolute path`
    }
    if (mount['posture'] !== 'read_only' && mount['posture'] !== 'read_write') {
      return `grant.mounts[${i}].posture must be read_only or read_write`
    }
  }

  const network = v['network']
  if (!isRecord(network)) return 'grant.network must be an object'
  const networkKeys = checkKeys(network, 'grant.network', ['default', 'granted_destinations'])
  if (networkKeys !== undefined) return networkKeys
  if (network['default'] !== 'deny') return 'grant.network.default admits only "deny"'
  const destinations = network['granted_destinations']
  if (!Array.isArray(destinations)) return 'grant.network.granted_destinations must be an array'
  for (const [i, dest] of destinations.entries()) {
    if (!isRecord(dest)) return `grant.network.granted_destinations[${i}] must be an object`
    const destKeys = checkKeys(dest, `grant.network.granted_destinations[${i}]`, ['host', 'port'])
    if (destKeys !== undefined) return destKeys
    if (!isString(dest['host']) || dest['host'].length === 0) {
      return `grant.network.granted_destinations[${i}].host must be a hostname`
    }
    if (!isFiniteNumber(dest['port']) || dest['port'] < 1 || dest['port'] > 65535) {
      return `grant.network.granted_destinations[${i}].port must be a port`
    }
  }

  return checkCredentialList(v['credentials'], 'grant.credentials')
}

/**
 * Parse one wire invocation, closed. Returns a refusal — never throws —
 * so a malformed invocation travels through the contract as an
 * `environmental_fault` report rather than a crash.
 */
export function parseWireInvocation(bytes: string): Parsed | Refusal {
  let raw: unknown
  try {
    raw = JSON.parse(bytes)
  } catch {
    return refuse('invocation is not valid JSON')
  }
  if (!isRecord(raw)) return refuse('invocation must be a JSON object')

  const keys = checkKeys(raw, 'invocation', [
    'run_id',
    'generation',
    'adapter',
    'profile',
    'input',
    'grant',
    'routing',
    'limits',
    'credentials',
    'workspace',
  ])
  if (keys !== undefined) return refuse(keys)

  if (!isString(raw['run_id']) || raw['run_id'].length === 0) {
    return refuse('run_id must be a non-empty string')
  }
  if (!isFiniteNumber(raw['generation'])) return refuse('generation must be a number')
  if (!isString(raw['adapter']) || raw['adapter'].length === 0) {
    return refuse('adapter must be a non-empty string')
  }

  const profile = raw['profile']
  if (!isRecord(profile)) return refuse('profile must be an object')
  const profileKeys = checkKeys(profile, 'profile', ['name', 'version', 'digest'])
  if (profileKeys !== undefined) return refuse(profileKeys)
  for (const k of ['name', 'version', 'digest'] as const) {
    if (!isString(profile[k]) || profile[k].length === 0) {
      return refuse(`profile.${k} must be a non-empty string`)
    }
  }

  const input = raw['input']
  if (!isRecord(input)) return refuse('input must be an object')
  const inputKeys = checkKeys(input, 'input', ['kind', 'task', 'parameters'])
  if (inputKeys !== undefined) return refuse(inputKeys)
  if (input['kind'] !== 'task') return refuse('input.kind admits only "task"')
  if (!isString(input['task']) || input['task'].length === 0) {
    return refuse('input.task must be a non-empty string')
  }
  const parameters = input['parameters']
  if (!isRecord(parameters) || Object.values(parameters).some((v) => !isString(v))) {
    return refuse('input.parameters must be a string-to-string record')
  }

  const grantRefusal = checkGrant(raw['grant'])
  if (grantRefusal !== undefined) return refuse(grantRefusal)

  const routing = raw['routing']
  if (!isRecord(routing)) return refuse('routing must be an object')
  const routingKeys = checkKeys(routing, 'routing', ['routing_class', 'model_route', 'fallback'])
  if (routingKeys !== undefined) return refuse(routingKeys)
  for (const k of ['routing_class', 'model_route', 'fallback'] as const) {
    if (!isString(routing[k])) return refuse(`routing.${k} must be a string`)
  }

  const limits = raw['limits']
  if (!isRecord(limits)) return refuse('limits must be an object')
  const limitKeys = checkKeys(limits, 'limits', [
    'wall_clock_seconds',
    'cpu_cores',
    'memory_bytes',
    'pids',
    'output_bytes',
  ])
  if (limitKeys !== undefined) return refuse(limitKeys)
  for (const k of [
    'wall_clock_seconds',
    'cpu_cores',
    'memory_bytes',
    'pids',
    'output_bytes',
  ] as const) {
    if (!isFiniteNumber(limits[k]) || limits[k] <= 0) {
      return refuse(`limits.${k} must be a positive number`)
    }
  }

  const credentialRefusal = checkCredentialList(raw['credentials'], 'credentials')
  if (credentialRefusal !== undefined) return refuse(credentialRefusal)

  const workspace = raw['workspace']
  if (!isRecord(workspace)) return refuse('workspace must be an object')
  const workspaceKeys = checkKeys(workspace, 'workspace', ['session_ref', 'root_ref'])
  if (workspaceKeys !== undefined) return refuse(workspaceKeys)
  for (const k of ['session_ref', 'root_ref'] as const) {
    if (!isString(workspace[k]) || workspace[k].length === 0) {
      return refuse(`workspace.${k} must be a non-empty string`)
    }
  }

  return { ok: true, invocation: raw as unknown as WireInvocation }
}
