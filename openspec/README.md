# openspec/

The OpenSpec root: spec-driven change planning for this repository.

| Path | Contains |
|---|---|
| `config.yaml` | Active schema selection and project context injected into every artifact |
| `schemas/governed-spec-driven-v1/` | The project workflow schema and its artifact templates |
| `changes/<name>/` | In-flight changes: proposal → specs deltas → design → assurance → tasks |
| `specs/` | Main capability specs, populated when changes are archived |

## The governed workflow

`governed-spec-driven-v1` extends the standard OpenSpec flow with a mandatory
**assurance** artifact between design and tasks: invariants, state-space
coverage, proof obligations, landing plan, and review posture must exist
before implementation tasks are authorized.

## What OpenSpec artifacts are — and are not

Planning documents only. A change here:

- **grants no authority** — profiles and ADRs do that, through their own review;
- **cannot change an ADR's status** or edit an accepted ADR;
- **cannot resolve** anything in
  [`docs/architecture/unresolved-decisions.md`](../docs/architecture/unresolved-decisions.md);
- **does not create GitHub issues** — issues are minted by the human planning
  workflow from reviewed changes, not by tooling.

Precedence is unchanged: accepted ADRs and `AGENTS.md` govern; a change that
conflicts with them is wrong, not authoritative. The scoped agent contract is
[`AGENTS.md`](AGENTS.md) in this directory.

## Validation

Two layers, deliberately distinct:

- **Repository gate** — `bash scripts/validate-scaffold.sh` (run by
  `scripts/check.sh` and CI) enforces the *structural* invariants:
  `config.yaml` selects the governed schema, the artifact DAG keeps
  assurance before tasks and tasks before apply, referenced templates exist
  with balanced fences, and the governance/authorization wording is present.
  This is dependency-free and **not equivalent to OpenSpec validation**.
- **OpenSpec CLI** — artifact-level correctness (`openspec validate
  <change> --strict`, `openspec schemas`) requires the CLI and is run per
  change, not in the merge gate.
