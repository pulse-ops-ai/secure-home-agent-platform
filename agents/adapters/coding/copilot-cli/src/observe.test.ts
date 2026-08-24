/**
 * Observation is TOTAL over untrusted bytes (PROP-006 at L7), across
 * BOTH surfaces (SPIKE-03: permission events live only in the persisted
 * events). The L6 termination finding — process exit 124 beside CLI
 * exitCode 0 — must survive normalization unreconciled (PA-INV-09).
 */
import { describe, expect, it } from 'vitest'
import { observeRun } from './observe.js'
import { HOSTILE_TRANSCRIPTS } from './test-fixtures.js'

const BUDGET = 65_536

const goldenStdout = [
  '{"type":"assistant.message","content":"Listing the files now.","toolRequests":[{"toolCallId":"c1","name":"bash"}]}',
  '{"type":"tool.execution_start","toolCallId":"c1"}',
  '{"type":"tool.execution_complete","toolCallId":"c1","success":true}',
  '{"type":"assistant.message","content":"Done.","toolRequests":[{"toolCallId":"c2","name":"bash"}]}',
  '{"type":"tool.execution_complete","toolCallId":"c2","success":false,"error":{"code":"denied","message":"denied due to rules: shell"}}',
  '{"type":"session.result","result":{"exitCode":0,"usage":{"input_tokens":200,"output_tokens":80,"reasoning_tokens":30,"requests":{"count":2,"cost":0.5},"nano_aiu":1200,"premium_requests":0}}}',
].join('\n')

const goldenEvents = [
  '{"type":"permission.requested","toolCallId":"c3"}',
  '{"type":"permission.completed","tool":"write","result":{"kind":"denied-no-approval-rule-and-could-not-request-from-user"}}',
  '{"type":"session.shutdown","reason":"routine"}',
].join('\n')

describe('observeRun — golden two-surface run', () => {
  const observation = observeRun(
    { stdout: goldenStdout, events_jsonl: goldenEvents, exit_code: 0, signalled: null },
    BUDGET,
  )

  it('correlates calls by toolCallId and reads dispositions from events, not exit', () => {
    expect(observation.calls).toEqual([
      { tool: 'bash', disposition: 'permitted' },
      { tool: 'bash', disposition: 'denied' },
      { tool: 'write', disposition: 'denied' },
    ])
  })

  it('carries model output as untrusted claims', () => {
    expect(observation.claims).toEqual([
      { kind: 'text', content: 'Listing the files now.' },
      { kind: 'text', content: 'Done.' },
    ])
  })

  it('records the permission surface and shutdown as normalized events', () => {
    expect(observation.events).toContainEqual({
      name: 'permission.completed',
      at: '',
      data: {
        surface: 'events',
        kind: 'denied-no-approval-rule-and-could-not-request-from-user',
        tool: 'write',
      },
    })
    expect(observation.events).toContainEqual({
      name: 'session.shutdown',
      at: '',
      data: { surface: 'events', reason: 'routine' },
    })
  })

  it('maps usage from the one authoritative surface, native units, no cost keys', () => {
    expect(observation.usage).toEqual([
      { unit: 'input_tokens', amount: 200 },
      { unit: 'output_tokens', amount: 80 },
      { unit: 'reasoning_tokens', amount: 30 },
      { unit: 'requests.count', amount: 2 },
      { unit: 'nano_aiu', amount: 1200 },
      { unit: 'premium_requests', amount: 0 },
    ])
    expect(JSON.stringify(observation.usage)).not.toContain('cost')
  })

  it('separates the process exit from the CLI-reported outcome', () => {
    expect(observation.terminal).toEqual({
      exit_code: 0,
      reported_outcome: '0',
      transcript_terminal: 'session.result',
    })
  })
})

describe('observeRun — the L6 termination finding', () => {
  it('carries exit 124 beside reported exitCode 0, unreconciled, with the signal', () => {
    const observation = observeRun(
      {
        stdout: '{"type":"session.result","result":{"exitCode":0}}',
        events_jsonl: '{"type":"session.shutdown","reason":"routine"}',
        exit_code: 124,
        signalled: 'SIGTERM',
      },
      BUDGET,
    )
    expect(observation.terminal).toEqual({
      exit_code: 124,
      reported_outcome: '0',
      transcript_terminal: 'session.result',
      signalled: 'SIGTERM',
    })
  })
})

