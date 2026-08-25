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
                    L8 — EXECUTION-PORT BOUNDARY (this change)

     profile / captured authority ─┐
                                   ▼
                    AdapterInvocationRequest        (platform-built)
                                   │
                    AdapterInvocationPort.invoke()
                          ╱                ╲
                    Claude report      Copilot report
                          ╲                ╱
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
adapter-derived channels against nine authority-derived ones. The nine
are proven *invariant* (they must be byte-identical across adapters); the
two are proven *neutral* (same platform semantics from different provider
dialects).

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
2. **Provider vocabulary reaches a platform-visible position**: the
   classification detail differs by dialect (`terminated result` vs
   `terminated session.result`), which is the surface ADR-0003 lines
   88–92 and `runner-adoption/spec.md:35-43` govern.

`transcript_terminal` has **no documented vocabulary** anywhere in
`docs/` or `openspec/` — the frozen SPI types it `string` with no
comment, runner-core assigns it meaning, and L7 filled it with provider
frames. Three landed layers, no shared contract.

**This change does not fix it.** Three candidate resolutions exist, in
three different ownerships:

| Candidate | Owner | Cost |
|---|---|---|
| Adapters normalize `transcript_terminal` to a platform vocabulary | L7 adapters (`agents/adapters/**`) | small; but invents a vocabulary no contract states |
| runner-core stops comparing against the literal `'success'` | L3 trusted core (`packages/runner-core/**`) | touches the trusted core; and `'success'` in the core is itself a vocabulary question |
| The SPI documents the field's vocabulary | L4 frozen surface (`services/runner-control/src/ports/values.ts`) | requires authority the L4 freeze deliberately withheld from L7-era changes |

Per the standing instruction that #56 grants no authority to redesign the
frozen L4/L7 SPI, the choice is escalated, not taken. The plan is
authored so that **either** the harness lands first and records the
finding as a red, named divergence, **or** the owner authorizes a fix
first and the harness lands green — `tasks.md` sequences both.

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
| Deep-import `services/runner-control/dist/testing-fixtures.js` | It exists in `dist/` and would supply `testPorts()`/`runRequest()` outright, but it is not a declared package export (`exports` exposes only `"."`). Binding a governed proof to an undeclared internal module is a worse dependency than the two-symbol re-export below. |

## Scope assessment — the one honest tension

`Ports` (`services/runner-control/src/ports/index.ts:154-173`) requires
thirteen implementations. Checked one by one against the public export
surface (`src/index.ts`):

| Port | Public implementation available? |
|---|---|
| `authority` | ✅ `FilesystemAuthoritySource` |
| `journal` | ✅ `InMemoryRunJournal` |
| `lease` | ✅ `InMemoryRunLease` |
| `finalization` | ✅ `TransactionalFinalization` |
| **`session`** | ❌ `InMemoryExecutionSession` exists in `src/adapters/index.ts`, **absent from `src/index.ts`** |
| **`workspace`** | ❌ `InMemoryWorkspaceLifecycle` exists in `src/adapters/index.ts`, **absent from `src/index.ts`** |
| `observer` | ✅ `FilesystemWorkspaceObserver` |
| `artifacts` | ✅ `FilesystemArtifactObserver` |
| `execution` | ✅ `DeterministicExecution` |
| `adapter` | ✅ `DeterministicAdapterInvocation` |
| `events` | ✅ `RecordingEventSink` |
| `evidence` | ✅ `RecordingEvidenceSink` |
| `clock` | ✅ `SteppingClock` |

Eleven of thirteen are already public. **Two are not**, and without them
a `Runner` cannot be composed from outside the package.

**Requested expansion (approval required, not assumed):** add
`InMemoryExecutionSession` and `InMemoryWorkspaceLifecycle` to the
existing `export { … } from './adapters/index.js'` list in
`services/runner-control/src/index.ts`. Two symbols, already implemented,
already built into `dist/`, already siblings of eleven exported peers. No
new behavior, no new interface, no `AdapterInvocationPort` change.

Zero-expansion alternative, recorded for the reviewer to weigh:
re-implement both in-memory ports inside `tests/framework-conformance/`.
It keeps the change literally inside #56's declared scope, at the cost of
a second implementation of substrate behavior living in a test, free to
drift from the real one — which would quietly weaken the very proof the
landing exists to make. **Recommendation: the two-symbol re-export**,
because the proof's value depends on the composition being the real one.

The decision is the reviewer's; `tasks.md` blocks on it.

## The same-run comparison model

One logical run, held identical across adapters by construction:

| Held identical | Allowed to differ |
|---|---|
| `run_id`, requester, profile ref, gates, workspace root, pinned base, artifact paths | the stub provider's transcript dialect |
| the captured profile bytes (same authority source) | provider tool identities inside the grant translation |
| grant, routing, limits, credential references | native usage units and amounts |
| the platform-built `AdapterInvocationRequest` fields | provider event payload data |

Two runs, one per adapter, then a field-by-field comparison under an
explicit classification.

### Classification rules

**MUST be adapter-neutral** — any difference is a failure:

- the emitted `event_type` sequence, drawn from the closed vocabulary in
  `runner-execution/spec.md:61-68`;
- event shape/field inventory per event type;
- `call.disposition` values for the same logical operation, and the
  permitted/denied partition of evidence `operations`;
- lifecycle classification (`established` vs conflict kind) and the
  terminal outcome;
- `run_id`, fence `generation`, profile identity + digest, principal,
  `image_digest`, `provider` route;
- evidence field grammar (the key inventory of the assembled bundle);
- the presence or absence of a permitted operation for a logically
  out-of-grant request.

**MAY be provider-native** — difference is expected and must not fail:

- provider tool names inside `operation.name` (claude `Read` vs copilot
  `bash`) — the *disposition* is neutral, the *name* is data;
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
only production-code change under consideration is the two-symbol
re-export above, which adds no behavior.

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
- **The `transcript_terminal` vocabulary decision** — escalated to the
  owner; a separate authorized change in one of the three ownerships
  above.
- **Effective cancellation and enforcement** — L9 (#57), behind U4 (#9).
- **The third (deterministic-loop) adapter** that turns this seed into
  framework conformance — L10 (#58).
