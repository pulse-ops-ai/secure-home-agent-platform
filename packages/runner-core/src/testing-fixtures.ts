/**
 * Shared deterministic fixtures for the runner-core proof net. Test
 * support only — imported exclusively by `*.test.ts` files; never
 * exported from the package index.
 */
import { ExecutionProfile, GateRegistry, PathPolicy } from '@secure-home/contracts'
import type { AuthorityBytes, CapturedAuthority, SourceIdentity } from './authority/index.js'
import { captureAuthority } from './authority/index.js'
import type { ExecutionProfileT, GateRegistryT, PathPolicyT } from '@secure-home/contracts'

export const digestHex = (letter: string): string => `sha256:${letter.repeat(64)}`

export const profileDocument = (): Record<string, unknown> => ({
  contract_id: 'execution-profile',
  contract_version: '1.0.0',
  identity: { name: 'home-status-read', version: '1.0.0' },
  runtime: { image_digest: digestHex('a'), adapter: 'copilot-cli' },
  capability: {
    tools: ['household.read'],
    mounts: [{ path: '/workspace', posture: 'read_write' }],
    network: { default: 'deny', granted_destinations: [] },
    credentials: [{ env_var: 'RUN_TOKEN' }],
  },
  execution: { routing_class: 'R1', model_route: 'local-default', fallback: 'refuse' },
  limits: {
    wall_clock_seconds: 600,
    cpu_cores: 1,
    memory_bytes: 536870912,
    pids: 128,
    output_bytes: 1048576,
  },
  principal: { sub: 'agent:home-status', actor_required: false },
  knowledge: { selection: 'household-baseline' },
  evidence: { contract: 'evidence-bundle@2.0.0' },
})

export const policyDocument = (): Record<string, unknown> => ({
  contract_id: 'path-policy',
  contract_version: '2.0.0',
  allowed_write_roots: ['packages', 'docs'],
  prohibited_rules: [
    { kind: 'path_prefix', prefix: '.git' },
    { kind: 'path_prefix', prefix: 'schemas' },
    { kind: 'path_prefix', prefix: 'AGENTS.md' },
  ],
  max_files: 8,
  max_total_bytes: 4096,
  max_file_bytes: 1024,
})

export const registryDocument = (): Record<string, unknown> => ({
  contract_id: 'gate-registry',
  contract_version: '1.0.0',
  gates: {
    lint: {
      executable: 'pnpm',
      args: ['lint'],
      timeout_seconds: 600,
      max_output_bytes: 262144,
      environment_names: ['PATH'],
      network: 'none',
    },
    'unit-tests': {
      executable: 'pnpm',
      args: ['test'],
      timeout_seconds: 900,
      max_output_bytes: 262144,
      environment_names: ['PATH'],
      network: 'none',
    },
  },
})

export const source = (name: string): SourceIdentity => ({ source: name })

export const bytesOf = (document: unknown, name: string): AuthorityBytes => ({
  ok: true,
  source: source(name),
  bytes: JSON.stringify(document),
})

export const capturedProfile = (): CapturedAuthority<ExecutionProfileT> => {
  const captured = captureAuthority<ExecutionProfileT>(
    bytesOf(profileDocument(), 'profiles/coding/home-status-read.json'),
    { contract_id: 'execution-profile', schema: ExecutionProfile },
  )
  if ('kind' in captured) throw new Error('fixture capture must not fail operationally')
  return captured
}

export const capturedPolicy = (
  document: unknown = policyDocument(),
): CapturedAuthority<PathPolicyT> => {
  const captured = captureAuthority<PathPolicyT>(bytesOf(document, 'profiles/path-policy.json'), {
    contract_id: 'path-policy',
    schema: PathPolicy,
  })
  if ('kind' in captured) throw new Error('fixture capture must not fail operationally')
  return captured
}

export const capturedRegistry = (): CapturedAuthority<GateRegistryT> => {
  const captured = captureAuthority<GateRegistryT>(
    bytesOf(registryDocument(), 'profiles/gate-registry.json'),
    { contract_id: 'gate-registry', schema: GateRegistry },
  )
  if ('kind' in captured) throw new Error('fixture capture must not fail operationally')
  return captured
}

/** Deterministic PRNG for property tests — no new dependency. */
export const mulberry32 = (seed: number): (() => number) => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
