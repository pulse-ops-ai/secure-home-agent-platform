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
import { closeSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { observeRun } from './observe.js'
import { childEnvironment, ISOLATION_ENV, planLaunch } from './plan.js'
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

/** One file, read as at most `limit` BYTES — bounded BEFORE materializing. */
const readBounded = (path: string, limit: number): Buffer | undefined => {
  let fd: number | undefined
  try {
    const size = statSync(path).size
    const take = Math.min(size, limit)
    if (take <= 0) return undefined
    fd = openSync(path, 'r')
    const buffer = Buffer.alloc(take)
    const read = readSync(fd, buffer, 0, take, 0)
    return buffer.subarray(0, read)
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Every persisted events.jsonl under the provisioned home, concatenated —
 * capped in BYTES with the bound applied before any file is materialized,
 * so an adversarially large persisted surface cannot balloon memory. A
 * truncated trailing document degrades in the defensive parser like any
 * other malformed input.
 */
const readPersistedEvents = (cap: number): string | undefined => {
  const home = process.env[ISOLATION_ENV]
  if (home === undefined || home === '') return undefined
  try {
    const sessionRoot = join(home, 'session-state')
    const parts: Buffer[] = []
    let total = 0
    for (const entry of readdirSync(sessionRoot)) {
      const remaining = cap - total
      if (remaining <= 0) break
      const bytes = readBounded(join(sessionRoot, entry, 'events.jsonl'), remaining)
      // A session directory without a readable events file is not this
      // entry's problem to explain; the surfaces that exist are collected.
      if (bytes === undefined) continue
      total += bytes.length
      parts.push(bytes)
    }
    return parts.length > 0 ? Buffer.concat(parts).toString('utf8') : undefined
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
    // No `cwd` option, deliberately: the workspace refs in the invocation
    // are OPAQUE platform identities (`workspace:<run>`), never paths —
    // the L9 session substrate establishes the sandbox working directory
    // and launches this entry inside it, so the provider INHERITS the
    // sandbox cwd rather than the adapter resolving anything.
    const child = spawn(plan.command, plan.argv, {
      // Allowlisted, never inherited: an ambient variable the invocation
      // did not declare — an undeclared credential above all — must not
      // reach the provider (ADR-0013 decision 7 as a spawn property).
      env: childEnvironment(plan, process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    let stdoutBytes = 0
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

    // Captured as BYTES and sliced to the EXACT remaining budget — a
    // final chunk never overshoots the cap. Decoding happens once, after
    // the cap, so multi-byte characters are neither miscounted nor split
    // by per-chunk decoding (a boundary-split character degrades in the
    // defensive parser like any other malformed input).
    child.stdout.on('data', (chunk: Buffer) => {
      const remaining = rawCap - stdoutBytes
      if (remaining <= 0) return
      const take = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining)
      stdoutChunks.push(take)
      stdoutBytes += take.length
    })
    child.stderr.resume()

    child.on('error', (error: Error) => {
      settle(fault(`provider CLI could not be launched: ${error.message}`))
    })

    child.on('close', (code, signal) => {
      const observation = observeRun(
        {
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
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
