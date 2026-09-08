#!/usr/bin/env node
/**
 * EX-TS-002: WHAT THE CUTOVER MUST PRESERVE, BY SURFACE.
 *
 * The frozen `ts6-emit-baseline.json` is the raw historical record — the bytes
 * TypeScript 6.0.3 actually produced. It is never regenerated, never widened,
 * and never reinterpreted, so it cannot answer a structural question. This tool
 * adds the second artifact the accepted plan calls for: the TypeScript 6
 * MIGRATION-COMPARISON PROJECTION, which records what those bytes MEAN.
 *
 *   exact bytes        emitted runtime `.js`      the program that ships
 *   exact bytes        member `generate` output   artifacts other tools read
 *   structural shape   `.d.ts`                    the declared type and API
 *   attribution        `.js.map` / `.d.ts.map`    which original line a
 *                                                 generated position resolves to
 *
 * The split is the point. Requiring bytes everywhere blocks the cutover on
 * serializer choices no consumer can observe; requiring nothing lets a real
 * change through. Each surface is held to what it actually promises.
 *
 * The projection is captured under the OLD compiler and read afterwards, like
 * the baseline beside it, and for the same reason: once the pin moves, the old
 * compiler's answer is unobtainable.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { declarationShapeSha256 } from './declaration-shape.mjs'
import { compareMap, expectedEmittedTarget, mapProjection } from './source-map-shape.mjs'
import { capture as captureRaw, emittingMembers } from './emit-baseline.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex')

const KIND_OF = (file) =>
  file.endsWith('.d.ts.map')
    ? 'declarationMap'
    : file.endsWith('.d.ts')
      ? 'declaration'
      : file.endsWith('.js.map')
        ? 'sourceMap'
        : file.endsWith('.js')
          ? 'javascript'
          : 'other'

/** Structural and attribution projections for every emitted surface. */
export async function captureProjection(repoRoot = REPO_ROOT, head = undefined, raw = undefined) {
  raw = raw ?? captureRaw(repoRoot, head)
  const members = {}
  for (const [member, record] of Object.entries(raw.members)) {
    const declarations = {}
    const maps = {}
    for (const file of Object.keys(record.outputs)) {
      const kind = KIND_OF(file)
      const text = readFileSync(path.join(repoRoot, file), 'utf8')
      if (kind === 'declaration') {
        declarations[file] = { shapeSha256: await declarationShapeSha256(text) }
      } else if (kind === 'sourceMap' || kind === 'declarationMap') {
        const projected = mapProjection(text, file, file, repoRoot)
        // Per-line attribution is only ever consulted for `.js.map`, whose
        // generated `.js` is required byte-identical. Declaration maps are
        // compared by COVERAGE, because their generated positions may
        // legitimately move — so carrying their attribution would be storing
        // hundreds of thousands of entries nothing reads.
        if (kind === 'declarationMap') projected.attribution = null
        maps[file] = projected
      }
    }
    members[member] = { declarations, maps, scope: `${member}/` }
  }
  return {
    schemaVersion: 1,
    proof: 'EX-TS-002 (migration-comparison projection)',
    capturedAtHead: raw.capturedAtHead,
    compiler: raw.compiler,
    note:
      'Structural companion to ts6-emit-baseline.json, which stays the raw byte record. ' +
      'Declarations are compared by canonical shape; maps by attribution and coverage. ' +
      'Exact-byte surfaces are checked against the raw baseline, not against this file.',
    members,
  }
}

export function sealableBody(document) {
  const { manifestSha256: _seal, ...body } = document
  return `${JSON.stringify(body, null, 2)}\n`
}

export const seal = (document) => ({ ...document, manifestSha256: digest(sealableBody(document)) })

/**
 * The full per-surface differential.
 *
 * Exact-byte surfaces come from the frozen raw baseline; structural surfaces
 * from the projection. Both are required: the raw baseline alone would refuse a
 * legitimate serializer change, and the projection alone would accept a changed
 * program.
 */
