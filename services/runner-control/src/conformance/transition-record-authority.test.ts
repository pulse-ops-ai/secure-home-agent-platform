/**
 * RO-EX-92: the transition record has ONE authority.
 *
 * `runner-lifecycle` requires every declared transition to land in the
 * run's transition record — an orchestration-owned durable record
 * distinct from the L2 event stream — and design D9 assigns that job to
 * `RunJournalPort`, appended as the walk happens.
 *
 * `EvidenceSinkPort` nonetheless still declared a third record shape:
 *
 *     { kind: 'transition_record'; transitions: unknown }
 *
 * Nothing wrote it. `conclude()` says in as many words that it no longer
 * duplicates a transition record into the evidence sink, because a
 * record written after the seal made the seal not the run's last write.
 * What survived was the SHAPE — a second declared authority for a
 * concept that has one owner, kept alive only by the helpers that
 * filtered it back out.
 *
 * Two authorities for one concept is how they drift: the next writer
 * picks whichever they find first, and a reader has to know to consult
 * both. The contract requires the record, not the sink kind, so the kind
 * goes.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import { runRequest, testPorts } from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'
const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(resolve(here, '..'))

const productionSources = (): readonly string[] => {
  const out: string[] = []
  for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    if (entry.name.endsWith('.test.ts')) continue
    if (entry.name === 'testing-fixtures.ts') continue
    out.push(join(entry.parentPath, entry.name))
  }
  return out
}

describe('RO-EX-92: only the journal is the transition record', () => {
  it('no production module declares a transition_record sink shape', () => {
    // Scanned with comments and string literals removed. `ports/index.ts`
    // deliberately DOCUMENTS why the shape is absent and where the
    // record actually lives — a raw-text scan would make that honest
    // explanation the failure, and teach the next person to delete the
    // explanation rather than keep the property.
    const code = (file: string): string =>
      readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')

    for (const file of productionSources()) {
      expect(
        code(file).includes('transition_record'),
        `${file} keeps a second authority for the transition record`,
      ).toBe(false)
    }
  })

  it('the journal holds the whole walk', () => {
    // The concept must survive the cleanup. Deleting the sink shape is
    // only correct because the requirement is met somewhere else, and
    // this is where.
    expect(readFileSync(join(srcRoot, 'run-state/ports.ts'), 'utf8')).toContain('appendTransition')
  })

  it('a completed run journals its walk and writes only governed records', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled?.transitions).toHaveLength(7)

    // And the evidence sink holds ONLY the governed shape — no
    // filtering required, because nothing else can be written to it.
    const kinds = ports.evidence.all.filter((write) => write.run_id === RUN).map((w) => w.kind)
    expect(kinds).toEqual(['evidence_bundle'])
  })
})
