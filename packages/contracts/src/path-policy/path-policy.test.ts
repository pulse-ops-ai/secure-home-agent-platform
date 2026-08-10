/**
 * C-EX-001 fixtures for the path policy, plus the corrections proof net:
 * CC-EX-01 / CC-ADV-02 (an untyped, unknown-kind, or non-normalized rule
 * form is unrepresentable — CC-MUT-01 kill) and CC-EX-03 (the structural
 * prefix constraint survives into the generated JSON Schema).
 */
import { describe, expect, it } from 'vitest'
import { generateArtifacts } from '../schema/generation.js'
import { PathPolicy } from './path-policy.js'

const policy = () => ({
  contract_id: 'path-policy' as const,
  contract_version: '2.0.0' as const,
  allowed_write_roots: ['packages', 'services'],
  prohibited_rules: [
    { kind: 'path_prefix' as const, prefix: '.git' },
    { kind: 'path_prefix' as const, prefix: 'schemas/identity-ledger.json' },
  ],
  max_files: 64,
  max_total_bytes: 1_000_000,
  max_file_bytes: 200_000,
})

describe('path policy v2 (C-EX-001, CC-EX-01)', () => {
  it('validates typed prefix rules and refuses unknown keys', () => {
    expect(PathPolicy.safeParse(policy()).success).toBe(true)
    expect(PathPolicy.safeParse({ ...policy(), executable: 'sh' }).success).toBe(false)
  })

  it('the superseded untyped rule form no longer validates', () => {
    expect(
      PathPolicy.safeParse({
        ...policy(),
        contract_version: '1.0.0',
        prohibited_rules: ['.git/', '*.pem'],
      }).success,
    ).toBe(false)
    expect(PathPolicy.safeParse({ ...policy(), prohibited_rules: ['.git'] }).success).toBe(false)
  })

  it('an unknown rule kind is unrepresentable', () => {
    for (const bad of [
      { kind: 'glob', prefix: 'docs' },
      { kind: 'regex', prefix: '^docs$' },
      { prefix: 'docs' },
    ]) {
      expect(PathPolicy.safeParse({ ...policy(), prohibited_rules: [bad] }).success).toBe(false)
    }
  })

  it('non-normalized prefixes are unrepresentable (CC-ADV-02, CC-MUT-01 kill)', () => {
    for (const prefix of [
      '*.pem',
      'docs/*',
      'what?.md',
      '../escape',
      'a/../b',
      'a/..',
      '.',
      '..',
      './docs',
      '/etc/passwd',
      'file:secrets',
      'https://evil.example',
      '',
      'a//b',
      'docs/',
    ]) {
      expect(
        PathPolicy.safeParse({
          ...policy(),
          prohibited_rules: [{ kind: 'path_prefix', prefix }],
        }).success,
        `prefix ${JSON.stringify(prefix)} must be unrepresentable`,
      ).toBe(false)
    }
  })

  it('dot-carrying but normalized segments remain representable', () => {
    for (const prefix of ['.git', '.github/workflows', 'docs/a.b.c', '..a', 'a.', 'x/.env']) {
      expect(
        PathPolicy.safeParse({
          ...policy(),
          prohibited_rules: [{ kind: 'path_prefix', prefix }],
        }).success,
        `prefix ${JSON.stringify(prefix)} must be representable`,
      ).toBe(true)
    }
  })

  it('the structural constraint survives generation (CC-EX-03)', async () => {
    const artifacts = await generateArtifacts()
    const schema = JSON.parse(artifacts.get('path-policy/2.0.0.json') ?? '{}') as {
      properties: {
        prohibited_rules: {
          items: { properties: { kind: Record<string, unknown>; prefix: Record<string, unknown> } }
        }
      }
    }
    const rule = schema.properties.prohibited_rules.items.properties
    expect(rule.kind['const']).toBe('path_prefix')
    expect(typeof rule.prefix['pattern']).toBe('string')
    expect(rule.prefix['pattern']).toContain('(?!')
  })

  it('the superseded 1.0.0 artifact is still generated (CC-EX-04 half)', async () => {
    const artifacts = await generateArtifacts()
    expect(artifacts.get('path-policy/1.0.0.json')).toBeDefined()
    expect(artifacts.get('path-policy/2.0.0.json')).toBeDefined()
  })
})
