/**
 * Provider transcript → observation, pure and TOTAL.
 *
 * Everything here is untrusted input (ADR-0013 decision 4). Multi-surface
 * capture is SPIKE-03's instruction: the stdout `--output-format json`
 * frames AND the persisted `events.jsonl` (permission events exist only
 * there) are consumed by one defensive loop; `toolCallId` is stable in a
 * run and joins request → execution_start → execution_complete across
 * surfaces. Terminal truth is carried, never resolved: the spike's
 * SIGTERM case produced process exit 124 beside CLI `exitCode: 0`, and
 * both land here side by side (decision 3).
 *
 * Usage has ONE authoritative surface (SPIKE-04: surfaces disagree, pick
 * one): the stdout terminal frame's usage numbers, in native units.
 * Anything under a `cost`-spelled key is excluded — the spike found the
 * cost fields inconsistent across surfaces, and money is not modeled
 * (decision 6). Persisted `session.shutdown` numbers are recorded as
 * event data, never double-counted as usage.
 */
import type {
  AdapterCall,
  AdapterObservation,
  NormalizedProviderEvent,
  TerminalObservations,
  UntrustedClaim,
  UsageMeasure,
} from './spi.js'

/** What the process boundary saw — both surfaces plus exit metadata. */
export interface CapturedRun {
  readonly stdout: string
  /** Concatenated persisted events.jsonl bytes; undefined = surface absent. */
  readonly events_jsonl: string | undefined
  readonly exit_code: number | null
  readonly signalled: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Bounded detail: hostile bytes are described, never replayed. */
const describe = (line: string): string =>
  line.length <= 40 ? line : `${line.slice(0, 40)}… (${String(line.length)} bytes)`

/**
 * The budget is BYTES — `limits.output_bytes` means what it says, so
 * every charge is a UTF-8 byte length, never a UTF-16 code-unit count
 * (300 'é' characters are 600 bytes, and must spend 600).
 */
class BudgetedCollector {
  readonly calls: AdapterCall[] = []
  readonly claims: UntrustedClaim[] = []
  readonly events: NormalizedProviderEvent[] = []
  readonly usage: UsageMeasure[] = []
  #spent = 0
  #truncated = false
  readonly #budget: number

  constructor(budget: number) {
    this.#budget = budget
  }

