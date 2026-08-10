/**
 * Path policy (capability `runner-verification`): repository-declared data
 * consumed by a neutral engine. Shapes only — enforcement is L3.
 *
 * Version 2.0.0 (runner-contract-corrections D1): prohibited rules are
 * TYPED structured rules with a closed, platform-owned kind vocabulary —
 * never opaque strings whose meaning a consumer must invent. The initial
 * vocabulary is exactly one kind, `path_prefix`; extending the rule
 * language is a new kind in a new contract version, never a
 * reinterpretation of existing rule data.
 */
import { z } from 'zod'
import { SemVer } from '../primitives/index.js'

export const PATH_POLICY_ID = 'path-policy' as const
export const PATH_POLICY_VERSION = '2.0.0' as const

/**
 * A normalized repository-relative path prefix, structurally: no leading
 * `/`, no scheme, no wildcard, and no `.`/`..` segment (the pattern
 * excludes dot-only segments positionally, so a traversal segment is
 * unrepresentable rather than merely refused at runtime). The pattern
 * survives into the generated JSON Schema.
 */
export const RelativePathPrefix = z
  .string()
  .regex(
    /^(?!\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9._-]+)*$/,
    'normalized repository-relative path prefix',
  )

/** One prohibited-path rule; the kind vocabulary is closed. */
export const ProhibitedPathRule = z.strictObject({
  kind: z.literal('path_prefix'),
  prefix: RelativePathPrefix,
})

export const PathPolicy = z.strictObject({
  contract_id: z.literal(PATH_POLICY_ID),
  contract_version: z.literal(PATH_POLICY_VERSION),
  allowed_write_roots: z.array(z.string().min(1)),
  prohibited_rules: z.array(ProhibitedPathRule),
  max_files: z.int().positive(),
  max_total_bytes: z.int().positive(),
  max_file_bytes: z.int().positive(),
})

export type ProhibitedPathRuleT = z.infer<typeof ProhibitedPathRule>
export type PathPolicyT = z.infer<typeof PathPolicy>

SemVer.parse(PATH_POLICY_VERSION)