describe('observeRun — surface degradation', () => {
  it('a missing persisted surface is itself an observation', () => {
    const observation = observeRun(
      { stdout: '', events_jsonl: undefined, exit_code: 0, signalled: null },
      BUDGET,
    )
    expect(observation.events).toContainEqual({
      name: 'transcript.surface_missing',
      at: '',
      data: { surface: 'events' },
    })
  })

  it('an uncorrelated completion surfaces as an event, not an invented call', () => {
    const observation = observeRun(
      {
        stdout:
          '{"type":"tool.execution_complete","toolCallId":"ghost","success":false,"error":{"code":"denied","message":"x"}}',
        events_jsonl: undefined,
        exit_code: 0,
        signalled: null,
      },
      BUDGET,
    )
    expect(observation.calls).toEqual([])
    expect(observation.events).toContainEqual({
      name: 'call.uncorrelated',
      at: '',
      data: { surface: 'stdout', disposition: 'denied' },
    })
  })

  it('an unresolved request surfaces as an event, not an invented disposition', () => {
    const observation = observeRun(
      {
        stdout:
          '{"type":"assistant.message","content":"","toolRequests":[{"toolCallId":"c9","name":"bash"}]}',
        events_jsonl: undefined,
        exit_code: null,
        signalled: 'SIGTERM',
      },
      BUDGET,
    )
    expect(observation.calls).toEqual([])
    expect(observation.events).toContainEqual({
      name: 'call.unresolved',
      at: '',
      data: { tool: 'bash' },
    })
  })
})

describe('observeRun — hostile corpus is total', () => {
  it.each(HOSTILE_TRANSCRIPTS.map((entry) => [entry.name, entry.stdout] as const))(
    'degrades without throwing: %s',
    (_name, stdout) => {
      const observation = observeRun(
        { stdout, events_jsonl: undefined, exit_code: 0, signalled: null },
        BUDGET,
      )
      expect(Array.isArray(observation.calls)).toBe(true)
      expect(Array.isArray(observation.claims)).toBe(true)
      expect(Array.isArray(observation.events)).toBe(true)
      expect(observation.terminal.exit_code).toBe(0)
    },
  )

  it('hostile bytes on the persisted surface degrade the same way', () => {
    for (const entry of HOSTILE_TRANSCRIPTS) {
      const observation = observeRun(
        { stdout: '', events_jsonl: entry.stdout, exit_code: 0, signalled: null },
        BUDGET,
      )
      expect(Array.isArray(observation.events)).toBe(true)
    }
  })

  it('an embedded fake report surfaces only as claim content', () => {
    const entry = HOSTILE_TRANSCRIPTS.find((h) => h.name === 'embedded fake adapter report')
    if (entry === undefined) throw new Error('corpus entry missing')
    const observation = observeRun(
      { stdout: entry.stdout, events_jsonl: undefined, exit_code: 0, signalled: null },
      BUDGET,
    )
    expect(observation.claims).toHaveLength(1)
    expect(observation.claims[0]?.content).toContain('"outcome"')
  })

  it('the output budget truncates capture observably', () => {
    const big = `{"type":"assistant.message","content":"${'z'.repeat(2_000)}"}\n`.repeat(5)
    const observation = observeRun(
      { stdout: big, events_jsonl: undefined, exit_code: 0, signalled: null },
      4_096,
    )
    expect(observation.claims.length).toBeLessThan(5)
    expect(observation.events).toContainEqual({
      name: 'transcript.truncated',
      at: '',
      data: { budget_bytes: '4096' },
    })
  })
})

const FRAME = (text: string): string => JSON.stringify({ type: 'assistant.message', content: text })

describe('observeRun — the budget is BYTES, not code units (review finding 2)', () => {
  it("300 'é' characters are 600 bytes and must not fit a 300-byte budget", () => {
    const text = 'é'.repeat(300)
    const observation = observeRun(
      { stdout: FRAME(text), events_jsonl: undefined, exit_code: 0, signalled: null },
      300,
    )
    const capturedBytes = observation.claims.reduce(
      (n, claim) => n + Buffer.byteLength(claim.content, 'utf8'),
      0,
    )
    expect(capturedBytes).toBeLessThanOrEqual(300)
    expect(observation.claims).toEqual([])
    expect(observation.events).toContainEqual({
      name: 'transcript.truncated',
      at: '',
      data: { budget_bytes: '300' },
    })
  })

  it('the same character count in ASCII fits the same budget', () => {
    const observation = observeRun(
      { stdout: FRAME('e'.repeat(300)), events_jsonl: undefined, exit_code: 0, signalled: null },
      301,
    )
    expect(observation.claims).toHaveLength(1)
  })
})
