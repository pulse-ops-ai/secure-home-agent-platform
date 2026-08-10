/**
 * C-ADV-001 and the C-MUT-004 kill for the launch assertion: a
 * secret-bearing assertion is unrepresentable, never redacted.
 */
import { describe, expect, it } from 'vitest'
import { LaunchAssertion } from './launch-assertion.js'

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
