# Design: runner-adapter-conformance-seed

## Context

ADR-0003 lines 187–190 require framework-conformance tests "asserting
that every adapter emits the same event and evidence contract for the
same logical run". L7 landed two real adapters and 85 tests. Those tests
stop at the adapter's own output. This change carries that output across
the one seam that turns it into platform facts.

All findings below were taken from main at `5403a85` and are reproducible
offline.

## The two boundaries

```text
                    L7 — PROCESS BOUNDARY (landed, 85 tests)
        ┌───────────────────────────────────────────────────────┐
        │  wire invocation ──▶ adapter process ──▶ AdapterReport │
        │        (stdin)          plan/observe        (stdout)   │
        └───────────────────────────────────────────────────────┘
                                   ▲
                    proof stops here: report SHAPE compared
                                   │
  ─────────────────────────────────┼─────────────────────────────────
                                   │
                    L8 — EXECUTION-PORT CONSUMER PATH (this change)

     Claude adapter process        Copilot adapter process
       (real, vs its stub)           (real, vs its stub)
              │                              │
              ▼                              ▼
        real AdapterReport            real AdapterReport
              └──────────────┬───────────────┘
                             ▼
        DeterministicAdapterInvocation(report)   ← value-returning double;
                             │                     launches nothing. The
     profile / captured authority ─┐                adapters ran BEFORE
                             │     │                the port, not behind it.
                             ▼     ▼
                    AdapterInvocationRequest        (platform-built)
                                   │
                    AdapterInvocationPort.invoke()  ← the CONSUMER PATH
                                   │                  under proof
                                   ▼
              runner-control interpretation (running.ts)
                 ├── classifyTerminalObservations()   [runner-core]
                 └── recordCalls()                    [orchestration]
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
             platform events              evidence operations
        run.started, capability.granted,   { attempted, permitted,
        adapter.started, call.attempted,     denied } + outcome +
        call.disposition, adapter.completed, authority-derived identities
        run.terminated
                    └──────────────┬──────────────┘
                                   ▼
                       ◀── L8 COMPARES HERE ──▶
```

L7 compares the top box's output. L8 compares the bottom box's output.

**What this does and does not prove.** It proves that two *real,
different* provider reports, carried through the *real* port consumer
path and the *real* interpretation, yield adapter-neutral platform events
and evidence. It does **not** prove that either adapter is an
`AdapterInvocationPort` implementation — neither is, here: the port
implementation is the same value-returning double in both runs, and the
adapters execute before it. An earlier draft's requirement said
"exercise each coding adapter as the implementation behind the … seam",
which the mechanism never did; the spec now states the narrower claim the
harness actually earns. Making an adapter a live port implementation
means spawning a provider from inside `invoke()`, which is L9's shape —
see the rejected alternatives below.
Nothing in the landed suite reaches below the line: verified at `5403a85`
that no file under `tests/framework-conformance/` imports
`@secure-home/runner-control`, constructs a `Runner`, or reads an event
or evidence value. The lone reference, `fc_support.FROZEN_SPI`, opens
`services/runner-control/src/ports/values.ts` as **source text** for the
mirror tether.

## The seam, exactly

`services/runner-control/src/orchestration/phases/running.ts:34-72` is
the whole of it:

```ts
const invocation = await ports.adapter.invoke({ ...scope.fence, adapter, profile,
  input, grant, routing, limits, credentials, workspace, signal })

if (invocation.outcome === 'stale_fence')        → loseFence + conclude('none')
if (invocation.outcome === 'environmental_fault') → operational_fault / OPERATIONAL_FAILURE

const classified = classifyTerminalObservations(invocation.observation.terminal)
if (!classified.established)                      → finish(indeterminate, INDETERMINATE)

const recorded = await recordCalls(env, authority, invocation.observation.calls)
```

### What the platform actually consumes

Verified by grep over non-test runner-control source: **exactly two**
fields of `AdapterObservation` have a consumer.