export function differential(baseline, projection, current, currentProjection) {
  const problems = []

  if (digest(sealableBody(projection)) !== projection.manifestSha256) {
    problems.push(
      'the frozen migration projection does not match its own seal: its bytes were edited ' +
        'after capture',
    )
  }
  if (projection.compiler.version !== baseline.compiler.version) {
    problems.push(
      `the projection was captured under typescript@${projection.compiler.version} but the raw ` +
        `baseline under ${baseline.compiler.version}; they must describe the same compiler`,
    )
  }
  if (projection.capturedAtHead !== baseline.capturedAtHead) {
    problems.push('the projection and the raw baseline are bound to different commits')
  }

  // The projection must be the stable-ordered one, bound to THIS baseline.
  // Without these, a v1 projection — whose shapes were canonicalized by sorting
  // members, and which therefore cannot see an overload reordering — would be
  // accepted as current comparison authority.
  if (projection.schemaVersion !== 2) {
    problems.push(
      `the projection is schema v${projection.schemaVersion}; comparison authority requires v2, ` +
        'the stable-ordered projection. v1 canonicalized declarations by sorting object-type ' +
        'members, which erases overload order',
    )
  }
  if (projection.declarationOrdering?.mechanism !== '--stableTypeOrdering') {
    problems.push('the projection does not record the stable-ordering mechanism it was built with')
  }
  if (projection.boundTo?.rawBaselineManifestSha256 !== baseline.manifestSha256) {
    problems.push(
      'the projection is bound to a different raw baseline than the one being compared against',
    )
  }
  if (projection.boundTo?.rawBaselineCapturedAtHead !== baseline.capturedAtHead) {
    problems.push('the projection is bound to a different source state than the raw baseline')
  }

  for (const member of Object.keys({ ...baseline.members, ...current.members })) {
    const was = baseline.members[member]
    const now = current.members[member]
    if (was === undefined) {
      problems.push(`${member}: emits now but carried no baseline disposition`)
      continue
    }
    if (now === undefined) {
      problems.push(`${member}: was captured as emitting but emits nothing now`)
      continue
    }

    // ── exact-byte surfaces ────────────────────────────────────────────────
    for (const file of Object.keys({ ...was.outputs, ...now.outputs })) {
      const kind = KIND_OF(file)
      const before = was.outputs[file]
      const after = now.outputs[file]
      if (before === undefined) {
        problems.push(`${member}: ${file} is emitted now but has no baseline entry`)
        continue
      }
      if (after === undefined) {
        problems.push(
          `${member}: ${file} was emitted under the baseline compiler and is absent now`,
        )
        continue
      }
      if (kind !== 'javascript') continue
      if (before.sha256 !== after.sha256) {
        problems.push(
          `${member}: emitted runtime ${file} differs from the frozen baseline — shipped ` +
            'executable code must be byte-identical',
        )
      }
    }

    // ── declarations, structurally ─────────────────────────────────────────
    const wasDecl = projection.members[member]?.declarations ?? {}
    const nowDecl = currentProjection.members[member]?.declarations ?? {}
    for (const file of Object.keys({ ...wasDecl, ...nowDecl })) {
      const before = wasDecl[file]
      const after = nowDecl[file]
      if (before === undefined || after === undefined) continue // absence handled above
      if (before.shapeSha256 !== after.shapeSha256) {
        problems.push(
          `${member}: ${file} changed the declared type/API shape, which is not a serializer ` +
            'difference',
        )
      }
    }

    // ── maps, by attribution ───────────────────────────────────────────────
    const wasMaps = projection.members[member]?.maps ?? {}
    const nowMaps = currentProjection.members[member]?.maps ?? {}
    for (const file of Object.keys({ ...wasMaps, ...nowMaps })) {
      const before = wasMaps[file]
      const after = nowMaps[file]
      if (before === undefined) {
        problems.push(`${member}: ${file} is emitted now but has no baseline map projection`)
        continue
      }
      if (after === undefined) {
        problems.push(`${member}: ${file} was mapped under the baseline compiler and is absent now`)
        continue
      }
      problems.push(
        ...compareMap(`${member}: ${file}`, before, after, {
          // Every effective source must sit inside the member that owns the
          // map. A `sourceRoot` that redirected attribution outside the member
          // would otherwise pass every structural check.
          scope: projection.members[member]?.scope ?? `${member}/`,
          // `.js` is required byte-identical, so a generated line means the
          // same thing in both builds and must resolve identically. Declaration
          // serialization may move, so only coverage is required there.
          strictLines: KIND_OF(file) === 'sourceMap',
          // What this map claims to describe, checked against its own path
          // rather than only against the previous compiler's claim.
          expectedFile: expectedEmittedTarget(file),
        }),
      )
    }
  }

  // ── generator artifacts, exact bytes ─────────────────────────────────────
  for (const member of Object.keys({ ...baseline.generators, ...current.generators })) {
    const was = baseline.generators[member]
    const now = current.generators[member]
    if (was === undefined) {
      problems.push(`${member}: generates now but carried no baseline disposition`)
      continue
    }
    if (now === undefined) {
      problems.push(`${member}: was captured as generating but generates nothing now`)
      continue
    }
    for (const file of Object.keys({ ...was.artifacts, ...now.artifacts })) {
      const before = was.artifacts[file]
      const after = now.artifacts[file]
      if (before === undefined) {
        problems.push(`${member} (generate): ${file} is produced now but has no baseline entry`)
        continue
      }
      if (after === undefined) {
        problems.push(
          `${member} (generate): ${file} was produced under the baseline and is absent now`,
        )
        continue
      }
      if (before.sha256 !== after.sha256) {
        problems.push(
          `${member} (generate): ${file} differs — generated artifacts are consumed by other tools and must be byte-identical`,
        )
      }
    }
  }

  return problems
}

