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

The dependency-free companion script closes that gap:

```sh
node scripts/openspec-review-gate.mjs manifest --change <change-name>
node scripts/openspec-review-gate.mjs verify --change <change-name>
```

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
