# governed-spec-driven-v2

A repository-local OpenSpec workflow for changes that need architecture,
assurance, and independent review before implementation.

## Workflow

```text
proposal
   ├── specs
   └── design
          │
          └──────┐
                 ▼
             assurance
                 ▼
               tasks
                 ▼
     preimplementation-review
                 ▼
               apply
```

The review artifact follows `tasks.md` so an independent reviewer sees the
complete implementation plan, including authority allocation, landing seams,
and proof work.

## Files

```text
governed-spec-driven-v2/
├── README.md
├── schema.yaml
├── templates/
│   ├── proposal.md
│   ├── spec.md
│   ├── design.md
│   ├── assurance.md
│   ├── tasks.md
│   └── preimplementation-review.md
└── support/
    └── reviews/
        ├── README.md
        └── round.md
```

The support files are optional copy sources for a change-local `reviews/`
history. They are not workflow artifacts.

## Ownership Model

- `proposal.md` owns motivation, scope, impact, and non-goals.
- `specs/**` owns observable normative behavior.
- `design.md` owns architecture, decisions, trust boundaries, and rationale.
- `assurance.md` owns invariants, proof obligations, authority allocation, and
  review exit criteria.
- Canonical schemas, policies, typed tables, derivations, fixtures, and golden
  vectors own exact mutable facts allocated to them.
- `tasks.md` owns sequence, paths, prerequisites, checks, and progress.
- `preimplementation-review.md` owns the current acceptance decision over pinned
  planning bytes.
- `reviews/**` owns history only.

One mutable fact gets one hand-authored canonical authority. Generated or
mechanically checked mirrors are permitted; competing hand-edited mirrors are
not.

## Why the Companion Gate Exists

OpenSpec's custom artifact graph controls dependency order and requires a review
file before apply is available. OpenSpec does not semantically validate a custom
review verdict or prove that the reviewed files are still the same files.

The dependency-free companion script closes part of that gap — and it is worth
being exact about which part, because the name "review gate" invites a stronger
reading than the mechanism supports.

**What `REVIEW_GATE_VALID` proves.** At the pre-apply boundary, the planning
bytes are still exactly the bytes recorded in the accepting review; the reviewed
commit is an ancestor of HEAD; nothing outside the review report and
`reviews/**` changed since that commit; the working tree is clean; the review
report is committed and was recorded after the planning pin; and the report
satisfies the declared contract — required sections, section-owned markers, and
exactly one governed verdict.

**What it does not prove.** It does not authenticate the reviewer. The
`reviewer` field is a declared string, and nothing here binds it to a
cryptographic identity or to a human at all. It cannot show that the review was
independent, that a reviewer read anything, or that the verdict reflects
judgement rather than a paste. **Reviewer identity and reviewer independence
remain external, procedural facts** — established by who may push, who reviews
the pull request, and the repository's own social process, not by this script.
No cryptographic reviewer authentication is claimed or implemented.

The gate makes drift and contract violations mechanically impossible to miss. It
does not make a dishonest review impossible to write.

The commands:

```sh
pnpm run review:manifest -- --change <change-name>   # before the review
pnpm run review:verify   -- --change <change-name>   # immediately before apply
```

(equivalently `node scripts/openspec-review-gate.mjs manifest|verify --change <name>`)

## Review epochs — one per independently released scope

v2 is not "one review before the first edit". It is **one review epoch before
each independently released implementation scope**:

```text
complete planning package
  -> review epoch 1 -> verify -> implementation scope 1
  -> review epoch 2 -> verify -> implementation scope 2
  -> ...
```

`tasks.md` owns scope and declares one `<!-- review-scope: <id> -->` marker per
independently releasable scope. The review block refers to a scope **only by
id** — it never restates the scope's paths, tasks, requirements, or
authorization, so scope keeps exactly one authority.

**An epoch is a review attempt, not a scope ordinal.** `review_epoch` counts
review boundaries and increases monotonically across the change; `scope_id` says
which scope a given boundary reviewed. A scope can need several epochs — most
obviously when the base advances before implementation begins — so epoch N does
not mean "the Nth scope":

```text
epoch 1 -> scope A     accepted
base advances
epoch 2 -> scope A     focused base-freshness review
epoch 3 -> scope B     after scope A is released
```

A single-scope change that is reviewed once declares one id and runs one epoch.

Superseded rounds move to `reviews/<epoch>-<reviewed-sha12>.md`. **Admission is
mechanical, not a naming convention**: a round counts only if it is committed,
named for its own epoch and reviewed commit, and carries a gate block whose
contract, epoch, reviewed commit, and `ARCHITECTURE_ACCEPTED` verdict all agree
with that name. A placeholder file called `1-anything.md` admits nothing. Epoch
N requires exactly the admitted epochs 1..N-1: no skip, no duplicate, no
regression.

## When to run it — and when not to

`verify` is a **pre-apply boundary check**, not a continuous one. It refuses any
repository change made after the reviewed planning commit, so each epoch passes
exactly once: between an accepted review and the first implementation edit of
its scope. Every legitimate commit after that point makes it fail — and that
refusal is the signal that the next scope needs its own epoch.

| | |
|---|---|
| **Run `verify`** | once, immediately before the first implementation or canonical-authority change |
| **Never** | as an unconditional `check.sh` step or CI job — it would fail every change under implementation |

What runs continuously instead:

- `pnpm run check:review-history` — admitted `reviews/**` rounds are append-only, a two-revision property enforced on every push and pull request;
- `tests/test_openspec_review_gate.py` — the gate's own behaviour, in the unconditional governance suite.

**CI tests the mechanism; it does not re-execute the one-time authorization.**

## A worked sequence

