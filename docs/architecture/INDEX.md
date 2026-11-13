# docs/architecture/ — Architecture entry point

Current governance state is not authored here. Use [the canonical registry](../../governance/state.json),
[its generated projection](../../governance/STATE.md), or
`node scripts/query-governance-state.mjs --json` from the repository root.
Registry data grants no implementation or runtime authority.

This is the household-specific application of an inherited, implementation-neutral
architecture. **Read the decisions before the descriptions**:
[`../decisions/INDEX.md`](../decisions/INDEX.md) records *why*; this folder
records *what the system therefore looks like*.

This index is validated by [`scripts/validate-scaffold.sh`](../../scripts/validate-scaffold.sh):
every document referenced here must exist, and every document in this folder must
be referenced here.

## Adopted upstream contract — pinned

This repository **adopts by reference and does not copy**
([ADR-0001](../decisions/ADR-0001-adopt-security-first-architecture.md)):

| Repository | Role | Pinned at |
|---|---|---|
| [`pulse-ops-ai/security-first-platform-architecture`](https://github.com/pulse-ops-ai/security-first-platform-architecture) | the contract — eight-layer control model, trust zones, identity/authorization separation, internal identity envelope, agent-as-client | tag **`v0.3.0`** (`07e65a07bb6f2eab57bfd6dd8619f2eac77098e9`) |
| [`pulse-ops-ai/platform-edge`](https://github.com/pulse-ops-ai/platform-edge) | a **reference implementation** and the shared L1–L5 edge for the remote path only — **not** this product's runtime | `main` @ **`b70894a8a49b9433a5fca16bc5538b3bd8891a88`** (2026-07-13) |

Changing either pin requires a pull request that records what the diff changed
for this repository.

**Inherited vocabulary** — used throughout this folder without redefining it:
layers **L1** (network reachability) → **L8** (semantic / agent reasoning);
trust zones **Z0** (public) → **Z4** (internal trusted, envelope-carrying).

## Documents

| Document | What it answers |
|---|---|
| [`system-context.md`](system-context.md) | Who and what is in the system, and where each part lives |
| [`trust-boundaries.md`](trust-boundaries.md) | Which boundaries exist, and what evidence each crossing requires |
| [`runner-model.md`](runner-model.md) | How agents are executed: base image, derived image, profile, adapter, run, evidence |
| [`effect-boundary-model.md`](effect-boundary-model.md) | How orchestration crosses an asynchronous effect boundary: lifecycle authority, effect classes, expiry, interruption, acquisition, fencing |
| [`distributed-effect-lifecycle.md`](distributed-effect-lifecycle.md) | What identities a run and its finalization carry, and how a durable effect becomes visible |
| [`identity-and-authorization-flow.md`](identity-and-authorization-flow.md) | How identity, delegation, authorization, the envelope, and safety policy compose |
| [`local-remote-routing.md`](local-remote-routing.md) | Local, remote, and cloud call paths and their routing classes |
| [`degraded-mode.md`](degraded-mode.md) | What continues, what is bounded, and what fails closed during an outage |
| [`agent-triage-and-escalation.md`](agent-triage-and-escalation.md) | How an agent reasons about a situation it did not cause, and when it stops and hands it to a person |
| [`api-contract-model.md`](api-contract-model.md) | How one Zod definition becomes DTOs, validation, OpenAPI, metadata, SDKs, and MCP tools |
| [`knowledge-selection-model.md`](knowledge-selection-model.md) | How a profile selects knowledge, how a runner resolves it, and what the run records |
| [`knowledge-promotion-model.md`](knowledge-promotion-model.md) | Where a durable architectural truth lives, and how it reaches an agent |
| [`unresolved-decisions.md`](unresolved-decisions.md) | Open questions that are deliberately **not** decided yet |

## Reading order

1. [`system-context.md`](system-context.md) — the map
2. [`trust-boundaries.md`](trust-boundaries.md) — the rules that constrain the map
3. [`identity-and-authorization-flow.md`](identity-and-authorization-flow.md) — how a request earns the right to act
4. [`runner-model.md`](runner-model.md) — how agents run inside those rules
   1. [`effect-boundary-model.md`](effect-boundary-model.md) — how one asynchronous effect is bounded
   2. [`distributed-effect-lifecycle.md`](distributed-effect-lifecycle.md) — what its identities prove, and how it is published
5. [`local-remote-routing.md`](local-remote-routing.md) — where work executes
6. [`degraded-mode.md`](degraded-mode.md) — what happens when parts are missing
7. [`api-contract-model.md`](api-contract-model.md) — how contracts are authored and generated
8. [`knowledge-selection-model.md`](knowledge-selection-model.md) — what a run is allowed to *understand*
9. [`unresolved-decisions.md`](unresolved-decisions.md) — what is still open

## Status

**Some of this is implemented; none of it is running.** The distinction matters
more than either half alone.

Consult [canonical governance](../../governance/STATE.md) for runner program
delivery and readiness. The architecture documents below describe component
responsibilities and proof boundaries, not a second delivery-state table.
A recorded landing is not evidence of a running service or deployment permission.

Where a document describes something that does not exist, it says so. Where
something **is** implemented, saying it is not is equally a defect.

## Rules for this folder

- Describe the **household application** of the inherited architecture. Do not
  restate upstream content; link to it.
- Every document must be reachable from this index, and every index entry must
  point at a file that exists.
- Do not silently resolve anything listed in
  [`unresolved-decisions.md`](unresolved-decisions.md). Moving an item out of
  that file requires an ADR.
- Do not describe an unimplemented thing in the present tense without marking it
  as unimplemented.
- Governed by [`../../AGENTS.md`](../../AGENTS.md) and
  [`../AGENTS.md`](../AGENTS.md).
