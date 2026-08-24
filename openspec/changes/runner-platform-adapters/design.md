# Design: runner-platform-adapters

## Context

L4 froze the adapter SPI inside `services/runner-control/src/ports/values.ts`
and said why: "L7's authorized scope is `adapters/` and images — not this
service." L5 landed the image lineage with the Claude runtime pinned. L6
produced empirical findings against Copilot CLI 1.0.79. ADR-0013 (accepted)
fixed the ten decisions this design implements. What remains is the part the
platform has never had: real adapters, the proof that they emit one contract,
and the second derived image.

## Goals

- Two real adapters — Claude reference, Copilot — conformant to ADR-0013,
  translation-faithful to their pinned CLIs, defensively parsing everything
  they read.
- The framework-conformance suite proving ADR-0003's central claim with two
  real adapters, offline.
- `secure-home-runner-copilot` in the governed lineage with real CI digests.
- All of it inert: nothing launches, nothing is wired into the service.

## Non-Goals

- The launcher, runtime selection, profile activation (L9 / #57 behind U4).
- Any edit under `services/runner-control/` — including "harmless" ones.
- Credential handling in any form.
- A Codex adapter, any frameworks-tier adapter, any provider SDK.

## The seam (load-bearing): conforming to a type you may not import

The SPI types live inside a deployable. The workspace rules make the obvious
approaches illegal, and the legality is mechanical, not stylistic:

| Approach | Why it is refused |
|---|---|
| Adapters `import type { ... } from '@secure-home/runner-control'` | `check-source-imports.mjs` fails any import of a deployable — "nothing may import a service or an app" — **before** the zone check, so tests are covered too; `type`-only imports are still imports to the AST walk |
| Move the SPI into `packages/contracts` | Edits the frozen L4 surface and the L2 corpus, both outside L7's authority; the freeze comment exists precisely to stop this |
| A new shared `adapter-spi` package | A third copy of the truth; still requires runner-control to import it (an L4 edit) or drift from it; adds a package outside #55's scope for no property the chosen design lacks |

**Chosen: structural mirror + mechanical tether + behavioral goldens.**

1. Each adapter declares its own `src/spi.ts` mirroring the frozen value
   shapes it exchanges: the wire invocation (the frozen
   `AdapterInvocationRequest` minus `signal` — an `AbortSignal` does not
   serialize; cancellation crosses the process boundary as SIGTERM) and the
   report side (`AdapterCall`, `UntrustedClaim`, `NormalizedProviderEvent`,
   `TerminalObservations`, `UsageMeasure`, `AdapterObservation`,
   `AdapterReport`). The file carries provenance: which file froze the
   shapes, and that the mirror never adds, removes, or renames a field.
2. The conformance suite tethers the mirrors mechanically: it derives the
   field inventory of the frozen interfaces from
   `services/runner-control/src/ports/values.ts` **source text** at run time
   (the same derive-or-refuse pattern `check-images.mjs` uses on
   `helpers.ts`), derives each mirror's inventory the same way, and fails on
   any difference. Reading source bytes is not an import; the direction rule
   governs module edges, and the tether creates none.
3. Golden wire fixtures pin behavior: a frozen-shape invocation document and
   report-grammar assertions, so a mirror that drifted *semantically* (right
   fields, wrong meaning) still fails the suite.

TypeScript's structural typing means that when L9's launcher later holds a
real `AdapterInvocationRequest` and serializes it for an adapter process,
agreement is by shape, not by shared nominal types — which is exactly the
neutrality posture ADR-0013 decision 9 demands of the SPI itself.

## Package identity and placement

- Names: `@secure-home/adapter-claude-code`, `@secure-home/adapter-copilot-cli`.
  Every other member's name is its directory basename, but these basenames
  (`claude-code`, `copilot-cli`) are provider product names; the `adapter-`
  prefix keeps the workspace name stating the platform role while the
  directory states the provider. No mechanical naming rule exists either
  way; this is recorded as the decision.
- Layer: **3**, beside `runner-core` and for the same reason (its design
  D1): the framework-dependency guard in `check-workspace.mjs` applies at
  `ownLayer <= CONTRACT_LAYER_MAX (3)`, so the placement buys mechanical
  refusal of `@nestjs/*`, `fastify`, `express`, and friends in adapter
  manifests. Imports allowed by direction from layer 3: layers 1–2
  (`contracts`, `errors`, `events`, `query-model`).
- Dependencies: **zero runtime dependencies.** The only platform types an
  adapter needs beyond its own mirror are `CapabilityGrantT` (and its
  neighbors) — consumed as `import type` from `@secure-home/contracts` and
  declared as a **devDependency**: the edge is erased at compile time, so
  the manifest's runtime-dependency claim (`dependencies: {}`) stays true,
  while `check-source-imports.mjs` still verifies the direction of the
  type import (layer 3 → layer 1, inward). Grant validation inside the wire
  parser is hand-rolled and closed rather than zod-based, so the compiled
  adapter resolves nothing but `node:` builtins.
- Workspace admission: `pnpm-workspace.yaml` gains `'agents/adapters/coding/*'`
  (the `services/workers/*` precedent for a nested glob root);
  `scripts/workspace-model.mjs` gains the matching `MEMBER_GLOBS` entry and
  two explicit `LAYERS` placements. `agents/adapters/coding/codex/` has no
  `package.json`, so both pnpm and `findMembers` skip it — README-only is
  preserved without a special case.

## Adapter architecture (identical in both packages)

```
src/spi.ts      the wire mirror + closed, hand-rolled wire validators
src/plan.ts     pure: wire invocation  → provider launch plan
src/observe.ts  pure: captured surfaces → AdapterObservation
src/bin.ts      the process entry: stdin → validate → spawn → collect →
                report on stdout   (the only file that touches a process)
src/index.ts    exports the pure core and types; no side effects at import
```

`plan` and `observe` are pure functions so every mapping decision is
unit-testable without a process; `bin.ts` is thin plumbing over them. The
provider CLI is resolved by name on `PATH` (`claude`, `copilot`) — inside
the paired image that is the pinned binary; in conformance it is the stub.
No environment override exists for the binary path: an override would be a
widening surface.

### The wire contract

| Surface | Rule |
|---|---|
| stdin | one JSON document: the wire invocation (frozen request minus `signal`) |
| stdout | exactly one JSON document: the frozen `AdapterReport`; nothing else, ever |
| stderr | diagnostics only; never parsed by the substrate |
| exit 0 | a report was emitted (any outcome — `environmental_fault` is a report, not a crash) |
| exit ≠0 | the adapter itself faulted before it could report; the substrate classifies |
| SIGTERM | cancellation: forwarded to the provider child, bounded grace, then the report is still emitted with `terminal.signalled` recorded |

A malformed invocation (not JSON, unknown keys, missing fields, wrong
types) yields an `environmental_fault` report naming the refusal — closed
parsing, unknown keys refused, mirroring the platform's strict-schema
posture at every other boundary.

### Claude translation (pinned: `@anthropic-ai/claude-code@2.1.241`)

| Invocation field | Provider surface |
|---|---|
| `input.task` | `claude -p <task>` (non-interactive print mode) |
| `grant.tools` | `--allowedTools <granted...>` — the closed visible set |
| tools outside the grant | `--disallowedTools` for the known surface outside the grant; the substrate remains the boundary |
| `routing.model_route` | `--model <route>` — passed through as data; no model name exists in adapter source |
| `routing.fallback` | NOT translated — ADR-0007 platform routing policy ("refuse", degrade between classes), enforced by the substrate before an invocation exists; never a provider model identifier |
| transcript capture | `--output-format stream-json --verbose` on stdout |
| `limits.output_bytes` | capture budget in `observe`, measured in UTF-8 bytes (the CLI has no native cap) |
| `credentials[].env_var` | named as required provisioning; child env allowlisted to baseline + declared names; values never touched |
| `workspace.session_ref` / `root_ref` | opaque platform data (`workspace:<run>`) — never resolved, never a cwd; the L9 session substrate establishes the sandbox working directory and adapter + provider inherit it |

Observation mapping: `system`/init events → normalized lifecycle events;
assistant text → `UntrustedClaim{kind:'text'}`; structured result payloads →
`UntrustedClaim{kind:'structured'}`; tool-use/tool-result pairs →
`AdapterCall` with disposition from the result's permission/error channel;
the final result event → `terminal.reported_outcome` +
`transcript_terminal` + native token usage → `UsageMeasure[]` (unit names
like `input_tokens`, `output_tokens`; no money).

### Copilot translation (pinned: `@github/copilot@1.0.79`)

Every row traces to the L6 spike; the adapter README carries the full
normalization-basis table.

| Invocation field | Provider surface | L6 basis |
|---|---|---|
| `input.task` | `copilot -p <task>` non-interactive with `--no-ask-user` | SPIKE-02 (unapproved writes fail closed noninteractively) |
| `grant.tools` | `--available-tools=<tool>` per granted tool — availability narrowing in the availability grammar | SPIKE-02 (availability removed other tools; unknown names fail closed) |
| granted `bash` → permission | `--allow-tool=shell` — the evidenced namespace mapping (availability `bash` ↔ the `shell` permission-rule family); an availability identity is never copied into the permission grammar, and a granted tool with no evidenced mapping gets no invented rule | SPIKE-02 (proven positive case `available=bash / allow=shell(printf)`; the two controls have different identity grammars) |
| `bash` outside the grant | `--deny-tool=shell` — only then; a granted tool's own family is never denied | SPIKE-02 (deny beats allow; read-only shell auto-approves unless denied) |
| `credentials[].env_var` → secrecy | `--secret-env-vars=<NAME>` per declared reference — strips named variables from shell/MCP subprocess environments and redacts output; custody stays with L9 | SPIKE-05 (confirmed: the marker was absent from the shell tool) |
| `routing.model_route` | `--model <route>` pinned explicitly, never Auto | spike environment (model explicitly pinned for every evidence run) |
| transcript capture | stdout `--output-format json` framing + the persisted events surface under a per-run `COPILOT_HOME` | SPIKE-03 (permission events only in persisted events; multi-surface capture) |
| structured output | never trusted as schema-enforced; content is claims | SPIKE-01 (no response-schema enforcement; malformed content with exit 0) |
| usage | native token/request/credit units from the result/shutdown surfaces, one authoritative surface chosen and named | SPIKE-04 (units not currency; surfaces disagree; termination skews totals) |
| terminal truth | process exit code and CLI-reported `exitCode` carried separately | SPIKE-03 / cross-cutting (exit 124 alongside `exitCode: 0`) |
| credentials | env-var names only (`COPILOT_GITHUB_TOKEN` precedence documented), never values; per-run `COPILOT_HOME` named as substrate obligation | SPIKE-05 (OS-store auth persists; a per-run design needs injected env + throwaway HOME) |

Tool-call correlation is by `toolCallId` across request/start/complete and
permission events (SPIKE-03); a denial is machine-readable and lands as
`AdapterCall{disposition:'denied'}` — the run's own exit stays independent
(cross-cutting: denial and success are independent).

### Defensive consumption (PROP-006 at L7)

`observe` is a total function over arbitrary bytes: line-by-line JSONL
parsing where a bad line becomes a normalized `transcript.malformed` event
(bounded detail, no raw hostile bytes replayed upward), truncation and
prose-prefix cases from SPIKE-01 handled the same way, an output budget from
`limits.output_bytes` applied to claims/events with the truncation itself
observable, and nothing the transcript says able to change what the adapter
*does* — content that mimics the wire report framing is data inside a claim,
never the adapter's stdout. The hostile corpus is a committed fixture set
exercised by both the package tests and the conformance suite.

## The conformance suite

Per its landed README: pytest, at `tests/framework-conformance/`, offline,
deterministic, stubs not providers, written once.

- **Stubs**: two small Node scripts (stdlib only, no install) placed on a
  temp `PATH` as `claude` / `copilot`. Each speaks its provider's pinned
  transcript dialect for a scripted scenario (env-selected from a closed
  set): normal run, denial, cancellation-hang, hostile output, terminal
  disagreement (Copilot's 124/0). Stubs are evidence-shaped: the Copilot
  stub's frames come from the L6 findings; the Claude stub's from the
  pinned CLI's documented stream-json framing.
- **Execution**: the suite runs each adapter's **built** entry
  (`dist/bin.js`) as a subprocess. It fails loudly with the build command
  when `dist/` is absent — the repository's stated philosophy (the
  classifier job comment: verifying a gate conditionally is not verifying
  it) rejects silent skips.
- **CI**: the `classifier` job in `checks.yml` already provisions Node,
  pnpm, and uv together and builds the knowledge toolchain before the
  governance pytest run; one added step builds the two adapters (their
  `deps` scripts build `contracts` first). `check.sh` already orders the
  TypeScript ladder before the Python ladder, so the local aggregate needs
  no change.
- **Assertions** (each written once, parameterized over both adapters):
  tether; identical contract for the golden logical run; effective
  cancellation; cannot-widen; failure-through-contract; unlaunchability
  (no reference to the adapter packages outside `agents/adapters/`; zero
  runtime deps; side-effect-free import); pinned-version agreement between
  adapter and image lock.
- **R0**: the deterministic no-model adapter is `runner-control`'s
  `DeterministicAdapterInvocation`, already proven against the frozen SPI
  by that service's own conformance tests, which this landing does not
  touch. The suite README records that mapping instead of duplicating the
  proof across the process boundary.

"Identical contract" is defined precisely: same wire report grammar, same
observation field inventory, same call dispositions for the same logical
events, same adapter-owned lifecycle event vocabulary. Provider-native
*data* (event payload values, usage unit names) differs by design —
ADR-0013 decision 6 keeps native units native — and so does the
observable FORM of an out-of-grant attempt: claude records a reactive
permission denial, copilot's availability narrowing prevents the call
entirely (L6 outside-tool case). The suite asserts the shared property
(never permitted) in each dialect faithfully rather than fabricating one
dialect into the other's shape.

## The Copilot image

`deploy/images/runner-copilot/Dockerfile` mirrors the Claude derived image
mechanically: `FROM secure-home-runner-base` as the logical name the
governed build pins by digest; `ARG RUNTIME_PACKAGE=@github/copilot` and
`ARG RUNTIME_VERSION=1.0.79` declared exactly and consumed by the install
RUN; tarballs fetched from the registry and verified against recorded
sha512 **before** `npm install -g --offline`; `copilot --version` as the
wiring assertion; curl purged after use; the runtime label set.

One real difference from the Claude image, and it is recorded rather than
smoothed over: `@github/copilot` has a runtime dependency
(`detect-libc@^2.1.2`) used to select its platform executable package, so
the offline install feeds **three** verified tarballs — the main package,
`@github/copilot-linux-{x64,arm64}@1.0.79`, and `detect-libc@2.1.2`
(exact-version pinned, zero dependencies of its own). Identities resolved
from registry.npmjs.org on 2026-08-23:

| Package | Integrity |
|---|---|
| `@github/copilot@1.0.79` | `sha512-uHBm2BYbKJgyfiKp1WokX7QUNHGvzEX0zaGeb3qM3CybP06rsJrX3JgQe95qwwma6vQz0ah9gV68ERW2JqaKRA==` |
| `@github/copilot-linux-x64@1.0.79` | `sha512-wzotZfvHkItutciLFMXZT2k9Qiii4Ta8tsVDCMQ7CP8hPxV91FyJ1yf3+FFSSfPvWrfYM6BOAiqIuX+LjgRuiw==` |
| `@github/copilot-linux-arm64@1.0.79` | `sha512-qqaNkvi92Wg+4OZk/kTWC2nUG72G0vV6eRAo5+PnKaPmjdX1GsI0a+lPxXPEbzX0zYLi/8yrUyANwyyNEsGgXA==` |
| `detect-libc@2.1.2` | `sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==` |

The lock entry registers runtime
`{name: copilot, package: "@github/copilot", version: 1.0.79}` with the
main-package integrity, exactly as the Claude entry registers its runtime.
`detect-libc` is an install input of the registered runtime, not a second
runtime: it carries no provider family token, and the lock still registers
exactly one runtime for the image. Version 1.0.79 is chosen over the
registry's newer 1.0.80 deliberately — it is the version the L6 evidence
was gathered against, and the adapter's normalization basis must match the
image's pinned binary.

Digest bootstrap follows the L5 protocol unchanged: sentinel in the lock →
the PR's `images.yml` run builds all four images and fails verification
loudly with RECORD THESE → the emitted identities are recorded → the next
run converges. The base and gates digests must not move; the expected diff
is exactly the new entry.

`scripts/check-images.mjs` is class-based and admits a fourth entry as
written; the only edits are where the closed inventory is asserted (the
registered-name set) — no rule is weakened, and the L5 adversarial corpus
must stay green.

## ADR-0013 trace

| Decision | Where it lands |
|---|---|
| 1 — translate/report, never decide/enforce | pure `plan`/`observe`; closed report vocabulary; no success field |
| 2 — capability control is cross-layer | grant → availability + explicit denials; substrate named as the boundary in both READMEs |
| 3 — terminal state observational | `TerminalObservations` carried unreconciled; 124/0 conformance case |
| 4 — model output untrusted | everything content-shaped is `UntrustedClaim` |
| 5 — events normalized at the boundary | provider-native frames never leave `observe`; normalized names + string data |
| 6 — usage native, no money | `UsageMeasure` units from provider surfaces; no currency anywhere |
| 7 — credential references | wire shape has no value slot; scan + conformance assertions |
| 8 — cancellation substrate-effected | SIGTERM wire rule; forwarding + reporting are adapter hygiene; the enforceable termination guarantee is the substrate's at L9 |
| 9 — structural neutrality | zero schema diff; corpus proofs re-run; adapters live outside the platform structure |
| 10 — expressible by CLI + deterministic loop | both CLIs mapped; R0 mapping recorded from runner-control's own proof |

## Inherited obligations — L7 interpretation

- **INV-002 / EX-002 / PROP-004**: the contract corpus is byte-untouched;
  the L2 conformance suite passes at the completion head; `schemas/` diff
  against base is empty. Two real adapters with zero contract change is the
  strongest form of the neutrality proof yet available.
- **INV-012**: nothing in the adapters names a container runtime; the
  images stay digest-primary inert (the L5 checker's scans now also cover
  the fourth image).
- **INV-015**: the Copilot digest chain extends the recorded base digest;
  trust flows from the lock through governed CI evidence, never from an
  agent's claim.
- **PROP-006**: re-proved at the new consumption surface — the transcript
  parser — by the hostile corpus (see Defensive consumption).

## Alternatives considered

- **Adapters as vitest-tested libraries only, no process entry** — rejected:
  ADR-0003 launches adapters as isolated processes; a contract without its
  process form would leave L9 to invent the wire, unproven.
- **A TypeScript conformance suite in a new package** — rejected: the landed
  README fixes pytest at `tests/framework-conformance/`, READMEs are
  authoritative for their directories, and the governance pytest job already
  has the exact toolchain needed.
- **Skip-when-unbuilt conformance tests** — rejected: the repository's own
  stated philosophy (classifier job comment) is that conditionally-verified
  gates are unverified; the suite fails with instructions instead.
- **zod-validating the wire in adapters** — rejected: it would make zod a
  real runtime dependency of the adapter artifact; hand-rolled closed
  validation keeps the compiled adapter dependency-free while `import type`
  keeps compile-time agreement with the contracts package.
- **Pinning Copilot 1.0.80 (latest)** — rejected: the L6 evidence and the
  ADR's citations are against 1.0.79; a version bump without re-run
  evidence would decouple the adapter's normalization basis from its image.

## Failure classification boundaries

- Adapter cannot act (bad invocation, missing CLI, spawn failure) →
  `environmental_fault` report, exit 0.
- Adapter itself crashes → nonzero exit, no report; the substrate (L9)
  classifies; the conformance suite proves the crash paths that exist in
  this landing still report instead.
- Provider misbehaves (hostile output, hang, weird exit) → `observed`
  report carrying exactly what was seen.
- Ownership lost mid-run → the wire carries the fence; `stale_fence` is
  reserved for the substrate-side port at L9 (an adapter process has no
  fence ledger); the wire keeps the field so the report grammar is the
  frozen one.

## Compatibility and migration

No contract, event, profile, or evidence shape changes. The workspace
gains two members and one glob; the lock gains one entry; CI gains one
build step. Nothing existing is renamed, moved, or re-versioned.

## Security implications

Covered in the proposal's Trust section; the design adds two specifics:
the adapters' zero-runtime-dependency rule means the supply-chain surface
of the adapter artifacts is the Node standard library alone, and the stub
CLIs ensure the conformance suite can never be induced to contact a real
provider (no network, no credentials, names resolved to committed stubs).

## Deferred behavior (named owners)

- Launching adapters, wiring `AdapterInvocationPort` to a process, fence
  semantics across the wire — L9 (#57), behind U4 (#9).
- Per-run `COPILOT_HOME`/cache custody and credential injection — L9,
  informed by SPIKE-05's UNDETERMINED verdicts.
- Consumption-side PROP-006 at profile activation and launch — L9.
- Container-content verification of one-runtime — L9.
- A Codex adapter and image — a future issue, not this one.
