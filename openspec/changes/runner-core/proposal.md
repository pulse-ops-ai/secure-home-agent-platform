# Change Proposal: runner-core

## Why

Landing L2 (#51, `runner-domain-contracts`) authored the runner domain
contracts and stopped exactly at shapes. Its own modules say so:
`path-policy.ts` — "Shapes only — enforcement is L3"; `evidence.ts` — "Shapes
only — populating, sealing, and independently verifying evidence is L3
behavior."

So the platform now has a complete vocabulary for authority, gates, paths, and
evidence, and **nothing that decides anything with it**. Every trust invariant
the ratified `runner-adoption` contract asserts — authority captured once and
digest-bound, refusal rather than default, refusal rather than truncation,
observation outranking claims, evidence sealed last and independently
re-derivable — is currently an unimplemented promise.

Evidence motivating this change:

- `openspec/specs/runner-adoption/spec.md` — the ratified contract, whose
  requirements bind every adoption landing.
- The archived `runner-baseline-adoption` design § Landing Seams: L3 is
  "packages/runner-core: validation, eligibility, policy, workspace
  observation, reconciliation, evidence construction/verification — with its
  own proof net, before anything consumes it".
- The archived assurance § Traceability: INV-001, INV-006, INV-007 (with L4),
  INV-008 (data/paths), INV-010, INV-011, INV-015 are all traced to L3, and
  INV-003 to L3 and L4.
- GitHub issue #52, the external authority anchor for this landing.

## Problem

**What happens today.** `packages/contracts` and `packages/events` validate
shapes. No package decides whether a run may proceed, which paths a run may
write, whether observed changes agree with claimed changes, or whether an
evidence bundle is complete and consistent. There is no trusted core to decide
any of it, and no independent verifier to check a producer's output.

**What should be possible instead.** A reusable, framework-neutral package
containing the trusted decisions — and only the decisions — so that L4 can
orchestrate against typed interfaces without being able to make a trust
decision itself, and so that every decision is proven before anything consumes
it.

**Who is affected.** L4 (`services/runner-control`, #27) consumes this package.
L9's enforcement layer inherits its path and bound decisions. Every future run's
evidence derives from its construction and verification logic.

**Consequence of leaving it unchanged.** L4 would have to make trust decisions
inline, which is precisely the "orchestration decides" failure the ratified
contract forbids (`runner-adoption`: a run cannot alter what judges it;
decision-bearing logic executes only from trusted platform-controlled code).
Building orchestration first and extracting a core later inverts the
serial-safety argument the landing plan depends on.

## Proposed Capability

A trusted decision core: given captured authority inputs and host observations,
it returns typed decisions — proceed or refuse, with the cause named — and
constructs and independently re-derives evidence.

It holds no runtime identity, launches nothing, reads nothing on its own
initiative, and grants nothing. It is a library of decisions that a later
orchestrator asks.

Four bounded behaviors:

1. **Authority capture and eligibility** — construct immutable, digest-bound
   snapshots from authority bytes the orchestrator acquired (acquiring each
   source exactly once is L4's obligation), and decide eligibility from the
   snapshot before any model or provider spend. Missing authority is never a
   permissive default.
2. **Path decisions** — allowed write roots, prohibited paths, governing-context
   protection, normalized path handling, and declared bounds. Over-bound input
   is refused, never truncated.
3. **Workspace observation and reconciliation** — derive the authoritative
   change set from host observation, record model claims separately, and
   reconcile. Observation outranks claims by construction.
4. **Evidence derivation and independent verification** — construct evidence
   from captured authority, observations, gate results, and artifacts; and
   re-derive expected state independently, failing closed on anything missing,
   malformed, ambiguous, extra, or inconsistent.

## Scope

### In scope

- `packages/runner-core` as a new workspace member, registered in the layer
  model with a mechanically enforced dependency direction.
- The four behaviors above, as pure decision logic over immutable values
  supplied by the orchestrator — the core owns no I/O and no I/O
  abstraction (design D3).
- The proof net that must land with them: architecture guards, deterministic
  examples, hostile fixtures, property tests, and mutation targets.

### Out of scope

Named explicitly rather than hidden — each belongs to a later landing:

| Deferred behavior | Owner |
|---|---|
| Run lifecycle state machine, consent, cancellation, timeout | L4 (#27) |
| Gate scheduling and exact-argv gate execution | L4 |
| Evidence **finalization ordering** (L3 owns the eligibility predicate only) | L4 |
| Orchestration provenance — modified orchestration never judges its own run (INV-008 code side) | L4 |
| Container launch, mounts, network enforcement, resource ceilings | L9 (post-U4 ADR) |
| Provider adapters, transcript parsing, credential injection | L6/L7 (post-U6 ADR) |
| Image lineage | L5 |

## Affected Areas

| Area | Impact |
|---|---|
| `packages/runner-core/**` | new package: source, tests, manifest, configs |
| `packages/README.md` | layout table gains the new package |
| `scripts/workspace-model.mjs` | `LAYERS` gains `packages/runner-core` |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | member registration and resolution |
| `packages/contracts`, `packages/events` | **consumed, not modified** — the first real consumer of the L2 contracts |

No service, application, script, or contract package is modified.

## Governance

From the `docs/decisions/INDEX.md` "which ADRs apply" table:

- **ADR-0001** — applies to everything; the inherited control model and the
  rule that a zone crossing requires verifiable evidence, never a network fact.
- **ADR-0003** — the runner substrate is provider- and framework-neutral, and
  no provider or framework name may occupy a structural position. `runner-core`
  is substrate: it must not import a framework or name one structurally.
- **ADR-0004** — agents are clients; a run's own claims are untrusted input.
  This is the architectural basis for observation outranking claims.
- **ADR-0006** — authority comes from a versioned execution profile;
  implementation code grants nothing. `runner-core` merely reads captured
  authority and decides.
- **ADR-0012** — TypeScript package under `packages/`, Zod-authored contracts
  consumed rather than redefined, dependency direction inward only (§15),
  catalog-governed dependencies (§19).

**Depends on U1–U11:** `none`.

L3 stays on the near side of every open decision it touches: it selects no
workload identity (U2), places no service (U4), and freezes no adapter SPI
(U6). It reads captured bytes and returns decisions; it never acquires a
credential, chooses a placement, or defines a provider interface.

This change proposes **no ADR status change**. Amending or reversing an
accepted ADR requires a new superseding ADR through its own human review.

## Trust / Security / Data Considerations

| Concern | Applies | Note |
|---|---|---|
| authentication or authorization | **yes** | eligibility decisions gate spend; a permissive default would be an authorization bypass |
| PII or encryption | no | no personal data; digests only |
| persistence or migrations | no | no storage; pure decisions over supplied immutable values |
| transaction or concurrency | no | no shared mutable state; decisions are pure functions of their inputs |
| public package contracts | **yes** | `packages/runner-core` exports the interface L4 consumes |
| runner / review / materialization machinery | **yes** | this *is* the trusted core of that machinery |
| proposed-change-set binding and evidence | **yes** | observation-versus-claim reconciliation and evidence derivation live here |
| reconciliation or readiness authority | **yes** | materialization eligibility and seal eligibility are decided here |
| deployment or production isolation | no | nothing deploys; the package is inert until L4 consumes it |

Classification follows in `assurance.md`: **trust-critical**.

## Existing Evidence

- `openspec/specs/runner-adoption/spec.md` — ratified adoption requirements.
- `openspec/specs/{execution-profile,runner-execution,runner-verification,runner-evidence}/spec.md`
  — L2's canonical capability specs, archived and synced by #63. These are the
  authoritative behavioral statement of the contracts L3 consumes.
- `openspec/changes/archive/2026-08-09-runner-baseline-adoption/{design,assurance}.md`
  — landing seams and the inherited proof identifiers.
- `packages/contracts/src/{path-policy,verification,execution-profile,launch-assertion,primitives}/**`
  — the authority and policy shapes L3 consumes.
- `packages/events/src/{evidence,run-record,run-events}.ts` — the evidence,
  outcome, and event shapes L3 constructs and verifies against.
- `scripts/workspace-model.mjs`, `scripts/check-workspace.mjs`,
  `scripts/check-source-imports.mjs` — the existing mechanical dependency-direction
  enforcement that INV-001 relies on.
- GitHub issue #52 — provenance for this landing, recorded in `tasks.md`.

## Dependencies

**Already implemented:**

- L2 / #51 — `packages/contracts` and `packages/events`, merged.
- The workspace dependency-direction machinery (manifest layering and
  source-import direction), merged in #44 and #45.

**Directed but not yet implemented:**

- **`runner-contract-corrections`** — the review-directed L2 correction
  (typed prohibited rules; evidence identities completed over the governing
  policy and registry). **L3 implementation sequences behind it**: this seam
  consumes the amended `path-policy` and `evidence-bundle` contracts, and
  task 0.1 cannot flip before the correction lands and this seam is
  reconciled against it.

**External:** none. No new third-party dependency is proposed; `zod` is already
in the catalog and is the only runtime dependency L2 carries.

## Success

A later landing can ask this package "may this run proceed?", "may these paths
be materialized?", "do the observed and claimed change sets agree?", and "is
this evidence complete and self-consistent?" — and receive a typed decision
whose refusals name their cause — **without the asking code being able to
influence the answer**, and with an independent verifier that disagrees with a
tampered producer.

## Non-Goals

This change must not:

- launch a container, start a process, or open a socket;
- read a file or environment variable on its own initiative;
- select a workload-identity mechanism (U2), place `runner-control` (U4), or
  define the adapter SPI (U6);
- import NestJS, Fastify, or any framework, or expose a decorator, module, or
  provider;
- import a provider adapter, Home Assistant client, OpenFGA client, or database
  client;
- modify `packages/contracts` or `packages/events`;
- sequence anything — ordering is orchestration, and orchestration is L4.

## Open Questions

All questions this proposal carried are resolved by the delta review
(2026-08-10, on PR #62). Recorded with outcomes; `design.md` § Open
Questions holds the detail:

- **Q1 — `prohibited_rules` rule language. RESOLVED: typed rule contract in
  L2.** The review directed that L3 not invent semantics over opaque
  strings; the `runner-contract-corrections` change types the rules, and L3
  consumes the amended contract (design D8).

- **Q2 — evidence cannot record the policy or gate-registry digest.
  RESOLVED: option B.** The review directed a governed L2 follow-up adding
  both digest-bound identities to the `runner-evidence` contract;
  `runner-contract-corrections` carries it, and L3 populates and verifies
  the new fields. Options C and D remain rejected with their recorded
  reasons.

- **Q3 — protected-path violation representation. CONFIRMED.** A
  protected-path violation is a policy/materialization refusal (design D9),
  never a reconciliation disagreement.

- **Q4 — port granularity. RESOLVED: no L3 ports.** Acquisition and
  observation abstractions move to L4; L3 receives immutable values (design
  D3/D4), and INV-007's acquire-once half is honestly assigned to L4.
