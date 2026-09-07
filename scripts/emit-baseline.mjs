#!/usr/bin/env node
/**
 * THE EMITTED-OUTPUT BASELINE, AND THE DIFFERENTIAL AGAINST IT.
 *
 * `EX-TS-002`. A compiler cutover that builds cleanly can still change what it
 * EMITS. `tsc` exiting 0 says the program typechecked, not that the shipped
 * declarations, the maps consumers debug through, or the schemas other tools
 * read came out the same. So the surfaces the repository actually emits are
 * digested under the old compiler, frozen, and required to match afterwards.
 *
 * ONE SCRIPT, TWO MODES, deliberately. `--capture` writes the baseline and
 * `--verify` re-derives it and compares. If capture and comparison were two
 * programs they could disagree about what "the same output" means, and the
 * disagreement would look like a passing differential.
 *
 * WHAT IS CLAIMED. Only what the compiler says it emits, per member, read from
 * `tsc --showConfig` rather than asserted here:
 *
 *     .d.ts       declarations       claimed where `declaration` is on
 *     .d.ts.map   declaration maps   claimed where `declarationMap` is on
 *     .js.map     source maps        claimed where `sourceMap` is on
 *     generator   member `generate` output
 *
 * A member that emits none of a kind carries NO claim for it and says why --
 * `apps/web` compiles with `declaration: false`, so it has no declarations to
 * be identical to. Inventing an empty golden claim there would look like
 * coverage and prove nothing.
 *
 * `.js` is digested too, but as OBSERVATION rather than claim. `EX-TS-002`
 * names three compiled surfaces plus generator output, and widening a proof
 * obligation is not this task's to do. Recording the bytes anyway costs one
 * line and means a change to shipped runtime code cannot pass through this
 * cutover completely unseen.
 *
 * NORMALIZATION IS ALMOST NOTHING, ON PURPOSE. Two rules are authorized:
 * compiler version banners where genuinely present, and absolute filesystem
 * paths. Both are recorded with a COUNT of what they actually neutralized, so
 * "the outputs match" cannot quietly come to mean "the normalizer erased the
 * difference". Under TypeScript 6 both counts are zero: this repository's
 * emitted output carries no banner and no absolute path, and the rules exist
 * so that the differential stays honest if that changes.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The emitted kinds this baseline knows about, and the option that governs each. */
export const SURFACE_KINDS = [
  { kind: 'declaration', extension: '.d.ts', option: 'declaration', claimed: true },
  { kind: 'declarationMap', extension: '.d.ts.map', option: 'declarationMap', claimed: true },
  { kind: 'sourceMap', extension: '.js.map', option: 'sourceMap', claimed: true },
  // Observed, not claimed. See the header.
  { kind: 'javascript', extension: '.js', option: undefined, claimed: false },
]

/**
 * The only two authorized neutralizations, each reporting what it did.
 *
 * A normalizer that silently erased a real difference would turn this proof
 * into a formality, so every substitution is counted and the counts travel
 * with the baseline.
 */
