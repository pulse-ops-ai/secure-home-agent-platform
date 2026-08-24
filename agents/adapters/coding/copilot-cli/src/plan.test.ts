/**
 * Translation narrows and passes through; it never widens and never
 * decides (PA-INV-06, PA-MUT-03). Every flag family asserted here traces
 * to the L6 spike (SPIKE-02 for the two-control model and the read-only
 * auto-approve boundary finding; COMMAND-RESULTS.txt for the hermetic
 * surface; SPIKE-05 for the isolation home).
 */
import { describe, expect, it } from 'vitest'
import { childEnvironment, ISOLATION_ENV, planLaunch, PROVIDER } from './plan.js'
import { validInvocation } from './test-fixtures.js'
import type { WireInvocation } from './spi.js'

const plan = (mutate?: (invocation: WireInvocation) => WireInvocation) => {
  const invocation = mutate ? mutate(validInvocation()) : validInvocation()
  const result = planLaunch(invocation)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.refusal)
  return result.plan
}

describe('planLaunch', () => {
  it('expresses the grant as availability PLUS allow rules (SPIKE-02)', () => {
    const launch = plan()
    expect(launch.argv).toContain('--available-tools=bash')
    expect(launch.argv).toContain('--allow-tool=bash')
  })

  it('closes the read-only auto-approve hole when shell is ungranted', () => {
    const launch = plan()
    expect(launch.argv).toContain('--deny-tool=shell')
  })

  it('emits no shell denial when shell itself is granted', () => {
    const launch = plan((invocation) => ({
      ...invocation,
      grant: { ...invocation.grant, tools: ['shell'] },
    }))
    expect(launch.argv).toContain('--available-tools=shell')
    expect(launch.argv).not.toContain('--deny-tool=shell')
  })

  it('an empty grant narrows availability to nothing and denies shell', () => {
    const launch = plan((invocation) => ({
      ...invocation,
      grant: { ...invocation.grant, tools: [] },
    }))
    expect(launch.argv.some((a) => a.startsWith('--available-tools='))).toBe(false)
    expect(launch.argv.some((a) => a.startsWith('--allow-tool='))).toBe(false)
    expect(launch.argv).toContain('--deny-tool=shell')
  })

  it('names no tool outside the grant anywhere in argv', () => {
    const launch = plan()
    const grantFlags = launch.argv.filter(
      (a) => a.startsWith('--available-tools=') || a.startsWith('--allow-tool='),
    )
    expect(grantFlags).toEqual(['--available-tools=bash', '--allow-tool=bash'])
  })

  it('pins the model explicitly, never Auto, as pass-through data', () => {
    const launch = plan()
    expect(launch.argv[launch.argv.indexOf('--model') + 1]).toBe('route-a')
  })

  it('runs the spike-evidenced hermetic surface non-interactively', () => {
    const launch = plan()
    for (const flag of [
      '--no-custom-instructions',
      '--no-auto-update',
      '--disable-builtin-mcps',
      '--no-remote',
      '--no-remote-export',
      '--no-ask-user',
      '--no-color',
    ]) {
      expect(launch.argv).toContain(flag)
    }
    expect(launch.argv[launch.argv.indexOf('--output-format') + 1]).toBe('json')
    expect(launch.argv[launch.argv.indexOf('--stream') + 1]).toBe('off')
  })

  it('carries the task verbatim behind -p', () => {
    const launch = plan()
    expect(launch.argv[launch.argv.indexOf('-p') + 1]).toBe('list the repository README titles')
  })

  it('surfaces credential NAMES plus the per-run isolation home (SPIKE-05)', () => {
    const launch = plan()
    expect(launch.required_env).toEqual(['COPILOT_GITHUB_TOKEN', ISOLATION_ENV])
    expect(JSON.stringify(launch)).not.toContain('value')
  })

  it('treats the workspace root as an opaque reference', () => {
    expect(plan().cwd_ref).toBe('/workspace')
  })

  it('refuses parameters it cannot express instead of reshaping the workload', () => {
    const result = planLaunch({
      ...validInvocation(),
      input: { kind: 'task', task: 'x', parameters: { depth: '3' } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.refusal).toContain('input.parameters is not expressible')
  })

  it('pins the provider identity this adapter targets', () => {
    expect(PROVIDER).toEqual({
      command: 'copilot',
      package: '@github/copilot',
      version: '1.0.79',
      image: 'secure-home-runner-copilot',
    })
  })
})

describe('planLaunch — delimiter widening is refused (review finding 3)', () => {
  it('refuses a granted tool containing a comma', () => {
    const result = planLaunch({
      ...validInvocation(),
      grant: { ...validInvocation().grant, tools: ['bash,view'] },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.refusal).toContain('"bash,view"')
      expect(result.refusal).toContain('widen')
    }
  })
})

describe('childEnvironment — the provider env is allowlisted (review finding 1)', () => {
  const ambient = {
    PATH: '/isolated/bin',
    COPILOT_GITHUB_TOKEN: 'declared-and-provisioned',
    COPILOT_HOME: '/run/copilot-home',
    AMBIENT_UNDECLARED_SECRET: 'must-never-pass',
  }

  it('passes the baseline, the declared credentials, and the isolation home', () => {
    const launch = plan()
    expect(childEnvironment(launch, ambient)).toEqual({
      PATH: '/isolated/bin',
      COPILOT_GITHUB_TOKEN: 'declared-and-provisioned',
      COPILOT_HOME: '/run/copilot-home',
    })
  })

  it('an undeclared ambient variable never passes', () => {
    const child = childEnvironment(plan(), ambient)
    expect('AMBIENT_UNDECLARED_SECRET' in child).toBe(false)
  })
})
