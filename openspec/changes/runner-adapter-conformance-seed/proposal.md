# Change Proposal: runner-adapter-conformance-seed

## Why

L7 (#55) merged as PR #96; main is `5403a85`. The runner program index
(#19) names **L8 / #56** next: the coding-adapter conformance *seed* —
"same profile, same run → same events and evidence across the Claude and
Copilot adapters **at the execution-port level**."

L7 landed a substantial shared suite at `tests/framework-conformance/`
(85 tests). That suite proves the adapters agree at the **process
boundary**: the same `AdapterReport` grammar, observation field
inventory, call dispositions, adapter-owned event vocabulary, claim
kinds, native-and-moneyless usage, closed wire parsing, SPI mirror
tethering, cannot-widen properties, credential-name handling,
environment allowlisting, opaque workspace refs, cancellation
forwarding, hostile transcript handling, byte budgets, version/image-lock
agreement, and adapter inertness.

**None of it crosses `AdapterInvocationPort`.** Verified mechanically at
`5403a85`: no file under `tests/framework-conformance/` imports
`@secure-home/runner-control`, constructs a `Runner`, or inspects a
platform event or evidence bundle. The single reference to
runner-control is `fc_support.FROZEN_SPI`, which reads `values.ts` as
**source text** for the mirror tether — bytes, not an import, and not an
execution path.

So the platform's *interpretation* of an adapter report — the transform
that turns provider observations into run events and evidence — is today
proven for exactly one implementation: the in-memory
`DeterministicAdapterInvocation` fixture inside runner-control's own
conformance tests. It has never been exercised with two real, different
provider dialects.

That gap is not theoretical. **Constructing the missing proof by hand
already falsifies the composition** (evidence in `design.md`, reproduced
offline from built artifacts at `5403a85`): feeding each adapter's real
`observeRun()` output for a *clean, fully successful* run into the real
`classifyTerminalObservations()` yields, for both adapters,

```text
established: false   conflict: transcript_contradicts_exit
```

— i.e. every successful coding run would be classified **INDETERMINATE**
at the execution port, with the provider's own vocabulary
(`terminated result` vs `terminated session.result`) inside the
platform-visible detail string. This is a cross-layer contract gap
between three landed layers, and it is structurally invisible to L7,
which asserts the *shape* of `TerminalObservations` and never their
interpretation.

This change therefore has a real, non-duplicative subject.

## Problem

1. **The execution-port property is unproven.** ADR-0003's claim is that
   the platform's properties belong to the substrate, not the runtime.
   The substrate's observable output is events and evidence — not
   `AdapterReport`. Nothing today proves those stay adapter-neutral when
   the port is backed by two different provider dialects.

2. **The proof cannot be assembled from the current public surface.**
   `Ports` requires thirteen port implementations. Eleven are publicly
   exported by `@secure-home/runner-control`; **`session`
   (`InMemoryExecutionSession`) and `workspace`
   (`InMemoryWorkspaceLifecycle`) are not** — they exist in
   `src/adapters/index.ts` but are absent from `src/index.ts`. A test
   outside the package cannot compose a `Runner` today without either an
   undeclared deep import, a local re-implementation, or a two-symbol
   re-export.

3. **The adapters leak provider vocabulary upward, against an accepted
   ADR.** ADR-0013 decision 3 (lines 92–95) says the adapter normalizes
   exit, self-reported outcome, and transcript-terminal observations;
   decision 5 (line 122) says provider shapes "never leak upward". Both
   L7 adapters instead populate `transcript_terminal` with a provider
   *frame name* (`observe.ts:163`, `observe.ts:195`). Ownership of the
   fix is therefore settled — it belongs to the adapters. What is *not*
   settled is the **vocabulary**: `transcript_terminal` is typed `string`
   in the frozen SPI with no documented meaning anywhere in `docs/` or
   `openspec/`, while runner-core makes the literal `'success'`
   load-bearing at `terminal.ts:86`.

4. **The gate cannot pass until that fix lands.** #56 requires "suite
   green across both adapters", and a conformance gate that cannot pass
   is not a gate. The adapter normalization is therefore sequenced as a
   **required predecessor** of this landing — not as an open question,
   and not as a reason to merge a red suite. #56's other clause,
   "divergences are named findings, never averaged away", describes the
   gate's correct *failure behavior*, which this change builds and
   guards.

## Proposed Capability

A **seed** proof at the execution-port boundary, added to the
`platform-adapters` capability:

- A conformance harness, landing **after** the adapter-normalization
  predecessor, that carries each adapter's **real** `AdapterReport`
  through the **real** runner-control interpretation path
  (`Runner` → `running` phase → `classifyTerminalObservations` +
  `recordCalls` → event sink + evidence assembly), and compares the
  platform-observable results across adapters.
- An explicit, mechanically-checked split between what MUST be
  adapter-neutral (platform event grammar and vocabulary, disposition
  semantics, lifecycle classification, outcome, run/fence/profile
  identity binding, evidence field grammar) and what MAY legitimately
  differ (provider-native tool names, native usage units, provider event
  data, reactive-denial vs preventive-absence dialects).
- Divergence handling that **names** contradictions instead of
  normalizing them, with the discovered `transcript_contradicts_exit`
  case kept as a committed regression case so the predecessor cannot
  silently regress.
- An explicit **one logical run, two provider bindings** comparison
  model: because `runtime.adapter` and `runtime.image_digest` are profile
  fields and the runner derives the adapter from the captured profile,
  two adapters mean two profiles — so provider-bound identities are
  proven by *binding to their own profile*, not by cross-run equality.

## Scope

### In scope

- `tests/framework-conformance/**` — the harness, the neutrality
  comparison rules, the adversarial and mutation cases, and the
  divergence report.
- **One requested expansion, flagged for approval, not pre-approved:**
  two symbols re-exported from `services/runner-control/src/index.ts`
  (`InMemoryExecutionSession`, `InMemoryWorkspaceLifecycle`). No new
  behavior, no new interface, no change to `AdapterInvocationPort`. The
  zero-expansion alternative and its cost are in `design.md`; the
  decision is the reviewer's.

### Out of scope

- **Everything L9.** No container launch, no image activation from a
  profile, no filesystem/mount/network isolation, no cgroups, no process
  tree teardown, no credential provisioning or teardown, no real
  `AdapterInvocationPort` implementation that starts a provider.
- **Any change to `AdapterInvocationPort` or the frozen SPI.** A
  contract defect was found; this change reports it and does not
  redesign the seam. #56 grants no such authority.
- **Implementing the `transcript_terminal` normalization.** It belongs to
  `agents/adapters/**` (ADR-0013 §3/§5), which is outside this change's
  declared scope; it lands as its own authorized change or as an
  explicitly authorized extension, before this gate.
- **Contacting a real provider**, adding a credential, or running
  anything non-deterministic or online.
- **U4/#9**, runner-control placement, ADR status changes.
- **L10 framework conformance** (the deterministic-loop adapter). #56
  says this is a seed; the third implementation completes it.
- **Re-proving anything L7 already proves.** Every task in `tasks.md`
  must close a demonstrated residual gap.

## Affected Areas

| Area | Change |
|---|---|
| `tests/framework-conformance/` | new execution-port harness + comparison rules + divergence report |
| `services/runner-control/src/index.ts` | **requested only**: two re-exports (approval required) |
| `openspec/changes/runner-adapter-conformance-seed/` | this change's artifacts |

## Governance

- **ADR-0003** — the direct mandate. Lines 187–190 require
  "framework-conformance tests … asserting that every adapter emits the
  same event and evidence contract for the same logical run"; lines
  88–92 forbid a provider name in any structural position, allowing it
  "only as an *opaque value* of an `adapter` field". This change is the
  first landing that can test either claim with two real adapters.
- **`openspec/specs/runner-execution/spec.md:59-89`** — the canonical
  requirement being proven: a closed platform `event_type` vocabulary
  (`run.started`, `capability.granted`, `call.attempted`,
  `call.disposition`, `adapter.started`, `adapter.completed`,
  `run.terminated`), provider naming carried "only in optional opaque
  data fields", and "**Event shapes SHALL be identical across
  adapters**".
- **`openspec/specs/runner-evidence/spec.md:11-53`** — evidence is
  representationally complete and carries "provider and adapter identity
  as opaque data"; two runs differing only in an opaque identity value
  validate against the same schema.
- **`openspec/specs/runner-adoption/spec.md:35-65`** — provider
  neutrality in structural positions; "adding an adapter changes no
  schema".
- **ADR-0006** — separates implementation / profile / run / automation,
  and places `adapter` as a *field of the profile* (line 45). It is cited
  for that placement only: it says nothing about adapter identity in
  events or evidence, and this change does not claim otherwise.
- **ADR-0013** — the adapter SPI: translate and report, never decide;
  terminal state observational; usage native; the ten decisions this
  change proves the *consumption* side of.
- **ADR-0012** — workspace layering and dependency direction, which
  constrain what a test may import.
- Constitution invariants INV-002 (structural neutrality) and INV-012
  (runtime neutrality); PROP-004/PROP-006 re-proof lineage.
- **Unresolved decisions**: this change depends on none of U1–U11. It
  does not touch U4 (runtime placement) and requires no ADR status
  change.

## Trust / Security / Data Considerations

- **No new trust surface.** The harness is offline and deterministic; it
  runs the same stub CLIs L7 landed, never a real provider, and holds no
  credential.
- **The proof direction is inward.** A test that reaches runner-control
  does so to *observe* the substrate's output, never to widen it. The
  harness constructs no port implementation that can launch anything —
  `DeterministicAdapterInvocation` carries an already-produced report.
- **Divergence is a finding, not a repair.** The harness must never
  normalize two contradictory provider facts into equality; that
  behavior is itself a mutation target.
- **L7's inertness invariant is preserved.** No member outside
  `agents/adapters/` may declare or import an adapter package — which
  independently rules out parameterizing runner-control's own suite by
  adapter (see `design.md`, alternatives).

## Existing Evidence

- `tests/framework-conformance/` at `5403a85` — 85 tests, inventory in
  `design.md`, none crossing the port.
- `services/runner-control/src/orchestration/phases/running.ts:34-72` —
  the seam and its two consumers.
- `packages/runner-core/src/outcome/terminal.ts:86` — the
  `transcript_contradicts_exit` rule.
- `services/runner-control/src/finalization/records.ts:155-177` — the
  evidence assembly inputs, showing which fields are authority-derived
  and which are adapter-derived.
- The falsification reproduced offline from built artifacts, recorded in
  `design.md`.
