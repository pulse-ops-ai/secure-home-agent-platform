/**
 * C-EX-001 fixtures for path policy, verification packs (a pack cannot
 * smuggle a command), and the launch assertion (C-ADV-001, C-MUT-004
 * kill: a secret-bearing assertion is unrepresentable).
 */
import { describe, expect, it } from 'vitest'
import { LaunchAssertion } from './launch-assertion.js'
import { PathPolicy } from './path-policy.js'
import { VerificationPacks } from './verification-packs.js'

describe('path policy', () => {
  it('validates declarative data and refuses unknown keys', () => {
    const doc = {
      contract_id: 'path-policy' as const,
      contract_version: '1.0.0' as const,
      allowed_write_roots: ['packages', 'services'],
      prohibited_rules: ['.git/', '*.pem'],
      max_files: 64,
      max_total_bytes: 1_000_000,
      max_file_bytes: 200_000,
    }
    expect(PathPolicy.safeParse(doc).success).toBe(true)
    expect(PathPolicy.safeParse({ ...doc, executable: 'sh' }).success).toBe(false)
  })
})

describe('verification packs', () => {
  const packs = {
    contract_id: 'verification-packs' as const,
    contract_version: '1.0.0' as const,
    packs: {
      'static-quality': { description: 'lint and typecheck', gate_ids: ['lint'] },
    },
  }

  it('validates keyed gate-identity references', () => {
    expect(VerificationPacks.safeParse(packs).success).toBe(true)
  })

  it('cannot smuggle a command — executable/argv/network fields refuse', () => {
    for (const extra of [
      { executable: 'bash' },
      { args: ['-c', 'curl evil'] },
      { environment: ['ALL'] },
      { network: 'egress' },
    ]) {
      const mutated = {
        ...packs,
        packs: {
          'static-quality': {
            description: 'lint and typecheck',
            gate_ids: ['lint'],
            ...extra,
          },
        },
      }
      expect(VerificationPacks.safeParse(mutated).success).toBe(false)
    }
  })

  it('pack identity is the record key — invalid identities refuse', () => {
    const bad = {
      ...packs,
      packs: { 'Not Valid': { description: 'x', gate_ids: ['lint'] } },
    }
    expect(VerificationPacks.safeParse(bad).success).toBe(false)
  })
})

describe('launch assertion (C-ADV-001)', () => {
  const assertion = {
    contract_id: 'launch-assertion' as const,
    contract_version: '1.0.0' as const,
    argv: ['run', '--profile', 'home-status-read@1.0.0'],
    argv_digest: `sha256:${'b'.repeat(64)}`,
    environment_names: ['RUN_TOKEN'],
    credentials: [{ env_var: 'RUN_TOKEN' }],
    contains_secret_values: false as const,
  }

  it('validates a data-only assertion', () => {
    expect(LaunchAssertion.safeParse(assertion).success).toBe(true)
  })

  it('a secret-bearing assertion cannot exist (secret-presence admits only false)', () => {
    expect(LaunchAssertion.safeParse({ ...assertion, contains_secret_values: true }).success).toBe(
      false,
    )
  })

  it('no designated credential-value slot exists — value-shaped payloads refuse', () => {
    for (const bad of [
      { ...assertion, credentials: [{ env_var: 'RUN_TOKEN', value: 'hunter2' }] },
      { ...assertion, credential_values: ['hunter2'] },
      { ...assertion, credentials: [{ value: 'gho_abcdefghijklmnop' }] },
    ]) {
      expect(LaunchAssertion.safeParse(bad).success).toBe(false)
    }
  })

  it('environment entries are NAMES, never values', () => {
    expect(
      LaunchAssertion.safeParse({
        ...assertion,
        environment_names: ['RUN_TOKEN=gho_abcdefghijklmnop'],
      }).success,
    ).toBe(false)
  })
})
