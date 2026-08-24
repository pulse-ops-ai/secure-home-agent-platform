/**
 * Translation narrows and passes through; it never widens and never
 * decides (PA-INV-06, PA-MUT-03). The plan is a value: every assertion
 * here reads argv, not behavior.
 */
import { describe, expect, it } from 'vitest'
import { childEnvironment, planLaunch, PROVIDER } from './plan.js'
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
  it('narrows availability to exactly the granted tools, comma-joined', () => {
    const launch = plan()
    const toolsAt = launch.argv.indexOf('--tools')
    expect(toolsAt).toBeGreaterThan(-1)
    expect(launch.argv[toolsAt + 1]).toBe('Read,Grep')
    const allowedAt = launch.argv.indexOf('--allowedTools')
    expect(launch.argv[allowedAt + 1]).toBe('Read,Grep')
  })

  it('an empty grant disables every tool — the documented "" spelling', () => {
    const launch = plan((invocation) => ({
      ...invocation,
      grant: { ...invocation.grant, tools: [] },
    }))
    const toolsAt = launch.argv.indexOf('--tools')
    expect(launch.argv[toolsAt + 1]).toBe('')
    expect(launch.argv).not.toContain('--allowedTools')
  })

  it('names no tool outside the grant anywhere in argv', () => {
    const launch = plan()
    const blob = launch.argv.join(' ')
    for (const ungranted of ['Bash', 'Edit', 'Write', 'WebFetch']) {
      expect(blob).not.toContain(ungranted)
    }
  })

  it('passes the model route and fallback through as data', () => {
    const launch = plan((invocation) => ({
      ...invocation,
      routing: { routing_class: 'coding', model_route: 'route-b', fallback: 'route-c' },
    }))
    expect(launch.argv[launch.argv.indexOf('--model') + 1]).toBe('route-b')
    expect(launch.argv[launch.argv.indexOf('--fallback-model') + 1]).toBe('route-c')
  })

  it('omits the fallback flag when routing declares none', () => {
    expect(plan().argv).not.toContain('--fallback-model')
  })

  it('runs hermetically: no ambient settings source is loaded', () => {
    const launch = plan()
    const at = launch.argv.indexOf('--setting-sources')
    expect(at).toBeGreaterThan(-1)
    expect(launch.argv[at + 1]).toBe('')
  })

  it('captures the transcript as stream-json in print mode', () => {
    const launch = plan()
    expect(launch.argv).toContain('--print')
    expect(launch.argv[launch.argv.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(launch.argv).toContain('--verbose')
  })

  it('carries the task verbatim as the final positional argument', () => {
    const launch = plan()
    expect(launch.argv.at(-1)).toBe('list the repository README titles')
  })

  it('surfaces credential NAMES for substrate provisioning, never values', () => {
    const launch = plan()
    expect(launch.required_env).toEqual(['PROVIDER_TOKEN_REF'])
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
    if (!result.ok) {
      expect(result.refusal).toContain('input.parameters is not expressible')
      expect(result.refusal).toContain('depth')
    }
  })

  it('pins the provider identity this adapter targets', () => {
    expect(PROVIDER).toEqual({
      command: 'claude',
      package: '@anthropic-ai/claude-code',
      version: '2.1.241',
      image: 'secure-home-runner-claude',
    })
  })
})

describe('planLaunch — delimiter widening is refused (review finding 3)', () => {
  it('refuses a granted tool containing the comma delimiter', () => {
    const result = planLaunch({
      ...validInvocation(),
      grant: { ...validInvocation().grant, tools: ['Read,Bash'] },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.refusal).toContain('"Read,Bash"')
      expect(result.refusal).toContain('widen')
    }
  })
})

describe('childEnvironment — the provider env is allowlisted (review finding 1)', () => {
  const ambient = {
    PATH: '/isolated/bin',
    HOME: '/home/runner',
    PROVIDER_TOKEN_REF: 'declared-and-provisioned',
    AMBIENT_UNDECLARED_SECRET: 'must-never-pass',
    STUB_HARNESS_DETAIL: 'must-never-pass',
  }

  it('passes exactly the baseline plus the declared variables', () => {
    const launch = plan()
    expect(childEnvironment(launch, ambient)).toEqual({
      PATH: '/isolated/bin',
      HOME: '/home/runner',
      PROVIDER_TOKEN_REF: 'declared-and-provisioned',
    })
  })

  it('a declared but unprovisioned variable stays absent, not empty', () => {
    const launch = plan()
    const child = childEnvironment(launch, { PATH: '/isolated/bin' })
    expect(child).toEqual({ PATH: '/isolated/bin' })
    expect('PROVIDER_TOKEN_REF' in child).toBe(false)
  })
})