/**
 * The SUPERSEDING projection, captured from a TypeScript 6 tree that emits in
 * TypeScript 7's ordering.
 *
 * The v1 projection compared declarations by sorting every `{ ... }` member
 * group, which erases overload order — and TypeScript resolves overloads by
 * declaration order, so a sorter reports two different types equal. Order is
 * meaning, and the reordering the cutover really produces is handled where it
 * belongs: TypeScript 6 is asked for TypeScript 7's ordering with
 * `--stableTypeOrdering` (D18), a migration-analysis projection that never
 * enters repository configuration.
 *
 * Every precondition is PROVED here rather than assumed, because a projection
 * captured from the wrong tree, the wrong compiler, or a mutated baseline would
 * be a golden that agrees with whatever produced it.
 */
export async function captureStableProjection(ts6Root, { baselinePath, boundHead }) {
  const problems = []

  const compiler = JSON.parse(
    readFileSync(path.join(ts6Root, 'node_modules', 'typescript', 'package.json'), 'utf8'),
  ).version
  if (compiler !== '6.0.3') {
    problems.push(`the capture tree resolves typescript@${compiler}; it must be 6.0.3`)
  }

  const catalog = readFileSync(path.join(ts6Root, 'pnpm-workspace.yaml'), 'utf8')
  if (!/^ {2}typescript: 6\.0\.3$/m.test(catalog)) {
    problems.push('the capture tree does not pin typescript 6.0.3')
  }

  // Its sources must be the ones the raw baseline speaks for, or the two
  // artifacts would describe different programs.
  const differing = execFileSync(
    'git',
    ['diff', '--name-only', boundHead, 'HEAD', '--', '*/src/*'],
    { cwd: ts6Root, encoding: 'utf8' },
  ).trim()
  if (differing !== '') {
    problems.push(`the capture tree's member sources differ from ${boundHead}: ${differing}`)
  }

  // And the raw baseline must be exactly what it was. Checked against the
  // commit that INTRODUCED it, which is not the commit whose sources it speaks
  // for: it was captured from `boundHead`'s tree and committed afterwards.
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const baselineRel = 'tests/evidence/ts6-emit-baseline.json'
  const introducing = execFileSync('git', ['log', '--format=%H', '-1', '--', baselineRel], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim()
  const committed = execFileSync('git', ['show', `${introducing}:${baselineRel}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (committed !== readFileSync(baselinePath, 'utf8')) {
    problems.push(`${baselineRel} differs from its committed bytes at ${introducing}`)
  }
  if (baseline.capturedAtHead !== boundHead) {
    problems.push(
      `the raw baseline speaks for ${baseline.capturedAtHead}, not the requested ${boundHead}`,
    )
  }

  if (problems.length > 0) throw new Error(problems.join('\n'))

  // Two passes, in this order, and the order matters. `captureRaw` performs the
  // clean rebuild that makes a baseline a statement about a compiler rather
  // than about a directory — so it must run FIRST. Running it after the
  // stable-order pass silently rebuilds without the flag and throws the
  // ordering away, which is exactly what happened the first time.
  const raw = captureRaw(ts6Root, boundHead)

  // Now re-emit every project with the ordering flag. Passed on the COMMAND
  // LINE and never written into a tsconfig or a package script, so it stays a
  // migration-analysis projection rather than repository configuration.
  const tsc = path.join(ts6Root, 'node_modules', '.bin', 'tsc')
  for (const member of emittingMembers(ts6Root)) {
    execFileSync(tsc, ['-p', member.config, '--stableTypeOrdering'], {
      cwd: path.join(ts6Root, member.rel),
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  }

  // Reads what is now on disk; `raw` is passed in so nothing rebuilds again.
  const projection = await captureProjection(ts6Root, boundHead, raw)

  return {
    ...projection,
    schemaVersion: 2,
    proof: 'EX-TS-002 (migration-comparison projection, stable-ordered)',
    compiler: { package: 'typescript', version: compiler, tscReported: `Version ${compiler}` },
    declarationOrdering: {
      mechanism: '--stableTypeOrdering',
      appliedBy: 'command line only, at capture; never in a tsconfig or a package script',
      why:
        'TypeScript 7 orders type members deterministically. Asking TypeScript 6 for that ' +
        'ordering makes the two comparable WITHOUT a comparator that reorders anything, so ' +
        'declaration order stays meaning — which it is, for overload resolution.',
    },
    boundTo: {
      rawBaseline: 'tests/evidence/ts6-emit-baseline.json',
      rawBaselineManifestSha256: baseline.manifestSha256,
      rawBaselineCapturedAtHead: baseline.capturedAtHead,
      captureTreeHead: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: ts6Root,
        encoding: 'utf8',
      }).trim(),
    },
    supersedes: {
      path: 'tests/evidence/ts6-migration-projection.json',
      status:
        "HISTORICAL. It is the first implementation's evidence and stays byte-identical. It " +
        'is NOT current comparison authority: its declaration shapes were canonicalized by ' +
        'sorting object-type members, which erases overload order.',
    },
  }
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  const args = process.argv.slice(2)
  const at = (flag) => {
    const found = args.find((arg) => arg.startsWith(`${flag}=`))
    return found === undefined ? undefined : found.slice(flag.length + 1)
  }
  const resolve = (given) => path.resolve(REPO_ROOT, given)

  if (args.includes('--capture-stable')) {
    const from = at('--from')
    if (from === undefined) {
      console.error('--capture-stable requires --from=<a TypeScript 6 worktree>')
      process.exit(2)
    }
    const target = resolve(at('--out') ?? 'tests/evidence/ts6-migration-projection-v2.json')
    const document = seal(
      await captureStableProjection(path.resolve(from), {
        baselinePath: resolve('tests/evidence/ts6-emit-baseline.json'),
        boundHead: at('--head') ?? '362c349e18cfb3c63c52fc29a5c70a947a1107f2',
      }),
    )
    writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`)
    const declarations = Object.values(document.members).reduce(
      (total, member) => total + Object.keys(member.declarations).length,
      0,
    )
    console.log(
      `✓ stable-ordered migration projection v${document.schemaVersion} captured under ` +
        `typescript@${document.compiler.version} — ${declarations} declaration shapes`,
    )
  } else if (args.includes('--capture')) {
    const target = resolve(at('--out') ?? 'tests/evidence/ts6-migration-projection.json')
    const document = seal(await captureProjection(REPO_ROOT, at('--head')))
    writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`)
    const declarations = Object.values(document.members).reduce(
      (total, member) => total + Object.keys(member.declarations).length,
      0,
    )
    const maps = Object.values(document.members).reduce(
      (total, member) => total + Object.keys(member.maps).length,
      0,
    )
    console.log(
      `✓ migration projection captured under typescript@${document.compiler.version} — ` +
        `${declarations} declaration shapes, ${maps} map attributions`,
    )
  } else if (args.includes('--verify')) {
    const baseline = JSON.parse(
      readFileSync(resolve(at('--baseline') ?? 'tests/evidence/ts6-emit-baseline.json'), 'utf8'),
    )
    const projection = JSON.parse(
      readFileSync(
        resolve(at('--projection') ?? 'tests/evidence/ts6-migration-projection-v2.json'),
        'utf8',
      ),
    )
    const current = captureRaw(REPO_ROOT)
    const currentProjection = await captureProjection(REPO_ROOT, undefined, current)
    const problems = differential(baseline, projection, current, currentProjection)
    if (problems.length > 0) {
      console.error(`✗ emitted-output conformance — ${problems.length} difference(s)\n`)
      for (const problem of problems) console.error(`    ${problem}`)
      process.exit(1)
    }
    const compiler = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'node_modules', 'typescript', 'package.json'), 'utf8'),
    ).version
    console.log(
      `✓ emitted-output conformance — typescript@${compiler} preserves every surface the ` +
        `baseline frozen under typescript@${baseline.compiler.version} requires`,
    )
  } else {
    console.error('usage: emit-conformance.mjs (--capture [--head=<sha>] | --verify)')
    process.exit(2)
  }
  void execFileSync
  void emittingMembers
}
