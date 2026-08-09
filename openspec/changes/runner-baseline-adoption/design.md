# Design: runner-baseline-adoption

## Context

The platform has contracts (`runner-model.md`, ADR-0003/0004/0006/0011) but
no substrate. The upstream `agent-service` substrate is production-proven but
provider-coupled and carries known gaps against the platform contract. The
proposal decided: no IP re-homing — reimplementation against new
platform-owned domain schemas, upstream consumed as design evidence only at
the one-shot pin (`origin/dev` @ `941160c0`).

This design classifies every upstream mechanism, fixes the target
boundaries, and defines the landing seams the issue decomposition is minted
from. See `proposal.md` for scope and governance; the normative adoption
invariants are the `runner-adoption` spec delta.

## Goals

- Preserve the upstream trust mechanisms that earned their keep — authority
  as reviewed data, evidence over claims, refuse-don't-default,
  fail-closed — in platform-native code.
- Make the provider seam neutral from the first landing, so the Copilot CLI
  adapter is an addition, never a rewrite.
- Produce a landing plan whose seams map one-to-one onto mintable issues
  under #19.

## Non-Goals

- Freezing the adapter SPI (U6), selecting workload identity (U2), placing
  runner-control (U4).
- Porting upstream code or schemas.
- Designing the household runner class or any household profile.
- Adopting citation-evidence, publication, observability-explain, QA, or
  knowledge surfaces (deferred with named triggers).

## Current Architecture

