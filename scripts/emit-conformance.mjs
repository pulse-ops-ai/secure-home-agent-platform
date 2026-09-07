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
import { compareMap, mapProjection } from './source-map-shape.mjs'
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
export function captureProjection(repoRoot = REPO_ROOT, head = undefined) {
  const raw = captureRaw(repoRoot, head)
  const members = {}
  for (const [member, record] of Object.entries(raw.members)) {
    const declarations = {}
    const maps = {}
    for (const file of Object.keys(record.outputs)) {
      const kind = KIND_OF(file)
      const text = readFileSync(path.join(repoRoot, file), 'utf8')
      if (kind === 'declaration') {
        declarations[file] = { shapeSha256: declarationShapeSha256(text) }
      } else if (kind === 'sourceMap' || kind === 'declarationMap') {
        const projected = mapProjection(text, file)
        // Per-line attribution is only ever consulted for `.js.map`, whose
        // generated `.js` is required byte-identical. Declaration maps are
        // compared by COVERAGE, because their generated positions may
        // legitimately move — so carrying their attribution would be storing
        // hundreds of thousands of entries nothing reads.
        if (kind === 'declarationMap') projected.attribution = null
        maps[file] = projected
      }
    }
    members[member] = { declarations, maps }
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
          // `.js` is required byte-identical, so a generated line means the
          // same thing in both builds and must resolve identically. Declaration
          // serialization may move, so only coverage is required there.
          strictLines: KIND_OF(file) === 'sourceMap',
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

  if (args.includes('--capture')) {
    const target = resolve(at('--out') ?? 'tests/evidence/ts6-migration-projection.json')
    const document = seal(captureProjection(REPO_ROOT, at('--head')))
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
        resolve(at('--projection') ?? 'tests/evidence/ts6-migration-projection.json'),
        'utf8',
      ),
    )
    const current = captureRaw(REPO_ROOT)
    const currentProjection = captureProjection(REPO_ROOT)
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
