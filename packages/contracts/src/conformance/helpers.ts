/**
 * Shared fixtures for the corpus-conformance suites: repository roots,
 * digesting, the committed-schema walk, the current ledger, and the
 * structural-position walker behind the neutrality and slot scans.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Ledger } from '../schema/ledger-history.js'

const here = dirname(fileURLToPath(import.meta.url))
export const repoRoot = resolve(here, '../../../..')
export const schemasRoot = join(repoRoot, 'schemas')

export const digest = (content: string): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`

export const committedSchemas = (): ReadonlyMap<string, string> => {
  const out = new Map<string, string>()
  for (const dir of readdirSync(schemasRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    for (const file of readdirSync(join(schemasRoot, dir.name))) {
      if (!file.endsWith('.json')) continue
      out.set(`${dir.name}/${file}`, readFileSync(join(schemasRoot, dir.name, file), 'utf8'))
    }
  }
  return out
}

export const currentLedger = (): Ledger =>
  (
    JSON.parse(readFileSync(join(schemasRoot, 'identity-ledger.json'), 'utf8')) as {
      entries: Ledger
    }
  ).entries

export const FORBIDDEN_STRUCTURAL_NAMES = [
  'claude',
  'copilot',
  'codex',
  'anthropic',
  'openai',
  'langgraph',
  'pydantic',
  'docker',
  'containerd',
  'kata',
  'runc',
  'gvisor',
]

export const structuralStrings = (node: unknown, out: string[]): void => {
  if (Array.isArray(node)) {
    for (const item of node) structuralStrings(item, out)
    return
  }
  if (node === null || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  for (const [key, value] of Object.entries(record)) {
    if (key === 'properties' || key === '$defs') {
      out.push(...Object.keys(value as Record<string, unknown>))
    }
    if (key === 'enum' && Array.isArray(value)) {
      out.push(...value.filter((v): v is string => typeof v === 'string'))
    }
    if (key === 'const' && typeof value === 'string') out.push(value)
    structuralStrings(value, out)
  }
}
