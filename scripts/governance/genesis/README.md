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
  --source 83e6cd8fa7d2d05ab246a39de039129b4056966d --inventory-source WORKTREE
```

`acceptance.mjs` audits every historical Accepted/Rejected ADR before extraction
can emit anything. It parses the declared actor and calendar date, checks exact
decision bytes at an original Proposed-to-decided transition, and compares its
UTC committer date with that declaration. Locally available original commit
objects are examined even when no branch still names them; first-parent main
delivery and merge commits are not fallback acceptance evidence. Ambiguity,
unreadable sources, and missing transitions fail closed. The complete audit is
available without generating a candidate:

```sh
node scripts/governance/genesis/acceptance.mjs --root . \
  --source 83e6cd8fa7d2d05ab246a39de039129b4056966d
```

This observes the [D6.2 source boundary](../../../openspec/changes/governance-state-substrate/design.md#d6-genesis-a-closed-source-manifest):
local evidence of a recording instant is not human identity or owner attestation.
The current [provisional-candidate warning](../../../tests/fixtures/governance/candidate/README.md)
records the blocking exception and unfinished integration; no freeze is authorized
by an audit receipt alone.

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
evidence identities (including historical dispositions and observed members),
and the independently scanned consumer inventory. Commit equality is neither
necessary nor sufficient. This structural/freshness result is not full state
validation and does not substitute for the PR-3 owner ceremony.
