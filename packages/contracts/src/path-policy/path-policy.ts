/**
 * Path policy (capability `runner-verification`): repository-declared data
 * consumed by a neutral engine. Shapes only — enforcement is L3.
 */
import { z } from 'zod'
import { SemVer } from '../primitives/index.js'

export const PATH_POLICY_ID = 'path-policy' as const
export const PATH_POLICY_VERSION = '1.0.0' as const

export const PathPolicy = z.strictObject({
  contract_id: z.literal(PATH_POLICY_ID),
  contract_version: z.literal(PATH_POLICY_VERSION),
  allowed_write_roots: z.array(z.string().min(1)),
  prohibited_rules: z.array(z.string().min(1)),
  max_files: z.int().positive(),
  max_total_bytes: z.int().positive(),
  max_file_bytes: z.int().positive(),
})

export type PathPolicyT = z.infer<typeof PathPolicy>

SemVer.parse(PATH_POLICY_VERSION)
