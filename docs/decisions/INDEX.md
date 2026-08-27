# docs/decisions/ — Architecture Decision Records

An ADR records **why** a decision was made, not just what it is. It is the
answer to "why is it like this?" eighteen months from now.

> **All eleven foundational ADRs are `Accepted`** as of **2026-08-05**, by
> @mikegtech (repository owner), in PR #2. They are now **immutable**: reverse or
> amend a decision by writing a new ADR that supersedes it — never by editing an
> accepted file.
>
> **Neither foundational acceptance resolved anything in
> [`unresolved-decisions.md`](../architecture/unresolved-decisions.md).** Three
> items have closed since: **[U6](../architecture/unresolved-decisions.md#u6)**,
> by [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) on 2026-08-12;
> **[U7](../architecture/unresolved-decisions.md#u7)**, by
> [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) on
> 2026-08-15; and **[U4](../architecture/unresolved-decisions.md#u4)**, by
> [ADR-0020](ADR-0020-place-runner-control-by-workload-class.md) on 2026-08-26 —
> three of the tracked set **U1–U11**. Every other item still
> blocks the work that depends on it; U7's closure decided the knowledge
> format without opening knowledge authoring, and U4's decided placement
> without deploying anything. See
> [What acceptance does and does not unblock](#what-acceptance-does-and-does-not-unblock).

This index is validated by [`scripts/validate-scaffold.sh`](../../scripts/validate-scaffold.sh):
every ADR file referenced here must exist, and every ADR file present must be
referenced here.

## Conventions

- Filenames are `ADR-NNNN-short-title.md`, zero-padded, never renumbered.
- Status is one of `Proposed`, `Accepted`, `Superseded`, `Rejected`.
- An accepted ADR is **immutable**. Reverse it with a new ADR that supersedes it;
  do not edit history.
- Every ADR carries: status, date, context, decision, consequences, alternatives
  considered, security implications, availability implications, validation and
  follow-up obligations, and links.
- Write an ADR when the trade-off was real and another reasonable engineer would
  have chosen differently.

## Acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-05 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0001 … ADR-0011, as one set |
| **Unresolved decisions resolved** | **none** — every item then open stayed open, by explicit decision |
| **Review** | PR #1 (scaffold), three rounds of security review; PR #2 (acceptance) |

The set was accepted **as a whole**, which matters:
[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md),
[ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
and [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) are
only defensible in combination — the three-control separation, the bound
approval, and the degraded-mode classes each assume the other two.

## What acceptance does and does not unblock

**Now unblocked** — an accepted ADR can be implemented against, once a task
contract or issue authorizes the specific work
([`.github/agents/implementation.agent.md`](../../.github/agents/implementation.agent.md)):

- the execution-profile, run, action, and automation schemas;
- the runner substrate, and — since **ADR-0013** closed
  [U6](../architecture/unresolved-decisions.md#u6) on 2026-08-12 — the adapter
  SPI in full, not only its neutral parts;
- the household authorization model's structure (types, relations, delegation);
- the deterministic safety-policy declaration format and evaluator;
- the knowledge-bundle validator and the four OKF interfaces;
- the base runner image and the derived per-provider images;
- conformance and policy-scenario test suites;
- **GATE-U4, and nothing else** — since **ADR-0020** closed
  [U4](../architecture/unresolved-decisions.md#u4) on 2026-08-26, the launcher
  landing is no longer waiting on a *decision*. It is not therefore next: L9's
  prerequisites are **`L8 + GATE-U4`**, L8 (#56) has not landed and is not
  authorized to implement, and L9 needs its own task contract on top of that.
  No launcher, network default-deny, resource ceiling, or isolation mechanism
  exists or is authorized by that acceptance.

**Still blocked** — acceptance changed nothing here, because these depend on
questions the ADRs deliberately left open:

| Blocked work | Blocked on |
|---|---|
| Any offline/bounded local authority mechanism | [U1](../architecture/unresolved-decisions.md#u1) — **BOUNDED still behaves as FAIL CLOSED** |
| Issuing run credentials to a sandbox | [U2](../architecture/unresolved-decisions.md#u2) |
| Building the L6 envelope issuer | [U3](../architecture/unresolved-decisions.md#u3) |
| Deploying `runner-control` to a host | ~~[U4](../architecture/unresolved-decisions.md#u4)~~ — **decided** by [ADR-0020](ADR-0020-place-runner-control-by-workload-class.md) (2026-08-26), which closed the decision and nothing else. Still blocked on **L8 (#56), which has not landed**, and then on L9's own task contract: L9 (#57) implements the launcher, network default-deny, and resource ceilings, and none of that exists |
| Automation persistence and scheduling | [U5](../architecture/unresolved-decisions.md#u5) |
| Authoring `household/**` knowledge, or releasing any set | `blockedByRollout` — both remain rollout-blocked (ADR-0016 §7a). Runbooks are allowlisted per module, never by directory; `knowledge/catalog.json` is authoritative for current eligibility |
| **Publishing** any knowledge bundle | no governed **Proof B** producer exists ([ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) §5a). Discharging readiness did not unblock publication |
| Deploying an OpenFGA store | [U8](../architecture/unresolved-decisions.md#u8) |
| Caching an authorization decision | [U9](../architecture/unresolved-decisions.md#u9) |
| Giving `action-gateway` a Home Assistant credential | [U10](../architecture/unresolved-decisions.md#u10) |

**Knowledge authoring is no longer blocked on the toolchain gate.** The
[ADR-0015 §12](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
obligation was **discharged on 2026-08-16** after independent review of the
toolchain, its conformance suite, and repository content admission, so
`blockedByToolchain` is `false` on all 23 catalog entries. Authoring the ten
`platform/**` modules is eligible; everything else is held by `blockedByRollout`,
and publication is held separately by the absent Proof B producer.
[U7](../architecture/unresolved-decisions.md#u7) is **RESOLVED** and was never
this gate.

**Acceptance is not authorization to deploy.** No runtime service, no
credential, and no Home Assistant instance is authorized by this change. Those
require their own reviewed work, and several require an unresolved decision to be
closed first.

Each accepted ADR's *"Validation and follow-up obligations"* section is now a
live obligation rather than a proposal.

## The foundational set

These eleven ADRs are one coherent set. Several are only defensible in
combination — in particular
[ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md),
[ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md),
and [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md).

| ADR | Title | Status | Governs |
|---|---|---|---|
| [ADR-0001](ADR-0001-adopt-security-first-architecture.md) | Adopt the security-first platform architecture by pinned reference | Accepted | the whole repository |
| [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md) | Adopt a hybrid-home deployment profile | Accepted | [`deploy/`](../../deploy/), [`services/`](../../services/) |
| [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md) | Use framework-neutral runner contracts and execution profiles | Accepted | [`profiles/`](../../profiles/), [`agents/adapters/`](../../agents/adapters/), [`services/runner-control/`](../../services/runner-control/) |
| [ADR-0004](ADR-0004-treat-agents-as-clients.md) | Treat agents as clients, not insiders | Accepted | [`agents/`](../../agents/), [`services/`](../../services/) |
| [ADR-0005](ADR-0005-separate-capability-authorization-and-safety.md) | Separate sandbox capability, platform authorization, and safety policy | Accepted | [`services/policy-engine/`](../../services/policy-engine/), [`services/action-gateway/`](../../services/action-gateway/) |
| [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md) | Separate agent implementation, execution profile, run, and automation | Accepted | [`agents/`](../../agents/), [`profiles/`](../../profiles/), [`schemas/`](../../schemas/), [`services/automation-service/`](../../services/automation-service/) |
| [ADR-0007](ADR-0007-route-local-remote-and-cloud-execution-explicitly.md) | Route local, remote, and cloud execution explicitly | Accepted | [`profiles/`](../../profiles/), [`schemas/execution-profile/`](../../schemas/execution-profile/) |
| [ADR-0008](ADR-0008-use-openfga-for-relationships-and-deterministic-policy-for-safety.md) | Use OpenFGA for relationship decisions and deterministic policy for safety | Accepted | [`services/policy-engine/`](../../services/policy-engine/), [`services/pi-api/`](../../services/pi-api/) |
| [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) | Define degraded mode and offline authorization posture | Accepted | [`services/`](../../services/), [`docs/architecture/degraded-mode.md`](../architecture/degraded-mode.md) |
| [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) | Use OKF for portable knowledge only | Accepted | [`knowledge/`](../../knowledge/) |
| [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md) | Keep the base runner provider-neutral and coding-agent images provider-specific | Accepted | [`deploy/images/`](../../deploy/images/), [`agents/adapters/coding/`](../../agents/adapters/coding/) |

## Implementation decisions

The foundational set decides the *logical* architecture and is deliberately
implementation-neutral. These decide how it is built.

| ADR | Title | Status | Governs |
|---|---|---|---|
| [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) | Adopt TypeScript, NestJS, and pnpm as the primary implementation stack | Accepted | [`apps/`](../../apps/), [`packages/`](../../packages/), [`services/`](../../services/), [`schemas/`](../../schemas/) |
| [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) | Define the runner adapter SPI | Accepted | [`agents/adapters/`](../../agents/adapters/), [`services/runner-control/`](../../services/runner-control/) |
| [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) | Promote durable lessons into canonical architecture and portable knowledge | Accepted | [`docs/`](../), [`knowledge/`](../../knowledge/), provider instruction files |
| [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) | Adopt OKF v0.2 as the source representation only, and keep packaging, query, and admission ours | Accepted | [`knowledge/`](../../knowledge/), the knowledge toolchain |
| [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) | Hybrid admission assurance for prohibited content | Accepted | [`knowledge/`](../../knowledge/), the knowledge toolchain |
| [ADR-0017](ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md) | Classify asynchronous effects and enforce their semantics at runner boundaries | Accepted | [`services/runner-control/`](../../services/runner-control/), any port implementation |
| [ADR-0018](ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md) | Separate orchestration-attempt, durable-fact, and finalization-transaction identity | Accepted | [`services/runner-control/`](../../services/runner-control/), any finalization participant |
| [ADR-0019](ADR-0019-version-and-release-knowledge-sets-as-immutable-compositions.md) | Version and release knowledge sets as immutable compositions | Accepted | [`knowledge/`](../../knowledge/) set families and releases |
| [ADR-0020](ADR-0020-place-runner-control-by-workload-class.md) | Place runner-control by workload class — household control on the Pi, coding execution off it | Accepted | [`services/runner-control/`](../../services/runner-control/), [`deploy/`](../../deploy/) |

> **ADR-0020 is `Accepted`** (2026-08-26) and **immutable**. It
> **resolves [U4](../architecture/unresolved-decisions.md#u4)** — the first
> placement decision this repository has made — and satisfies **GATE-U4 only**.
> L9 (#57) stays blocked on L8 (#56) and on its own task contract, and none of
> it is implemented. See
> [the ADR-0020 acceptance record](#adr-0020-acceptance-record).
>
> **ADR-0019 is `Accepted`** (2026-08-21) and **immutable**. See
> [the ADR-0019 acceptance record](#adr-0019-acceptance-record). It **refines
> ADR-0016 §7/§7a on the set side only** — the release transition and the
> representation in which set rollout eligibility lives — **without editing
> it**; every module and runbook decision there is preserved.
>
> **Acceptance authorizes the shape of the work, not the work.** No set is
> versioned or released, no rollout gate has moved, and no release record,
> resolver, or profile schema exists. Implementing it needs its own task
> contract.
>
> **ADR-0017 is `Accepted`** (2026-08-17) and **immutable**. See
> [the ADR-0017 acceptance record](#adr-0017-acceptance-record).
>
> **ADR-0018 is `Accepted`** (2026-08-17) and **immutable**. See
> [the ADR-0018 acceptance record](#adr-0018-acceptance-record). Its dependency
> on ADR-0017 was satisfied *before* it was accepted, and each was a separate
> explicit decision — which is what proposing two ADRs was for.
>
> **ADR-0012 is `Accepted`** (2026-08-06) and **immutable**. It **refines**
> ADR-0003 and ADR-0006 — deciding how their contracts are authored — without
> editing or superseding either. See
> [the ADR-0012 acceptance record](#adr-0012-acceptance-record).

## Under review

An ADR here is **`Proposed`**. It decides nothing yet: it does not close an
unresolved decision, does not authorize implementation, and does not constrain a
change that lands before it is accepted. Acceptance is a separate human-reviewed
action in its own change.

**Nothing is currently under review.**

### ADR-0020 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-26 |
| **Accepted by** | @mikegtech (repository owner) |
| **Accepted at** | [`47bb2e8`](https://github.com/pulse-ops-ai/secure-home-agent-platform/commit/47bb2e8) — the exact reviewed content, after two acceptance-review rounds |
| **Review** | PR #97 (proposal), PR #100 (acceptance-review corrections), and the acceptance change itself |
| **Depends on** | [ADR-0002](ADR-0002-adopt-hybrid-home-deployment-profile.md) (ingress paths, availability contract), [ADR-0007](ADR-0007-route-local-remote-and-cloud-execution-explicitly.md) (routing classes), [ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) (degraded posture), [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md), [ADR-0013](ADR-0013-define-the-runner-adapter-spi.md), [ADR-0017](ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md) — all already accepted |
| **Scope** | ADR-0020 in full: placement decided per workload class; initial and target placement; what may never move; control plane versus execution substrate; one package, two deployments; the migration boundary; credential, network, blast-radius, and degraded-mode implications; the candidate matrix; and the L9 obligations O1–O9 it creates |
| **Unresolved decisions resolved** | **[U4](../architecture/unresolved-decisions.md#u4)** — `runner-control` placement (issue #9) |
| **Changes no accepted ADR** | it selects a topology inside the space ADR-0002 and ADR-0007 already define |
| **Changes no contract** | no schema, no profile field, no port signature |

**What was accepted.** Placement is decided **per workload class**, not per
repository: household orchestration and household execution stay on the Pi;
coding orchestration and coding execution move off it, onto a host that is
neither the Pi nor the authoritative-database host. One package, two
deployments.

**What acceptance does not do.** It implements nothing. **L9 (#57) remains
unimplemented** — no launcher, no network default-deny, no resource ceilings,
no isolation mechanism. Acceptance satisfied L9's GATE-U4 and no other
prerequisite: `L9 ← L8 + GATE-U4`, L8 (#56) has not landed, and L9 needs its
own task contract besides.

**On the host, precisely.** ADR-0020 §2 **does select the initial coding host**
— the workstation-class tailnet machine — and §3 states the target as a role
(`coding-execution`) filled operationally under four invariants. Selecting it
is not standing it up: no deployment asset was written, no host was
provisioned, and no credential exists. Whether that selection should become a
declared, reviewable **profile property** rather than an operational
consequence is a different question, left open as obligation F3.

**Obligation status at acceptance.** **F5 is discharged by this change** — it
is the obligation that *defines* the accepting change, so it can be discharged
by nothing else. **F1, F2, F3, F4, and F6 are open.** F1 (the mechanical check
that no coding-class profile grants household reach), F2 (version skew between
the two deployments), and F4 (re-scoped contention evidence) belong to L9 (#57).
F3 — whether execution-host placement becomes a declared, reviewable profile
property — is undecided and needs its own ADR or tracked item; acceptance did
not answer it and forbids answering it by a schema change under ADR-0020. F6,
evidence transport from the coding host, is held with
[U11](../architecture/unresolved-decisions.md#u11).

**Two properties worth restating, because review corrected them.** Placement
removes *authority*, not network presence: a compromised coding host keeps
tailnet reachability and can still attack availability, and every household
crossing still passes B3's authentication, authorization, and deterministic
safety policy. And the failure-domain separation is host-local — resource,
kernel, thermal, and container-runtime — while shared network and persistence
dependencies deliberately remain.

**What this unblocks.** GATE-U4, and nothing else. It does not authorize
deployment onto the host it selects, does not make L9 next — L8 (#56) is still
ahead of it — and does not resolve
[U2](../architecture/unresolved-decisions.md#u2) (workload identity) or
[U11](../architecture/unresolved-decisions.md#u11) (persistence), both of which
the ADR explicitly leaves open.

### ADR-0013 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-12 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0013 in full: the ten SPI decisions, including the cross-layer capability split and the terminal-state posture |
| **Review** | issue #11 (U6 gate); PR #74, drafted from the L6 spike evidence in PR #73 |
| **Unresolved decisions resolved** | **[U6](../architecture/unresolved-decisions.md#u6)** — the first item ever to leave `unresolved-decisions.md`. [U7](../architecture/unresolved-decisions.md#u7) followed on 2026-08-15 |

**What was accepted.** Adapters translate and report, never decide or enforce ·
capability is a **cross-layer** property — the adapter narrows the
provider-visible tool surface from the profile (defense in depth, proven at
L7/L8 as translation fidelity) while the substrate enforces the real boundary
(proven at L9), so *"one adapter cannot widen the profile"* is a cross-layer
proof · provider terminal state is observational input and the lifecycle
decides among the six terminal states · model output is untrusted text until
the platform validates it · provider event shapes are normalized at the adapter
boundary against a pinned provider version and never leak upward · usage is
recorded in native token and credit units, never as modeled currency · adapters
hold credential references only, with per-run semantics left to U2 and
enforcement to L9 · cancellation is effected by the substrate · neutrality holds
structurally, so adding an adapter changes no schema.

**Decided on evidence, not expectation.** Every decision traces to the L6 spike
([`docs/spikes/l6-copilot-cli/`](../spikes/l6-copilot-cli/)), which found that
Copilot CLI 1.0.79 enforces no caller schema, that `--allow-tool` is not a
closed allowlist, and that the CLI reported success while being killed.

**Now eligible for implementation — under a specific issue or task contract:**

| Issue | Work |
|---|---|
| #55 | L7 platform adapters, against the frozen SPI |
| #56 | L8 coding-adapter conformance seed |

**Still not authorized by this acceptance.** No adapter is implemented, no
provider credential is provisioned, no image is built, and
[U2](../architecture/unresolved-decisions.md#u2) (workload identity) and
[U11](../architecture/unresolved-decisions.md#u11) (persistence) remain open.
[U4](../architecture/unresolved-decisions.md#u4) (placement) was open when
ADR-0013 was accepted and has since closed — by ADR-0020 on 2026-08-26, not by
anything here.
The ADR's own § Validation and follow-up obligations lists what L7, L8, and L9
must each prove.

### ADR-0012 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-06 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0012 in full, including §5 taxonomy, §18 `worker-base`, §19 dependency governance, §20 CI model |
| **Review** | issue #5; PR #41, two rounds |
| **Unresolved decisions resolved** | **none** — every item then open stayed open |

**What was accepted.** TypeScript primary · NestJS 11 on Fastify 5 · pnpm
workspaces · pnpm catalogs · Syncpack manifest governance · frozen
`pnpm-lock.yaml` · Next.js for `apps/web` · the repository taxonomy
(`services/` deployable backend processes, `apps/` human-facing applications,
`packages/` reusable libraries, `agents/` agent implementations and profiles) ·
`services/control-plane`, `services/runner-control`, `services/workers/*` ·
`packages/worker-base` · Zod as the authored source for DTOs, shared API/domain
types, validation, metadata, OpenAPI, SDK, and MCP contracts · no handwritten
NestJS DTO duplication · deterministic normalized OpenAPI · authorization-aware
metadata routes · one projection configuration per API module · cursor
pagination and the standard response envelopes · an allowlisted MCP operation
catalog · path-aware CI with unconditional governance gates · persistence
toolkit deferred to U11 · Python restricted to isolated specialist inference
workers.

**Now eligible for implementation — under a specific issue or task contract:**

| Issue | Work |
|---|---|
| #24 | pnpm workspace and canonical repository-layout migration |
| #25 | shared TypeScript configuration and testing packages |
| #26 | NestJS/Fastify `control-plane` shell |
| #27 | `runner-control` shell |
| #28 | Zod contract packages |
| *(future)* | Next.js web shell; `packages/worker-base` |

**Acceptance is not a general authorization.** It permits building *against*
ADR-0012 when an issue authorizes the specific work. It is **not** authorization
to deploy, and it does not make any unresolved decision decided.

**Still blocked, unchanged by this acceptance:**

- **No persistence toolkit is selected** — [U11](../architecture/unresolved-decisions.md#u11).
  No schema, migration, or repository code.
- **No Home Assistant runtime is authorized**, and no credential strategy exists
  — [U10](../architecture/unresolved-decisions.md#u10).
- **No OpenFGA runtime is deployed** — [U8](../architecture/unresolved-decisions.md#u8).
- **No runner workload identity is selected** — [U2](../architecture/unresolved-decisions.md#u2).
- **`BOUNDED` still behaves as `FAIL CLOSED`** — [U1](../architecture/unresolved-decisions.md#u1).
- U3, U5, and U9 likewise remain open and still block the work that depends on
  them. **U6, U7, and U4 have since closed** — U6 by ADR-0013 on 2026-08-12, U7
  by ADR-0015 on 2026-08-15, U4 by ADR-0020 on 2026-08-26. No closure came from
  ADR-0012's acceptance, which is the point this list was making; each came from
  a later ADR that answered the question. U7's closure decided the knowledge
  format and did **not** open knowledge authoring; U4's decided placement and did
  **not** deploy anything.

### ADR-0014 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-15 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0014 in full: the canonical-home taxonomy by kind of truth, the projection semantics, the provider-artifact limit, the four-layer split, and the determination obligation |
| **Review** | PR #83, across two correction rounds |
| **Unresolved decisions resolved** | **none.** This ADR closed no item. [U7](../architecture/unresolved-decisions.md#u7) was open at the time and was resolved later the same day by [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md). Authoring knowledge remains blocked, because the ADR-0010 toolchain does not exist |

**What was accepted.** A durable truth has ONE canonical home, chosen by its
**kind** — architecture to ADRs and `docs/architecture/`; governance,
coding-agent obligations and review policy to the applicable governed contract;
human procedures to `docs/operations/`; normative contracts to their
specification owner; and the agent-facing form to `knowledge/`, **as a
projection** · a projection MAY summarize, subset, transform, reorganize, or
restate, and MUST name its governing sources, claim no independent authority,
remain subordinate, and is defective when it materially disagrees · a
provider-native skill or instruction file is **runtime integration only**, never
the canonical home of an invariant, policy, or procedure · the image carries a
runtime, the profile carries the knowledge set · promotion confers no authority ·
and a change that discovers a durable truth **must determine** whether to
promote it — the determination is the obligation, and a recorded negative answer
satisfies it.

**What was NOT accepted.** Nothing about the knowledge *format*, which is
[ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) and remains
`Proposed`. No knowledge module may be authored: that is gated on the ADR-0010
toolchain, not on this decision.

### ADR-0015 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-15 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0015 in full: OKF v0.2 as source representation only, pinned; the admission/consumption split; the repository profile; the catalog-as-authority reconciliation; the refusal of execution-bearing content; raw-byte digest identity with a normative manifest format; the trust/authority prohibition; and the implementation obligation |
| **Dependency** | [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md), accepted 2026-08-15 — satisfied before this acceptance, as ADR-0015 §3a required |
| **Unresolved decisions resolved** | **[U7](../architecture/unresolved-decisions.md#u7)** — the second item ever to leave `unresolved-decisions.md` |

**What was accepted.** OKF v0.2 is the source representation and nothing else,
pinned rather than floating · admission **rejects** while consumption
**tolerates**, because every field this repository requires is optional in OKF ·
the catalog stays authoritative for module metadata and frontmatter mirrors it,
with a material disagreement an admission failure · execution-bearing content —
`Attested Computation`, `runtime`, `computation`, `executor`, `attester` — is
**refused**, so a Skill, script, or container cannot enter through the knowledge
plane · digest identity is over raw bytes through a normative, versioned manifest
serialization · and **no OKF trust signal is an input to execution authority,
capability, authorization, safety policy, or live state** — `human-reviewed`
confers exactly what `unverified` does, which is nothing.

**What this acceptance does NOT do.**

| | |
|---|---|
| **Toolchain implementation obligation** | **UNSATISFIED.** compile / validate / package / query do not exist, and neither does the §12 conformance suite |
| **Knowledge authoring** | **BLOCKED.** Recorded structurally as `blockedByToolchain: true` on every registered module and set, asserted by `scripts/check-knowledge.mjs` — not merely required as a field |
| **Runtime or deployment authority** | **NONE GRANTED.** `knowledge/` remains non-runtime-authoritative |

**What it does unblock.** The implementation of that obligation — the next
landing — is now eligible to begin against a decided architecture.

**Why U7 closing is not permission.** U7 asked whether the format architecture
was decided. It was the wrong variable to carry authoring readiness, and the two
were separated deliberately in the same commit that closed it: `blockedByU7`
became `blockedByToolchain` across every registry entry and consumer, and the
validator now asserts it is `true`. Opening authoring is an explicit reviewed
transition, not a side effect of an item closing.

### ADR-0016 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-16 |
| **Accepted by** | @mikegtech (repository owner) |
| **Scope** | ADR-0016 in full: the A/B/C coverage model with no A classes today; fail-closed by deterministic finding **and** human content-review attestation; deterministic findings dominating attestation; the attestation as a repository admission artifact bound to exact bytes and distinct from OKF `verified`; Proof A / Proof B separation; policy v1 anchored to §1–§2; the two independent gates; and the authoring / admission / publication stage model |
| **Refines** | [ADR-0010](ADR-0010-use-okf-for-portable-knowledge-only.md) §5 and its dependent machine-check claims; [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) §8 and the prohibited-content clause of §12. **Neither ADR was edited** — both are accepted and immutable |
| **Unresolved decisions resolved** | **NONE.** This ADR closes no item |

**What was accepted.** The prohibited-content **list is unchanged**; what changed
is a false claim about how it is established. Coverage is stated by class —
**there are no class-A detectors today**, media included, because arbitrary bytes
fit inside Markdown. The gate is fail-closed by two mechanisms, and a
deterministic finding **always** dominates an attestation. The attestation binds
to exact bytes through ADR-0015 §6's identity, lives in the catalog, is versioned
by policy, and is deliberately **not** OKF `verified`. Proof A (toolchain) and
Proof B (governed human review, bound to the exact attestation) are independent
and neither substitutes for the other.

**State initialised by this acceptance.**

| | |
|---|---|
| `blockedByRollout` | **`false`** on 10 `platform/**` modules · **`true`** on 4 `household/**`, 3 `runbooks/**`, and all 6 sets |
| `blockedByToolchain` | **`true` on all 23 entries — unchanged** |
| Runbook allowlist | empty |

**What this acceptance does NOT do.**

| | |
|---|---|
| **Toolchain obligation** | **UNSATISFIED.** compile / validate / package / query and the §9 conformance suite do not exist |
| **Authoring** | **BLOCKED in practice**, because `blockedByToolchain` is `true` everywhere. Both gates must be `false` |
| **Publication** | **additionally BLOCKED**, because no governed machine-consumable Proof B evidence mechanism exists |
| **Runtime or deployment authority** | **NONE GRANTED** |

Acceptance authorizes implementation **against** ADR-0016. It proves and
discharges **no** executable obligation.

### ADR-0017 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-17 |
| **Accepted by** | @mikegtech (repository owner) |
| **Accepted at** | `f6746beb0742bd4981acae0cb2a3eb12209ed751` — the exact reviewed commit |
| **Scope** | ADR-0017 in full: exhaustive effect classification; interruption owned by the port boundary; one absolute governed expiry; acknowledged effects as facts; acquisition resolved at the resource; fencing enforced at the effect; terminal settlement bounded independently of the run clock; lifecycle authority gating effect progression; and finalization as a distinct effect class |
| **Promotes** | merged PR [#82](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82) (`95346de`) into a canonical home, as [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) requires |
| **Unresolved decisions resolved** | **NONE.** [U11](../architecture/unresolved-decisions.md#u11) *inherits* §5, §6, and §9 rather than being answered by them |

**What was accepted.** The orchestration-side effect contract that
[ADR-0013](ADR-0013-define-the-runner-adapter-spi.md) deliberately left outside
the adapter SPI. Every asynchronous port method carries exactly one effect class,
and an unclassified method must fail a gate rather than a review. Interruption
belongs to the boundary, and the effect is not started before the abort check. A
lost acknowledgement is not an absent effect. Acquisition uncertainty is resolved
at the resource, because the caller cannot compensate for a grant it never
learned about. Fencing is the resource refusing an older generation — **with its
limit stated**: a stale write to a resource the new owner has never touched is
admitted, and terminating the dispossessed worker is a substrate concern.

**What this acceptance does NOT do.**

- It does **not** accept
  [ADR-0018](ADR-0018-separate-attempt-durable-fact-and-finalization-identity.md).
  Invisible staging, the single visibility transition, the atomicity model,
  staging custody, cross-path domain identity, and finalization concurrency
  remain undecided.
- It does **not** authorize the operative `docs/architecture/` descriptions.
  Those follow ADR-0018's acceptance.
- It does **not** change production code, knowledge content, or any gate.
  `blockedByToolchain` stays `false` on 23/23 and `blockedByRollout` is untouched.
- It does **not** mandate TypeScript typestate, `RunAborted`, phase class names,
  file decomposition, or module-size limits. §8's validation obligation names
  typestate as the current **proof technique**; the requirement is the proof, not
  the mechanism.

**CI state at the accepted commit**, recorded because it is unusual:

```text
Repository checks workflow: PASS
Exact-head attached checks: 5/5 PASS
CodeQL default-setup checks: NOT DISPATCHED for this SHA
No CodeQL failure exists
```

An absent GitHub-managed dispatch is not a failed security result, and the
commit changes only a decision document. Manufacturing a further commit to coax
the dispatch would have broken the chain between the reviewed bytes and the
accepted bytes.

### ADR-0019 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-21 |
| **Accepted by** | @mikegtech (repository owner) |
| **Accepted at** | `43170c76e64917dc91303e544297d177688cc811` — the exact reviewed commit |
| **Depends on** | [ADR-0015](ADR-0015-adopt-okf-v0-2-as-source-representation-only.md) §6 byte identity and [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md), both already accepted |
| **Refines** | [ADR-0016](ADR-0016-hybrid-admission-assurance-for-prohibited-content.md) §7/§7a **on the set side only**, without editing it. Every module and runbook decision there is preserved |
| **Scope** | ADR-0019 in full: set family distinct from immutable set release; the canonical `okf-set-release-v1` manifest and `releaseDigest`; exact `(id, version, digest)` pins for required **and** optional members; identity-bearing policy fields; per-release lifecycle with executable request semantics; `releaseReview` bound non-circularly to the digest; semantic member-eligibility preconditions; one rollout authority; and task deltas producing a resolved manifest rather than a minted set version |
| **Unresolved decisions resolved** | **none** |

**What was accepted.** A mutable catalog row cannot explain a version it has
moved past, so a set *family* and a set *release* are different objects: the
family is authoring state, the release is an immutable, digest-identified
revision, and a profile pins the release. `(familyId, version) → releaseDigest`
is unique and immutable for all time, and a version is never reused.

Identity is a digest over a canonical line-oriented manifest, not over a JSON
serializer's output — with field order, separators, encoding, admissible bytes,
and set ordering all fixed, so a second implementation can reproduce it from
logical content. Optional members are pinned exactly like required ones:
*optional* governs omission, never substitution.

**One authority, deliberately.** `Released` **is** the eligibility; there is no
release-level boolean that could disagree with it, and the legacy family-level
`blockedByRollout` authorizes nothing and must not survive migration as a second
authority.

**What acceptance does NOT do.** It assigns no set version, releases no set,
moves no rollout gate, and creates no release record, resolver, or profile
schema. The twenty falsification cases are answered *architecturally* and remain
mechanical obligations for the implementation — an architecture answer is not a
mechanism. Module publication is deliberately **not** a release precondition, so
no set release waits on the absent Proof B producer.

### ADR-0018 acceptance record

| | |
|---|---|
| **Accepted** | 2026-08-17 |
| **Accepted by** | @mikegtech (repository owner) |
| **Accepted at** | `f41fee5e75244765f5b214be7e87b35d83d90814` — the exact reviewed commit |
| **Depends on** | [ADR-0017](ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md), accepted 2026-08-17 — satisfied **before** this acceptance, in that order |
| **Scope** | ADR-0018 in full: attempt outcome distinct from logical-run terminal; three non-interchangeable identity planes; identity equality insufficient without canonical content; finalization as invisible staging plus one publication transition; a pre-existing durable participant not committing the transaction; staging custody distinct from fact equivalence; one domain identity yielding at most one durable fact across every creation path; and the finalization-concurrency properties |
| **Promotes** | merged PR [#82](https://github.com/pulse-ops-ai/secure-home-agent-platform/pull/82) (`95346de`) into a canonical home, as [ADR-0014](ADR-0014-promote-durable-lessons-into-canonical-architecture-and-portable-knowledge.md) requires |
| **Unresolved decisions resolved** | **NONE.** [U11](../architecture/unresolved-decisions.md#u11) *inherits* the staging contract rather than being answered by it |

**What was accepted.** Finalization is one atomic publication, not an ordering of
writes: every fallible participant stages invisibly, exactly one visibility
transition publishes what the transaction owes, and there is no compensating
rollback afterwards. Three identities answer three different questions and never
imply one another. A replay ledger retains canonical content, so an exact retry
reconciles and a conflicting one refuses with the first fact intact — and that
refusal is never mislabelled as stale fencing.

**A deliberate non-decision was accepted as such.** The acknowledgement
disposition of an exact staged-versus-ordinary replay was left open by PR #82;
durable uniqueness and acknowledgement truthfulness were proven, and which
acknowledgement that cell returns was not. This ADR does **not** settle it.

**What this acceptance does NOT do.**

- It does **not** mandate an implementation. The commit marker and in-memory MVCC
  are the reference realization of §4; a database transaction or durable marker
  conforms equally, and single-flight joining is one permitted way to satisfy §8
  rather than the requirement.
- It does **not** widen [ADR-0017](ADR-0017-classify-asynchronous-effects-at-runner-boundaries.md)
  §6's fencing limit. A dispossessed attempt has no *authority* to manufacture a
  logical-run verdict; the *mechanism* guarantee is that publication
  re-establishes ownership at the finalization boundary. A stale write to a
  resource that has never observed the newer generation is still admitted.
- It does **not** change production code, knowledge content, or any gate.
- It does **not** author the operative `docs/architecture/` descriptions. Both
  ADRs are now accepted, so that work is unblocked — but it is a separate
  landing.

**CI state at the accepted commit**, recorded because it is unusual:

```text
Repository checks workflow: PASS — 5/5 repo-owned checks
CodeQL Analyze (actions):            PASS
CodeQL Analyze (javascript-typescript): PASS
CodeQL Analyze (python):             FAILURE — GitHub infrastructure
CodeQL:                              neutral — downstream of the above
```

The Python job failed inside `Initialize CodeQL`, before analysing anything:
`HttpError: No server is currently available to service your request` while
determining feature enablement. The `CodeQL` neutral reports `1 configuration
not found` as its consequence. **No security finding exists.** Re-running the
job was attempted and refused by GitHub (`This workflow run cannot be retried`),
and no commit was manufactured to force a fresh dispatch — that would have
separated the reviewed bytes from the accepted bytes.

## Which ADRs apply to what I am changing?

| If you are touching… | Read at least |
|---|---|
| anything | ADR-0001 |
| a service under `services/` | ADR-0002, ADR-0004, ADR-0005, ADR-0008, ADR-0009 |
| an execution profile or the profile schema | ADR-0003, ADR-0006, ADR-0007 |
| an agent implementation or adapter | ADR-0003, ADR-0004, ADR-0006, ADR-0011, **ADR-0013** |
| the runner substrate or a runner image | ADR-0003, ADR-0005, ADR-0011 |
| authorization, identity, or the envelope | ADR-0004, ADR-0008 |
| safety policy or device actuation | ADR-0005, ADR-0008, ADR-0009 |
| availability, offline, or failure behaviour | ADR-0002, ADR-0007, ADR-0009 |
| a knowledge bundle | ADR-0010 |
| a knowledge module, set, or the selection contract | ADR-0010, ADR-0003, ADR-0006 + [`../architecture/knowledge-selection-model.md`](../architecture/knowledge-selection-model.md) |
| the knowledge format, validator, packaging, or query interfaces | ADR-0010, **ADR-0015** |
| prohibited-content enforcement, or a knowledge content review | ADR-0010, ADR-0015, **ADR-0016** |
| versioning, releasing, or pinning a knowledge **set** | ADR-0010, ADR-0015, ADR-0016, **ADR-0019** |
| where a durable lesson from a change or review belongs | **ADR-0014** + [`../architecture/knowledge-promotion-model.md`](../architecture/knowledge-promotion-model.md) |
| a provider instruction file or provider-native skill | **ADR-0014**, ADR-0011 |
| deployment assets | ADR-0002, ADR-0011 |
| a TypeScript package, app, or API contract | **ADR-0012** + [`../architecture/api-contract-model.md`](../architecture/api-contract-model.md) |
| an OpenAPI, MCP, or metadata surface | **ADR-0012**, ADR-0004 |
| anything touching persistence | **ADR-0012** + [U11](../architecture/unresolved-decisions.md#u11) |
| runner orchestration crossing an asynchronous port | **ADR-0017** + ADR-0013 |
| where a runner workload physically executes, or a deployment topology | ADR-0002, ADR-0007, ADR-0009 + **ADR-0020** (`Accepted` 2026-08-26 — household control on the Pi, coding execution off it) |
| finalization, run identity, or replay of a durable fact | **ADR-0018** + **ADR-0017** |

## Deliberately not decided

The hardest open questions are **not** settled by these ADRs, and were **not**
settled by accepting them. They are tracked in
[`docs/architecture/unresolved-decisions.md`](../architecture/unresolved-decisions.md)
and each leaves that file only via a **new** ADR — never via an implementation.

The most consequential is the bounded-authority mechanism for offline household
authorization, which
[ADR-0009](ADR-0009-define-degraded-mode-and-offline-authorization.md) names and
explicitly refuses to guess at. Until it is closed, every `BOUNDED` operation
behaves as `FAIL CLOSED`.
