# Design: runner-baseline-adoption

## Context

The platform has contracts (`runner-model.md`, ADR-0003/0004/0006/0011) but
no substrate. The upstream substrate is operationally
exercised and heavily tested but provider-coupled, and it carries known gaps
against the platform contract. The proposal decided: no IP re-homing —
reimplementation against new platform-owned domain schemas, upstream
consumed as historical design evidence during this review. After
ratification, this repository owns the resulting truth (D2).

This design classifies every upstream mechanism, fixes the target
boundaries, and defines the landing seams the issue decomposition is minted
from. See `proposal.md` for scope and governance; the normative adoption
invariants are the `runner-adoption` spec delta.

## Goals

- Preserve the upstream trust mechanisms that earned their keep — authority
  as reviewed data, evidence over claims, immutable authority inputs,
  protected governing context, refuse-don't-default, fail-closed — as
  normative requirements first and platform-native code second.
- Make the provider seam neutral from the first landing, so any adapter is
  an addition, never a schema change (ADR-0003's test).
- Produce a landing plan whose seams map one-to-one onto mintable issues
  under #19, with the U6 and U4 ADR gates explicit in the sequence.

## Non-Goals

- Freezing the adapter SPI (U6), selecting workload identity (U2), placing
  runner-control (U4). Landings that need them are gated on their ADRs.
- Porting upstream code or schemas.
- Designing the household runner class or any household profile.
- Adopting citation-evidence, publication, observability-explain, QA, or
  knowledge surfaces (deferred with named triggers).

## Current Architecture

Platform side: documented contracts only. `profiles/`, `schemas/`,
`deploy/images/`, `tests/` are placeholder boundaries; `services/runner-control`
is deliberately a shell (#27) with no Docker access and explicit U2/U4/U6
blocked markers; no image, no profile schema, no adapter.

Upstream side (evidence, as observed during the review):

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

Trust posture worth naming, because the spec now requires it rather than
merely admiring it: the model is untrusted; authority inputs are captured
once and digest-bound; the workspace is an ephemeral derivation of a pinned
base; a run cannot write the material that judges it; the workspace diff is
the only source of truth; gates run in `--network none` containers from a
registry of exact argv; paid runs sit behind explicit consent gates;
evidence catalogs are written last and independently verifiable.

Known upstream gaps against `runner-model.md`: model-container egress is
declared `open` (per-run network isolation never landed), no resource
ceilings on the model container, cancellation is process convention, the
image is monolithic, orchestration is bash, and the provider credential is a
long-lived operator token.

## Proposed Architecture

```text
packages/contracts            authored Zod source (ADR-0012) for the runner
                              domain definitions: execution-profile, run,
                              launch assertion, path policy, gate registry,
                              verification packs
packages/events               run-event vocabulary and evidence-bundle
                              shape (existing boundary, chartered for
                              exactly this; uniform across adapters)
schemas/execution-profile     generated JSON Schema, published for
  · run · …                   language-neutral consumers
packages/runner-core          reimplemented trusted core: validation,
                              eligibility, policy engines, workspace diff,
                              reconciliation, evidence catalog/verifier.
                              Placement: a reusable library with no runtime
                              identity of its own — imported by
                              runner-control, never deployed — which is the
                              ADR-0012 §5 definition of packages/. Its
                              landing registers it in the workspace layout
                              (README + manifest) so the scaffold checks
                              admit it deliberately, not incidentally.
services/runner-control       NestJS service (#27): the typed run-lifecycle
                              state machine (terminal branches REFUSED /
                              OPERATIONAL_FAILURE / CANCELLED / TIMED_OUT /
                              INDETERMINATE), consent to spend, profile
                              resolution, workspace lifecycle, cancellation
                              + timeout, gate scheduling, evidence
                              finalization, adapter invocation — absorbs
                              what upstream bash owns; concrete launcher
                              waits for the U4 ADR. Shell survives only as
                              the container entrypoint (bootstrap, exec)
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

### D2: Adoption conclusions are repository-owned after ratification

- **Decision:** the upstream runner is consumed as historical design
  evidence during this review. Once this change is ratified, the
  classification matrix, requirements, and landing boundaries **in this
  repository** are authoritative for the platform. Subsequent upstream
  changes neither modify nor invalidate this adoption automatically;
  incorporating a later upstream lesson requires an explicit new or
  superseding platform change. The donor repository is evidence and
  history — never a versioned dependency: **nothing in this platform
  executes, resolves, fetches, compares, or gates against an external
  revision.** The observed state the review inspected is recorded in the
  proposal's Existing Evidence as audit context only.
- **Rationale:** with no vendored code there is nothing to sync, and with
  repository-owned conclusions there is nothing to drift. A normative
  external commit pin would have given stability at the price of coupling
  this repository to another repository's commit history; ownership gives
  the same stability without the coupling.
- **Alternatives considered:** a normative one-shot upstream commit pin
  (rejected: makes a donor SHA part of the platform contract); periodic
  re-inventory (rejected: recurring cost with no consumer); tracking
  upstream `dev` (rejected: evidence rot).

### D3: Zod-authored contracts; upstream's structural validator is replaced

- **Decision:** runner domain contracts are authored as Zod in
  `packages/contracts` (with the run-event and evidence vocabulary in
  `packages/events` — see D9) and published as generated JSON Schema. The
  upstream zero-dependency JSON-Schema-subset validator is **replace**, not
  adopt: runtime validation authority is Zod; generated schemas serve
  language-neutral consumers.
- **Rationale:** upstream hand-authored raw JSON Schema as the source of
  truth and therefore needed a fail-closed interpreter for it; ADR-0012
  inverts that here. Preserved from upstream: the *invariant* that an
  unenforceable constraint refuses rather than silently passes, and the
  strict `additionalProperties: false` posture.
- **Alternatives considered:** adopting the validator pattern wholesale
  (rejected: duplicates Zod); loosening strictness (rejected: fail-open).

### D4: Claude is the reference vehicle; the Copilot adapter waits for the U6 ADR

- **Decision:** substrate gaps are closed with a Claude Code adapter as the
  working reference. The execution-profile schema stays fully neutral: a
  provider or framework name appears **only as the opaque value of the
  `adapter` field** (ADR-0003). Provider-specific flag mapping, transcript
  parsing, and credential handling live entirely behind the adapter
  boundary; **no provider-specific configurable structure enters any
  platform contract before the U6 ADR**. The sequence is: Copilot
  capability/credential spike → **#11/U6 SPI ADR (human acceptance)** →
  the platform Claude reference adapter, the Copilot adapter, and the
  Copilot derived image (U6 blocks every adapter, the reference one
  included; before the ADR, Claude participates as the reference image and
  spike vehicle only). Claude↔Copilot conformance is a
  **coding-adapter conformance seed**; framework conformance completes only
  with a dissimilar adapter (a plain deterministic loop), per U6's recorded
  approach.
- **Rationale:** never debug substrate hardening and a new adapter at once;
  U6 explicitly blocks every adapter until the SPI ADR exists and requires
  the SPI be defined against the two most dissimilar adapters — two coding
  CLIs cannot stand in for that proof. The spike's five properties
  (structured output, fail-closed tool allowlisting, machine-readable
  transcript, cost/usage reporting, noninteractive credential injection and
  isolation) are evidence *for* the U6 ADR, not a substitute for it.
- **Alternatives considered:** provider-tagged posture union in the profile
  schema (**rejected: violates ADR-0003 and this change's own spec — a
  discriminator is an enum position, and adding an adapter would change the
  schema**); Copilot-first (rejected: two unknowns at once, loses the
  injection-tested reference); retiring Claude after the port (deferred:
  the conformance suite needs a second adapter, and ADR-0011 is built for
  coexistence).

### D5: Platform domain vocabulary (accepted 2026-08-09)

- **Decision (accepted):** the new domain schemas use platform-native
  terms. Mapping from upstream vocabulary:

| Upstream term                          | Platform term                         |
| -------------------------------------- | ------------------------------------- |
| candidate (change set)                 | proposed change set                   |
| candidate-attributable                 | change-attributable                    |
| operational (failure)                  | operational (kept)                    |
| hunter                                 | proving test                          |
| landing                                | landing (kept — already in templates) |
| byte accounting / obligation identity  | deferred with citation-evidence       |

- **Rationale:** reimplementation authors the vocabulary anyway; terms
  should name platform concepts rather than inherited pipeline jargon.
  `change-attributable` (not `agent-attributable`): a reviewer can discover
  a defect in a human-authored change or one produced by another agent —
  the failure belongs to the change being evaluated, never the reviewing
  agent. The canonical workflow templates are reconciled to this table in
  the same seam that accepted it.
- **Alternatives considered:** keeping upstream vocabulary wholesale
  (workable but imports concepts with no platform referent).

### D6: Orchestration leaves bash — runner-control owns the run lifecycle

- **Decision:** the upstream bash crossed from automation glue into
  application logic: it owns dispatch, consent, lifecycle phases,
  cancellation, workspace state, gate execution, and evidence finalization —
  a stateful control-plane application written as shell scripts. Those
  responsibilities become `services/runner-control`, modeled as an explicit
  **typed run-lifecycle state machine**:

  ```text
  REQUESTED → PROFILE_RESOLVED → ELIGIBLE → SANDBOX_STARTED → RUNNING
            → VERIFYING → EVIDENCE_SEALED → COMPLETED
  terminal branches: REFUSED · OPERATIONAL_FAILURE · CANCELLED ·
                     TIMED_OUT · INDETERMINATE
  ```

  Illegal transitions are impossible by construction or loudly rejected;
  ambiguous state never becomes success (normative in the spec delta). The
  responsibility split is fixed, one owner per concern:

  ```text
  runner-core    = decisions      eligibility, policy, path/protected-
                                  context, diff/reconciliation, evidence
                                  construction/verification, deterministic
                                  classification
  runner-control = orchestration  state machine, consent to spend, profile
                                  resolution, workspace lifecycle,
                                  cancellation + timeout, gate scheduling,
                                  evidence finalization, adapter invocation
  adapter        = provider translation
  profile        = authority
  sandbox        = untrusted execution
  ```

  **D6 relocates a trust boundary.** Upstream, decision-bearing
  orchestration executes from proposed-change-writable worktree files —
  the donor's recorded gap: three landings ensured a change could not
  alter the policy data judging it, while the change could still alter
  the code *interpreting* that data. The platform replacement moves those
  decisions into trusted platform-controlled code outside the sandbox's
  write authority — a provenance and write-isolation invariant (the
  spec's judge-protection requirement now names orchestration code), not
  a physical-placement claim: placement stays with U4. The typed state
  machine is the mechanism that makes the boundary explicit and testable.

  The donor defect catalog is the evidence: duplicate gate execution
  (identity uniqueness should be structural — unrepresentable, not a
  runtime run-once guard); lifecycle-by-grep (a hand-rolled
  INDETERMINATE); exit/return propagation by convention (typed outcomes);
  ambient environment overrides as undeclared authority (captured-once
  applied to orchestration itself); the dual-implementation tax
  (orchestration invokes the one trusted decision implementation, never
  reproduces it).

  **Shell may execute; shell may not decide.** Thin shell/process
  adapters may bootstrap and execute a trusted, already-determined plan
  and report raw execution results. They do not own eligibility, policy
  interpretation, gate membership, outcome classification,
  reconciliation, or authoritative evidence finalization.

  Shell survives only as the container entrypoint: bootstrap the
  environment, `exec` runner-control. **None of the 38 upstream scripts is
  ported and cleaned up later** — the invariants they discovered are
  preserved through runner-core and the state machine; the accidental shell
  architecture is discarded.

  Honest boundary: #27 is today deliberately a shell with no Docker access
  and explicit U2/U4/U6 blocked markers. The orchestration lands behind an
  execution port with no container launch; the **concrete launcher and any
  enforcement land only after the U4 ADR (#9)** decides placement,
  resource-starvation posture, credential custody, and mount isolation.
- **Rationale:** bash-as-control-plane defeats exactly what the adoption
  exists to keep — typed state transitions, structured failures,
  cancellation semantics, concurrency, testability, invariant enforcement,
  reliable recovery. The upstream split was already half-right: the trusted
  package answers "given these facts, what is allowed / what happened /
  what does the evidence prove," while the bash answers "what do we do
  next." Those are different concerns; this makes the split total and gives
  the consent gate and cancellation an owner with an API.
- **Alternatives considered:** porting the 38 scripts and cleaning up later
  (**rejected: carries the accidental architecture forward** — the
  platform is TypeScript-first and the bash embeds upstream repo layout
  throughout); folding orchestration into runner-core (rejected: decisions
  and orchestration are different concerns — mixing them is the upstream
  shape being corrected).

### D7: Image lineage; the gate toolchain leaves the runner lineage

- **Decision:** `secure-home-runner-base` (neutral substrate only) →
  `secure-home-runner-copilot` (first derived; Claude derived image as the
  reference sibling). The verification/gate toolchain becomes its own image
  outside the ADR-0011 runner lineage (working name:
  `secure-home-gates-toolchain`), since it runs repository gates, not
  agents. Digest pins are recorded in profiles.
- **Rationale:** the upstream monolith (provider CLI + toolchain + OpenSpec
  CLI in one image) violates the lineage; separating the toolchain also
  lets gate containers stay `--network none` with a warmed, read-only
  toolchain mount, which upstream proved out.
- **Alternatives considered:** toolchain inside the base (rejected: base
  must stay minimal and provider-free); per-derived toolchains (rejected:
  needless rebuild fan-out). Naming confirmed at the image-lineage landing.

### D8: Network default-deny and resource ceilings are platform landings

- **Decision:** per-run network isolation with explicit egress allowlists,
  and model-container resource ceilings (memory, CPU, pids, wall clock,
  output size), are first-class landings of this adoption — not inherited,
  because upstream never landed them. They are **gated by the U4 ADR**,
  which owns placement, starvation, and isolation decisions, and they
  require the concrete runner-control launcher.
- **Rationale:** `runner-model.md` requires default deny and Pi-safe
  limits; the upstream honestly declares `open` because its enforcement
  never shipped. The declared-but-unenforced state is the one posture the
  platform contract forbids.
- **Alternatives considered:** deferring to a later epic (rejected: every
  profile authored before enforcement would assert a fiction); landing
  enforcement before U4 (rejected: enforcement without a placement decision
  hard-codes one).

### D9: Contract ownership follows the existing workspace charters

- **Decision:** execution-profile, run, launch-assertion, path-policy,
  gate-registry, and verification-pack definitions are authored in
  `packages/contracts`; the **run-event vocabulary and evidence-bundle
  shape are authored in `packages/events`**, whose README already charters
  exactly that (uniform across adapters, no provider names structurally,
  evidence never optional). `packages/runner-core` is added as a new
  classified member of `packages/` (reusable library, no runtime identity,
  imported by runner-control), registered in the workspace layout at its
  landing.
- **Rationale:** the scaffold deliberately created `packages/events` for
  this vocabulary; silently collapsing it into `contracts` would break the
  workspace's own charter and its checks, which reject unclassified
  members.
- **Alternatives considered:** everything in `packages/contracts`
  (rejected: conflicts with the existing boundary); a new events package
  (rejected: it already exists).

## Decision Tables

The classification matrix. Verdicts use the reimplementation semantics from
the proposal: **adopt** = mechanism preserved as-is in new code, **adapt** =
preserved with platform changes, **replace** = deliberately different
mechanism, **defer** = not carried, named trigger.

| Upstream mechanism (observed evidence)           | Verdict | Platform destination                     | Notes                                                              |
| ------------------------------------------------ | ------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Authority-as-data (profile → capabilities)       | adopt   | `profiles/` + execution-profile schema   | extended with routing class, principal, knowledge, evidence groups |
| Refuse-don't-default eligibility                 | adopt   | `packages/runner-core`                   | refusal before any paid call                                       |
| Read-once, digest-bound authority inputs         | adopt   | `packages/runner-core`                   | spec: "Authority inputs are captured once and digest-bound"        |
| Protected governing context (run can't judge-shop) | adopt | `packages/runner-core`                   | spec: "A run cannot alter what judges it"                          |
| Workspace-diff-is-truth + claim cross-check      | adopt   | `packages/runner-core`                   | spec: "Evidence outranks claims"                                   |
| Exit-code outcome discipline (0/1/2)             | adapt   | CLI boundaries + runner-control          | CLIs retain 0/1/2; runner-control exposes typed service outcomes (D6 state machine) |
| Evidence catalog written last + verifier         | adopt   | `packages/runner-core`                   | spec: "sealed, independently re-derivable, fail-closed"            |
| Hardened container launch posture                | adapt   | runner-control launcher (post-U4)        | posture kept; ceilings added (D8); expressed runtime-neutrally     |
| Consent gates for paid runs                      | adopt   | runner-control                           | becomes an owned API, not env convention                           |
| Gate registry (exact argv, no shell)             | adopt   | platform gate contract                   | spec: "Gates execute only from the exact-argv registry"            |
| `--network none` gate containers                 | adopt   | runner-control + gates toolchain image   | read-only warmed toolchain mount                                   |
| Path policy / protected-context enforcement      | adopt   | `packages/contracts` + runner-core       | repo-declared data, runner-neutral engine                          |
| Seed/packet byte bounds (refuse, never truncate) | adopt   | runner-core                              | spec: "Security-relevant bounds refuse, never truncate"            |
| Posture→argv assertion before launch             | adapt   | adapter boundary                         | mechanism kept; provider flags live behind the adapter, never in contracts |
| Posture profile schema                           | adapt   | execution-profile schema (Zod)           | new field groups; adapter as opaque value (ADR-0003); provider structure waits for U6 |
| Transcript → neutral tool events                 | adapt   | adapter SPI seam                         | one parser per provider; neutral event contract in `packages/events` |
| Event stream / metrics shapes                    | adapt   | `packages/events` run-event contract     | de-provider-named; uniform across adapters                         |
| Provider CLI credential custody                  | replace | adapter boundary + spike property 5      | noninteractive injection; no persistence in `$HOME`, caches, workspace, image layers, or after teardown |
| Platform workload identity (agent principal)     | —       | U2 ADR (#7) — nothing to adopt           | upstream had no platform principal; analysis only                  |
| JSON-Schema-subset structural validator          | replace | Zod (D3)                                 | invariant kept: unenforceable ⇒ refuse                             |
| Monolithic image + heredoc Dockerfile            | replace | `deploy/images/` lineage (D7)            | ADR-0011                                                           |
| Bash orchestration                               | replace | `services/runner-control` (D6)           | #27 revision input; launcher gated by U4                           |
| prePR packet-review pipeline surface             | replace | platform review flow (later change)      | mechanism lessons kept; artifact family not carried                |
| `review-context/` citation evidence              | defer   | —                                        | re-adoption only via a new governed platform change; the upstream disclosure work settling is timing context, not a contract term |
| GitHub/Jenkins publication surface               | defer   | —                                        | forge wiring is a platform concern later                           |
| Observability explain / experiment planner       | defer   | —                                        | upstream-tool dependent                                            |
| Knowledge bundle wiring (roadmap row 13)         | defer   | —                                        | U7 + `knowledge-selection-model.md` govern here                    |
| QA Newman adapter, eval corpus                   | defer   | —                                        | no platform consumer                                               |

Gap → landing mapping:

| Platform-contract gap                      | Landing (see Landing Seams) |
| ------------------------------------------ | --------------------------- |
| No domain contracts                        | L2                          |
| No trusted core                            | L3                          |
| Orchestration is bash; no lifecycle owner  | L4                          |
| No image lineage                           | L5                          |
| Copilot capabilities/custody unverified    | L6                          |
| No platform adapter implementations        | L7 (post-U6 ADR)            |
| No coding-adapter conformance              | L8                          |
| Network `open`; no ceilings; no launcher   | L9 (post-U4 ADR)            |
| No framework-neutral conformance proof     | L10                         |

## Interfaces and Contracts

Authored in `packages/contracts` (Zod), published as generated JSON Schema:

- **execution-profile** — identity, runtime (image digest; `adapter` as an
  opaque value), capability (tools, mounts, network), execution (routing
  class R0–R3, model route, fallback), limits, principal (`sub`/`actor`),
  knowledge (selection reference only — grants nothing), evidence contract.
- **launch assertion** — ordered argv as data, digest, credential transport
  by env-var name only, `contains_secret_values` inexpressible as true.
- **path policy / gate registry / verification packs** — repository-declared
  data consumed by a neutral engine.

Authored in `packages/events` (Zod), per its existing charter:

- **run record / run event** — uniform across adapters; provider identity
  as data; stable dotted event names.
- **evidence bundle / catalog** — artifact inventory, hashes, outcome
  classification, independently verifiable; evidence never optional.

Nothing is frozen by this change. Each contract freezes in its own landing
under its own external authority; the SPI in particular stays unfrozen until
the U6 ADR.

## Failure Classification Boundaries

Classification happens in trusted host code, never in the model or the
adapter. Contract refusal (bound violated → refusal evidence, exit 1) is
distinct from operational failure (environment fault, exit 2); an
undecidable state refuses. Change-attributable versus operational
classification of run outcomes lives in the evidence contract (vocabulary
per D5).

## Shared vs Independent Logic

- **Shared:** the trusted core (validation, eligibility, policy engines,
  diff, evidence) — one implementation, no provider knowledge.
- **Independently implemented per provider:** transcript parsing, argv flag
  mapping, credential env-var naming and custody, CLI capability quirks. No
  shared provider shims — the SPI seam is the only meeting point, so one
  adapter can never widen another's behavior.

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
- No secrets or credentials anywhere in the adoption. Credential transport
  remains env-var-name-only as an invariant; provider credential custody is
  proven at the spike (no persistence in `$HOME`, caches, workspace, image
  layers, or after teardown); the platform workload-identity mechanism
  itself waits for U2.
- The coding runner class keeps zero path to household devices; nothing
  adopted touches L6/L7 or the action path.
- Fail-closed posture is preserved end to end and is now normative:
  refusal artifacts, undecidable states refuse, unenforceable constraints
  refuse, evidence-finalization failure can never become success.

## Landing Seams

Serial where dependent, parallel where not. Each landing is independently
mergeable, lands inert until its consumer exists, and carries its own
external authorizing issue (minted after this change merges, indexed under
#19, and recorded in that landing's child change `tasks.md` — never by
editing this parent). The two human ADR gates are part of the sequence, not
landings of this change.

```text
L1  ratification              this change merging; #19/#27 revised from it
L2  domain contracts          Zod contracts in packages/contracts +
                              packages/events (inert: nothing consumes yet)
L3  trusted runner-core       packages/runner-core: validation, eligibility,
    + proof net               policy, workspace observation, reconciliation,
                              evidence construction/verification — with its
                              own proof net, before anything consumes it
L4  runner-control            the lifecycle state machine, consent,
    orchestration             cancellation + timeout, workspace lifecycle,
                              gate scheduling, evidence finalization —
                              behind an execution port, no container launch
                              (#27 constraints hold; launcher waits for
                              U4). Proves the core/control boundary:
                              decisions cannot orchestrate, orchestration
                              cannot decide
L5  image lineage             runner-base + gates-toolchain + Claude
                              reference derived image (inert: no profile
                              references them yet)
L6  Copilot capability +      answers the five verifications, incl.
    credential spike          credential injection/isolation (parallel
                              with L5; evidence for the U6 ADR)
──  GATE: #11 / U6 ADR        human-accepted SPI decision, defined against
                              dissimilar adapters
L7  platform adapters       Claude reference adapter + Copilot adapter +
                              Copilot derived image (all post-U6)
L8  coding-adapter            Claude ↔ Copilot: same profile, same run →
    conformance seed          same events/evidence. A seed, not framework
                              conformance
──  GATE: #9 / U4 ADR         placement, starvation, credential custody,
                              mount isolation
L9  launcher + enforcement    concrete runner-control launcher; per-run
                              network default-deny + resource ceilings
                              (authority posture: enforce)
L10 framework-neutral         deterministic-loop adapter joins the matrix;
    conformance               completes the ADR-0003 conformance claim
```

Some landings may later be combined or parallelized; the conceptual
boundaries stay.

One evidence note for L4: the donor repository intends to export a
lifecycle census, a bash failure-mode catalog, frozen machine-readable
surface semantics, an execute-vs-decide inventory, and a
shadow-conformance plan. The L4 child author **distills** those materials
into platform-owned state models, requirements, and hostile corpora that
stand on their own — the donor documents are evidence and history, never
cited authority, and no child artifact needs a donor revision reference
beyond optional audit context (D2). Once distilled, a requirement such as
"SKIP_ENV never normalizes to SKIP_OK" is a platform truth independent of
where the lesson was learned.

Serial safety: L2 is reviewable purely as contracts; L3 lands the trusted
core with its own proof net before anything consumes it; L4 lands
orchestration against the core through typed interfaces, with the boundary
proven in both directions by dependency checks and no container launch; L5
images are unreferenced until a profile pins them; L7 cannot merge before
the U6 ADR is accepted and L6's evidence exists — and it implements both
platform adapters, so L8 has two real parties; L9 cannot land before the
U4 ADR because enforcement without a placement decision hard-codes one; L10
is the only point at which "uniform across adapters" may be claimed at
ADR-0003's full strength.

## Open Questions

- `secure-home-gates-toolchain` naming and registry placement — confirmed at
  L5.
- The shape of L7 depends on L6's findings (native structured output vs
  wrapper; transcript availability decides how the conduct-audit mechanism
  reimplements).
- Whether L10's deterministic-loop adapter is authored inside this change's
  landing plan or as the first landing of the household-runner change —
  decided when the U6 ADR fixes the SPI's shape.