Platform side: documented contracts only. `profiles/`, `schemas/`,
`deploy/images/`, `tests/` are placeholder boundaries; `services/runner-control`
is an empty shell scope (#27); no image, no profile schema, no adapter.

Upstream side (evidence, at the pin):

```text
.ai/                          config-as-data: 8 posture profiles, 6 policies
                              (path policy, gate registry, verification packs),
                              11 schemas, prompts; bash pipeline (~38 scripts)
exp-global-packages/
  agent-runner/               trusted host library: ~43.5k lines TS, zero
                              runtime deps, 50 JSON schemas, 30 CLIs
                              (exit 0 / 1-contract / 2-operational), ~768 tests
one monolithic image          provider CLI + gate toolchain + OpenSpec CLI
docker run (hardened)         --cap-drop ALL, no-new-privileges, read-only,
                              tmpfs HOME, declared mounts, argv asserted
```

Trust posture worth naming: the model is untrusted; the workspace diff is
the only source of truth; gates run in `--network none` containers from a
registry of exact argv; paid runs sit behind explicit consent gates;
evidence catalogs are written last and independently verifiable.

Known upstream gaps against `runner-model.md`: model-container egress is
declared `open` (no per-run network isolation ever landed), no resource
ceilings on the model container, cancellation is process convention, the
image is monolithic, orchestration is bash, and the credential is a
long-lived operator token.

## Proposed Architecture

```text
packages/contracts            authored Zod source for the runner domain
                              contracts (ADR-0012) — profile, run, event,
                              evidence, launch, policy, gates
schemas/execution-profile     generated JSON Schema, published for
  · run · …                   language-neutral consumers
packages/runner-core          reimplemented trusted core: validation,
                              eligibility, policy, workspace diff,
                              reconciliation, evidence catalog
                              (no imports from services/* or apps/*)
services/runner-control       NestJS service (#27): lifecycle, profile
                              validation boundary, adapter registry,
                              cancellation/timeout, evidence ports —
                              absorbs what upstream bash owns
agents/adapters/coding/*      per-provider adapters behind the SPI seam
deploy/images/                secure-home-runner-base (neutral)
                              └─ secure-home-runner-copilot (first derived)
                              gate-toolchain image outside the runner lineage
profiles/ (versioned)         the only grant of authority, digest-pinned
tests/framework-conformance   same profile, same run → same events/evidence
                              across adapters
```

Control flow is unchanged from `runner-model.md`: trigger → runner-control →
profile resolution → pinned image launch with granted mounts/network only →
adapter → uniform events → sealed evidence.

## Decisions

### D1: Reimplement against new domain schemas — never port

- **Decision:** upstream code and schemas do not travel. New contracts are
  authored in this repository's domain vocabulary; new code implements
  them. Upstream supplies mechanisms, invariants, and failure lessons.
- **Rationale:** no IP re-homing exists for the `@exprealtytech` assets
  (proposal, decided); reimplementation also removes 20 hardcoded upstream
  path constants, the `.ai/` layout coupling, and the prePR legacy surface
  in one move.
- **Alternatives considered:** code re-homing (rejected: ownership);
  adopting only the JSON schemas (rejected: schemas are equally upstream
  IP, and ADR-0012 makes Zod the authored source here anyway).

### D2: One-shot upstream pin at `941160c0`

- **Decision:** upstream evidence is cited at exactly one commit; no
  periodic re-inventory; re-evaluation only via a new change after upstream
  PR-5 activation.
- **Rationale:** with no vendored code there is nothing to sync; the
  in-flight D11 sequence touches only the deferred citation-evidence
  surface; a floating reference would make every citation unstable.
- **Alternatives considered:** periodic re-inventory (rejected: recurring
  cost with no consumer); tracking upstream `dev` (rejected: evidence rot).

### D3: Zod-authored contracts; upstream's structural validator is replaced

- **Decision:** runner domain contracts are authored as Zod in
  `packages/contracts` and published as generated JSON Schema. The upstream
  zero-dependency JSON-Schema-subset validator is **replace**, not adopt:
  runtime validation authority is Zod; generated schemas serve
  language-neutral consumers.
- **Rationale:** upstream hand-authored raw JSON Schema as the source of
  truth and therefore needed a fail-closed interpreter for it; ADR-0012
  inverts that here. Preserved from upstream: the *invariant* that an
  unenforceable constraint refuses rather than silently passes, and the
  strict `additionalProperties: false` posture.
- **Alternatives considered:** adopting the validator pattern wholesale
  (rejected: duplicates Zod); loosening strictness (rejected: fail-open).

### D4: Claude adapter is the reference vehicle; Copilot is the first derived image

- **Decision:** substrate gaps are closed with a Claude Code adapter as the
  working reference, neutralizing the provider seam as each piece is
  touched; `secure-home-runner-copilot` is the first platform derived
  image. The profile's posture is a provider-tagged union; argv composition
  is a per-provider flag map; transcript parsing is one adapter module per
  provider emitting neutral tool events.
- **Rationale:** never debug substrate hardening and a new adapter at
  once; U6 wants the SPI defined against dissimilar adapters, which
  requires two working ones; the four Copilot capability unknowns
  (structured output, fail-closed tool allowlist, machine-readable
  transcript, cost reporting) are verified by a spike before the derived
  image is designed.
- **Alternatives considered:** Copilot-first (rejected: two unknowns at
  once, loses the injection-tested reference); retiring Claude after the
  port (deferred: the conformance suite needs a second adapter, and
  ADR-0011 is built for coexistence).

### D5: Platform domain vocabulary (proposed — pending owner acceptance)

- **Decision (proposed):** the new domain schemas use platform-native
  terms. Mapping from upstream vocabulary:

| Upstream term            | Platform term (proposed)            |
| ------------------------ | ----------------------------------- |
| candidate (change set)   | proposed change set                 |
| candidate-attributable   | agent-attributable                  |
| operational (failure)    | operational (kept)                  |
| hunter                   | proving test                        |
| landing                  | landing (kept — already in templates) |
| byte accounting / obligation identity | deferred with citation-evidence |

- **Rationale:** reimplementation authors the vocabulary anyway; terms
  should name platform concepts (agents, runs, profiles) rather than
  inherited pipeline jargon. The template vocabulary freeze resolves here:
  templates are reconciled to whatever this table says once accepted.
- **Alternatives considered:** keeping upstream vocabulary wholesale
  (workable but imports concepts with no platform referent).

### D6: The bash orchestrator's responsibilities move to runner-control

- **Decision:** dispatch, consent gating, the phase machine, cancellation,
  workspace lifecycle, gate execution, and evidence finalization — all bash
  upstream — become `services/runner-control` interfaces. This list is the
  #27 scope-revision input.
- **Rationale:** the upstream package is a library of trusted decisions;
  invocation lives outside it. The platform's service boundary makes
  cancellation an API instead of a process convention and gives the
  consent gate an owner.
- **Alternatives considered:** porting the bash (rejected: the platform is
  TypeScript-first and the bash embeds upstream repo layout throughout).

### D7: Image lineage; the gate toolchain leaves the runner lineage

- **Decision:** `secure-home-runner-base` (neutral substrate only) →
  `secure-home-runner-copilot` (first derived; Claude derived image as the
  reference sibling). The verification/gate toolchain becomes its own
  image outside the ADR-0011 runner lineage (working name:
  `secure-home-gates-toolchain`), since it runs repository gates, not
  agents. Digest pins are recorded in profiles.
- **Rationale:** the upstream monolith (provider CLI + toolchain + OpenSpec
  CLI in one image) violates the lineage; separating the toolchain also
  lets gate containers stay `--network none` with a warmed, read-only
  toolchain mount, which upstream proved out.
- **Alternatives considered:** toolchain inside the base (rejected: base
  must stay minimal and provider-free); per-derived toolchains (rejected:
  needless rebuild fan-out). Naming confirmed at the base-image landing.

### D8: Network default-deny and resource ceilings are platform landings

- **Decision:** per-run network isolation with explicit egress allowlists,
  and model-container resource ceilings (memory, CPU, pids, wall clock,
  output size), are first-class landings of this adoption — not inherited,
  because upstream never landed them.
- **Rationale:** `runner-model.md` requires default deny and Pi-safe
  limits; the upstream honestly declares `open` because its enforcement
  never shipped. The declared-but-unenforced state is the one posture the
  platform contract forbids.
- **Alternatives considered:** deferring to a later epic (rejected: every
  profile authored before enforcement would assert a fiction).

## Decision Tables

The classification matrix. Verdicts use the reimplementation semantics from
the proposal: **adopt** = mechanism preserved as-is in new code, **adapt** =
preserved with platform changes, **replace** = deliberately different
mechanism, **defer** = not carried, named trigger.

| Upstream mechanism (evidence at pin)        | Verdict | Platform destination                   | Notes                                                    |
| ------------------------------------------- | ------- | -------------------------------------- | -------------------------------------------------------- |
| Authority-as-data (profile → capabilities)  | adopt   | `profiles/` + execution-profile schema | extended with routing class, principal, knowledge, evidence groups |
| Refuse-don't-default eligibility            | adopt   | `packages/runner-core`                 | refusal before any paid call                              |
| Workspace-diff-is-truth + claim cross-check | adopt   | `packages/runner-core`                 | spec requirement "Evidence outranks claims"               |
| Exit-code outcome discipline (0/1/2)        | adopt   | all runner tools                       | spec requirement "Outcome classification"                 |
| Evidence catalog written last + verifier    | adopt   | `packages/runner-core`                 | independent re-derivation preserved                       |
| Hardened container launch flag set          | adopt   | runner-control launcher                | plus ceilings from D8                                     |
| Consent gates for paid runs                 | adopt   | runner-control                         | becomes an owned API, not env convention                  |
| Gate registry (exact argv, no shell)        | adopt   | platform gate contract                 | model never names a command                               |
| `--network none` gate containers            | adopt   | runner-control + gates toolchain image | read-only warmed toolchain mount                          |
| Path policy / protected-context enforcement | adopt   | `packages/contracts` + runner-core     | repo-declared data, runner-neutral engine                 |
| Posture→argv assertion before launch        | adapt   | per-provider flag map                  | mechanism kept; flags become provider data               |
| Posture profile schema                      | adapt   | execution-profile schema (Zod)         | new field groups; provider-tagged posture union           |
| Transcript → neutral tool events            | adapt   | adapter SPI seam                       | one parser per provider; neutral event contract           |
| Event stream / metrics shapes               | adapt   | run-event contract                     | de-provider-named; uniform across adapters                |
| Seed/packet byte bounds (refuse, never truncate) | adopt | runner-core                        | bound values become profile data                          |
| JSON-Schema-subset structural validator     | replace | Zod (D3)                               | invariant kept: unenforceable ⇒ refuse                    |
| Monolithic image + heredoc Dockerfile       | replace | `deploy/images/` lineage (D7)          | ADR-0011                                                  |
| Bash orchestration                          | replace | `services/runner-control` (D6)         | #27 revision input                                        |
| Long-lived operator token                   | replace | U2 ADR outcome                         | analysis only here; landing stops at the boundary         |
| prePR packet-review pipeline surface        | replace | platform review flow (later change)    | mechanism lessons kept; artifact family not carried       |
| `review-context/` citation evidence         | defer   | —                                      | trigger: upstream PR-5 activation                         |
| GitHub/Jenkins publication surface          | defer   | —                                      | forge wiring is a platform concern later                  |
| Observability explain / experiment planner  | defer   | —                                      | upstream-tool dependent                                   |
| Knowledge bundle wiring (roadmap row 13)    | defer   | —                                      | U7 + `knowledge-selection-model.md` govern here           |
| QA Newman adapter, eval corpus              | defer   | —                                      | no platform consumer                                      |

Gap → landing mapping:

| Platform-contract gap             | Landing (see Landing Seams) |
| --------------------------------- | --------------------------- |
| No domain contracts               | L2                          |
| No image lineage                  | L3                          |
| Copilot capabilities unverified   | L4                          |
| No Copilot adapter/image          | L5                          |
| No cross-adapter conformance      | L6                          |
| Network `open`; no ceilings       | L7                          |

## Interfaces and Contracts

Authored in `packages/contracts` (Zod), published as generated JSON Schema:

- **execution-profile** — identity, runtime (image digest, adapter),
  capability (tools, mounts, network), execution (routing class R0–R3,
  model route, fallback), limits, principal (`sub`/`actor`), knowledge
  (selection reference only — grants nothing), evidence contract.
- **run record / run event** — uniform across adapters; provider identity
  as data.
- **evidence catalog** — artifact inventory, hashes, outcome
  classification, independently verifiable.
- **launch assertion** — ordered argv as data, digest, credential transport
  by env-var name only, `contains_secret_values` inexpressible as true.
- **path policy / gate registry / verification packs** — repository-declared
  data consumed by a neutral engine.

Nothing is frozen by this change. Each contract freezes in its own landing
under its own external authority; the SPI in particular stays unfrozen until
the U6 ADR.

## Failure Classification Boundaries

Classification happens in trusted host code, never in the model or the
adapter. Contract refusal (bound violated → refusal evidence, exit 1) is
distinct from operational failure (environment fault, exit 2); an
undecidable state refuses. Agent-attributable versus operational
classification of run outcomes lives in the evidence contract (vocabulary
per D5).

## Shared vs Independent Logic

- **Shared:** the trusted core (validation, eligibility, policy engines,
  diff, evidence) — one implementation, no provider knowledge.
- **Independently implemented per provider:** transcript parsing, argv flag
  mapping, credential env-var naming, CLI capability quirks. No shared
  provider shims — the SPI seam is the only meeting point, so one adapter
  can never widen another's behavior.

## Compatibility and Migration

Greenfield; no platform behavior exists to migrate. Upstream artifact
formats are explicitly not carried: upstream run evidence stays upstream.
The only continuity obligation is documentary — this change supersedes the
"runner-baseline review" placeholder language in `profiles/README.md` once
merged (that README's warning against pre-review profile authoring is
discharged by this review).

## Security Implications

- No authority is added, moved, or removed by this change; landings add
  enforcement (deny-by-default egress, ceilings) — authority narrows, never
  widens.
- No secrets or credentials anywhere in the adoption; credential transport
  remains env-var-name-only as an invariant, and the credential mechanism
  itself waits for U2.
- The coding runner class keeps zero path to household devices; nothing
  adopted touches L6/L7 or the action path.
- Fail-closed posture is preserved end to end: refusal artifacts, undecidable
  states refuse, unenforceable constraints refuse.

## Landing Seams

Serial where dependent, parallel where not. Each landing is independently
mergeable, lands inert until its consumer exists, and carries its own
external authorizing issue (recorded in `tasks.md`, minted after this change
merges).

```text
L1  ratification            this change merging; #19/#27 revised from it
L2  domain contracts        Zod contracts + generated schemas (inert:
                            nothing consumes until L3+/runner-control)
L3  image lineage           runner-base + gates-toolchain + Claude
                            reference derived image (inert: no profile
                            references them yet)
L4  Copilot capability spike  answers the four verifications (parallel
                            with L3; gates L5's design)
L5  Copilot adapter + derived image
L6  conformance suite       same profile, same run → same events across
                            the two adapters
L7  substrate hardening     per-run network default-deny + resource
                            ceilings (consumes runner-control's launcher;
                            authority posture: enforce)
```

L7 is the only landing that changes enforcement posture; everything before
it is inert or additive. For serial safety: L2 is reviewable purely as
contracts; L3 images are unreferenced until a profile pins them; L5 cannot
merge before L4's evidence exists; L6 requires both adapters; L7 lands last
because a deny-by-default flip with no conformance net would block the
reference adapter blind.

## Open Questions

- D5 vocabulary table — pending owner acceptance; templates reconcile to it
  when accepted.
- `secure-home-gates-toolchain` naming and registry placement — confirmed at
  L3.
- The shape of L5 depends on L4's findings (native structured output vs
  wrapper; transcript availability decides how conduct-audit reimplements).
