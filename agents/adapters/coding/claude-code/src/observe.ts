/**
 * Provider transcript → observation, pure and TOTAL.
 *
 * Everything here is untrusted input (ADR-0013 decision 4): the pinned
 * CLI's stream-json stdout, its exit metadata, all of it. Every path
 * through this module returns a well-formed observation — malformed
 * bytes become recorded observations, never exceptions and never changed
 * adapter behavior. This is the L7 re-proof surface of PROP-006.
 *
 * Normalization basis: the stream-json framing of the pinned CLI
 * (`@anthropic-ai/claude-code@2.1.241`) — `system`/`assistant`/`user`/
 * `result` frames. Anything outside the recognized frames is observed as
 * unrecognized rather than guessed at.
 *
 * Deliberate exclusions, recorded here and in the README: the provider's
 * monetary fields (`total_cost_usd`) are never mapped — usage is native
 * units only (decision 6). The adapter also never invents a timestamp:
 * `at` carries the provider's own timestamp string when one exists, else
 * the empty string.
 */
import type {
  AdapterCall,
  AdapterObservation,
  NormalizedProviderEvent,
  TerminalObservations,
  UntrustedClaim,
  UsageMeasure,
} from './spi.js'

/** What the process boundary saw — collected by the entry, typed here. */
export interface CapturedRun {
  readonly stdout: string
  readonly exit_code: number | null
  readonly signalled: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** The usage units this adapter maps, all native token/turn counts. */
const USAGE_UNITS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
] as const

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
      // The truncation itself is observable — the one event that bypasses
      // the budget, so a blown budget cannot silently look like a quiet run.
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
    // Calls are the platform's audit trail of what the provider DID; they
    // are recorded regardless of the content budget.
    this.calls.push({ tool, disposition })
  }

  measure(unit: string, amount: number): void {
    if (Number.isFinite(amount)) this.usage.push({ unit, amount })
  }
}

/** One recognized frame, dispatched; anything else observed as such. */
function consumeFrame(
  frame: Record<string, unknown>,
  out: BudgetedCollector,
  pendingCalls: Map<string, string>,
  terminal: { reported_outcome?: string; transcript_terminal?: string },
): void {
  const at = asString(frame['timestamp']) ?? ''
  switch (frame['type']) {
    case 'system': {
      const data: Record<string, string> = {}
      const subtype = asString(frame['subtype'])
      if (subtype !== undefined) data['subtype'] = subtype
      const model = asString(frame['model'])
      if (model !== undefined) data['model'] = model
      const session = asString(frame['session_id'])
      if (session !== undefined) data['session_id'] = session
      out.event('session.system', at, data)
      return
    }
    case 'assistant':
    case 'user': {
      const message = frame['message']
      const content = isRecord(message) ? message['content'] : undefined
      if (!Array.isArray(content)) {
        out.event('transcript.malformed', at, { reason: 'message frame without content array' })
        return
      }
      for (const block of content) {
        if (!isRecord(block)) continue
        if (block['type'] === 'text' && typeof block['text'] === 'string') {
          out.claim('text', block['text'])
        } else if (block['type'] === 'tool_use') {
          const id = asString(block['id'])
          const name = asString(block['name'])
          if (id !== undefined && name !== undefined) pendingCalls.set(id, name)
        } else if (block['type'] === 'tool_result') {
          const id = asString(block['tool_use_id'])
          const tool = id !== undefined ? pendingCalls.get(id) : undefined
          if (tool !== undefined && id !== undefined) {
            pendingCalls.delete(id)
            // A result arrived, so the call happened. An error result is
            // still a permitted call that failed — only the provider's own
            // permission refusal marks a denial, and the authoritative list
            // of denials arrives on the result frame.
            out.call(tool, 'permitted')
          }
        }
      }
      return
    }
    case 'result': {
      const subtype = asString(frame['subtype'])
      terminal.reported_outcome =
        subtype ?? (typeof frame['is_error'] === 'boolean' ? String(frame['is_error']) : 'result')
      terminal.transcript_terminal = 'result'
      const denials = frame['permission_denials']
      if (Array.isArray(denials)) {
        for (const denial of denials) {
          const tool = isRecord(denial) ? asString(denial['tool_name']) : undefined
          if (tool !== undefined) out.call(tool, 'denied')
        }
      }
      const usage = frame['usage']
      if (isRecord(usage)) {
        for (const unit of USAGE_UNITS) {
          const amount = usage[unit]
          if (typeof amount === 'number') out.measure(unit, amount)
        }
      }
      if (typeof frame['num_turns'] === 'number') out.measure('turns', frame['num_turns'])
      const result = frame['result']
      if (typeof result === 'string' && result.length > 0) out.claim('text', result)
      return
    }
    default: {
      out.event('transcript.unrecognized', at, {
        frame_type: asString(frame['type']) ?? 'absent',
      })
    }
  }
}

/** Total over arbitrary bytes: every input yields a well-formed observation. */
export function observeRun(captured: CapturedRun, outputBudgetBytes: number): AdapterObservation {
  const out = new BudgetedCollector(outputBudgetBytes)
  const pendingCalls = new Map<string, string>()
  const reported: { reported_outcome?: string; transcript_terminal?: string } = {}

  for (const line of captured.stdout.split('\n')) {
    if (line.trim() === '') continue
    let frame: unknown
    try {
      frame = JSON.parse(line)
    } catch {
      out.event('transcript.malformed', '', {
        reason: 'unparseable line',
        line: describe(line),
      })
      continue
    }
    if (!isRecord(frame)) {
      out.event('transcript.malformed', '', { reason: 'frame is not an object' })
      continue
    }
    consumeFrame(frame, out, pendingCalls, reported)
  }

  // A tool_use the transcript never resolved: the call was requested; no
  // disposition ever arrived. Observed as denied-nothing? No — inventing a
  // disposition would be deciding. It surfaces as an event instead.
  for (const tool of pendingCalls.values()) {
    out.event('call.unresolved', '', { tool })
  }

  const terminal: TerminalObservations = {
    ...(captured.exit_code !== null ? { exit_code: captured.exit_code } : {}),
    ...(reported.reported_outcome !== undefined
      ? { reported_outcome: reported.reported_outcome }
      : {}),
    ...(reported.transcript_terminal !== undefined
      ? { transcript_terminal: reported.transcript_terminal }
      : {}),
    ...(captured.signalled !== null ? { signalled: captured.signalled } : {}),
  }

  return {
    calls: out.calls,
    claims: out.claims,
    events: out.events,
    terminal,
    usage: out.usage,
  }
}
