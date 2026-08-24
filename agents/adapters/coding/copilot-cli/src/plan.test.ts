/**
 * Translation narrows and passes through; it never widens and never
 * decides (PA-INV-06, PA-MUT-03). Every flag family asserted here traces
 * to the L6 spike — above all SPIKE-02's two-namespace model:
 * availability identities (`bash`) and permission-rule identifiers
 * (`shell`, `shell(printf)`) are DIFFERENT grammars, translated through
 * the evidenced mapping and never conflated (review finding 1).
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

describe('planLaunch — the L6 two-namespace grant translation', () => {
  it('reproduces the L6 positive shape: available=bash, allow in the SHELL family', () => {
    // The proven case is `--available-tools=bash` + `--allow-tool=shell(…)`
    // — availability names the built-in tool, permission names the shell
    // rule family. An unqualified platform grant of `bash` carries the
    // family-level rule (the substrate is the boundary, decision 2).
    const launch = plan()
    expect(launch.argv).toContain('--available-tools=bash')
    expect(launch.argv).toContain('--allow-tool=shell')
  })

  it('never copies an availability identity into the permission namespace', () => {
    const launch = plan()
    expect(launch.argv).not.toContain('--allow-tool=bash')
  })

  it('never denies the permission family of a granted tool (deny wins — SPIKE-02)', () => {
    const launch = plan()
    expect(launch.argv).not.toContain('--deny-tool=shell')
  })

  it('closes the read-only auto-approve hole exactly when bash is ungranted', () => {
    const launch = plan((invocation) => ({
      ...invocation,
      grant: { ...invocation.grant, tools: ['view'] },
    }))
    expect(launch.argv).toContain('--available-tools=view')
    expect(launch.argv).toContain('--deny-tool=shell')
  })

  it('a granted tool with no evidenced permission mapping gets NO allow rule', () => {
    // Inventing `--allow-tool=view` would put an availability name into
    // the permission grammar with no evidence it means anything there.
    const launch = plan((invocation) => ({
      ...invocation,
      grant: { ...invocation.grant, tools: ['view'] },
    }))
    expect(launch.argv.filter((a) => a.startsWith('--allow-tool='))).toEqual([])
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

  it('names no availability identity outside the grant', () => {
    const launch = plan()
    expect(launch.argv.filter((a) => a.startsWith('--available-tools='))).toEqual([
      '--available-tools=bash',
    ])
  })
})

describe('planLaunch — credentials reach the evidenced secrecy control (review finding 2)', () => {
  it('emits --secret-env-vars for every declared credential reference', () => {
    // SPIKE-05: the ONE evidenced mechanism stripping named variables
    // from shell/MCP subprocess environments and redacting output.
    const launch = plan()
    expect(launch.argv).toContain('--secret-env-vars=COPILOT_GITHUB_TOKEN')
  })

  it('emits one flag per credential, names only', () => {
    const launch = plan((invocation) => ({
      ...invocation,
      credentials: [{ env_var: 'COPILOT_GITHUB_TOKEN' }, { env_var: 'SECOND_TOKEN_REF' }],
    }))
    expect(launch.argv.filter((a) => a.startsWith('--secret-env-vars='))).toEqual([
      '--secret-env-vars=COPILOT_GITHUB_TOKEN',
      '--secret-env-vars=SECOND_TOKEN_REF',
    ])
    expect(JSON.stringify(launch)).not.toContain('value')
  })
})

describe('planLaunch — pass-through and hermetic surface', () => {
  it('pins the model explicitly, never Auto, as pass-through data', () => {
    const launch = plan()
    expect(launch.argv[launch.argv.indexOf('--model') + 1]).toBe('route-a')
  })

  it('never translates platform fallback policy into a provider surface (review finding)', () => {
    const launch = plan()
    expect(launch.argv).not.toContain('refuse')
    const degraded = plan((invocation) => ({
      ...invocation,
      routing: { routing_class: 'R2', model_route: 'route-b', fallback: 'R1' },
    }))
    expect(degraded.argv).not.toContain('R1')
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
  })

  it('workspace references are DATA — they appear nowhere in the plan (review finding)', () => {
    const launch = plan()
    const serialized = JSON.stringify(launch)
    expect(serialized).not.toContain('workspace:run-0001')
    expect(serialized).not.toContain('session-0001')
    expect('cwd_ref' in launch).toBe(false)
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
