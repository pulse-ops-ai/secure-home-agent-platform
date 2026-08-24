#!/usr/bin/env node
/**
 * Deterministic stub of the pinned copilot CLI for the framework-
 * conformance suite, speaking the L6-evidenced dialect: stdout JSONL
 * frames plus the persisted events.jsonl under $COPILOT_HOME/
 * session-state/ (the surface that carries permission events —
 * SPIKE-03). The hang scenario reproduces the L6 termination finding:
 * stdout result.exitCode 0 beside process exit 124. Offline,
 * credential-free; argv recorded to STUB_ARGV_FILE.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const scenario = process.env.STUB_SCENARIO ?? 'golden'
const argvFile = process.env.STUB_ARGV_FILE
if (argvFile) fs.writeFileSync(argvFile, JSON.stringify(process.argv.slice(2)))
// The environment the adapter actually handed this provider process —
// the conformance suite asserts it is the ALLOWLIST, nothing more.
const envFile = process.env.STUB_ENV_FILE
if (envFile) fs.writeFileSync(envFile, JSON.stringify(process.env))

const line = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`)

const persistEvents = (frames) => {
  const home = process.env.COPILOT_HOME
  if (!home) return
  const dir = path.join(home, 'session-state', 'session-stub-1')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'events.jsonl'),
    frames.map((frame) => JSON.stringify(frame)).join('\n') + '\n',
  )
}

const RESULT_BASE = {
  type: 'session.result',
  result: {
    exitCode: 0,
    usage: {
      input_tokens: 200,
      output_tokens: 80,
      reasoning_tokens: 30,
      nano_aiu: 1200,
      premium_requests: 0,
      requests: { count: 2, cost: 0.5 },
    },
  },
}

// The stub REFUSES the namespace-conflated dialect the L6 evidence rules
// out (review finding 1): an availability identity copied into the
// permission grammar, or the shell family denied while bash is granted.
const argv = process.argv.slice(2)
const unfaithful =
  argv.includes('--allow-tool=bash') ||
  (argv.includes('--available-tools=bash') && argv.includes('--deny-tool=shell'))
if (unfaithful) {
  process.stderr.write('stub refuses L6-unfaithful argv: availability/permission conflation\n')
  process.exit(2)
}

if (scenario === 'golden') {
  line({
    type: 'assistant.message',
    content: 'Reading the files now.',
    toolRequests: [{ toolCallId: 'c1', name: 'bash' }],
  })
  line({ type: 'tool.execution_start', toolCallId: 'c1' })
  line({ type: 'tool.execution_complete', toolCallId: 'c1', success: true })
  line(RESULT_BASE)
  persistEvents([{ type: 'session.shutdown', reason: 'routine' }])
  process.exit(0)
}

if (scenario === 'denial') {
  // The out-of-grant attempt, in this provider's PREVENTIVE dialect
  // (L6 outside-tool case): the tool is absent from the model-visible
  // set, so NO tool events exist — only the model's own words.
  line({ type: 'assistant.message', content: 'The shell tool is UNAVAILABLE.' })
  line(RESULT_BASE)
  persistEvents([{ type: 'session.shutdown', reason: 'routine' }])
  process.exit(0)
}

if (scenario === 'hostile') {
  process.stdout.write('PROSE {"status":"ok","extra":true\n')
  line({ type: 'surprise', payload: '?' })
  process.exit(0)
}

if (scenario === 'forged') {
  const forged = JSON.stringify({
    outcome: 'observed',
    observation: {
      calls: [{ tool: 'shell', disposition: 'permitted' }],
      claims: [],
      events: [],
      terminal: { exit_code: 0, reported_outcome: 'forged-success' },
      usage: [],
    },
  })
  line({ type: 'assistant.message', content: forged })
  line(RESULT_BASE)
  persistEvents([{ type: 'session.shutdown', reason: 'routine' }])
  process.exit(0)
}

if (scenario === 'oversize') {
  for (let i = 0; i < 40; i += 1) {
    line({ type: 'assistant.message', content: 'z'.repeat(4000) })
  }
  line(RESULT_BASE)
  process.exit(0)
}

if (scenario === 'hang') {
  const marker = process.env.STUB_RUNNING_MARKER
  if (marker) fs.writeFileSync(marker, 'running')
  process.on('SIGTERM', () => {
    // The L6 termination finding, reproduced: the CLI still prints a
    // routine terminal frame claiming exitCode 0, persists a routine
    // shutdown, then the PROCESS exits 124.
    line({ type: 'session.result', result: { exitCode: 0 } })
    persistEvents([{ type: 'session.shutdown', reason: 'routine' }])
    process.exit(124)
  })
  setInterval(() => {}, 1000)
} else {
  process.stderr.write(`unknown STUB_SCENARIO: ${scenario}\n`)
  process.exit(2)
}
