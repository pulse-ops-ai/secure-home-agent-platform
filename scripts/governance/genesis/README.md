# Governance genesis extraction

Pre-activation extraction and freshness machinery for PR-2 of the
[governed plan](../../../openspec/changes/governance-state-substrate/tasks.md).
It reads exact Git revisions and produces reviewed candidate material, never
canonical governance state or an owner attestation. Schema, digest, equivalence,
and history decisions remain in the [shared model](../model/README.md).

`observations.mjs` enumerates every tracked file and its exact bytes at an
explicit revision. Read failure is not absence. Current and history entry points
select the source manifest beside the evaluated candidate, or the canonical
manifest path after a separately authorized activation.

Preparation (prints JSON; writes nothing):

```sh
node scripts/governance/genesis/extract.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20 --inventory-source WORKTREE
```

`acceptance.mjs` audits every historical Accepted/Rejected ADR before extraction
can emit anything. It parses the declared actor and calendar date, checks exact
decision bytes at an original Proposed-to-decided transition, and compares its
encoded UTC committer date with that declaration, without requiring equality.
The closed manifest records an explicit reviewed divergence disposition.
Locally available original commit
objects are examined even when no branch still names them; first-parent main
delivery and merge commits are not fallback acceptance evidence. Ambiguity,
unreadable sources, and missing transitions fail closed. The complete audit is
available without generating a candidate:

```sh
node scripts/governance/genesis/acceptance.mjs --root . \
  --source c82fda72927464d813ec769aee53f4079ebe3b20
```

