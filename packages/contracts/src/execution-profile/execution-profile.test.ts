/**
 * C-EX-001 (profile fixtures), C-PROP-001 (strictness), C-PROP-002
 * (adapter falsification), C-ADV-001 seeds (credentials are references).
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ExecutionProfile } from './execution-profile.js'
import { generateArtifacts } from '../schema/generation.js'

const mulberry32 = (seed: number) => (): number => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const validProfile = () => ({
  contract_id: 'execution-profile' as const,
  contract_version: '1.0.0' as const,
  identity: { name: 'home-status-read', version: '1.0.0' },
  runtime: {
    image_digest: `sha256:${'a'.repeat(64)}`,
    adapter: 'copilot-cli',
  },
  capability: {
    tools: ['household.read'],
    mounts: [{ path: '/workspace', posture: 'read_write' as const }],
    network: {
      default: 'deny' as const,
      granted_destinations: [{ host: 'api.example.internal', port: 443 }],
    },
    credentials: [{ env_var: 'RUN_TOKEN' }],
  },
  execution: { routing_class: 'R1' as const, model_route: 'local-default', fallback: 'refuse' },
  limits: {
    wall_clock_seconds: 600,
    cpu_cores: 1,
    memory_bytes: 512 * 1024 * 1024,
    pids: 128,
    output_bytes: 1024 * 1024,
  },
  principal: { sub: 'agent:home-status', actor_required: true },
  knowledge: { selection: 'household-baseline' },
  evidence: { contract: 'evidence-bundle@1.0.0' },
})

describe('execution profile (C-EX-001)', () => {
  it('validates a complete profile and exposes each group', () => {
    const parsed = ExecutionProfile.parse(validProfile())
    expect(parsed.capability.network.default).toBe('deny')
    expect(parsed.limits.pids).toBe(128)
  })

  it('refuses a versionless profile', () => {
    const doc: Record<string, unknown> = { ...validProfile() }
    delete doc['contract_version']
    expect(ExecutionProfile.safeParse(doc).success).toBe(false)
  })

  it('cannot express an open network posture', () => {
    const doc = validProfile() as unknown as Record<string, unknown>
    const withOpen = {
      ...doc,
      capability: {
        ...(doc['capability'] as Record<string, unknown>),
        network: { default: 'open', granted_destinations: [] },
      },
    }
    expect(ExecutionProfile.safeParse(withOpen).success).toBe(false)
  })

  it('credential grants admit references only — a value-shaped grant refuses', () => {
    const doc = validProfile() as unknown as Record<string, unknown>
    const cap = doc['capability'] as Record<string, unknown>
    for (const bad of [
      { env_var: 'lowercase_not_allowed' },
      { value: 'sk-ant-not-a-real-credential' },
      { env_var: 'RUN_TOKEN', value: 'x' },
    ]) {
      const mutated = { ...doc, capability: { ...cap, credentials: [bad] } }
      expect(ExecutionProfile.safeParse(mutated).success).toBe(false)
    }
  })

  it('knowledge is a selection reference only — capability fields refuse', () => {
    const doc = validProfile() as unknown as Record<string, unknown>
    const mutated = {
      ...doc,
      knowledge: { selection: 'household-baseline', tools: ['x'] },
    }
    expect(ExecutionProfile.safeParse(mutated).success).toBe(false)
  })
})

describe('strictness (C-PROP-001)', () => {
  it('refuses an unknown key at every object level, naming the position', () => {
    const targets = [
      [],
      ['identity'],
      ['runtime'],
      ['capability'],
      ['execution'],
      ['limits'],
      ['principal'],
      ['knowledge'],
      ['evidence'],
    ]
    for (const path of targets) {
      const doc = structuredClone(validProfile()) as Record<string, unknown>
      let cursor: Record<string, unknown> = doc
      for (const key of path) cursor = cursor[key] as Record<string, unknown>
      cursor['unexpected_key'] = true
      const result = ExecutionProfile.safeParse(doc)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(JSON.stringify(result.error.issues)).toContain('unexpected_key')
      }
    }
  })
})

describe('adapter falsification (C-PROP-002)', () => {
  it('any generated adapter identifier parses with zero schema change', async () => {
    const random = mulberry32(51)
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789-'
    for (let index = 0; index < 50; index += 1) {
      const length = 1 + Math.floor(random() * 20)
      let id = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(random() * 26)] ?? 'a'
      for (let c = 0; c < length; c += 1) {
        id += alphabet[Math.floor(random() * alphabet.length)]
      }
      const doc = validProfile()
      doc.runtime.adapter = id
      expect(ExecutionProfile.safeParse(doc).success).toBe(true)
    }
    // The generated schema types the adapter as a constrained string —
    // never an enum, discriminator, or branch.
    const artifacts = await generateArtifacts()
    const schemaText = artifacts.get('execution-profile/1.0.0.json')
    expect(schemaText).toBeDefined()
    const schema = JSON.parse(schemaText ?? '{}') as {
      properties: { runtime: { properties: { adapter: Record<string, unknown> } } }
    }
    const adapter = schema.properties.runtime.properties.adapter
    expect(adapter['type']).toBe('string')
    expect(adapter['enum']).toBeUndefined()
    expect(adapter['const']).toBeUndefined()
  })
})

describe('zod parse authority', () => {
  it('the authored schema is strict zod, not a passthrough (C-MUT-001 kill)', () => {
    expect(ExecutionProfile instanceof z.ZodObject).toBe(true)
    const withExtra = { ...validProfile(), extra: 1 }
    expect(ExecutionProfile.safeParse(withExtra).success).toBe(false)
  })
})
