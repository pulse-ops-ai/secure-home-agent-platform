# knowledge/ — Registry

The canonical registry of knowledge **modules** and **sets**.

> **Six platform modules are authored and validated; nothing is packaged or
> published, and none of this is runtime-authoritative.** The toolchain and its
> conformance suite are implemented and are invoked over real repository content
> by `scripts/check-knowledge-content.mjs`, and the ADR-0015 §12 readiness
> obligation was **discharged on 2026-08-16** — so `blockedByToolchain` is
> `false` on all 23 entries and the ten `platform/**` modules are
> **authoring-eligible**.
>
> Six `platform/**` modules are **`Validated`** at `1.0.0` — `runner-model`,
> `repository-taxonomy`, `governance`, `workspace-conventions`,
> `implementation-rules`, and `review-conventions`. Each carries **its own**
> human content review bound to **its own** digest and passes canonical
> admission independently. Every other module is `Planned`. Nothing is packaged and
> nothing is published — `household/**`, `runbooks/**`, and every set remain
> rollout-blocked, and publication additionally requires Proof B, for which no
> governed producer exists.

Metadata lives once, in [`catalog.json`](catalog.json). This document is its
human-facing view, and
[`scripts/check-knowledge.mjs`](../scripts/check-knowledge.mjs) asserts the two
agree **in both directions** — every registered module and set appears here, and
nothing appears here that is not registered. They cannot drift apart quietly.

## Three concepts, deliberately distinct

| | Is | Versioned | Exists today |
|---|---|---|---|
| **Knowledge module** | one independently versioned body of portable knowledge | yes, independently | as a specification directory only |
| **Knowledge set** | a named, profile-oriented composition of allowed modules | yes | as a specification entry only |
| **Packaged bundle** | the immutable, digest-addressed artifact delivered to a run | yes, by digest | **no** — none exists yet |

A profile selects a **set**. The runner resolves that set to exact module
versions and produces a **packaged bundle**, whose digest is recorded in run
evidence. Profiles never reference repository file paths.

**Knowledge is context, not authority.** A module being visible to a profile
never implies the profile may act on what it knows. Selection is independent of
tool permission, filesystem and network permission, governed API capability,
authorization, deterministic safety policy, and live state.

The selection contract, resolution algorithm, failure semantics, and evidence
fields are specified in
[`docs/architecture/knowledge-selection-model.md`](../docs/architecture/knowledge-selection-model.md).

## Status vocabulary

| Status | Meaning |
|---|---|
| `Planned` | the boundary is defined; no content is authored |
| `Source-ready` | content is authored and reviewed, but not yet validated |
| `Validated` | content passes the ADR-0010 validator |
| `Packaged` | compiled into an immutable, digest-addressed artifact |
| `Published` | available to the resolver for selection by a profile |
| `Deprecated` | superseded; still resolvable, and it should not be newly selected |
| `Retired` | no longer resolvable |

**`platform/runner-model` is `Validated`; everything else below is `Planned`.**
`blockedByToolchain` was discharged on 2026-08-16, so `Validated` and `Packaged`
are representable for a module that has **earned** them — a status is validated
against the real mechanism rather than claimed, and no checker promotes a module
on its own. `Published` additionally requires Proof B, for which no governed
producer exists, and stays refused. `check-knowledge.mjs` distinguishes the two
reasons.

## Modules

### `platform/*` — how the platform works

| Module | Purpose | Consumers |
|---|---|---|
| [`platform/core-operating-model`](platform/core-operating-model/) | how this platform behaves, in the terms an agent must reason in | coding · household |
| [`platform/repository-taxonomy`](platform/repository-taxonomy/) | what lives in which repository root | coding |
| [`platform/governance`](platform/governance/) | instruction precedence, ADR immutability, how a decision changes | coding · household |
| [`platform/workspace-conventions`](platform/workspace-conventions/) | how the workspace is assembled and a change is landed | coding |
| [`platform/implementation-rules`](platform/implementation-rules/) | the rules an agent writing code here must hold | coding |
| [`platform/review-conventions`](platform/review-conventions/) | what a review looks for | coding |
| [`platform/api-contract-conventions`](platform/api-contract-conventions/) | how API surface is authored once and generated everywhere | coding |
| [`platform/worker-conventions`](platform/worker-conventions/) | what a background worker owes the platform | coding |
| [`platform/runner-model`](platform/runner-model/) | how runs execute, and where authority comes from | coding · household |
| [`platform/degraded-operation`](platform/degraded-operation/) | behaviour when parts of the platform are unreachable | coding · household |

### `household/*` — what the house is and what its signals mean

| Module | Purpose | Consumers |
|---|---|---|
| [`household/topology`](household/topology/) | floors, areas, rooms, and their relationships | household |
| [`household/climate`](household/climate/) | HVAC equipment, zones, capacities, documented limits | household |
| [`household/security-semantics`](household/security-semantics/) | what security signals mean, and what is not detected | household |
| [`household/energy-semantics`](household/energy-semantics/) | tariff and telemetry semantics | household |

