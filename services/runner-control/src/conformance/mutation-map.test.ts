/**
 * The mutation-target map (task 7.3).
 *
 * The map is itself a test, and it FAILS WHEN A REGISTERED TARGET IS
 * ABSENT FROM THE SWEEP rather than passing over a shorter list. That
 * distinction is the whole value: `RO-MUT-06` and `RO-MUT-07` were both
 * minted and both silently missing from an earlier sweep that named
 * `RO-MUT-01…05` and passed. A checklist that cannot notice its own gaps
 * certifies whatever it happens to contain.
 *
 * Each target names the mutation and the proof that kills it. The proof
 * must exist in this package's test corpus — a target pointing at a test
 * nobody wrote is exactly the gap this map exists to expose.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface MutationTarget {
  readonly id: string
  /** The behaviour a mutant would remove. */
  readonly mutation: string
  /** The proof identifiers whose failure signals the kill. */
  readonly killedBy: readonly string[]
}

/**
 * Every mutation target this landing registers. Adding a target here
 * without a proof that names it fails the map — which is the point.
 */
const TARGETS: readonly MutationTarget[] = [
  {
    id: 'RO-MUT-01',
    mutation: 'remove per-epoch token consumption so a source can be re-read',
    killedBy: ['RO-EX-04', 'RO-PROP-01'],
  },
  {
    id: 'RO-MUT-02',
    mutation: 'drop the outstanding-write check so the seal is no longer last',
    killedBy: ['RO-ADV-03'],
  },
  {
    id: 'RO-MUT-03',
    mutation: 'treat consent as satisfying eligibility, so a run spends without a core decision',
    killedBy: ['RO-ADV-01', 'RO-EX-05'],
  },
  {
    id: 'RO-MUT-04',
    mutation: 'accept caller-supplied argv in the scheduling interface',
    killedBy: ['ADV-006'],
  },
  {
    id: 'RO-MUT-05',
    mutation: 'fabricate an evidence bundle for a run that terminated in REQUESTED',
    killedBy: ['RO-ADV-07'],
  },
  {
    id: 'RO-MUT-06',
    mutation: 'source the requester from a captured profile instead of the run request',
    killedBy: ['RO-EX-08', 'RO-ADV-08'],
  },
  {
    id: 'RO-MUT-07',
    mutation:
      'replace a run_id-keyed structure with an unkeyed field, or drop the run_id from a port call',
    killedBy: ['RO-EX-09', 'RO-PROP-04'],
  },
  {
    id: 'RO-MUT-08',
    mutation: 'accept a captured profile without comparing its identity to the requested reference',
    killedBy: ['RO-EX-10'],
  },
  {
    id: 'RO-MUT-09',
    mutation: "ignore the consent record's run_id, making a past grant replayable",
    killedBy: ['RO-EX-11'],
  },
  {
    id: 'RO-MUT-10',
    mutation: 'move the base-identity assertion after the adapter invocation, or remove it',
    killedBy: ['RO-EX-13'],
  },
  {
    id: 'RO-MUT-11',
    mutation: 'discard the verification epoch values instead of verifying with them',
    killedBy: ['RO-EX-14'],
  },
  {
    id: 'RO-MUT-12',
    mutation: 'take the terminal transition before the seal, or emit the terminal event after it',
    killedBy: ['RO-EX-12', 'RO-EX-16'],
  },
  {
    id: 'RO-MUT-13',
    mutation: "discard the adapter's reported calls so they reach neither events nor evidence",
    killedBy: ['RO-EX-15'],
  },
  {
    id: 'RO-MUT-14',
    mutation: 'record EVIDENCE_SEALED before the write succeeds',
    killedBy: ['RO-EX-17'],
  },
  {
    id: 'RO-MUT-15',
    mutation: 'pass a refused capture onward as a snapshot',
    killedBy: ['RO-EX-18'],
  },
  {
    id: 'RO-MUT-16',
    mutation: 'collapse the refusal and operational variants at the evidence boundary',
    killedBy: ['RO-EX-19'],
  },
  {
    id: 'RO-MUT-17',
    mutation: 'digest sizes instead of content, or decide containment lexically',
    killedBy: ['RO-EX-20'],
  },
  {
    id: 'RO-MUT-18',
    mutation: 'remove the port-exception containment so run() can reject',
    killedBy: ['RO-EX-21'],
  },
  {
    id: 'RO-MUT-19',
    mutation: 'drop the verification-boundary cancellation check',
    killedBy: ['RO-EX-22'],
  },
  {
    id: 'RO-MUT-20',
    mutation: 'record the requester as the evidence principal',
    killedBy: ['RO-EX-23'],
  },
  {
    id: 'RO-MUT-21',
    mutation: 'keep the transition record in memory only',
    killedBy: ['RO-EX-25'],
  },
  {
    id: 'RO-MUT-22',
    mutation: "validate only the claim's version, not its run",
    killedBy: ['RO-EX-26'],
  },
  {
    id: 'RO-MUT-23',
    mutation: 'spread the caller body after the envelope fields',
    killedBy: ['RO-EX-27'],
  },
  {
    id: 'RO-MUT-24',
    mutation: "ignore a rejected transition and run the next phase's effects anyway",
    killedBy: ['RO-EX-28', 'RO-EX-29', 'RO-EX-31'],
  },
  {
    id: 'RO-MUT-25',
    mutation: 'batch the journal into a single write at conclusion',
    killedBy: ['RO-EX-32'],
  },
  {
    id: 'RO-MUT-26',
    mutation: 'claim the run lease and then not enforce it',
    killedBy: ['RO-EX-34'],
  },
  {
    id: 'RO-MUT-27',
    mutation: 'publish a staged record before the commit marker',
    killedBy: ['RO-EX-38', 'RO-EX-43', 'RO-EX-78', 'RO-EX-79', 'RO-EX-82'],
  },
  {
    id: 'RO-MUT-28',
    mutation: 'emit the terminal event before the commit, binding it to an intention',
    killedBy: ['RO-EX-38', 'RO-EX-39'],
  },
  {
    id: 'RO-MUT-29',
    mutation: "trust the provider's self-reported outcome over a contradicting observation",
    killedBy: ['RO-EX-46'],
  },
  {
    id: 'RO-MUT-30',
    mutation: 'admit a credential value field on the adapter invocation',
    killedBy: ['RO-EX-45'],
  },
  {
    id: 'RO-MUT-31',
    mutation: 'earn commit_spend on consent alone, without opening a session',
    killedBy: ['RO-EX-51'],
  },
  {
    id: 'RO-MUT-32',
    mutation: 'hand the abort signal over without racing it — advisory cancellation',
    killedBy: ['RO-EX-53', 'RO-EX-54', 'RO-EX-55'],
  },
  {
    id: 'RO-MUT-33',
    mutation: 'label every observed file modified instead of diffing the baseline',
    killedBy: ['RO-EX-58'],
  },
  {
    id: 'RO-MUT-34',
    mutation: 'digest observations as text instead of raw bytes',
    killedBy: ['RO-EX-59'],
  },
  {
    id: 'RO-MUT-35',
    mutation: 'use stat instead of lstat, so a symlink reads as a regular file',
    killedBy: ['RO-EX-60', 'RO-EX-61'],
  },
  {
    id: 'RO-MUT-36',
    mutation: 'omit one participant from the commit by staging it under a different commit id',
    killedBy: ['RO-EX-65', 'RO-EX-78', 'RO-EX-82'],
  },
  {
    id: 'RO-MUT-37',
    mutation: 'terminate a lost-lease run by writing its terminal record',
    killedBy: ['RO-EX-66'],
  },
  {
    id: 'RO-MUT-38',
    mutation: 'advance the journal cursor before the append lands',
    killedBy: ['RO-EX-67'],
  },
  {
    id: 'RO-MUT-39',
    mutation: 'make a reader ignore commit visibility, or add a second publication site',
    killedBy: ['RO-EX-71', 'RO-EX-79', 'RO-EX-80', 'RO-EX-82'],
  },
  {
    id: 'RO-MUT-40',
    mutation: 'apply changes back without asking the core to decide materialization',
    killedBy: ['RO-EX-72', 'RO-EX-73'],
  },
  {
    id: 'RO-MUT-41',
    mutation: 'seal COMPLETED after an apply-back that failed',
    killedBy: ['RO-EX-74'],
  },
  {
    id: 'RO-MUT-42',
    mutation:
      'drop the final ownership check at the commit marker, so a lease that moved after the last staging check still publishes',
    killedBy: ['RO-EX-84'],
  },
  {
    id: 'RO-MUT-43',
    mutation:
      'recover through a fresh RunMachine, so a run that reached RUNNING reports one invented transition from REQUESTED',
    killedBy: ['RO-EX-85'],
  },
  {
    id: 'RO-MUT-44',
    mutation: 'skip resource release on the exception path, leaking the workspace and the deadline',
    killedBy: ['RO-EX-87'],
  },
  {
    id: 'RO-MUT-45',
    mutation:
      'write the early-terminal record unconditionally, describing a run that held authority as one that never had any',
    killedBy: ['RO-EX-86'],
  },
  {
    id: 'RO-MUT-46',
    mutation:
      'apply a failure terminal without checking the machine, so a refused terminal concludes the run in a progress state',
    killedBy: ['RO-EX-88', 'RO-EX-89'],
  },
  {
    id: 'RO-MUT-47',
    mutation:
      'reimplement provider terminal classification locally in orchestration, under any function name',
    killedBy: ['RO-EX-90'],
  },
  {
    id: 'RO-MUT-48',
    mutation:
      'restore the transition_record shape to the evidence sink, giving the walk a second declared authority',
    killedBy: ['RO-EX-92'],
  },
  {
    id: 'RO-MUT-49',
    mutation:
      'reintroduce a definite-assignment assertion, or let a phase reach state it has not earned',
    killedBy: ['RO-EX-94'],
  },
  {
    id: 'RO-MUT-50',
    mutation:
      'accept a caller-supplied transition table unvalidated, or arm the deadline from the session-reported value',
    killedBy: ['RO-EX-96'],
  },
  {
    id: 'RO-MUT-51',
    mutation:
      'remove a boundary cancellation check, or terminate a cancelled run with an open session via finish rather than abortRun',
    killedBy: ['RO-EX-97'],
  },
  {
    id: 'RO-MUT-52',
    mutation:
      'halt on a lost lease but not on a fence refusal, so a dispossessed run spends anyway',
    killedBy: ['RO-EX-99', 'RO-EX-100'],
  },
  {
    id: 'RO-MUT-53',
    mutation:
      'mutate the machine through an entry point the owner does not expose, or narrow an escape scan to one syntactic form',
    killedBy: ['RO-EX-103'],
  },
  {
    id: 'RO-MUT-54',
    mutation:
      "return the caller's table from validation, or validate through a narrower key view than declaredNext reads",
    killedBy: ['RO-EX-106'],
  },
  {
    id: 'RO-MUT-55',
    mutation: 'accept an unprojected entry list in commitProjected',
    killedBy: ['RO-EX-107'],
  },
  {
    id: 'RO-MUT-56',
    mutation: 'bind a commit capability by identity alone — unfrozen entries, or no version check',
    killedBy: ['RO-EX-115'],
  },
  {
    id: 'RO-MUT-57',
    mutation: 'leave the canonical transition table mutable while freezing only supplied ones',
    killedBy: ['RO-EX-116'],
  },
  {
    id: 'RO-MUT-58',
    mutation: 'guard only named call sites rather than the complete port surface',
    killedBy: ['RO-EX-118'],
  },
  {
    id: 'RO-MUT-59',
    mutation:
      "add the profile's wall clock alongside the acquisition budget instead of replacing it",
    killedBy: ['RO-EX-119'],
  },
  {
    id: 'RO-MUT-60',
    mutation: "poll the caller's interrupt only between phases, never during a call",
    killedBy: ['RO-EX-120'],
  },
  {
    id: 'RO-MUT-61',
    mutation: 'prove a structural guard by scanning its own source text',
    killedBy: ['RO-EX-121'],
  },
  {
    id: 'RO-MUT-62',
    mutation: 'apply workspace changes back before the fence is consulted',
    killedBy: ['RO-EX-122'],
  },
  {
    id: 'RO-MUT-63',
    mutation:
      'take an already-created promise instead of a thunk, so the effect starts before the abort check',
    killedBy: ['RO-EX-123'],
  },
  {
    id: 'RO-MUT-64',
    mutation: 'return a mutable twin of the frozen projection',
    killedBy: ['RO-EX-124'],
  },
  {
    id: 'RO-MUT-65',
    mutation: "trust a caller's interrupt reason instead of coercing it to cancellation",
    killedBy: ['RO-EX-125'],
  },
  {
    id: 'RO-MUT-66',
    mutation:
      'abandon an aborted walk immediately, so its record depends on which interrupt arrived',
    killedBy: ['RO-EX-127'],
  },
  {
    id: 'RO-MUT-67',
    mutation: 'prove the typestate with a runtime count alone, with no compile-fail fixture',
    killedBy: ['RO-EX-128'],
  },
  {
    id: 'RO-MUT-68',
    mutation: 'race and abandon the whole walk instead of rejecting the awaited port call',
    killedBy: ['RO-EX-129'],
  },
  {
    id: 'RO-MUT-69',
    mutation: 'omit bounded terminal settlement so interrupted records depend on port latency',
    killedBy: ['RO-EX-130'],
  },
  {
    id: 'RO-MUT-70',
    mutation: 'guard only named provider/gate calls rather than the complete port surface',
    killedBy: ['RO-EX-131'],
  },
  {
    id: 'RO-MUT-71',
    mutation: 'start the next effect in a phase after the run has aborted',
    killedBy: ['RO-EX-132'],
  },
  {
    id: 'RO-MUT-72',
    mutation: 'leave ownership acquisition or resource cleanup outside every finite boundary',
    killedBy: ['RO-EX-133'],
  },
  {
    id: 'RO-MUT-73',
    mutation: 'restart the profile clock or let the proof override widen acquisition',
    killedBy: ['RO-EX-134'],
  },
  {
    id: 'RO-MUT-74',
    mutation:
      'use settlement expiry as timeout provenance, or disable interruption during non-terminal finalization',
    killedBy: ['RO-EX-135'],
  },
  {
    id: 'RO-MUT-75',
    mutation:
      'retain mutable transition or rejection entries at mint or across the journal boundary',
    killedBy: ['RO-EX-136'],
  },
  {
    id: 'RO-MUT-76',
    mutation: 'let a throwing public cancellation probe escape from the polling timer',
    killedBy: ['RO-EX-137'],
  },
  {
    id: 'RO-MUT-77',
    mutation: 'start lease claim before the guard or let an aborted attempt become ownership',
    killedBy: ['RO-EX-138'],
  },
  {
    id: 'RO-MUT-78',
    mutation:
      'recover after authority capture without a full bundle, or bypass the finite recovery boundary',
    killedBy: ['RO-EX-139'],
  },
  {
    id: 'RO-MUT-79',
    mutation:
      'replace the typed settlement capability with a mutable mode flag, or add duplicate local wrappers',
    killedBy: ['RO-EX-140'],
  },
  {
    id: 'RO-MUT-80',
    mutation: 'make acquisition or event mechanisms depend on an orchestration interruption type',
    killedBy: ['RO-EX-141'],
  },
  {
    id: 'RO-MUT-81',
    mutation:
      'terminalize from the strict phase typestate alone, dropping facts recorded before RUNNING completes',
    killedBy: ['RO-EX-142'],
  },
  {
    id: 'RO-MUT-82',
    mutation: 'swallow lifecycle control at a journal boundary as a transient storage fault',
    killedBy: ['RO-EX-143'],
  },
  {
    id: 'RO-MUT-83',
    mutation:
      'interrupt the session again during evidence settlement, or disarm the run deadline before recovery publication',
    killedBy: ['RO-EX-144'],
  },
  {
    id: 'RO-MUT-84',
    mutation: 'start lease claim before the guard or allow an aborted attempt to become ownership',
    killedBy: ['RO-EX-145'],
  },
  {
    id: 'RO-MUT-85',
    mutation: 'present a lifecycle terminal with no durable record as terminal plus produced none',
    killedBy: ['RO-EX-146'],
  },
  {
    id: 'RO-MUT-86',
    mutation: 'rely on the event-loop timer without checking absolute expiry at a call boundary',
    killedBy: ['RO-EX-147'],
  },
  {
    id: 'RO-MUT-87',
    mutation: 'accept a raced result without re-checking absolute expiry when the call returns',
    killedBy: ['RO-EX-151'],
  },
  {
    id: 'RO-MUT-88',
    mutation: 'let recovery consume a result that resolved past either of its ceilings',
    killedBy: ['RO-EX-151'],
  },
  {
    id: 'RO-MUT-89',
    mutation: 'narrow the pre-seal journal gate back to pending transitions only',
    killedBy: ['RO-EX-150'],
  },
  {
    id: 'RO-MUT-90',
    mutation: 'derive the lease attempt id from the run id alone',
    killedBy: ['RO-EX-148'],
  },
  {
    id: 'RO-MUT-91',
    mutation: 'return not_started without resolving the unacknowledged claim attempt',
    killedBy: ['RO-EX-149'],
  },
  {
    id: 'RO-MUT-92',
    mutation: 'grant an abandoned attempt at the in-memory lease',
    killedBy: ['RO-EX-149'],
  },
  {
    id: 'RO-MUT-93',
    mutation: 'skip the synchronous expiry check at the publication point inside the commit',
    killedBy: ['RO-EX-153'],
  },
  {
    id: 'RO-MUT-94',
    mutation: 'route the finalization port through the ordinary result-discarding call boundary',
    killedBy: ['RO-EX-153'],
  },
  {
    id: 'RO-MUT-95',
    mutation: 'write acquisitions or holds directly at their call sites, outside the outbox',
    killedBy: ['RO-EX-154'],
  },
  {
    id: 'RO-MUT-96',
    mutation: 'gate the seal on pending transitions alone rather than the whole outbox',
    killedBy: ['RO-EX-150', 'RO-EX-154'],
  },
  {
    id: 'RO-MUT-97',
    mutation: 'mint a new generation for a replayed attempt whose grant was released',
    killedBy: ['RO-EX-155'],
  },
  {
    id: 'RO-MUT-98',
    mutation: 'record the operation fact only after its event acknowledgement returns',
    killedBy: ['RO-EX-158'],
  },
  {
    id: 'RO-MUT-99',
    mutation: "mint the logical commit identity per call instead of taking the caller's",
    killedBy: ['RO-EX-160'],
  },
  {
    id: 'RO-MUT-100',
    mutation: 'skip the published-identity reconciliation before staging',
    killedBy: ['RO-EX-160'],
  },
  {
    id: 'RO-MUT-101',
    mutation: "ignore the journal's replay ledger and append a repeated entry identity again",
    killedBy: ['RO-EX-161'],
  },
  {
    id: 'RO-MUT-102',
    mutation:
      'let a conclusion claim a durable terminal or hold while the outbox holds a pending fact',
    killedBy: ['RO-EX-157', 'RO-EX-154'],
  },
  {
    id: 'RO-MUT-103',
    mutation: 'relabel an attempt-bound commit expiry as the lifecycle timeout',
    killedBy: ['RO-EX-159'],
  },
  {
    id: 'RO-MUT-104',
    mutation: 'cross the finalization commit through the result-discarding call boundary',
    killedBy: ['RO-EX-153'],
  },
  {
    id: 'RO-MUT-105',
    mutation: 'make the finalization identity terminal-only, treating every repeat as a replay',
    killedBy: ['RO-EX-162'],
  },
  {
    id: 'RO-MUT-106',
    mutation: 'derive the recovery expiry instant and its provenance independently',
    killedBy: ['RO-EX-163'],
  },
  {
    id: 'RO-MUT-107',
    mutation: 'increment the event sequence only after the acknowledgement',
    killedBy: ['RO-EX-164'],
  },
  {
    id: 'RO-MUT-108',
    mutation: 'accept a duplicate evidence record identity as a new append',
    killedBy: ['RO-EX-165'],
  },
  {
    id: 'RO-MUT-109',
    mutation: 'generate the resource identity only in the acquisition response',
    killedBy: ['RO-EX-170'],
  },
  {
    id: 'RO-MUT-110',
    mutation: 'keep a different event that wears a landed identity',
    killedBy: ['RO-EX-171'],
  },
  {
    id: 'RO-MUT-111',
    mutation: 'store identity membership only in the journal replay ledger',
    killedBy: ['RO-EX-172', 'RO-EX-175'],
  },
  {
    id: 'RO-MUT-112',
    mutation: 'store identity membership only in the evidence replay ledger',
    killedBy: ['RO-EX-173'],
  },
  {
    id: 'RO-MUT-113',
    mutation: 'acknowledge a conflicting replay as success',
    killedBy: ['RO-EX-172', 'RO-EX-173', 'RO-EX-175'],
  },
  {
    id: 'RO-MUT-114',
    mutation: "prefer caller-supplied expiry metadata over the boundary's winning value",
    killedBy: ['RO-EX-174'],
  },
  {
    id: 'RO-MUT-115',
    mutation: 'take the expiry provenance from the caller rather than the winning value',
    killedBy: ['RO-EX-174'],
  },
  {
    id: 'RO-MUT-116',
    mutation: 're-apply or accept a different materialization at a landed identity',
    killedBy: ['RO-EX-176'],
  },
  {
    id: 'RO-MUT-117',
    mutation: 'collapse a conflicting event replay into stale_fence and rewind the sequence',
    killedBy: ['RO-EX-177'],
  },
  {
    id: 'MUT-004',
    mutation: 'widen the executed command beyond the captured registry entry',
    killedBy: ['ADV-006'],
  },
  {
    id: 'MUT-005',
    mutation: 'classify INDETERMINATE as anything other than a failure',
    killedBy: ['RO-ADV-06'],
  },
  {
    id: 'MUT-009',
    mutation: 'renormalize SKIP_ENV to SKIP_OK somewhere downstream of recording',
    killedBy: ['ADV-015', 'PROP-007'],
  },
  {
    id: 'MUT-010',
    mutation: 'load code from observed workspace content',
    killedBy: ['ADV-018', 'RO-EX-03'],
  },
]