| Observation field | Consumer | Platform effect |
|---|---|---|
| `terminal` | `classifyTerminalObservations` (runner-core) | established / `INDETERMINATE` + operator-facing detail |
| `calls` | `recordCalls` (orchestration) | `call.attempted` + `call.disposition` events, and evidence `operations.{attempted,permitted,denied}` |
| `claims` | **none** | — |
| `events` | **none** | — (the event contract's `provider_event_name` slot is therefore never populated) |
| `usage` | **none** | — |
| `transcript` | **none** | — |

This is load-bearing for scoping the proof: the adapter-neutrality
question at this boundary has exactly **two** live channels today. The
four unconsumed fields are carried by the SPI and dropped by the current
consumer; asserting their neutrality *here* would prove nothing about the
platform, and this change says so rather than manufacturing coverage. It
records them instead as a named observation for L9/L10, when a consumer
exists.

### What evidence binds, and from where

`services/runner-control/src/finalization/records.ts:155-177`:

| Evidence field | Source | Adapter-influenceable? |
|---|---|---|
| `run_id` | request / captured authority | no |
| fence `generation` | lease claim | no |
| profile identity + `digest` | captured profile snapshot | no |
| `image_digest`, `runtime` | `profile.runtime.image_digest` | no |
| `provider` | `profile.execution.model_route` | no |
| `principal` | request requester | no |
| `adapter` | `inputs.adapter` (opaque identity) | value only, never structure |
| `operations` | `recordCalls` ← `observation.calls` | **yes** |
| outcome / terminal | `outcomeFor(inputs.terminal, …)` ← classification | **yes** |
| `gate_results` | gate execution | no |

So the neutrality proof has a small, exactly-bounded surface: two
adapter-derived channels (`operations`, and the outcome via terminal
classification) against everything else, which comes from captured
authority. "Adapter-influenceable" above means *by the report* — none of
the authority-derived fields can be moved by anything an adapter says.
Three of them (`adapter`, `image_digest`/`runtime`, profile identity +
digest) nonetheless differ **between the two runs**, because the profile
itself carries the provider binding; they are proven by *binding* to
their own captured profile rather than by cross-run equality. See "The
same-run comparison model".

## Finding: the composition is falsified today

Reproduced offline at `5403a85` from built artifacts (`runner-core` dist
+ both adapter dists), feeding each adapter's real `observeRun()` output
for a **clean, fully successful** run into the real classifier:

```text
claude  terminal: {"exit_code":0,"reported_outcome":"success","transcript_terminal":"result"}
copilot terminal: {"exit_code":0,"reported_outcome":"0","transcript_terminal":"session.result"}

claude  classified: {"established":false,"conflict":"transcript_contradicts_exit",
  "detail":"the provider reported exit 0 but its transcript terminated result; …"}
copilot classified: {"established":false,"conflict":"transcript_contradicts_exit",
  "detail":"the provider reported exit 0 but its transcript terminated session.result; …"}
```

`packages/runner-core/src/outcome/terminal.ts:86` treats any
`transcript_terminal` other than the literal `'success'` as contradicting
a zero exit. Both L7 adapters populate that field with a provider **frame
name** (`observe.ts`: claude sets `'result'`; copilot sets the frame
`type`, e.g. `'session.result'`).

Consequences, both real:

1. **Every successful coding run classifies `INDETERMINATE`** at the
   execution port — a failure class — for both adapters.
2. **The classification detail differs by dialect** (`terminated result`
   vs `terminated session.result`).

   An earlier draft called this a structural-neutrality violation. That
   over-reached: ADR-0003 lines 88–92 forbid a provider name in a
   **structural position** of a *contract* — field name, enum member,
   constant — and expressly permit it "only as an *opaque value*". A
   diagnostic detail string is a value, not a structural position, and
   `runner-execution/spec.md:61-68` likewise carries provider naming "in
   optional opaque data fields". So the detail differing by dialect is
   **not** itself the defect, and the L8 delta no longer prohibits it.

   The defect is narrower and entirely sufficient: `transcript_terminal`
   has no shared semantic vocabulary, so both adapters drive the *wrong
   lifecycle classification*. Fixing that is the predecessor's job; it
   does not require inventing a broader rule about diagnostic data.

`transcript_terminal` has **no documented vocabulary** anywhere in
`docs/` or `openspec/` — the frozen SPI types it `string` with no
comment, runner-core assigns it meaning, and L7 filled it with provider
frames. Three landed layers, no shared contract.

**Ownership is not open — ADR-0013 already assigns it.** An earlier draft
of this design offered a three-way choice; that was wrong, and the
correction matters because it decides what must land first.

- **ADR-0013 decision 3** (lines 92–95): "The provider's exit code, its
  self-reported outcome, and its transcript's terminal event are all
  **observations**. **The adapter normalizes them**; the lifecycle
  decides."
- **ADR-0013 decision 5** (line 122): "Provider event shapes are
  normalized at the adapter boundary and **never leak upward**."

The adapters therefore own normalization, and the current code leaks
provider frame names upward at
`agents/adapters/coding/claude-code/src/observe.ts:163` and
`agents/adapters/coding/copilot-cli/src/observe.ts:195`. This is an
adapter defect against an accepted ADR, not a contested boundary.

What remains genuinely undecided is **the vocabulary**: which value means
"the transcript terminated successfully", and where that vocabulary is
stated so three layers can share it. `transcript_terminal` is typed
`string` in the frozen SPI with no comment, and runner-core's rule
(`terminal.ts:86`) makes the literal `'success'` load-bearing without any
contract saying so. Candidate homes for the vocabulary — the SPI's own
doc comment, a contracts primitive, or a spec requirement — are a
narrower question than ownership, and it is the only part of this finding
that needs an owner decision.

**This change still does not implement the fix**: `agents/adapters/**` is
outside #56's declared scope. The fix is sequenced as a required
predecessor (see "Landing order" below), because a conformance gate that
cannot pass is not a gate.

## Harness architecture

### Chosen: real report → real port double → real Runner

Option **B** from the brief, using only landed, publicly-exported seams:

```text
tests/framework-conformance/  (pytest, offline, deterministic)
  │
  1. run each L7 adapter's BUILT dist/bin.js against its committed stub
     (exactly the landed L7 mechanism: fc_support.run_adapter)          → real AdapterReport JSON
  │
  2. node driver:
       new DeterministicAdapterInvocation(report)        ← publicly exported; carries the
                                                            report, launches nothing
       new Runner(ports, controls).run(request)          ← publicly exported
       ports.events   = RecordingEventSink               ← publicly exported
       ports.evidence = RecordingEvidenceSink            ← publicly exported
  │
  3. dump {events, evidence, conclusion} as JSON per adapter
  │
  4. pytest applies the neutrality classification and compares
```

Why this shape:

- **It is the real path.** The comparison observes what `running.ts`,
  `classifyTerminalObservations`, `recordCalls`, the event emitter, and
  evidence assembly actually produced — no re-implementation of the
  transform in the test, which is precisely the "fake common
  normalization" failure mode.
- **It creates no new interface.** `DeterministicAdapterInvocation` is
  the existing, exported port double; it even enforces the fence before
  returning. `AdapterInvocationPort` is untouched.
- **It cannot launch.** The port double returns a value. Nothing in the
  harness can start a container, and the adapters' own process runs are
  the same stub-backed runs L7 already performs.
- **It preserves L7's inertness invariant.** The adapter packages are
  reached only from `tests/`, never from a workspace member — so
  `test_no_manifest_outside_adapters_declares_an_adapter` and
  `test_no_source_outside_adapters_imports_an_adapter` keep passing.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| **(C) Parameterize runner-control's own conformance suite by adapter** | **Structurally forbidden by L7.** PA-INV-12 (landed as `test_no_manifest_outside_adapters_declares_an_adapter` / `test_no_source_outside_adapters_imports_an_adapter`) fails the moment `services/runner-control/**` declares or imports an adapter package. Choosing this would require deleting a landed invariant. |
| **(E) Re-derive the transform inside the test** (call `classifyTerminalObservations` and hand-build the operations) | Proves the test's copy of the rules, not the platform's. It is exactly mutation case 9 — a test-side normalization — and would have to be maintained against `running.ts` forever. |
| **(A) A conformance fixture that implements `AdapterInvocationPort` by spawning the adapter process inside `invoke()`** | Viable and tempting, but strictly larger: it puts process management inside a port implementation, which is the shape L9 owns. Producing the report first and carrying it through a value-returning double keeps L8 on the near side of the launcher. |
| **(D) Conclude L8 is pure promotion of existing evidence** | Refuted by the falsification above: the composition is not merely unproven, it is currently wrong. Promotion would ratify a broken composition. |
| Deep-import `services/runner-control/dist/testing-fixtures.js` | It exists in `dist/` and would supply `testPorts()`/`runRequest()` outright, but it is not a declared package export (`exports` exposes only `"."`). Binding a governed proof to an undeclared internal module is a worse dependency than a declared factory or export (see "Scope assessment"). |

## Scope assessment — the one honest tension

`Ports` (`services/runner-control/src/ports/index.ts:154-173`) requires
thirteen implementations. Checked one by one against the public export
surface (`src/index.ts`):

| Port | Publicly constructible? |
|---|---|
| `authority` | ✅ `FilesystemAuthoritySource` |
| `journal` | ⚠️ `InMemoryRunJournal` — exported, but defaults to a **private** `CommitLedger` |
| `lease` | ✅ `InMemoryRunLease` |
| **`finalization`** | ⚠️ `TransactionalFinalization` **is** exported, and so is the `CommitVisibility` type — but `CommitParticipants` and the only `CommitVisibility` implementation, `CommitLedger`, are not. **Correct finalization wiring and the shared ledger are not publicly provided.** |
| **`session`** | ❌ `InMemoryExecutionSession` exists in `src/adapters/index.ts`, **absent from `src/index.ts`** |
| **`workspace`** | ❌ `InMemoryWorkspaceLifecycle` — same |
| `observer` | ✅ `FilesystemWorkspaceObserver` |
| `artifacts` | ✅ `FilesystemArtifactObserver` |
| `execution` | ✅ `DeterministicExecution` |
| `adapter` | ✅ `DeterministicAdapterInvocation` |
| `events` | ⚠️ `RecordingEventSink` — exported, defaults to a **private** `CommitLedger` |
| `evidence` | ⚠️ `RecordingEvidenceSink` — same |
| `clock` | ✅ `SteppingClock` |

Verified against the built declarations, and corrected after review — an
earlier draft claimed `CommitVisibility` was unexported on the strength of
a `grep` over `index.d.ts`, which is the wrong probe: `export *` does not
inline names. The accurate chain is:

| Symbol | Public? | Evidence |
|---|---|---|
| `TransactionalFinalization` | ✅ | named re-export, `index.d.ts:14` |
| `CommitVisibility` (type) | ✅ | `index.d.ts:21` → `ports/index.d.ts:151` → `ports/finalization.d.ts:227` |
| `CommitParticipants` (type) | ❌ | declared at `adapters/finalization.d.ts:46`; absent from the named re-export list at `index.d.ts:14` |
| `CommitLedger` (the only `CommitVisibility` impl) | ❌ | `run-state/visibility.ts:35`, never re-exported |
| `InMemoryExecutionSession` | ❌ | in `src/adapters/index.ts`, absent from `src/index.ts` |
| `InMemoryWorkspaceLifecycle` | ❌ | same |

So the missing named pieces are exactly four: `CommitLedger`,
`CommitParticipants`, `InMemoryExecutionSession`,
`InMemoryWorkspaceLifecycle`.

Two problems, not one:

1. **Two ports are unreachable** (`session`, `workspace`), and a third —
   `finalization` — has no publicly provided *correct wiring*: a consumer
   can name `CommitVisibility` and could structurally satisfy
   `CommitParticipants` without naming it, but would have to hand-roll
   the ledger, i.e. define the platform's visibility semantics inside the
   test. That is precisely what this proof must not do.
2. **A silent-correctness hazard.** `CommitParticipants.visibility` is
   documented as "the visibility authority the three participants
   **SHARE**" (`adapters/finalization.ts:57-64`), but
   `RecordingEventSink` and `RecordingEvidenceSink` each default to
   `new CommitLedger()` (`adapters/deterministic.ts:127`, `:381`). A
   consumer that composes them without threading one shared ledger gets
   a harness where finalization publishes on one ledger while the sinks
   read another — the staged terminal event and evidence never become
   visible. That failure is quiet: the run completes, and the comparison
   silently has nothing terminal to compare.

The substrate already contains the correct wiring, in two layers:
`testing-fixtures.ts:203` `sharedPorts()` constructs one `CommitLedger`
and threads it through journal, events, and evidence — **four components,
not a complete `Ports`** — and `testing-fixtures.ts:218` `testPorts()`
composes the full thirteen around it, including
`InMemoryWorkspaceLifecycle`, `InMemoryExecutionSession`, and the
finalization participants. Neither is a declared package export.

**The requested factory is `testPorts`-shaped, not `sharedPorts`-shaped**,
and its contract must be stated rather than inferred:

| Requirement | Detail |
|---|---|
| Returns | a **complete `Ports`** — all thirteen fields — ready for `new Runner(ports)`; not a partial set the caller finishes |
| Shared visibility | ONE `CommitVisibility` instance threaded through `journal`, `events`, `evidence`, **and** the finalization participants; the caller cannot get this wrong because the caller never wires it |
| Readback | exposes the shared visibility and the two recording sinks, so the harness can read the emitted events and written evidence after the run |
| Overrides | accepts at least `adapter` and `authority` overrides, so the harness injects `DeterministicAdapterInvocation(report)` and a profile source that yields the two fixture profiles; an override must not silently break the shared wiring |
| Determinism | stepping clock, in-memory journal and lease; no wall-clock or randomness in the compared surface |
| Launches nothing | every returned port is value-returning or in-memory; none spawns a process |
| Scope | a curated, supported surface — **not** exporting `testing-fixtures` wholesale, whose other members (failing doubles, hanging adapters) are the service's own test scaffolding |
| Entry point | the existing top-level barrel, `src/index.ts`. **No `package.json` change**: the factory rides the already-declared `"."` export, so the affected path is one source file |

**Expansion — APPROVED at T0.2 (owner, 2026-08-26): option (b), the
composition factory from the existing top-level barrel.** The options as
weighed:

| Option | Shape | Cost |
|---|---|---|
| **(b) a public composition factory** *(recommended)* | expose a curated factory returning a **complete thirteen-field `Ports`** — the `testPorts` shape (`testing-fixtures.ts:218`), NOT the `sharedPorts` shape (`:203`, four components only) — from the existing `src/index.ts` barrel, satisfying the contract table above | makes **correct wiring the contract** instead of a consumer obligation; smallest public surface; one symbol; **no manifest change** |
| (a) piecemeal symbol exports | add the four missing named pieces: `CommitLedger`, `CommitParticipants`, `InMemoryExecutionSession`, `InMemoryWorkspaceLifecycle` | four additions, and it leaves the shared-ledger hazard as something every consumer must get right unaided |
| (c) re-implement in the test | build both in-memory ports **and** a `CommitLedger` inside `tests/` | stays literally inside #56's scope, but the harness would then define its own visibility semantics — a proof about the test's substrate, not the platform's. Rejected on merit |

**Why the top-level barrel and not a `./testing` subpath export.** An
earlier draft left both routes open, which under-declared the affected
scope: a subpath would additionally require `package.json` (which today
declares only `"."` — `services/runner-control/package.json:10`) and a
new source entry to back it. Restricted to the barrel on the evidence:

- the barrel **already exports ten in-memory / recording / deterministic
  doubles** (`DeterministicAdapterInvocation`, `RecordingEventSink`,
  `RecordingEvidenceSink`, `SteppingClock`, `InMemoryRunJournal`,
  `InMemoryRunLease`, the three `Filesystem*` observers,
  `DeterministicExecution`), so one factory beside them is consistent
  rather than novel;
- **every service in this workspace exports only `"."`.** Subpath exports
  exist solely on build-tooling and test-only packages
  (`eslint-config`, `tsconfig`, `testing`'s `./vitest`) and on the
  adapters' `./bin` process entry. A `./testing` subpath on a deployable
  would be unprecedented here;
- no repository gate asserts export maps, so the drift a second entry
  point invites would not be caught mechanically.

**T0.2 ruled the subpath out.** It is recorded here as rejected rationale,
not as a live option: it would require `package.json` plus a new entry
module plus their verification, which is a larger scope request than the
one approved. Reviving it would be a new scope request, separately
declared.

Two earlier framings were wrong and are corrected here: "two symbols"
missed the finalization pieces entirely, and "finalization is
unconstructible" overstated it — the class and the `CommitVisibility`
type are both public. The accurate defect is narrower and still
blocking: **correct finalization wiring and the shared ledger are not
publicly provided.** Option (b) is recommended because that wiring is
exactly the kind of thing a factory should own.

**Decided at T0.2 (owner, 2026-08-26): option (b), the curated
composition factory on the existing top-level barrel.** Options (a) and
(c) are rejected and retained above only as the rationale for that
choice.

## The same-run comparison model: one logical run, two provider bindings

An earlier draft said "same profile", which is **not expressible**. The
execution profile carries the provider binding itself:

```ts
// packages/contracts/src/execution-profile/execution-profile.ts:22-25
runtime: z.strictObject({ image_digest: Digest, adapter: AdapterId }),
```

and the runner derives the invoked adapter from the captured profile —
`services/runner-control/src/orchestration/phases/requested.ts:96`:
`const adapter = resolved.value.runtime.adapter`. Two adapters therefore
require **two profile documents**; ADR-0011 (one provider per derived
image) makes `runtime.image_digest` differ too, and the L7 fixture
already diverges on both the adapter identity and `grant.tools`
(`Read` vs `bash`) at `tests/framework-conformance/fc_support.py:99`.

The model is therefore **one logical run, two provider bindings**:

| Held identical by construction | Provider-bound: differs, and must be correctly bound | Provider-native: differs, unbound |
|---|---|---|
| `run_id`, requester/principal, input, gates, workspace root, pinned base, artifact paths | profile `identity` + digest | stub transcript dialect |
| fence generation | `runtime.adapter` → evidence `adapter` | provider tool identities in `capability.tools` / `operation.name` |
| `execution` routing class, route, fallback | `runtime.image_digest` → evidence `image_digest` / `runtime` | native usage units and amounts |
| `limits`; grant SHAPE (mounts, network policy, credential refs, tool count/semantics) | | provider event payload data |

The middle column is the part the earlier draft got wrong twice: those
values are *allowed* to differ, but they are **not** unconstrained. Each
must equal the corresponding field of the profile actually captured for
that run. That per-run binding is a stronger and more honest property
than the cross-run byte-equality the first draft asserted, and it is what
`runner-evidence/spec.md:21` ("provider and adapter identity as opaque
data") actually requires.

Two profile documents are authored as fixtures differing **only** in the
middle column, so any other difference between them is itself a fixture
defect the harness can detect.

### Aligning "the same logical operation"

The comparison rules above speak of "the same logical operation", which
the earlier drafts never defined. `recordCalls`
(`orchestration/calls.ts:38-40`) settles it:

```ts
for (const [index, call] of calls.entries()) {
  const call_id = `call-${String(index + 1).padStart(4, '0')}`
```

Identity is **positional**: the i-th entry of `observation.calls` becomes
`call-000i`, in both events and evidence. Tool names never enter the
identity, which is what makes cross-adapter comparison possible at all
when the names legitimately differ (`Read` vs `bash`).

Three consequences the harness must honour:

1. **Alignment is by ordinal, not by name.** The comparison pairs
   `call-0001` with `call-0001`, and asserts the *disposition* matches
   while the *name* is free to differ.
2. **Positional alignment is only meaningful when the sequences
   correspond.** The golden fixtures must therefore drive each stub to
   produce the **same number of logical operations in the same order**;
   that is a property of the fixtures, and the harness asserts it before
   comparing dispositions rather than assuming it.
3. **A dialect that legitimately produces a different count breaks
   positional alignment, and must not be compared positionally.** The
   out-of-grant case is exactly this: claude records a denied call,
   copilot records none at all (L6 outside-tool). Those sequences cannot
   be zipped. The shared property — *no permitted operation exists for
   the out-of-grant request* — is asserted over the whole sequence
   instead, and the dialect difference is classified MAY-differ.

So the call comparison has two modes, and the harness picks by
declaration, never by inference:

| Mode | When | Asserted |
|---|---|---|
| aligned | the case declares corresponding sequences | equal length, and for each ordinal: dispositions equal, `call_id` equal, names free |
| unaligned (dialect) | the case declares a dialect divergence (e.g. out-of-grant) | the shared property only — no permitted operation for the logical request |

**A length mismatch in an *aligned* case is a divergence, not an
alignment problem**: the harness fails and names it rather than silently
falling back to the unaligned mode. That fallback would be the
"normalization that manufactures equality" this change exists to prevent.

### Classification rules

**MUST be adapter-neutral** — any difference is a failure:

- the emitted `event_type` sequence, drawn from the closed vocabulary in
  `runner-execution/spec.md:61-68`;
- event shape/field inventory per event type;
- `call.disposition` values for the same logical operation, and the
  permitted/denied partition of evidence `operations`;
- lifecycle classification (`established` vs conflict kind) and the
  terminal outcome;
- `run_id`, fence `generation`, principal, routing class and `provider`
  route, limits;
- evidence field grammar (the key inventory of the assembled bundle) —
  the *keys*, including `adapter` and `image_digest`, are neutral even
  where their *values* are not;
- the presence or absence of a permitted operation for a logically
  out-of-grant request.

**MAY be provider-native** — difference is expected and must not fail,
but a *bound* value must still match its own captured profile:

- the evidence `adapter` field and the recorded `image_digest` / runtime
  identity, and the profile identity + digest — **bound** (each must
  equal its own profile's field);
- provider tool names inside `capability.tools` and `operation.name`
  (claude `Read` vs copilot `bash`) — the *disposition* is neutral, the
  *name* is data;
- native usage units/amounts (ADR-0013 decision 6) — not consumed by the
  platform today in any case;
- provider event payload data;
- the observable dialect of an out-of-grant attempt: claude's reactive
  denial record vs copilot's preventive absence (L6 outside-tool case).
  The shared property is "never permitted"; the shape is dialect.

**Unclassified is a failure.** A compared field belonging to neither set
fails rather than defaulting — an unclassified fact is an unproven one.

### Divergence handling

When a compared fact differs under a MUST-agree classification, the
harness fails and names: the field, both values, the classification, and
the platform position. It never rewrites, coerces, or "canonicalizes" the
two values into one. That prohibition is itself a mutation target, since
a well-meaning normalization is the most likely way this proof would be
silently destroyed.

## Landing order

The conformance gate cannot pass while the adapters leak provider frame
names into `transcript_terminal`, and a gate that cannot pass is not a
gate. So this landing is sequenced behind the adapter fix rather than
around it:

1. **Predecessor — adapter normalization** (`agents/adapters/**`, plus
   wherever the vocabulary is stated). Owned by the adapters per ADR-0013
   decisions 3 and 5. Outside #56's declared scope, and **T0.1 selected
   the separate predecessor change**: it does not land as an extension of
   this one, so #56 is never widened to carry adapter changes.
2. **This landing** — the execution-port harness, landing **green**.

The alternative — landing the harness red against a known finding — is
rejected. #56's completion intent is "suite green across both adapters";
a named divergence is the correct *failure behavior* of the gate, not a
successful conformance result. If the owner instead wants the
falsification captured before the fix exists, that is a different piece
of work with a different name (a falsification-only, explicitly
non-gating change), and `tasks.md` says so rather than blurring the two.

## The Python ↔ Node handoff contract

The harness spans two runtimes: the landed suite is pytest, the substrate
and adapters are Node. The boundary is specified here so implementation
does not invent it.

```text
pytest (fc_support)                      node driver (tests/framework-conformance/)
  │                                        │
  ├─ 1. build prerequisite ────────────────┤  both adapter dists AND runner-control dist
  │     fail loudly with the build command if absent (never skip)
  │                                        │
  ├─ 2. run adapter process ───────────────┤  existing fc_support.run_adapter → AdapterReport JSON
  │                                        │
  ├─ 3. write handoff document ────────────▶  {profile, request, report} as one JSON file
  │                                        │
  │                                        ├─ 4. compose Ports; new Runner(...).run(request)
  │                                        │     adapter port = DeterministicAdapterInvocation(report)
  │                                        │
  ◀─ 5. read result document ──────────────┤  {events, evidence, conclusion} as one JSON doc on stdout
  │
  └─ 6. classify + compare across adapters
```

| Concern | Contract |
|---|---|
| Process boundary | one `node <driver>` subprocess per adapter run; no daemon, no shared state between runs |
| Input | a single JSON document on **stdin** (the same shape both runs receive, differing only in the provider-bound fields) |
| Output | a single JSON document on **stdout**, and nothing else on stdout — the same stdout-purity rule the L7 wire contract already enforces |
| Diagnostics | stderr only; never parsed |
| Exit protocol | `0` = a result document was produced (including a run that concluded in a failure class — that is data, not a driver error); non-zero = the driver itself faulted before producing one |
| Failure attribution | a non-zero driver exit is an **operational** failure of the harness, never a conformance finding; the two are reported distinctly |
| Build prerequisite | the driver refuses (non-zero, with the exact build command) if any required `dist/` is missing — the landed L7 posture: fail, never skip |
| Determinism | `SteppingClock`, in-memory journal/lease, fixed `run_id`, fixed fixture bytes; no wall-clock, no randomness in the compared surface |
| Isolation | the adapter subprocess keeps L7's isolated PATH; the driver adds no network access and no credential |

`tasks.md` T1.3 lands this contract with the driver, before any assertion
depends on it.

## Failure classification boundaries

| Situation | Treated as |
|---|---|
| adapters agree; platform output identical under MUST-agree rules | pass |
| adapters differ only under MAY-differ rules | pass |
| adapters differ under a MUST-agree rule | **conformance failure**, divergence named |
| both adapters produce the same *wrong* platform semantics (the current `INDETERMINATE` finding) | **conformance failure** — agreement is necessary, not sufficient; the run must also reach the classification the contract requires |
| an adapter's build is missing | hard failure with the build command (never a skip) — the landed L7 posture |
| the stub, the harness, or the driver faults | operational failure, distinguished from a contract finding |

## Compatibility and migration

No contract, schema, event, evidence, profile, or ADR change. No change
to `AdapterInvocationPort`. The adapters and images are untouched. The
only approved production-code expansion is the curated composition
factory recorded by T0.2, which adds no behavior and no new interface.

## Security implications

The harness holds no credential, contacts no network, launches no
container, and constructs no port implementation capable of starting a
process. It runs the same committed stubs L7 landed, on the same isolated
PATH (`fc_support._isolated_path`) that refuses to run if a real provider
CLI is reachable. Reaching runner-control is an *observation* of the
substrate's output, never a widening of it.

## Deferred behavior (named owners)

- **Neutrality of `claims`, `events`, `usage`, `transcript`** at the
  recording boundary — deferred until a consumer exists (L9/L10). Named
  here so the gap is recorded rather than assumed closed.
- **The `transcript_terminal` vocabulary and where it is stated** —
  decided at T0.1 and carried by the **separate predecessor change**,
  together with the normalization itself, which the adapters own
  (ADR-0013 §3/§5). Neither is deferred work: the predecessor is the one
  landing this change waits on.
- **Effective cancellation and enforcement** — L9 (#57), behind U4 (#9).
- **The third (deterministic-loop) adapter** that turns this seed into
  framework conformance — L10 (#58).