### `runbooks/*` — ordered procedures

| Module | Purpose | Consumers |
|---|---|---|
| [`runbooks/repository-validation`](runbooks/repository-validation/) | proving a repository change is sound | coding |
| [`runbooks/incident-triage`](runbooks/incident-triage/) | reasoning about a household incident, in order | household |
| [`runbooks/safe-escalation`](runbooks/safe-escalation/) | when to stop, and how to hand over to a human | coding · household |

Full metadata for each — owner, version, as-of date, limitations, governing
sources, sensitivity, freshness policy, and toolchain blocking — is in
[`catalog.json`](catalog.json). Each module's own README states its intended
facts, prohibited facts, expected queries, and update trigger.

## Sets

Each set demonstrates **least-context selection**: the smallest composition that
answers its questions. Coding sets deny household modules outright; household
sets deny developer-platform conventions. Neither exclusion is a preference — a
module that is not selected is one an agent cannot reason from, and that is the
point.

| Set | For | Required | Optional | Denies |
|---|---|---|---|---|
| `prepr-review-default` | reviewing a change before opening a pull request | core-operating-model · governance · repository-taxonomy · review-conventions · degraded-operation · repository-validation | — | `household/*` |
| `implement-local-default` | implementing a change on the local host | core-operating-model · governance · repository-taxonomy · workspace-conventions · implementation-rules · worker-conventions · repository-validation | api-contract-conventions | `household/*` |
| `architecture-default` | reasoning about architecture, proposing decisions | core-operating-model · governance · runner-model · degraded-operation | repository-taxonomy | `household/*` · the household runbooks |
| `home-status-default` | answering questions about the house | core-operating-model · degraded-operation · topology · security-semantics | safe-escalation | every developer-platform module |
| `climate-default` | reasoning about comfort and HVAC behaviour | core-operating-model · degraded-operation · topology · climate | energy-semantics · safe-escalation | every developer-platform module · security-semantics |
| `gridwise-default` | reasoning about energy cost and load shifting | core-operating-model · degraded-operation · energy-semantics | climate · topology | every developer-platform module · security-semantics |

A set carries the **same metadata contract as a module** — owner, status,
version, as-of date, limitations, governing sources, sensitivity, freshness
policy, and toolchain blocking — in [`catalog.json`](catalog.json). Its `runnerClass` is
its intended-consumer field.

Two of those need care:

- **`version` is currently `null` on every set, and that is enforced rather than
  incidental.** A profile pins its base set as `name@version`, and run evidence
  records both requested and resolved set versions — so the registry must be
  version-capable. But a set version is only meaningful once the modules it
  selects have versions of their own; otherwise two different resolutions of
  `set@1` would look identical in evidence. `check-knowledge.mjs` rejects a set
  that carries a version while selecting an unversioned module.
- **`freshnessPolicy` and `maxFreshnessDays` are different things.**
  `freshnessPolicy` says when the *composition* should be reviewed;
  `maxFreshnessDays` is the ceiling the set imposes on the *modules* it selects,
  enforced at resolution — a required module staler than it rejects the run.

Each set's `rationale` records **why** a module is required rather than optional.
Three worth stating here:

- `climate-default` **requires** topology rather than treating it as optional:
  climate equipment is described per zone, and a zone means nothing without the
  area mapping.
- `architecture-default` deliberately omits the implementation and workspace
  modules. An architecture run reasons about the model; loading implementation
  rules invites it to start editing instead.
- Household sets carry a **shorter freshness window** than coding sets. A stale
  description of a house is confidently wrong about physical reality; a stale
  description of a convention is merely out of date.

## Packaged bundles

**None.** There is no packaged bundle, no digest, and no resolver.

When authoring opens, a packaged bundle will be registered here by ID, version, and
digest, and the compile → validate → package → query interfaces required by
[ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
will own its lifecycle. Nothing reads a bundle file directly, then or now.

## Adding a module

1. Create `knowledge/<group>/<name>/README.md` stating intended facts, prohibited
   facts, intended consumers, expected queries, governing sources, and the
   update trigger — plus a registry block naming its status and owner.
2. Register it in [`catalog.json`](catalog.json) with every required field.
3. Add it to the tables above.
4. Add it to the sets that should receive it — and to the `deny` list of the sets
   that should not.
5. Run `node scripts/check-knowledge.mjs`.

An unregistered module directory is a **failure**, not a draft: a module no
profile can select is invisible, and invisible things do not get reviewed.

## Governed by

[`../AGENTS.md`](../AGENTS.md) → [`AGENTS.md`](AGENTS.md) ·
[ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md) ·
[ADR-0003](../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md) ·
[ADR-0006](../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md)

## Validation

```sh
node scripts/check-knowledge.mjs
```