const testCorpus = (): string => {
  let corpus = ''
  for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.test.ts')) continue
    if (entry.name === 'mutation-map.test.ts') continue
    corpus += readFileSync(join(entry.parentPath, entry.name), 'utf8')
  }
  return corpus
}

describe('the mutation-target map is complete and live', () => {
  const corpus = testCorpus()

  it('every registered target names at least one proof', () => {
    for (const target of TARGETS) {
      expect(target.killedBy.length, `${target.id} registers no killing proof`).toBeGreaterThan(0)
    }
  })

  it('every killing proof named by a target EXISTS in the test corpus', () => {
    const missing: string[] = []
    for (const target of TARGETS) {
      for (const proof of target.killedBy) {
        if (!corpus.includes(proof)) missing.push(`${target.id} → ${proof}`)
      }
    }
    expect(missing, 'a target pointing at a test nobody wrote is an unswept mutation').toEqual([])
  })

  it('the sweep covers the CONTIGUOUS RO-MUT range — a gap is a failure, not a shorter list', () => {
    // The defect this catches: RO-MUT-06 and RO-MUT-07 were minted and a
    // sweep declaring "RO-MUT-01…05" passed without them.
    const registered = TARGETS.map((target) => target.id)
      .filter((id) => id.startsWith('RO-MUT-'))
      .map((id) => Number(id.replace('RO-MUT-', '')))
      .sort((a, b) => a - b)
    const expected = Array.from({ length: Math.max(...registered) }, (_, index) => index + 1)
    expect(registered, 'the RO-MUT range must have no holes').toEqual(expected)
  })

  it('every RO-MUT target the assurance artifact declares is registered here', () => {
    // The assurance artifact is the authority on what was minted. If it
    // declares a target this map has not registered, the map is stale
    // and the sweep is incomplete.
    const assurance = readFileSync(
      resolve(srcRoot, '../../../openspec/changes/runner-control-orchestration/assurance.md'),
      'utf8',
    )
    const declared = [...new Set(assurance.match(/RO-MUT-\d+/g) ?? [])].sort()
    const registered = TARGETS.map((target) => target.id)
      .filter((id) => id.startsWith('RO-MUT-'))
      .sort()
    expect(registered, 'the sweep must cover every target the assurance artifact mints').toEqual(
      declared,
    )
  })

  it('the assurance tables are well formed — no row has lost its identifier', () => {
    // Added because this artifact was silently corrupted twice while
    // being edited, and neither the checks above nor the aggregate gate
    // noticed. A bulk find-and-replace on a cell value like
    // `| RO-INV-55 |` matches the INVARIANT row and every proof and
    // mutation row that references it, splitting each of those in two:
    //
    //   | RO-EX-85 | <the inserted invariant text> |
    //   | RO-INV-55 | adversarial | ...            |   ← lost its id
    //
    // The scan above reads identifiers from anywhere in the file, so the
    // orphaned half still satisfied it. This asserts the SHAPE instead.
    const assurance = readFileSync(
      resolve(srcRoot, '../../../openspec/changes/runner-control-orchestration/assurance.md'),
      'utf8',
    )
    const CLASSES = ['adversarial', 'mutation', 'deterministic example', 'structural', 'property']

    const orphans = assurance
      .split('\n')
      .filter((line) => /^\| RO-INV-\d+ \|/.test(line))
      .filter((line) => {
        const second = line.split('|')[2]?.trim() ?? ''
        // An invariant row's second cell is its prose. A row whose
        // second cell is a PROOF CLASS is a proof or mutation row that
        // lost its leading identifier.
        return CLASSES.some((cls) => second.startsWith(cls))
      })
    expect(orphans, 'these rows lost their RO-EX/RO-MUT identifier').toEqual([])

    // And every minted identifier appears exactly once as a row.
    for (const prefix of ['RO-EX', 'RO-MUT', 'RO-INV']) {
      const ids = [...new Set(assurance.match(new RegExp(`${prefix}-\\d+`, 'g')) ?? [])]
      for (const id of ids) {
        const rows = assurance.split('\n').filter((line) => line.startsWith(`| ${id} |`))
        expect(rows.length, `${id} must define exactly one row`).toBe(1)
      }
    }
  })
})
