# ADR-0013: Define the runner adapter SPI

- **Status:** Proposed
- **Date:** 2026-08-12
- **Deciders:** @mikegtech (repository owner)
- **Supersedes:** none
- **Related:** [ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md), [ADR-0004](ADR-0004-treat-agents-as-clients.md), [ADR-0006](ADR-0006-separate-agent-implementation-profile-run-and-automation.md), [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md), [ADR-0012](ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md)
- **Closes:** [U6](../architecture/unresolved-decisions.md#u6) — on acceptance, by a human, in its own change

## Context

[ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md) requires adapters
but leaves the substrate↔adapter interface undefined: what is passed in, what
comes back, how failure and partial progress are reported, and how cancellation
reaches a runtime that may not support it. [U6](../architecture/unresolved-decisions.md#u6)
records that gap and sets two conditions — the SPI must be expressible by all
six intended adapters without a provider name in a structural position, and it
should be designed against the two most dissimilar adapters rather than the
most convenient one.

This ADR is written against evidence rather than expectation. The L6 spike
(issue #54) probed GitHub Copilot CLI 1.0.79 with `gpt-5.4` pinned and recorded
its findings in [`docs/spikes/l6-copilot-cli/`](../spikes/l6-copilot-cli/).
Five results bear directly on the interface:

1. **`--output-format json` frames a transcript; it enforces no schema on
   assistant content.** An adversarial prompt produced malformed, prose-prefixed
   output **with exit 0**.
2. **Tool availability and permission approval are separate controls, and only
   denial is dependable.** `--available-tools` narrowed the model-visible set and
   explicit `--deny-tool` held under prompt injection, but `--allow-tool` is an
   auto-approval rule, not a closed allowlist: an unlisted read-only command
   still executed.
3. **The provider's terminal report is not reliable about its own death.** Under
   external termination the process exited 124 while the CLI reported
   `result.exitCode = 0` and a routine shutdown.
4. **Machine events correlate by `toolCallId`** — request, arguments, result,
   truncation, denial — but **no per-field compatibility guarantee** was
   established.
5. **OS-store authentication is reusable after termination**, and `COPILOT_HOME`
   does not contain all cache state (`~/.cache/copilot` is written outside it).
   The per-run environment-token path could not be safely tested and remains
   undetermined.

Two structural facts frame the interface as much as the evidence does. The
platform already owns a closed run-event vocabulary and terminal-state
vocabulary ([`runner-execution`](../../openspec/specs/runner-execution/spec.md)),
and L4 already exposes an adapter-invocation port whose contents this ADR
defines. And the decisions L3/L4 made on principle — untrusted claims, typed
outcomes, lifecycle-owned classification — were, as it turns out, each
independently confirmed by a real provider.

## Decision

### 1. The adapter translates and reports; it never decides and never enforces

An adapter converts a resolved, platform-built invocation into what one runtime
expects, and converts that runtime's output back into platform vocabulary.
Nothing an adapter returns is authoritative. Specifically, an adapter **may not**
determine a run's terminal state, assert that a capability grant was applied,
resolve or hold a credential value, or introduce a shape the platform has not
contracted.

### 2. Capability is a cross-layer property, and the SPI says which layer owns which half

The spike disproved the intuition that a provider's permission flags are a
capability boundary. But the correct conclusion is *not* that provider controls
are worthless — it is that they are **narrowing, not enforcement**:

```text
profile capability grant
        │
        ├── adapter: faithful translation ──►  provider-visible tool surface
        │   (--available-tools generated from the profile; explicit denials)
        │   proven at L7/L8: no adapter-created widening
        │
        └── substrate: enforcement ─────────►  filesystem · network · process
            (mounts, egress, execution, ceilings)
            proven at L9: the boundary holds regardless of provider behaviour
```

The adapter **SHALL** generate the provider's available-tool set and explicit
denials from the profile — narrowing what the model can even see is real
defense in depth and must not be skipped. The adapter **SHALL NOT** be relied
upon for the security property. The ratified exit criterion *"one provider
adapter cannot widen the profile"* is therefore a **cross-layer proof**:
translation fidelity at L7/L8, enforcement at L9. Neither half alone discharges
it, and the property must survive a provider whose controls turn out weaker
than documented — or change in a later release.

### 3. Terminal state is observational input, never lifecycle authority

The provider's exit code, its self-reported outcome, and its transcript's
terminal event are all **observations**. The adapter normalizes them; the
lifecycle decides:

```text
provider exit code ─┐
provider outcome ───┤
transcript terminal ├─► adapter normalization ─► runner-control lifecycle
usage ──────────────┘                                     │
                                                          ▼
              COMPLETED · REFUSED · OPERATIONAL_FAILURE ·
              CANCELLED · TIMED_OUT · INDETERMINATE
```

An adapter has no way to report "the run succeeded". Where observations
disagree — as they did at exit 124 versus `exitCode: 0` — the disagreement is
carried upward as data, and a terminal state that cannot be established is
`INDETERMINATE`, which is a failure class.

### 4. Model output is untrusted text until the platform validates it

No adapter may present provider output as structured data on the strength of a
provider "JSON mode". Anything the model produces enters as a **claim**
([ADR-0004](ADR-0004-treat-agents-as-clients.md)), is validated by the platform,
and is recorded as malformed rather than repaired silently when it fails to
parse. Structured-output enforcement is the platform's job because no probed
provider offers it.

### 5. Provider event shapes are normalized at the adapter boundary and never leak upward

An adapter parses the provider's native transcript **defensively and against a
pinned provider version**, and emits the platform's closed event vocabulary,
carrying provider-native naming only in the contracted opaque fields. Because no
provider guarantees per-field stability, a provider transcript change must be
able to break exactly one adapter and nothing above it.

### 6. Usage is recorded in native units; monetary cost is not modeled

Tokens, request counts, provider credit units, model identity, and durations are
recorded as opaque data. A currency amount is recorded **only** if the provider
supplies a trustworthy one; none did. The platform does not compute money from
units, because that produces a fabricated number that looks authoritative.

### 7. The adapter never holds a credential, and per-run credential semantics are not its problem

Adapters receive credential **references** (environment-variable names), never
values, consistent with the existing contracts. Whether a credential is
short-lived and unreachable after termination is decided by
[U2](../architecture/unresolved-decisions.md#u2) and enforced by the substrate
(L9) — the spike showed OS-store authentication persisting across runs and cache
state escaping the provider's own home directory, so provider configuration
cannot deliver that property.

### 8. Cancellation is effected by the substrate; the adapter only reports

Because a runtime may not support cancellation, and because a provider can
report routine shutdown while being killed, the SPI does not require adapters to
implement cancellation. The substrate terminates; the adapter surfaces whatever
the runtime managed to emit; the lifecycle records the terminal state it
observed rather than the one the provider claims.

### 9. Neutrality holds structurally

No provider name appears in an SPI type, field, discriminant, or enum. Adapter
identity travels as opaque data, as the landed contracts already require
([ADR-0003](ADR-0003-use-framework-neutral-runner-profiles.md)). Adding an
adapter changes no schema.

### 10. Expressible by the two most dissimilar adapters

Per U6's approach condition, the SPI is defined against a coding CLI and a plain
deterministic loop:

| SPI element | Coding CLI (Copilot) | Deterministic loop |
|---|---|---|
| invocation | argv built from the profile; available-tools + denials generated | direct function call with the same capability-shaped inputs |
| tool surface | provider flags (narrowing) | the loop's own dispatch table |
| events | native JSONL parsed and normalized | emitted directly in platform vocabulary |
| claims | model text, untrusted | structured output, still untrusted |
| terminal signal | exit code + result + transcript, all observational | return value, observational |
| usage | tokens and credit units | zero or locally measured |
| credentials | referenced env names | referenced env names |

Nothing in the interface requires a subprocess, a transcript file, or a model.

## Consequences

- L7 adapters become thin and boring: build an invocation, run one runtime,
  normalize, report. Their conformance suite (L8) tests translation fidelity,
  not enforcement.
- The exit criterion *"one provider adapter cannot widen the profile"* now has a
  named home on both sides, and neither L7 nor L9 can quietly assume the other
  discharged it.
- The platform absorbs work the provider will not do: schema validation of model
  output, terminal classification, usage normalization.
- Every adapter carries a **pinned provider version**, and a provider upgrade is
  a reviewable change to that adapter — consistent with
  [ADR-0011](ADR-0011-keep-coding-agent-images-provider-specific.md)'s
  digest-pinned images.
- A provider offering genuine schema enforcement later does not change this SPI;
  it just makes one adapter's validation cheaper.

## Alternatives considered

- **Treat provider permission flags as the capability boundary.** Rejected on
  evidence: an unlisted read-only command executed anyway, so the boundary would
  have been imaginary.
- **Abandon provider-side narrowing entirely and rely only on the sandbox.**
  Rejected: `--available-tools` demonstrably restricts what the model sees, and
  discarding it would throw away a working defense-in-depth layer *and* the
  translation-fidelity obligation that L7/L8 conformance exists to prove.
- **Let the adapter report the terminal state.** Rejected on evidence: the
  provider reported success while being killed.
- **Pass provider-native event shapes upward and normalize later.** Rejected: no
  provider guarantees field stability, so the blast radius of a provider change
  would extend past the adapter into contracts and evidence.
- **Model monetary cost from token counts.** Rejected: it fabricates an
  authoritative-looking number the provider never supplied.
- **Require adapters to implement cancellation.** Rejected: some runtimes cannot,
  and the substrate can terminate regardless — making it an adapter obligation
  would produce inconsistent guarantees per provider.
- **Wait for a second provider spike before deciding.** Rejected: the constraints
  above are all of the form "do not depend on the provider for X", which a second
  provider can strengthen but not overturn.

## Security implications

- **The security property no longer rests on provider behaviour.** Enforcement is
  the substrate's; provider controls are narrowing. A provider regression cannot
  silently widen a run's authority.
- **A run cannot certify itself.** Terminal state, capability application, and
  structured output are all decided above the adapter, closing the path where a
  compromised or merely buggy provider declares its own success.
- **Blast radius is bounded by version pinning and early normalization.** A
  provider transcript change breaks one adapter, loudly, rather than corrupting
  evidence.
- **Non-guarantee:** this ADR does not make credentials ephemeral. The spike
  showed the opposite on a host login, and the per-run environment-token path is
  **untested** — U2 decides the semantics and L9 must prove containment. Nothing
  here should be read as evidence that environment injection is safe.
- **Non-guarantee:** provider-side narrowing is not proven to be
  injection-proof in general. Denial held in the tested case; that is one case,
  on one version.

## Availability implications

- Adapters add no availability dependency to the household control path; a run
  that cannot start is a refused or operationally-failed run, never a degraded
  household.
- Because the lifecycle owns terminal classification, a hung or lying provider
  resolves to `TIMED_OUT` or `INDETERMINATE` rather than a stuck run.
- Defensive, version-pinned parsing means a provider upgrade degrades one
  adapter rather than the platform, and the failure is visible at the merge gate
  rather than at runtime.

## Validation and follow-up obligations

On acceptance — which is a human act, in its own reviewed change — this ADR
closes [U6](../architecture/unresolved-decisions.md#u6). Until then U6 stays
open and L7 stays blocked.

- **L7 must prove translation fidelity:** the provider-visible tool surface is
  generated from the profile, and no adapter-created widening exists.
- **L8 must prove uniformity:** every adapter emits the same event and evidence
  contract for the same logical run.
- **L9 must prove the boundary:** filesystem, network, and process enforcement
  hold irrespective of provider controls; credentials are contained with proven
  teardown, including cache state outside the provider's configured home.
- **U2 remains open** and is not touched here.
- **Re-test when authorized:** valid environment-token persistence, credential
  isolation from same-user processes, crash-path teardown, and image-layer
  credential isolation — all listed unproven by the spike.
- **Each adapter pins its provider version**, and this ADR is revisited if a
  provider ships genuine caller-schema enforcement or a stable event contract.

## Links

- [L6 spike evidence](../spikes/l6-copilot-cli/) and its
  [U6 decision inputs](../spikes/l6-copilot-cli/U6-decision-inputs.md)
- [`runner-model.md`](../architecture/runner-model.md)
- [`unresolved-decisions.md#u6`](../architecture/unresolved-decisions.md#u6)
- Issue #11 (U6 gate), issue #54 (L6 spike), issue #55 (L7 adapters)