This observes the [D6.2 source boundary](../../../openspec/changes/governance-state-substrate/design.md#d6-genesis-a-closed-source-manifest):
encoded Git metadata is neither an observed recording instant nor human identity
or owner attestation. The [candidate receipt](../../../tests/fixtures/governance/candidate/README.md)
separates mechanical proof from the still-required independent review and owner
ceremony. The accepted ADR-0023 date model admits ADR-0022's agreeing September 1
decision records without changing its September 2 encoded committer timestamp.
Original transition selection is bound to the reviewed D12 table; the consumed
ADR-0023/ADR-0024 pair is located through its immutable D13 receipt and exact
single-parent history, never as a new manual-acceptance permission.

The common source is S. L4/L5/L7 archive-stage identities remain
`83e6cd8fa7d2d05ab246a39de039129b4056966d` at their exact archive roots. Git
replacement refs are ignored by exact-object observations.

The source is fixed by the PR-2 resumption authorization. `WORKTREE` is a
preparation-only inventory view, including newly authored PR-2 tooling; it is
never an activation-base identity. `--patch` emits an apply-patch document for
the three candidate files and still writes nothing itself.

After freezing the three candidate files in a commit, the separate read-only
freshness entry point takes an explicit full activation-base SHA:

```sh
node scripts/governance/genesis/freshness.mjs --root . --base <full-commit-sha>
```

The same command supports the two structural layouts needed by the activation
sequence. Before promotion, all three current candidate members must exist and
the promoted members must be absent; current candidate bytes remain the frozen
input. After promotion, all three candidate sources must be absent and the three
unattested canonical members must exist. Only then does the model recover the
candidate from the exact explicit base and require byte-identical promotion,
using the same promotion proof as projection preparation. Partial/mixed layouts,
non-regular members, changed promoted bytes and attested state refuse. No other
revision, current canonical seed or previous receipt supplies recovery evidence.

Both invocations recompute the complete comparison below. The mandatory second
invocation must reproduce the first receipt for the same candidate/base pair;
successful promotion alone is not freshness, full validation or attestation.

An equivalent result compares primitive tuples, relationship tuples, local
evidence identities (including decision evidence, historical dispositions and
observed members),
and the independently scanned consumer inventory. Commit equality is neither
necessary nor sufficient. This structural/freshness result is not full state
validation and does not substitute for the PR-3 owner ceremony.

Historical planning sources stay pinned to their original revisions and bytes.
Before extraction, checkpoint current planning/status files in Git. Existing
`planningSources` then binds one complete five-artifact preparation snapshot as
additional provenance, not architectural authority or a replacement common
source. Governance primitive/rule values still come from S. Freshness compares
the complete preparation bytes against the evaluated base, alongside decision
records, immutable bridge evidence, archive members and the full inventory.
Later planning drift requires a refreshed candidate; no status-stripping or
blanket planning-file exception is used.

To replay a frozen extraction after later commits, pass
`--planning-source <full-preparation-commit-sha>` from its `planningSources`
rows alongside `--inventory-source WORKTREE`. This selects only the recorded
preparation checkpoint; all five current planning files must still match its
exact bytes. It never changes common source S, archive-stage M, or authority.

## Consumer inventory after genesis

The frozen inventory is evidence of the genesis source and migration scope.
Recover its exact bytes only from the attested `activationBaseCommit` and verify
the existing three-member `candidateFreezeIdentity`. Its source manifest,
freshness proof and genesis envelopes remain immutable. Preparation and first
activation still require exact promotion of that inventory. An inventory
extension cannot be bundled into the genesis exception.

After activation, `governance/consumers.json` is the current closed inventory.
Version one permits only additive rows for new ADRs. The current checker
requires canonical closed JSON, unique paths and fact classes, complete
discovery, and preservation of every frozen row. The history checker requires
preservation of **every predecessor row**, including rows added after genesis.
All row fields are protected: path, disposition, fact classes, generated regions,
historical identity, migration landing and retained reason. A disappearing
keyword, renamed file, changed lifecycle or rewritten rationale never authorizes
a deletion or reclassification. Other inventory evolution requires a separately
reviewed contract and implementation; an unsupported change fails closed.

A new row must name an exact registered ADR path and arrive atomically with that
decision's first `Proposed` record and checked document. It uses
`retained-semantic-prose`, empty `generatedRegions`, null `historicalIdentity`
and null `migrationLanding` (it was not part of the initial migration). Its
required `retainedReason` is:

> Decision text and its checked lifecycle header remain authored; the registry
> owns current lifecycle and terminal bytes remain digest-bound.

On introduction, `factClasses` must exactly equal discovery of that document.
Later discovery may lose a signal, but may not introduce an uncovered class or
silently change the recorded classification. Acceptance or rejection uses the
existing lifecycle/evidence rules without reclassifying the row as historical.
This disposition preserves authored decision rationale and the checked header;
it does not exempt an ADR from validation or make its prose a second current
state authority. Human review still owns arbitrary prose semantics.

Discovery continues across every tracked file, including non-Markdown and
invalid-UTF-8 content. Checkout validation also observes untracked files; history
uses each explicitly selected commit's tree. Every discovered surface needs an
inventory row, except the four exact artifacts already owned by the model or
renderer: `governance/state.json`, `governance/consumers.json`,
`governance/genesis-source-manifest.json`, and `governance/STATE.md`. Their
schema, evidence and projection checks remain mandatory. This is no directory
or extension exemption; even neighboring files under `governance/` need their
own classification. Every ADR file and registry record must be accounted for
independently of keyword discovery. Only the three retired candidate paths may
remain as absent inventory rows after promotion; their bytes remain available
as immutable genesis evidence. Current projection counts use the current
inventory; genesis comparison and migration scope continue using the frozen one.

This implements the current/history and evidence distinctions in
[ADR-0021 §§7–10](../../../docs/decisions/ADR-0021-establish-machine-readable-governance-state.md),
with the temporal evidence rules of
[ADR-0023](../../../docs/decisions/ADR-0023-separate-governance-decision-dates-from-git-commit-timestamps.md).
It changes no accepted ADR or frozen candidate, and grants no activation or
decision-acceptance authority. The promotion determination under ADR-0014 is
negative: this is a phase-binding correction within the existing governance
contract, documented at its semantic owner; no new architectural invariant or
portable-knowledge projection is needed.
