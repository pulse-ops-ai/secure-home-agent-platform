/**
 * C-EX-004: the L2 contracts are inert — no production consumer outside
 * the contract layer (`packages/contracts`, `packages/events`) declares a
 * runtime dependency on them. Consumption begins at L3+, each landing
 * under its own authorization.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './helpers.js'

describe('inertness (C-EX-004)', () => {
  it('no production consumer outside the contract layer or its authorized consumers imports the contracts', () => {
    // packages/runner-core is the AUTHORIZED first consumer (L3/#52,
    // runner-core change; owner-approved allowlist amendment 2026-08-10
    // under #51+#52 jointly — the ratified "inert contract × first
    // consumer arrives" transition). Any OTHER importer still fails.
    const layer = new Set(['packages/contracts', 'packages/events', 'packages/runner-core'])
    const offenders: string[] = []
    for (const group of ['packages', 'services', 'apps']) {
      const groupDir = join(repoRoot, group)
      for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const memberDir = `${group}/${entry.name}`
        let manifest: Record<string, unknown>
        try {
          manifest = JSON.parse(
            readFileSync(join(groupDir, entry.name, 'package.json'), 'utf8'),
          ) as Record<string, unknown>
        } catch {
          continue
        }
        const runtimeDeps = Object.keys(
          (manifest['dependencies'] as Record<string, string> | undefined) ?? {},
        )
        const touches = runtimeDeps.some(
          (dep) => dep === '@secure-home/contracts' || dep === '@secure-home/events',
        )
        if (touches && !layer.has(memberDir)) offenders.push(memberDir)
      }
    }
    expect(offenders).toEqual([])
  })
})
