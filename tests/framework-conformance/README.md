# tests/framework-conformance/

Tests that **every adapter emits an identical event and evidence contract**
for the same logical run.

> **Status: active** (L7, #55). The suite covers both implemented coding
> adapters — `@secure-home/adapter-claude-code` and
> `@secure-home/adapter-copilot-cli` — driving each package's **built**
> process entry against the committed stub CLIs in [`stubs/`](stubs/).
> Offline, deterministic, credential-free: the stubs are the only
> "providers" any test can resolve (the suite constructs a PATH on which a
> real CLI cannot appear, and refuses to run if one could).

## Why this exists

[ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md)'s
central claim is that the platform's properties belong to the substrate, not
to the runtime. That claim is only true if it is tested. Without these tests,
"framework-neutral" is an aspiration and each adapter quietly emits its own
shape.

## What is asserted

| Assertion | Where |
|---|---|
| The same logical run through **any** adapter produces the identical contract — grammar, observation field inventory, call dispositions, adapter-owned event vocabulary, claim kinds | `test_identical_contract.py` |
| One wire contract: one stdin invocation, one stdout report and nothing else, exit 0 whenever a report was emitted, refusals THROUGH the contract | `test_wire_contract.py` |
| Each adapter's SPI mirror field-agrees with the frozen SPI, derived from source at run time; an underivable frozen source REFUSES | `test_spi_tether.py` |
| An adapter **cannot widen** its invocation: unknown keys refused, argv narrowed to the grant through evidenced namespace mappings, an out-of-grant attempt never permitted (each provider dialect asserted faithfully), platform fallback never a provider surface, credentials into the evidenced secrecy control, no credential value anywhere, the provider env allowlisted, workspace refs opaque and never a cwd | `test_cannot_widen.py` |
| Cancellation is **forwarded and observed**: SIGTERM reaches the provider and the report still lands, recording the signal; the L6 exit-124/`exitCode: 0` disagreement survives unreconciled. (Forwarding is adapter hygiene — the enforceable termination guarantee is the substrate's, L9) | `test_cancellation.py` |
| Failure is reported through the contract, not by crashing: missing CLI, hostile transcripts, forged report content, oversized output | `test_failure_paths.py` |
| Adapters are **unlaunchable and inert**: nothing outside `agents/adapters/` references them, zero runtime dependencies, side-effect-free import, pinned versions agree with the image lock, and the suite itself is ONE suite | `test_unlaunchability.py` |

**The deterministic (no-model) adapter (R0)** is
`DeterministicAdapterInvocation` inside `services/runner-control` — an
in-process port implementation, proven against the frozen SPI by that
service's own conformance tests (`src/conformance/adapter-spi.test.ts`).
This suite exercises the *process-boundary* form of the contract; the R0
proof deliberately stays with the service that owns the port, and this
suite's tether pins that both sides read the same frozen shapes.

## What belongs here

- The shared conformance suite every adapter must pass — written once,
  parameterized over the adapter registry in [`fc_support.py`](fc_support.py).
- The stub provider CLIs, evidence-shaped: the copilot stub's frames come
  from the L6 spike findings; the claude stub's from the pinned CLI's
  documented stream-json framing.
- A reference logical run, expressed neutrally (`golden_invocation`).

## What does not belong here

- **Profile grant tests** — [`../profile-conformance/`](../profile-conformance/).
- **Adapter-internal unit tests** — those live with the adapter.
- **Anything requiring a real provider credential or network call.** Adapters
  are exercised against stubs, always.

## Boundary rules

- **The suite is written once and applied to every adapter.** A per-adapter
  variant defeats the purpose (`test_the_suite_is_one_suite` enforces it).
- If an adapter cannot pass, the resolution is either the adapter or the SPI —
  never a relaxed test.
- Offline and deterministic. The suite FAILS (never skips) when an adapter
  is unbuilt — a gate verified conditionally is not verified. CI builds the
  adapters in the same job that runs this suite.

## Governed by

[`../README.md`](../README.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0006](../../docs/decisions/ADR-0006-separate-agent-implementation-profile-run-and-automation.md),
[0013](../../docs/decisions/ADR-0013-adopt-the-runner-adapter-spi.md)

## Validation

```sh
corepack pnpm --filter @secure-home/adapter-claude-code --filter @secure-home/adapter-copilot-cli run build
uv run pytest tests/framework-conformance
```
