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

An equivalent result compares primitive tuples, relationship tuples, local
evidence identities (including decision evidence, historical dispositions and
observed members),
and the independently scanned consumer inventory. Commit equality is neither
necessary nor sufficient. This structural/freshness result is not full state
validation and does not substitute for the PR-3 owner ceremony.

Historical planning sources stay pinned to their original revisions and bytes.
Current task bookkeeping may advance; owned primitive/rule values are still
independently extracted and compared at the evaluated base. This does not exempt
current decision records, immutable bridge evidence, archive members, or the
complete consumer inventory from freshness comparison.
