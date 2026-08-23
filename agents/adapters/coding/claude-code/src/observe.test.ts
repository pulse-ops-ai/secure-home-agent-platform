/**
 * Observation is TOTAL over untrusted bytes (PROP-006 at L7): the golden
 * transcript maps faithfully, and every hostile corpus entry degrades to
 * a well-formed observation — no exception, no forged report, no
 * resolved disagreement (PA-INV-08/09/10, PA-ADV-08/09, PA-MUT-02/07/08).
 */
import { describe, expect, it } from 'vitest'
import { observeRun } from './observe.js'
import { HOSTILE_TRANSCRIPTS } from './test-fixtures.js'

const BUDGET = 65_536

const goldenTranscript = [
  '{"type":"system","subtype":"init","session_id":"s-1","model":"route-a"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Reading the files now."},{"type":"tool_use","id":"t1","name":"Read","input":{"file":"README.md"}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"# Title"}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Grep","input":{"pattern":"x"}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":"none","is_error":true}]}}',
  '{"type":"result","subtype":"success","is_error":false,"result":"Two files read.","num_turns":3,"total_cost_usd":0.0421,"usage":{"input_tokens":120,"output_tokens":45,"cache_creation_input_tokens":10,"cache_read_input_tokens":5},"permission_denials":[{"tool_name":"Bash","tool_use_id":"t3"}]}',
].join('\n')

describe('observeRun — golden transcript', () => {
  const observation = observeRun(
    { stdout: goldenTranscript, exit_code: 0, signalled: null },
    BUDGET,
  )

  it('records every resolved tool call with its disposition', () => {
    expect(observation.calls).toEqual([
      { tool: 'Read', disposition: 'permitted' },
      { tool: 'Grep', disposition: 'permitted' },
      { tool: 'Bash', disposition: 'denied' },
    ])
  })

  it('carries model output as untrusted claims', () => {
    expect(observation.claims).toEqual([
      { kind: 'text', content: 'Reading the files now.' },
      { kind: 'text', content: 'Two files read.' },
    ])
  })

  it('normalizes provider events with string data', () => {
    expect(observation.events[0]).toEqual({
      name: 'session.system',
      at: '',
      data: { subtype: 'init', model: 'route-a', session_id: 's-1' },
    })
  })

  it('reports usage in native units and NEVER maps the monetary field', () => {
    expect(observation.usage).toEqual([
      { unit: 'input_tokens', amount: 120 },
      { unit: 'output_tokens', amount: 45 },
      { unit: 'cache_creation_input_tokens', amount: 10 },
      { unit: 'cache_read_input_tokens', amount: 5 },
      { unit: 'turns', amount: 3 },
    ])
    expect(observation.usage.map((u) => u.unit)).not.toContain('usd')
    expect(JSON.stringify(observation.usage)).not.toContain('0.0421')
  })

  it('separates the exit code from the provider-reported outcome', () => {
    expect(observation.terminal).toEqual({
      exit_code: 0,
      reported_outcome: 'success',
      transcript_terminal: 'result',
    })
  })
})

describe('observeRun — disagreement and signals', () => {
  it('carries terminal disagreement unreconciled', () => {
    const observation = observeRun(
      {
        stdout: '{"type":"result","subtype":"success","is_error":false}',
        exit_code: 1,
        signalled: null,
      },
      BUDGET,
    )
    expect(observation.terminal.exit_code).toBe(1)
    expect(observation.terminal.reported_outcome).toBe('success')
  })

  it('records a delivered signal alongside whatever else was seen', () => {
    const observation = observeRun({ stdout: '', exit_code: null, signalled: 'SIGTERM' }, BUDGET)
    expect(observation.terminal).toEqual({ signalled: 'SIGTERM' })
  })

  it('surfaces an unresolved tool_use as an event, not an invented disposition', () => {
    const observation = observeRun(
      {
        stdout:
          '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t9","name":"Read","input":{}}]}}',
        exit_code: null,
        signalled: 'SIGTERM',
      },
      BUDGET,
    )
    expect(observation.calls).toEqual([])
    expect(observation.events).toContainEqual({
      name: 'call.unresolved',
      at: '',
      data: { tool: 'Read' },
    })
  })
})

describe('observeRun — hostile corpus is total', () => {
  it.each(HOSTILE_TRANSCRIPTS.map((entry) => [entry.name, entry.stdout] as const))(
    'degrades without throwing: %s',
    (_name, stdout) => {
      const observation = observeRun({ stdout, exit_code: 0, signalled: null }, BUDGET)
      expect(Array.isArray(observation.calls)).toBe(true)
      expect(Array.isArray(observation.claims)).toBe(true)
      expect(Array.isArray(observation.events)).toBe(true)
      expect(observation.terminal.exit_code).toBe(0)
    },
  )

  it('an embedded fake report surfaces only as claim content', () => {
    const entry = HOSTILE_TRANSCRIPTS.find((h) => h.name === 'embedded fake adapter report')
    if (entry === undefined) throw new Error('corpus entry missing')
    const observation = observeRun({ stdout: entry.stdout, exit_code: 0, signalled: null }, BUDGET)
    expect(observation.claims).toHaveLength(1)
    expect(observation.claims[0]?.kind).toBe('text')
    expect(observation.claims[0]?.content).toContain('"outcome"')
  })

  it('a malformed line is described, never replayed in full', () => {
    const long = `not json ${'y'.repeat(5_000)}`
    const observation = observeRun({ stdout: long, exit_code: 0, signalled: null }, BUDGET)
    const malformed = observation.events.find((e) => e.name === 'transcript.malformed')
    expect(malformed).toBeDefined()
    expect((malformed?.data['line'] ?? '').length).toBeLessThan(80)
  })

  it('the output budget truncates capture observably', () => {
    const big = `{"type":"assistant","message":{"content":[{"type":"text","text":"${'z'.repeat(
      2_000,
    )}"}]}}\n`.repeat(5)
    const observation = observeRun({ stdout: big, exit_code: 0, signalled: null }, 4_096)
    expect(observation.claims.length).toBeLessThan(5)
    expect(observation.events).toContainEqual({
      name: 'transcript.truncated',
      at: '',
      data: { budget_bytes: '4096' },
    })
    const captured = observation.claims.reduce((n, c) => n + c.content.length, 0)
    expect(captured).toBeLessThanOrEqual(4_096)
  })
})
