#!/usr/bin/env node
/**
 * THE TRUSTED HOST LAUNCHER.
 *
 * This program is predecessor-owned code and it runs on the HOST runner, not
 * inside the subject's boundary. That placement is the whole point.
 *
 * Declaring the subject job with `jobs.<job>.container` does NOT achieve it:
 * GitHub runs every ordinary `run` step of such a job inside that container, so
 * the code owning the timeout, the exit codes, the artifact hashes and the
 * envelope would share a UID and filesystem with the candidate it is judging --
 * and a candidate that daemonizes simply outlives its own process there. The
 * container must be created BY the launcher, beneath it, not around it.
 *
 * So: the launcher stays on the host, starts each candidate command with
 * `docker run` under the policy's controls, and keeps every piece of state the
 * verdict depends on out of the candidate's reach. `--network none` also works
 * here, which it does not as a job-level container option.
 *
 * The candidate never receives the Docker socket.
 *
 * Node standard library plus docker. Governed by AGENTS.md, ADR-0022 (D14).
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { digestPathTree } from './check-toolchain-boundaries.mjs'

const IMAGE = 'node:24-bookworm-slim'
const SUBJECT_UID = '10001:10001'
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000

const arg = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index === -1 || !process.argv[index + 1]) {
    console.error(`missing required ${flag}`)
    process.exit(1)
  }
  return process.argv[index + 1]
}

const refuse = (problems) => {
  console.error(JSON.stringify({ refused: true, problems }))
  process.exit(1)
}

/**
 * The controls, assembled here rather than declared in workflow YAML.
 *
 * `--network none` is the reason this matters most: it is silently ignored as a
 * job-level container option, so a workflow that declares it there has an
 * assertion but not a boundary.
 */
function containerArgs(scratch, candidateRoot, workdir) {
  return [
    'run',
    '--rm',
    `--user=${SUBJECT_UID}`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--read-only',
    '--network=none',
    '--memory=2g',
    '--cpus=2',
    '--pids-limit=512',
    // The candidate tree is READ-ONLY. Output goes to a scratch directory the
    // launcher owns and the container cannot reach except through this mount.
    `--volume=${candidateRoot}:/subject:ro`,
    `--volume=${scratch}:/scratch:rw`,
    '--tmpfs=/tmp:rw,noexec,nosuid,size=256m',
    `--workdir=/subject/${workdir}`,
    // No `--env` at all: the container starts with the image's environment and
    // nothing of the runner's.
    IMAGE,
  ]
}

function main() {
  const planPath = arg('--plan')
  const candidateRoot = path.resolve(arg('--candidate-root'))
  const outDir = path.resolve(arg('--out'))
  const plan = JSON.parse(readFileSync(planPath, 'utf8'))
  mkdirSync(outDir, { recursive: true })

  const results = []
  for (const command of plan.commands) {
    // IDENTITY FIRST, on the host, before any candidate byte runs. The bytes
    // that will execute must be the pin the plan named.
    const manifestPath = path.join(
      candidateRoot,
      'node_modules',
      command.binary.package,
      'package.json',
    )
    let installed
    try {
      installed = JSON.parse(readFileSync(manifestPath, 'utf8')).version
    } catch {
      refuse([`${command.id}: ${command.binary.package} is not installed in the candidate tree`])
    }
    if (installed !== command.binary.version) {
      refuse([
        `${command.id}: ${command.binary.package} resolves to ${installed}, but the plan names ` +
          `${command.binary.version}`,
      ])
    }

    // Protected inputs, measured from the candidate tree. The verdict compares
    // these with the predecessor digests the plan pinned.
    const inputs = {}
    for (const input of Object.keys(command.inputs)) {
      inputs[input] = digestPathTree(candidateRoot, input)
    }

    const scratch = path.join(outDir, `scratch-${command.id}`)
    mkdirSync(scratch, { recursive: true, mode: 0o777 })

    const binary =
      command.binary.bin === 'node' ? 'node' : `/subject/node_modules/.bin/${command.binary.bin}`

    // The LAUNCHER owns the timeout and the kill. `--rm` plus a host-side
    // timeout means a candidate that hangs is destroyed by this process.
    const run = spawnSync(
      'docker',
      [...containerArgs(scratch, candidateRoot, command.cwd), binary, ...command.argv],
      { encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
    )

    // Exit status is captured here, from the process the launcher started. A
    // timeout is a definite failure, never an absent result.
    const exitCode = run.status === null ? 124 : run.status

    // The artifact is written by the LAUNCHER from what it observed, so the
    // candidate cannot author the record of its own run.
    writeFileSync(
      path.join(outDir, `${command.id}.json`),
      JSON.stringify({
        stdout: run.stdout ?? '',
        stderr: run.stderr ?? '',
        exitCode,
        timedOut: run.status === null,
      }),
    )

    results.push({
      id: command.id,
      argv: [...command.argv],
      cwd: command.cwd,
      binary: { ...command.binary },
      inputs,
      exitCode,
    })
  }

  const artifacts = {}
  for (const name of plan.expectedArtifacts) {
    artifacts[name] = createHash('sha256')
      .update(readFileSync(path.join(outDir, name)))
      .digest('hex')
  }

  writeFileSync(
    path.join(outDir, 'envelope.json'),
    JSON.stringify({
      schemaVersion: 1,
      planDigest: plan.digest,
      predecessorSha: plan.predecessorSha,
      candidateSha: plan.candidateSha,
      results,
      artifacts,
    }),
  )
  console.log(JSON.stringify({ ok: true, commands: results.length }))
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  main()
}
