/**
 * The wire boundary is CLOSED: unknown keys refused at every level,
 * types checked, credential references validated as names. A malformed
 * invocation is a refusal value, never an exception (PA-INV-04/05,
 * PA-ADV-06).
 */
import { describe, expect, it } from 'vitest'
import { parseWireInvocation } from './spi.js'
import { validInvocation } from './test-fixtures.js'

const asJson = (mutate: (invocation: Record<string, unknown>) => void): string => {
  const invocation = JSON.parse(JSON.stringify(validInvocation())) as Record<string, unknown>
  mutate(invocation)
  return JSON.stringify(invocation)
}

describe('parseWireInvocation', () => {
  it('accepts the canonical invocation', () => {
    const parsed = parseWireInvocation(JSON.stringify(validInvocation()))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.invocation.adapter).toBe('claude-code')
      expect(parsed.invocation.grant.tools).toEqual(['Read', 'Grep'])
    }
  })

  it('refuses bytes that are not JSON, without throwing', () => {
    const parsed = parseWireInvocation('not json {')
    expect(parsed).toEqual({ ok: false, refusal: 'invocation is not valid JSON' })
  })

  it('refuses a non-object document', () => {
    expect(parseWireInvocation('[1,2]').ok).toBe(false)
    expect(parseWireInvocation('"task"').ok).toBe(false)
    expect(parseWireInvocation('null').ok).toBe(false)
  })

  it.each(['image', 'argv', 'mount_path', 'launcher'])(
    'refuses a smuggled substrate concern: top-level "%s"',
    (key) => {
      const parsed = parseWireInvocation(asJson((invocation) => (invocation[key] = 'x')))
      expect(parsed).toEqual({ ok: false, refusal: `invocation carries unknown key "${key}"` })
    },
  )

  it('refuses unknown keys in nested positions', () => {
    for (const mutate of [
      (i: Record<string, unknown>) => {
        ;(i['profile'] as Record<string, unknown>)['image'] = 'sneaky'
      },
      (i: Record<string, unknown>) => {
        ;(i['grant'] as Record<string, unknown>)['sudo'] = true
      },
      (i: Record<string, unknown>) => {
        ;(i['limits'] as Record<string, unknown>)['network'] = 'open'
      },
      (i: Record<string, unknown>) => {
        ;(i['workspace'] as Record<string, unknown>)['host_path'] = '/'
      },
    ]) {
      const parsed = parseWireInvocation(asJson(mutate))
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.refusal).toContain('unknown key')
    }
  })

  it.each([
    'run_id',
    'generation',
    'adapter',
    'profile',
    'input',
    'grant',
    'routing',
    'limits',
    'credentials',
    'workspace',
  ])('refuses a missing required key: %s', (key) => {
    const parsed = parseWireInvocation(asJson((invocation) => delete invocation[key]))
    expect(parsed).toEqual({
      ok: false,
      refusal: `invocation is missing required key "${key}"`,
    })
  })

  it('refuses a credential reference that is not an env-var NAME', () => {
    for (const bad of ['lower_case', '1LEADING', 'WITH-DASH', 'ghp_abc123', '']) {
      const parsed = parseWireInvocation(
        asJson((invocation) => {
          invocation['credentials'] = [{ env_var: bad }]
        }),
      )
      expect(parsed.ok).toBe(false)
      if (!parsed.ok) expect(parsed.refusal).toContain('env_var')
    }
  })

  it('refuses a credential entry with a value-shaped extra field', () => {
    const parsed = parseWireInvocation(
      asJson((invocation) => {
        invocation['credentials'] = [{ env_var: 'TOKEN_REF', value: 'secret' }]
      }),
    )
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.refusal).toContain('unknown key "value"')
  })

  it('refuses an open network default', () => {
    const parsed = parseWireInvocation(
      asJson((invocation) => {
        ;((invocation['grant'] as Record<string, unknown>)['network'] as Record<string, unknown>)[
          'default'
        ] = 'allow'
      }),
    )
    expect(parsed).toEqual({ ok: false, refusal: 'grant.network.default admits only "deny"' })
  })

  it('refuses an out-of-vocabulary mount posture and a relative mount path', () => {
    for (const mount of [
      { path: '/workspace', posture: 'read_write_execute' },
      { path: 'workspace', posture: 'read_only' },
    ]) {
      const parsed = parseWireInvocation(
        asJson((invocation) => {
          ;(invocation['grant'] as Record<string, unknown>)['mounts'] = [mount]
        }),
      )
      expect(parsed.ok).toBe(false)
    }
  })

  it('refuses an input kind outside the vocabulary and non-string parameters', () => {
    expect(
      parseWireInvocation(
        asJson((invocation) => {
          ;(invocation['input'] as Record<string, unknown>)['kind'] = 'shell'
        }),
      ).ok,
    ).toBe(false)
    expect(
      parseWireInvocation(
        asJson((invocation) => {
          ;(invocation['input'] as Record<string, unknown>)['parameters'] = { depth: 3 }
        }),
      ).ok,
    ).toBe(false)
  })

  it('refuses non-positive limits', () => {
    for (const key of ['wall_clock_seconds', 'output_bytes', 'pids']) {
      const parsed = parseWireInvocation(
        asJson((invocation) => {
          ;(invocation['limits'] as Record<string, unknown>)[key] = 0
        }),
      )
      expect(parsed).toEqual({ ok: false, refusal: `limits.${key} must be a positive number` })
    }
  })
})
