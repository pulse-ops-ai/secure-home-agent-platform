/**
 * Gate registry and gate results (capability `runner-verification`).
 *
 * A gate is an exact executable plus argv array — never a shell string —
 * and its network field admits only "none": a networked gate is
 * inexpressible. Dispositions are the closed vocabulary
 * PASS | FAIL | SKIP_OK | SKIP_ENV; truncation is FAIL with a reason; a
 * duplicate gate identity is invalid at validation (the authored Zod
 * schemas are the parse authority — JSON Schema cannot express
 * unique-by-key, so generation uses the structural base).
 */
import { z } from 'zod'
import { GateId, SemVer } from './primitives.js'

export const GATE_REGISTRY_ID = 'gate-registry' as const
export const GATE_REGISTRY_VERSION = '1.0.0' as const

export const GateDefinition = z.strictObject({
  id: GateId,
  executable: z.string().min(1),
  args: z.array(z.string()),
  timeout_seconds: z.int().positive(),
  max_output_bytes: z.int().positive(),
  environment_names: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'environment-variable name')),
  network: z.literal('none'),
})

/** Structural base — what generation projects to JSON Schema. */
export const GateRegistryBase = z.strictObject({
  contract_id: z.literal(GATE_REGISTRY_ID),
  contract_version: z.literal(GATE_REGISTRY_VERSION),
  gates: z.array(GateDefinition),
})

const uniqueBy = <T>(
  items: readonly T[],
  key: (item: T) => string,
  ctx: z.core.$RefinementCtx,
  path: string,
): void => {
  const seen = new Set<string>()
  for (const [index, item] of items.entries()) {
    const k = key(item)
    if (seen.has(k)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate gate identity: ${k}`,
        path: [path, index],
      })
    }
    seen.add(k)
  }
}

/** Parse authority: structural base plus identity-uniqueness refinement. */
export const GateRegistry = GateRegistryBase.superRefine((value, ctx) => {
  uniqueBy(value.gates, (gate) => gate.id, ctx, 'gates')
})

/** Closed disposition vocabulary — platform-owned. */
export const GateDisposition = z.enum(['PASS', 'FAIL', 'SKIP_OK', 'SKIP_ENV'])

const GateResultShape = z.strictObject({
  gate_id: GateId,
  disposition: GateDisposition,
  reason: z.string().min(1).optional(),
  truncated: z.boolean(),
})

/** Truncated or incomplete output is FAIL with the reason recorded. */
export const GateResult = GateResultShape.superRefine((value, ctx) => {
  if (value.truncated && value.disposition !== 'FAIL') {
    ctx.addIssue({
      code: 'custom',
      message: 'truncated output must classify as FAIL',
      path: ['disposition'],
    })
  }
  if (value.truncated && value.reason === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'truncation requires an explicit reason',
      path: ['reason'],
    })
  }
  if (value.disposition === 'FAIL' && value.reason === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'FAIL requires an explicit reason',
      path: ['reason'],
    })
  }
})

export const GateResultSetBase = z.strictObject({
  results: z.array(GateResultShape),
})

/** Exactly one terminal disposition per gate identity per run. */
export const GateResultSet = GateResultSetBase.superRefine((value, ctx) => {
  const seen = new Set<string>()
  for (const [index, result] of value.results.entries()) {
    if (seen.has(result.gate_id)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate gate identity: ${result.gate_id}`,
        path: ['results', index],
      })
    }
    seen.add(result.gate_id)
  }
})

export type GateDefinitionT = z.infer<typeof GateDefinition>
export type GateRegistryT = z.infer<typeof GateRegistry>
export type GateDispositionT = z.infer<typeof GateDisposition>
export type GateResultT = z.infer<typeof GateResult>

SemVer.parse(GATE_REGISTRY_VERSION)
