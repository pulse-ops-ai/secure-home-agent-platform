/**
 * Writes this package's generated JSON Schema into the repository's
 * `schemas/` tree. Output only — the identity ledger is authored by hand
 * and NEVER written here: regeneration must not be able to heal an
 * identity violation (design D5).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateArtifacts } from '../generation.js'

const main = async (): Promise<void> => {
  const here = dirname(fileURLToPath(import.meta.url))
  const schemasRoot = resolve(here, '../../../../schemas')
  for (const [relPath, content] of await generateArtifacts()) {
    const target = resolve(schemasRoot, relPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

await main()
