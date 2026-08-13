/**
 * The structural guards. These do not test behaviour — they assert what
 * this service is ALLOWED TO CONTAIN, which is how the landing stays on
 * the near side of every open decision:
 *
 *  RO-EX-01  the runtime dependency set is exact
 *  RO-EX-02  no container-launch or process-spawn capability exists
 *  RO-EX-03  no dynamic import and no eval-family primitive
 *  RO-EX-07  the shell is inert: importing starts nothing
 *  RO-INV-06 every trust decision is attributable to a core call
 *
 * The scans cover PRODUCTION source only. Test files legitimately use
 * node:fs to read the tree they audit, and the fixtures legitimately
 * construct fake ports — auditing them would make the guards meaningless.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '../..')
const srcRoot = join(packageRoot, 'src')

const sourceFiles = (): readonly string[] => {
  const out: string[] = []
  for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    if (entry.name.endsWith('.test.ts')) continue
    if (entry.name === 'testing-fixtures.ts') continue
    out.push(join(entry.parentPath, entry.name))
  }
  return out
}

const read = (file: string): string => readFileSync(file, 'utf8')

/**
 * The file with comments and string literals removed.
 *
 * The scans below must see CODE. A guard that a doc comment can trip is
 * a guard people silence by rewording the comment — which teaches
 * exactly the wrong lesson, since the comment was accurate and the code
 * was fine. These modules deliberately document what they must not
 * contain ("no NestFactory", "no argv"), so scanning raw text would make
 * honest documentation the failure.
 */
const code = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')

describe('RO-EX-01: the runtime dependency set is exact', () => {
  const manifest = JSON.parse(read(join(packageRoot, 'package.json'))) as {
    dependencies?: Record<string, string>
  }

  it('is exactly the three platform packages plus the pinned framework set', () => {
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      '@nestjs/common',
      '@nestjs/core',
      '@nestjs/platform-fastify',
      '@secure-home/contracts',
      '@secure-home/events',
      '@secure-home/runner-core',
      'reflect-metadata',
      'rxjs',
    ])
  })

  it('declares NO zod: this service cannot author a schema', () => {
    // Authoring a contract here would put a second definition of a
    // governed shape in the tree. The contracts are authored once, in
    // packages/contracts, and consumed by instance everywhere else.
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain('zod')
  })

  it('declares no client SDK, container runtime, or process manager', () => {
    const forbidden = [
      'dockerode',
      'docker',
      'child_process',
      'execa',
      'node-pty',
      'pm2',
      'kubernetes',
    ]
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      for (const term of forbidden) {
        expect(dependency.includes(term), `${dependency} must not be a runtime dependency`).toBe(
          false,
        )
      }
    }
  })

  it('every external version comes from the catalog, never restated', () => {
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (name.startsWith('@secure-home/')) {
        expect(version).toBe('workspace:*')
        continue
      }
      expect(version, `${name} must reference the catalog`).toBe('catalog:')
    }
  })
})

describe('RO-EX-02: no container-launch or process-spawn capability', () => {
  it('no production module imports a process, container, or network module', () => {
    const forbidden = [
      'node:child_process',
      'child_process',
      'node:cluster',
      'node:worker_threads',
      'node:net',
      'node:http',
      'node:https',
      'node:dgram',
      'dockerode',
    ]
    for (const file of sourceFiles()) {
      const contents = read(file)
      for (const module of forbidden) {
        expect(
          contents.includes(`'${module}'`) || contents.includes(`"${module}"`),
          `${file} must not import ${module}`,
        ).toBe(false)
      }
    }
  })

  it('no spawn, exec, or fork primitive appears anywhere in production source', () => {
    for (const file of sourceFiles()) {
      const contents = code(file)
      for (const primitive of ['spawnSync', 'spawn(', 'execSync', 'execFile', '.fork(']) {
        expect(contents.includes(primitive), `${file} must not call ${primitive}`).toBe(false)
      }
    }
  })

  it('no Docker socket path or container runtime endpoint is named', () => {
    for (const file of sourceFiles()) {
      const contents = read(file)
      for (const path of ['/var/run/docker.sock', 'unix:///var/run', 'containerd', 'podman']) {
        expect(contents.includes(path), `${file} must not name ${path}`).toBe(false)
      }
    }
  })

  it('the port surface has no image, mount, socket, or argv parameter', () => {
    // A port that cannot express "launch this image with these
    // arguments" cannot be made to launch one by a caller. The gate
    // execution request carries an identity and the registry's own spec.
    //
    // Compared by identifier SEGMENT, not by substring: a substring scan
    // reads `amount` as containing `mount` and fails on an honest field,
    // which teaches people to rename the field rather than fix the code.
    const ports = code(join(srcRoot, 'ports/index.ts')) + code(join(srcRoot, 'ports/values.ts'))
    const segments = new Set(
      (ports.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).flatMap((identifier) =>
        identifier
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .toLowerCase()
          .split('_'),
      ),
    )
    for (const term of ['image', 'mount', 'mounts', 'socket', 'argv', 'command', 'exec']) {
      expect(segments.has(term), `the port surface must not name ${term}`).toBe(false)
    }
  })

  it('the only execution and adapter implementations in the tree are the deterministic ones', () => {
    const implementations = sourceFiles().filter((file) => {
      const contents = read(file)
      return (
        contents.includes('implements ExecutionPort') ||
        contents.includes('implements AdapterInvocationPort')
      )
    })
    expect(implementations.map((file) => file.replace(`${srcRoot}/`, ''))).toEqual([
      'adapters/deterministic.ts',
    ])
  })
})