  #charge(bytes: number): boolean {
    if (this.#truncated) return false
    if (this.#spent + bytes > this.#budget) {
      this.#truncated = true
      this.events.push({
        name: 'transcript.truncated',
        at: '',
        data: { budget_bytes: String(this.#budget) },
      })
      return false
    }
    this.#spent += bytes
    return true
  }

  claim(kind: UntrustedClaim['kind'], content: string): void {
    if (this.#charge(Buffer.byteLength(content, 'utf8'))) this.claims.push({ kind, content })
  }

  event(name: string, at: string, data: Readonly<Record<string, string>>): void {
    const size = Object.entries(data).reduce(
      (n, [k, v]) => n + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v, 'utf8'),
      Buffer.byteLength(name, 'utf8'),
    )
    if (this.#charge(size)) this.events.push({ name, at, data })
  }

  call(tool: string, disposition: AdapterCall['disposition']): void {
    this.calls.push({ tool, disposition })
  }

  measure(unit: string, amount: number): void {
    if (Number.isFinite(amount)) this.usage.push({ unit, amount })
  }
}

/** Native usage numbers from the terminal frame; cost-spelled keys excluded. */
function consumeUsage(usage: Record<string, unknown>, out: BudgetedCollector): void {
  for (const [key, value] of Object.entries(usage)) {
    if (key.toLowerCase().includes('cost')) continue
    if (typeof value === 'number') {
      out.measure(key, value)
    } else if (isRecord(value)) {
      for (const [inner, innerValue] of Object.entries(value)) {
        if (inner.toLowerCase().includes('cost')) continue
        if (typeof innerValue === 'number') out.measure(`${key}.${inner}`, innerValue)
      }
    }
  }
}

interface TerminalScratch {
  reported_outcome?: string
  transcript_terminal?: string
}

function consumeFrame(
  frame: Record<string, unknown>,
  surface: 'stdout' | 'events',
  out: BudgetedCollector,
  pendingCalls: Map<string, string>,
  terminal: TerminalScratch,
): void {
  const at = asString(frame['timestamp']) ?? ''
  const type = asString(frame['type']) ?? asString(frame['event']) ?? asString(frame['name'])

  if (type === undefined) {
    out.event('transcript.malformed', at, { reason: 'frame without a type', surface })
    return
  }

  if (type === 'assistant.message') {
    const content = asString(frame['content']) ?? asString(frame['text'])
    if (content !== undefined && content.length > 0) out.claim('text', content)
    const toolRequests = frame['toolRequests']
    if (Array.isArray(toolRequests)) {
      for (const request of toolRequests) {
        if (!isRecord(request)) continue
        const id = asString(request['toolCallId'])
        const name = asString(request['name']) ?? asString(request['tool'])
        if (id !== undefined && name !== undefined) pendingCalls.set(id, name)
      }
    }
    return
  }

  if (type === 'tool.execution_complete') {
    const id = asString(frame['toolCallId'])
    const tool = id !== undefined ? pendingCalls.get(id) : undefined
    const error = frame['error']
    const denied = isRecord(error) && asString(error['code']) === 'denied'
    if (tool !== undefined && id !== undefined) {
      pendingCalls.delete(id)
      out.call(tool, denied ? 'denied' : 'permitted')
    } else {
      // A completion with no correlated request is still an observation —
      // the join failed, and inventing a tool name would be deciding.
      out.event('call.uncorrelated', at, {
        surface,
        disposition: denied ? 'denied' : 'permitted',
      })
    }
    return
  }

  if (type === 'permission.completed') {
    const result = frame['result']
    const kind = isRecord(result) ? (asString(result['kind']) ?? '') : ''
    const tool = asString(frame['tool']) ?? asString(frame['toolName'])
    if (kind.startsWith('denied') && tool !== undefined) {
      out.call(tool, 'denied')
    }
    out.event('permission.completed', at, {
      surface,
      ...(kind !== '' ? { kind } : {}),
      ...(tool !== undefined ? { tool } : {}),
    })
    return
  }

  if (type === 'session.shutdown') {
    // Recorded as an event, never as usage — usage has one authoritative
    // surface and this is not it (SPIKE-04).
    const data: Record<string, string> = { surface }
    const reason = asString(frame['reason'])
    if (reason !== undefined) data['reason'] = reason
    out.event('session.shutdown', at, data)
    return
  }

  const result = frame['result']
  const exitCode = isRecord(result) ? result['exitCode'] : frame['exitCode']
  if (typeof exitCode === 'number') {
    terminal.reported_outcome = String(exitCode)
    terminal.transcript_terminal = type
    const usage = isRecord(result) ? result['usage'] : frame['usage']
    if (isRecord(usage)) consumeUsage(usage, out)
    return
  }

  if (type === 'tool.execution_start' || type === 'permission.requested') {
    out.event(type, at, { surface })
    return
  }

  out.event('transcript.unrecognized', at, { frame_type: describe(type), surface })
}

function consumeSurface(
  bytes: string,
  surface: 'stdout' | 'events',
  out: BudgetedCollector,
  pendingCalls: Map<string, string>,
  terminal: TerminalScratch,
): void {
  for (const line of bytes.split('\n')) {
    if (line.trim() === '') continue
    let frame: unknown
    try {
      frame = JSON.parse(line)
    } catch {
      out.event('transcript.malformed', '', {
        reason: 'unparseable line',
        line: describe(line),
        surface,
      })
      continue
    }
    if (!isRecord(frame)) {
      out.event('transcript.malformed', '', { reason: 'frame is not an object', surface })
      continue
    }
    consumeFrame(frame, surface, out, pendingCalls, terminal)
  }
}

/** Total over arbitrary bytes: every input yields a well-formed observation. */
export function observeRun(captured: CapturedRun, outputBudgetBytes: number): AdapterObservation {
  const out = new BudgetedCollector(outputBudgetBytes)
  const pendingCalls = new Map<string, string>()
  const terminal: TerminalScratch = {}

  consumeSurface(captured.stdout, 'stdout', out, pendingCalls, terminal)
  if (captured.events_jsonl !== undefined) {
    consumeSurface(captured.events_jsonl, 'events', out, pendingCalls, terminal)
  } else {
    // The persisted surface carries the permission events (SPIKE-03); its
    // absence is itself an observation, not a silent degradation.
    out.event('transcript.surface_missing', '', { surface: 'events' })
  }

  for (const tool of pendingCalls.values()) {
    out.event('call.unresolved', '', { tool })
  }

  const terminalObservations: TerminalObservations = {
    ...(captured.exit_code !== null ? { exit_code: captured.exit_code } : {}),
    ...(terminal.reported_outcome !== undefined
      ? { reported_outcome: terminal.reported_outcome }
      : {}),
    ...(terminal.transcript_terminal !== undefined
      ? { transcript_terminal: terminal.transcript_terminal }
      : {}),
    ...(captured.signalled !== null ? { signalled: captured.signalled } : {}),
  }

  return {
    calls: out.calls,
    claims: out.claims,
    events: out.events,
    terminal: terminalObservations,
    usage: out.usage,
  }
}