export function normalize(text, repoRoot = REPO_ROOT) {
  let banners = 0
  let paths = 0

  // A compiler version banner, only where one is genuinely present: a leading
  // comment naming a TypeScript version. Nothing else is treated as a banner.
  const withoutBanner = text.replace(
    /^\s*\/[/*][^\n]*\bTypeScript\s+v?\d+\.\d+\.\d+[^\n]*(?:\*\/)?\n/,
    () => {
      banners += 1
      return ''
    },
  )

  // Absolute filesystem paths, meaning THIS CHECKOUT'S path specifically: the
  // risk being neutralized is a compiler embedding the build machine's location
  // into its output, and only the real repository root can be that.
  //
  // Deliberately not a generic `/home/...` pattern. The first version was, and
  // it neutralized `/home/runner` inside an adapter test -- a string literal
  // the author wrote, in the authored source, which the compiler merely copied
  // through. That is semantic content, and a rule that erases it could hide a
  // real change to it. The counts are what caught it, which is why they exist.
  const withoutPaths = withoutBanner.replaceAll(repoRoot.replace(/\/$/, ''), () => {
    paths += 1
    return '<REPO>'
  })

  return { text: withoutPaths, applied: { banners, paths } }
}

const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

/** Every file under `dir`, repo-relative, sorted. */
function filesUnder(dir) {
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const full = path.join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else found.push(full)
    }
  }
  if (existsSync(dir)) walk(dir)
  return found.sort()
}

const rel = (absolute, repoRoot) => path.relative(repoRoot, absolute).split(path.sep).join('/')

/** Members that really compile something: a build config plus a `tsc -p` script. */
export function emittingMembers(repoRoot = REPO_ROOT) {
  const tracked = execFileSync('git', ['ls-files', '*tsconfig.build.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line !== '')
  const members = []
  for (const config of tracked) {
    const dir = path.dirname(config)
    const manifest = path.join(repoRoot, dir, 'package.json')
    if (!existsSync(manifest)) continue
    const build = String(JSON.parse(readFileSync(manifest, 'utf8')).scripts?.build ?? '')
    if (!/\btsc\b/.test(build)) continue
    members.push({ rel: dir, config: path.basename(config), build })
  }
  return members.sort((a, b) => a.rel.localeCompare(b.rel))
}

/** The compiler's OWN view of what a project emits. */
export function effectiveOptions(memberDir, config, repoRoot = REPO_ROOT) {
  const tsc = path.join(repoRoot, 'node_modules', '.bin', 'tsc')
  const out = execFileSync(tsc, ['--showConfig', '-p', config], {
    cwd: path.join(repoRoot, memberDir),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(out).compilerOptions ?? {}
}

/** Members whose `generate` script really runs a generator. */
export function generatingMembers(repoRoot = REPO_ROOT) {
  const found = []
  for (const manifest of execFileSync('git', ['ls-files', '*package.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line !== '')) {
    const parsed = JSON.parse(readFileSync(path.join(repoRoot, manifest), 'utf8'))
    const generate = String(parsed.scripts?.generate ?? '')
    if (generate === '') continue
    found.push({ rel: path.dirname(manifest), generate })
  }
  return found.sort((a, b) => a.rel.localeCompare(b.rel))
}

/**
 * What one generator wrote, identified by observation rather than by reading
 * its internals.
 *
 * Modification times before and after the run: `writeFileSync` stamps every
 * file it writes even when the bytes are unchanged, which is exactly the case
 * that matters -- a generator reproducing committed output must still be
 * recognised as having produced it.
 */
export function generatorOutputs(member, generate, repoRoot = REPO_ROOT) {
  const roots = ['schemas']
  const before = new Map()
  for (const root of roots) {
    for (const file of filesUnder(path.join(repoRoot, root))) {
      before.set(file, statSync(file).mtimeMs)
    }
  }
  execFileSync('pnpm', ['--filter', packageNameOf(member, repoRoot), 'run', 'generate'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  })
  const written = {}
  for (const root of roots) {
    for (const file of filesUnder(path.join(repoRoot, root))) {
      const was = before.get(file)
      if (was !== undefined && statSync(file).mtimeMs === was) continue
      const normalized = normalize(readFileSync(file, 'utf8'), repoRoot)
      written[rel(file, repoRoot)] = { sha256: digest(normalized.text), ...applied(normalized) }
    }
  }
  return written
}

const packageNameOf = (member, repoRoot) =>
  JSON.parse(readFileSync(path.join(repoRoot, member, 'package.json'), 'utf8')).name

/** Only record a normalization note when something was actually neutralized. */
const applied = (normalized) =>
  normalized.applied.banners === 0 && normalized.applied.paths === 0
    ? {}
    : { normalized: normalized.applied }

/**
 * Wipe every output directory and rebuild from source.
 *
 * Both modes call this, and they must. `dist/` accumulates: a file whose
 * source was deleted three commits ago stays on disk until something removes
 * it, and `tsc` has no reason to. The first capture ran against such a tree and
 * froze 32 outputs with no sources behind them -- including one written by a
 * test that plants a file in another package. The differential then reported
 * them as "emitted under the baseline compiler and absent now", which was true
 * of the DISK and false about both compilers.
 *
 * A baseline is only a statement about a compiler if the tree it measured came
 * entirely from that compiler.
 */
export function rebuild(repoRoot = REPO_ROOT) {
  for (const member of emittingMembers(repoRoot)) {
    const options = effectiveOptions(member.rel, member.config, repoRoot)
    const outDir = path.resolve(path.join(repoRoot, member.rel), options.outDir ?? '.')
    if (outDir !== path.resolve(path.join(repoRoot, member.rel))) {
      rmSync(outDir, { recursive: true, force: true })
    }
  }
  execFileSync('pnpm', ['build'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * The commit this baseline speaks for, CHECKED rather than asserted.
 *
 * Not `git rev-parse HEAD`. The baseline is committed after the tree it
 * measures, so HEAD at capture time is the baseline's own commit -- which
 * changes if that commit is ever amended, and which is not the tree anybody
 * cares about. The binding that matters is the last tree in which the old
 * compiler was authoritative.
 *
 * So the head is given, and then verified: every measured member's sources
 * must be identical to that commit's. A baseline claiming to speak for a tree
 * it did not measure is worse than one carrying no binding at all.
 */
export function verifyHeadBinding(head, repoRoot = REPO_ROOT) {
  const differing = []
  for (const member of emittingMembers(repoRoot)) {
    const out = execFileSync('git', ['diff', '--name-only', head, '--', `${member.rel}/src`], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
    if (out !== '') differing.push(...out.split('\n'))
  }
  if (differing.length > 0) {
    throw new Error(
      `the working tree's sources differ from ${head}, so a baseline captured here does not ` +
        `speak for that commit:\n  ${differing.join('\n  ')}`,
    )
  }
  return head
}

export function capture(repoRoot = REPO_ROOT, head = undefined) {
  const boundTo =
    head === undefined
      ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
      : verifyHeadBinding(head, repoRoot)
  rebuild(repoRoot)

  const compilerVersion = JSON.parse(
    readFileSync(path.join(repoRoot, 'node_modules', 'typescript', 'package.json'), 'utf8'),
  ).version
  const tscReported = execFileSync(path.join(repoRoot, 'node_modules', '.bin', 'tsc'), [
    '--version',
  ])
    .toString()
    .trim()

  const members = {}
  for (const member of emittingMembers(repoRoot)) {
    const options = effectiveOptions(member.rel, member.config, repoRoot)
    const outDir = path.resolve(path.join(repoRoot, member.rel), options.outDir ?? '.')
    const surfaces = {}
    const outputs = {}

    for (const surface of SURFACE_KINDS) {
      const files = filesUnder(outDir).filter((file) => {
        if (!file.endsWith(surface.extension)) return false
        // `.js` must not swallow `.d.ts`; `.d.ts` must not swallow `.d.ts.map`.
        return !SURFACE_KINDS.some(
          (other) =>
            other.extension !== surface.extension &&
            other.extension.endsWith(surface.extension) &&
            file.endsWith(other.extension),
        )
      })
      const enabled = surface.option === undefined ? undefined : options[surface.option] === true

      if (files.length === 0) {
        surfaces[surface.kind] = {
          claimed: false,
          disposition:
            enabled === false ? 'NOT_EMITTED_BY_CONFIG' : 'NOT_EMITTED_AND_NOT_EXPLAINED_BY_CONFIG',
          option: surface.option ?? null,
          optionValue: enabled ?? null,
        }
        continue
      }
      surfaces[surface.kind] = {
        claimed: surface.claimed,
        disposition: 'EMITTED',
        option: surface.option ?? null,
        optionValue: enabled ?? null,
        count: files.length,
      }
      for (const file of files) {
        const normalized = normalize(readFileSync(file, 'utf8'), repoRoot)
        outputs[rel(file, repoRoot)] = {
          kind: surface.kind,
          claimed: surface.claimed,
          sha256: digest(normalized.text),
          ...applied(normalized),
        }
      }
    }
    members[member.rel] = { config: member.config, build: member.build, surfaces, outputs }
  }

  const generators = {}
  for (const member of generatingMembers(repoRoot)) {
    generators[member.rel] = {
      generate: member.generate,
      artifacts: generatorOutputs(member.rel, member.generate, repoRoot),
    }
  }

  return {
    schemaVersion: 1,
    proof: 'EX-TS-002',
    capturedAtHead: boundTo,
    compiler: { package: 'typescript', version: compilerVersion, tscReported },
    normalization: {
      authorized: ['compiler version banners where genuinely present', 'absolute filesystem paths'],
      note:
        'Counts travel with each output. An entry with no `normalized` field had nothing ' +
        'neutralized, which is the expected state: this repository emits neither banners nor ' +
        'absolute paths.',
    },
    members,
    generators,
  }
}

/** Canonical bytes of everything except the seal itself. */
export function sealableBody(baseline) {
  const { manifestSha256: _ignored, ...body } = baseline
  return `${JSON.stringify(body, null, 2)}\n`
}

export function seal(baseline) {
  return { ...baseline, manifestSha256: digest(sealableBody(baseline)) }
}

/**
 * Every difference between a frozen baseline and the tree as it stands.
 *
 * Ordered so the report reads as a cause rather than a list: a compiler change
 * first, then surfaces that appeared or vanished, then individual outputs.
 */
export function differential(baseline, current) {
  const problems = []

  if (digest(sealableBody(baseline)) !== baseline.manifestSha256) {
    problems.push(
      'the frozen baseline does not match its own seal: its bytes were edited after capture, ' +
        'so it no longer records what the old compiler emitted',
    )
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
    for (const kind of Object.keys({ ...was.surfaces, ...now.surfaces })) {
      const before = was.surfaces[kind]
      const after = now.surfaces[kind]
      if (before?.disposition !== after?.disposition) {
        problems.push(
          `${member}: the ${kind} surface changed disposition, ` +
            `${before?.disposition ?? '(absent)'} -> ${after?.disposition ?? '(absent)'}`,
        )
      } else if (before?.count !== after?.count) {
        problems.push(
          `${member}: the ${kind} surface emitted ${after?.count ?? 0} files, baseline had ` +
            `${before?.count ?? 0}`,
        )
      }
    }
    problems.push(...compareOutputs(member, was.outputs, now.outputs))
  }

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
    problems.push(...compareOutputs(`${member} (generate)`, was.artifacts, now.artifacts))
  }

  return problems
}

function compareOutputs(label, was, now) {
  const problems = []
  for (const file of Object.keys({ ...was, ...now }).sort()) {
    const before = was[file]
    const after = now[file]
    if (before === undefined) {
      problems.push(`${label}: ${file} is emitted now but has no baseline entry`)
      continue
    }
    if (after === undefined) {
      problems.push(`${label}: ${file} was emitted under the baseline compiler and is absent now`)
      continue
    }
    if (before.sha256 !== after.sha256) {
      problems.push(
        `${label}: ${file} differs from the frozen baseline ` +
          `(${before.sha256.slice(0, 12)} -> ${after.sha256.slice(0, 12)})` +
          (after.normalized === undefined
            ? ''
            : ` — and normalization neutralized ${JSON.stringify(after.normalized)} here, so the ` +
              'difference is NOT explained by the authorized rules alone'),
      )
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
  const given = args.find((arg) => !arg.startsWith('--'))
  // Absolute paths pass through unchanged, so a test can point this at a
  // doctored copy outside the repository.
  const target = given === undefined ? undefined : path.resolve(REPO_ROOT, given)
  if (args.includes('--capture')) {
    const headFlag = args.find((arg) => arg.startsWith('--head='))
    const baseline = seal(
      capture(REPO_ROOT, headFlag === undefined ? undefined : headFlag.slice('--head='.length)),
    )
    writeFileSync(target, sealableBodyWithSeal(baseline))
    const claimed = countClaimed(baseline)
    console.log(
      `✓ emitted-output baseline captured under typescript@${baseline.compiler.version} — ` +
        `${claimed} claimed outputs across ${Object.keys(baseline.members).length} members, ` +
        `${Object.keys(baseline.generators).length} generators`,
    )
  } else if (args.includes('--verify')) {
    const baseline = JSON.parse(readFileSync(target, 'utf8'))
    const problems = differential(baseline, capture())
    if (problems.length > 0) {
      console.error(`✗ emitted-output differential — ${problems.length} difference(s)\n`)
      for (const problem of problems) console.error(`    ${problem}`)
      process.exit(1)
    }
    console.log(
      `✓ emitted-output differential — every claimed surface matches the baseline frozen under ` +
        `typescript@${baseline.compiler.version} at ${baseline.capturedAtHead.slice(0, 12)}`,
    )
  } else {
    console.error('usage: emit-baseline.mjs (--capture|--verify) <baseline.json>')
    process.exit(2)
  }
}

function sealableBodyWithSeal(baseline) {
  const { manifestSha256, ...body } = baseline
  return `${JSON.stringify({ ...body, manifestSha256 }, null, 2)}\n`
}

function countClaimed(baseline) {
  let claimed = 0
  for (const member of Object.values(baseline.members)) {
    claimed += Object.values(member.outputs).filter((entry) => entry.claimed).length
  }
  for (const generator of Object.values(baseline.generators)) {
    claimed += Object.keys(generator.artifacts).length
  }
  return claimed
}
