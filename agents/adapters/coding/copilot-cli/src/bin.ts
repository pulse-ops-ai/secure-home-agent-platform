/**
 * The adapter process entry — the wire contract, and nothing else.
 *
 * stdin:  one JSON wire invocation.
 * stdout: exactly one JSON adapter report. Nothing else, ever.
 * stderr: diagnostics only.
 * exit 0: a report was emitted (any outcome — a refusal IS a report).
 * SIGTERM: cancellation (ADR-0013 decision 8, substrate-effected):
 *          forwarded to the provider child, bounded grace, then SIGKILL —
 *          and the report is still emitted, recording the signal.
 *
 * After the provider exits, the entry collects the persisted events
 * surface from under `$COPILOT_HOME/session-state/` (SPIKE-03: the
 * permission events exist only there). It reads that one provisioned
 * location and nothing else; a missing surface becomes an observation.
 */
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { observeRun } from './observe.js'
import { ISOLATION_ENV, planLaunch } from './plan.js'
import { parseWireInvocation } from './spi.js'
import type { AdapterReport } from './spi.js'

/** Grace between forwarded SIGTERM and SIGKILL, in milliseconds. */
const TERM_GRACE_MS = 5_000

/** Raw-capture memory guard above the observation budget. */
const RAW_SLACK_BYTES = 1_048_576

const emit = (report: AdapterReport): void => {
  process.stdout.write(`${JSON.stringify(report)}\n`)
}

const fault = (detail: string): AdapterReport => ({ outcome: 'environmental_fault', detail })

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk as Buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Every persisted events.jsonl under the provisioned home, concatenated. */
const readPersistedEvents = (cap: number): string | undefined => {
  const home = process.env[ISOLATION_ENV]
  if (home === undefined || home === '') return undefined
  try {
    const sessionRoot = join(home, 'session-state')
    const parts: string[] = []
    let total = 0
    for (const entry of readdirSync(sessionRoot)) {
      try {
        const bytes = readFileSync(join(sessionRoot, entry, 'events.jsonl'), 'utf8')
        if (total + bytes.length > cap) break
        total += bytes.length
        parts.push(bytes)
      } catch {
        // A session directory without an events file is not this entry's
        // problem to explain; the surfaces that exist are collected.
      }
    }
    return parts.length > 0 ? parts.join('\n') : undefined
  } catch {
    return undefined
  }
}

export async function main(): Promise<void> {
  const parsed = parseWireInvocation(await readStdin())
  if (!parsed.ok) {
    emit(fault(`invocation refused: ${parsed.refusal}`))
    return
  }
  const invocation = parsed.invocation

  const planned = planLaunch(invocation)
  if (!planned.ok) {
    emit(fault(`translation refused: ${planned.refusal}`))
    return
  }
  const plan = planned.plan

  const rawCap = invocation.limits.output_bytes + RAW_SLACK_BYTES

  const report = await new Promise<AdapterReport>((resolve) => {
    const child = spawn(plan.command, plan.argv, {
      cwd: plan.cwd_ref,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let signalled: string | null = null
    let settled = false
    let killTimer: ReturnType<typeof setTimeout> | undefined

    const settle = (value: AdapterReport): void => {
      if (settled) return
      settled = true
      if (killTimer !== undefined) clearTimeout(killTimer)
      process.removeListener('SIGTERM', onCancel)
      process.removeListener('SIGINT', onCancel)
      resolve(value)
    }

    const onCancel = (signal: NodeJS.Signals): void => {
      signalled = signal
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), TERM_GRACE_MS)
      killTimer.unref()
    }
    process.on('SIGTERM', onCancel)
    process.on('SIGINT', onCancel)

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < rawCap) stdout += chunk.toString('utf8')
    })
    child.stderr.resume()

    child.on('error', (error: Error) => {
      settle(fault(`provider CLI could not be launched: ${error.message}`))
    })

    child.on('close', (code, signal) => {
      const observation = observeRun(
        {
          stdout,
          events_jsonl: readPersistedEvents(rawCap),
          exit_code: code,
          signalled: signalled ?? signal,
        },
        invocation.limits.output_bytes,
      )
      settle({ outcome: 'observed', observation })
    })
  })

  emit(report)
}

/**
 * Entry-point guard, real paths on both sides: importing this module runs
 * nothing (the conformance suite asserts import side-effect freedom), and
 * a symlinked invocation still executes.
 */
const isMain = ((): boolean => {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (isMain) {
  main().catch((error: unknown) => {
    // The adapter itself faulted before it could report. Exit nonzero so
    // the failure is the process's, visibly — never a fabricated report.
    console.error(error)
    process.exitCode = 1
  })
}