```text
1. author proposal, specs, design, assurance, tasks    (planning artifacts)
2. commit them; the worktree must be clean
3. pnpm run review:manifest -- --change <name>         (pins HEAD + byte digests)
4. paste the emitted block into preimplementation-review.md
5. independent review; fill reviewer, reviewed_at, counts, verdict
6. commit the completed review
7. pnpm run review:verify -- --change <name>           -> REVIEW_GATE_VALID
8. implement — from here verify will refuse, and that is correct
```

`tests/test_openspec_review_gate.py` executes this sequence against real Git
repositories, so the worked example is a test rather than prose — including the
full two-epoch lifecycle with real implementation drift between the epochs.

## The base is bound too

A review is accepted against one exact target-base commit, recorded as
`reviewed_base_commit`. The CLI takes the base ref explicitly (`--base
origin/main`) and records the **resolved SHA** — never the mutable ref, which
would be an authority that changes without anybody deciding.

If the recorded base moves, `verify` refuses with `REVIEW_BASE_DRIFT` and a
fresh epoch is required.

**Resolvable is not current.** `origin/main` is a local remote-tracking ref that
can be arbitrarily stale, so the gate demands a freshness proof and never
assumes one. Exactly one of:

| | |
|---|---|
| `--remote <remote>/<branch>` | contacts the remote and compares the live ref |
| `--base-sha <40-hex>` | an externally supplied authoritative SHA |

Supplying both is refused (`CONFLICTING_FRESHNESS_SOURCES`) — they are
alternative authorities, and silent precedence would hide which one decided. An
unreachable remote refuses with `BASE_FRESHNESS_UNPROVEN`; a stale local ref
refuses with `REVIEW_BASE_STALE`.

### The `--base-sha` trust limit, and what closes it

**The script cannot prove a `--base-sha` value came from anywhere in
particular.** It is an argument; an agent could pass its own stale SHA as both
the base and its own proof. That limitation is real and is not solved by naming
the flag well.

For local and manual runs, use the remote form, which actually contacts it:

```sh
pnpm run review:verify -- --change <name> \
    --base origin/main --remote origin/main
```

For the **governed one-time boundary**, provenance comes from
[`.github/workflows/review-boundary.yml`](../../../.github/workflows/review-boundary.yml):
a manually dispatched workflow that reads the pull request through the GitHub
API, checks out the exact head GitHub reported, runs strict validation and the
gate with GitHub's base SHA, then **re-reads the pull request and refuses if the
head or base moved while it ran**. Because it is `workflow_dispatch`, its
definition comes from the default branch — a pull request cannot rewrite the
check that authorizes it.

**A base advance does not automatically mean architectural redesign.** When the
planning bytes are unchanged and the base movement does not touch their
assumptions, the next epoch may be a **focused base-freshness review**. v2 does
not turn every base movement into another unrestricted architecture audit.

`manifest` prints the exact JSON gate block for the current clean planning
commit. `verify` checks:

- the change is pinned to `governed-spec-driven-v2`;
- the machine-readable review contract is closed and valid;
- verdict is `ARCHITECTURE_ACCEPTED`;
- unresolved P1 count is zero;
- every P2/P3 is assigned to a task, proof obligation, or explicit deferred
  landing;
- the accepting review did not require an invariant change;
- authority allocation is complete;
- every planning file is present exactly once and its SHA-256 still matches;
- the reviewed commit is an ancestor of the current head;
- no repository path except the current review report and `reviews/**` changed
  after the reviewed commit;
- no unrelated uncommitted change exists;
- required review headings and the human-readable verdict agree.

It does not replace `openspec validate --strict` and does not create
implementation authorization.

## Installation

Copy the schema directory to:

```text
openspec/schemas/governed-spec-driven-v2/
```

Copy the companion script to:

```text
scripts/openspec-review-gate.mjs
```

Validate the schema:

```sh
openspec schema validate governed-spec-driven-v2
```

Create a new change explicitly:

```sh
openspec new change <change-name> --schema governed-spec-driven-v2
```

This creates change-local metadata similar to:

```yaml
schema: governed-spec-driven-v2
created: YYYY-MM-DD
```

Prefer explicit per-change selection during rollout. Change metadata outranks
the project default, so v1 changes remain pinned to v1.

After the workflow is proven on several changes, the project default may be
changed in `openspec/config.yaml`:

```yaml
schema: governed-spec-driven-v2
```

## Review Sequence

1. Complete proposal, specs, design, assurance, and tasks.
2. Commit the complete planning package; this is review target `X`.
3. Start a fresh, read-only independent reviewer on `X`.
4. Run the manifest command and place its JSON in
   `preimplementation-review.md`.
5. Complete the review. Accept only when the v2 P1 and exit criteria hold.
6. Commit the review report as the only change after `X`.
7. Run strict OpenSpec validation and the deterministic review gate.
8. Verify external authorization in `tasks.md`.
9. Start apply with contract-first tasks before functional consumers.

## Review History

A prior report may be copied into a change-local `reviews/` directory before the
current report is replaced. Each historical finding records its disposition,
resolving commit, and executable regression authority.

An implementation agent must not need `reviews/**` to discover current
requirements or mechanics.

## Migration from v1

Do not rewrite active v1 changes merely to claim a newer process.

Use v2 for a new change, or migrate an existing change only through an explicit
planning-only commit that:

- adds `preimplementation-review.md`;
- adds Authority Allocation, Executable Contract Plan, and Exit Gate sections
  to assurance;
- removes competing exact facts from proposal, design, tasks, and reviews;
- assigns remaining exactness to canonical authorities;
- updates `.openspec.yaml` to v2;
- receives a new independent review.

## Validation

```sh
openspec schema validate governed-spec-driven-v2
openspec validate <change-name> --strict
node scripts/openspec-review-gate.mjs verify --change <change-name>
```
