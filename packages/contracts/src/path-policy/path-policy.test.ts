/** C-EX-001 fixtures for the path policy: declarative data only. */
import { describe, expect, it } from 'vitest'
import { PathPolicy } from './path-policy.js'

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