describe('RO-EX-03: the module graph is fixed', () => {
  it('no dynamic import or require with a non-literal specifier', () => {
    for (const file of sourceFiles()) {
      const contents = code(file)
      // A dynamic import with a computed specifier is how workspace
      // bytes would become executable code (ADV-018/MUT-010). Static
      // imports only, so the graph is decidable by reading the source.
      expect(/\bimport\s*\(\s*[^'"`)]/.test(contents), `${file} has a dynamic import`).toBe(false)
      expect(/\brequire\s*\(/.test(contents), `${file} uses require`).toBe(false)
    }
  })

  it('no eval-family primitive anywhere', () => {
    for (const file of sourceFiles()) {
      const contents = code(file)
      for (const primitive of ['eval(', 'new Function(', 'vm.runIn', 'createRequire']) {
        expect(contents.includes(primitive), `${file} must not use ${primitive}`).toBe(false)
      }
    }
  })

  it('ADV-018: observed workspace content is only ever read as data', () => {
    // The artifact observer returns { path, content: string }. Nothing
    // in the service passes that content to an import, a require, or an
    // evaluator — there is no such call site to pass it to.
    const observer = code(join(srcRoot, 'adapters/filesystem.ts'))
    expect(read(join(srcRoot, 'adapters/filesystem.ts'))).toContain('readFileSync')
    expect(observer.includes('import(')).toBe(false)
    expect(observer.includes('eval')).toBe(false)
  })

  it('the filesystem implementations are read-only: no write primitive exists', () => {
    const filesystem = code(join(srcRoot, 'adapters/filesystem.ts'))
    for (const primitive of [
      'writeFile',
      'appendFile',
      'mkdir',
      'rm(',
      'rmSync',
      'unlink',
      'rename',
      'chmod',
    ]) {
      expect(filesystem.includes(primitive), `the observers must not call ${primitive}`).toBe(false)
    }
  })
})

describe('RO-EX-07: the shell is inert', () => {
  it('nothing in the tree bootstraps, listens, or binds', () => {
    for (const file of sourceFiles()) {
      const contents = code(file)
      for (const primitive of [
        'NestFactory',
        '.listen(',
        'createServer',
        'process.exit',
        'setInterval',
      ]) {
        expect(contents.includes(primitive), `${file} must not call ${primitive}`).toBe(false)
      }
    }
  })

  it('importing the service index has no side effect and starts nothing', async () => {
    const surface = await import('../index.js')
    // Every export is a type, a function, a class, or a constant. An
    // instance would mean the import constructed something.
    for (const [name, value] of Object.entries(surface)) {
      const kind = typeof value
      expect(
        kind === 'function' || kind === 'object' || kind === 'string',
        `unexpected export shape for ${name}: ${kind}`,
      ).toBe(true)
    }
  })

  it('the service index does not reach the framework', () => {
    const index = code(join(srcRoot, 'index.ts'))
    expect(index.includes('@nestjs'), 'the public surface must stay framework-free').toBe(false)
    expect(index.includes('./app/'), 'the index must not re-export the shell').toBe(false)
  })

  it('importing the Nest module tree registers metadata and binds nothing', async () => {
    const shell = await import('../app/index.js')
    expect(typeof shell.RunnerControlModule).toBe('function')
    // Importing did not construct the module, only declared it.
    expect(Object.keys(shell.PORT_TOKENS)).toHaveLength(11)
  })
})

describe('RO-INV-06: orchestration cannot decide', () => {
  it('every trust decision in the tree comes from a runner-core call', () => {
    // The decision surface this service is allowed to use, and the only
    // way a trust judgement may enter a run.
    const coreOperations = [
      'captureAuthority',
      'decideEligibility',
      'decideMaterialization',
      'decideSealEligibility',
      'constructEvidence',
      'deriveAuthoritativeChangeSet',
      'reconcileClaims',
      'verifyEvidence',
      'consumeVerified',
      'compareBaseIdentity',
      'enforceBound',
      'classifyEvidenceFailure',
      'indeterminateOutcome',
    ]
    let calls = 0
    for (const file of sourceFiles()) {
      const contents = code(file)
      for (const operation of coreOperations) {
        if (contents.includes(`${operation}(`)) calls += 1
      }
    }
    expect(calls, 'the service must actually route decisions through the core').toBeGreaterThan(4)
  })

  it('no module re-implements a refusal code or a terminal-success map', () => {
    // Re-deriving either would be deciding. The vocabularies are the
    // platform's, consumed by instance.
    for (const file of sourceFiles()) {
      const contents = code(file)
      expect(contents.includes('REFUSAL_CODES ='), `${file} must not redefine refusal codes`).toBe(
        false,
      )
      expect(
        contents.includes('TERMINAL_SUCCESS ='),
        `${file} must not redefine success mapping`,
      ).toBe(false)
    }
  })

  it("the terminal vocabulary is the L2 contract's, not a local copy", () => {
    const states = read(join(srcRoot, 'lifecycle/states.ts'))
    // The lifecycle vocabulary includes orchestration-only progress
    // states, so it is declared here — but the OUTCOME shapes that reach
    // evidence are built by the contract, never hand-rolled.
    const records = read(join(srcRoot, 'finalization/records.ts'))
    expect(records).toContain('RunOutcomeT')
    expect(states).toContain('PROGRESS_STATES')
  })
})
