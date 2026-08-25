# agents/adapters/coding/claude-code

`@secure-home/adapter-claude-code` — the **reference adapter**, wrapping the
**Claude Code** CLI in the **coding** runner class.

> **Status: implemented and unlaunchable** (L7, #55). The package conforms
> to the frozen adapter SPI and is proven by the shared
> [`tests/framework-conformance/`](../../../../tests/framework-conformance/)
> suite against a stub CLI. No platform code path invokes it — the launcher
> is L9 (#57). No credential exists here, and no real provider is ever
> contacted by any test.

## Shape

Pure translation core plus one process boundary
([ADR-0013](../../../../docs/decisions/ADR-0013-adopt-the-runner-adapter-spi.md):
the adapter translates and reports; it never decides or enforces):

| File | Role |
|---|---|
| `src/spi.ts` | structural mirror of the frozen SPI (`services/runner-control/src/ports/values.ts`) + the closed wire validator — unknown keys refused |
| `src/plan.ts` | invocation → launch plan, pure: grant → tool narrowing, routing passed through as data, credential NAMES surfaced for substrate provisioning |
| `src/observe.ts` | captured transcript → observation, TOTAL over hostile bytes (the PROP-006 re-proof surface) |
| `src/bin.ts` | the wire entry: one JSON invocation on stdin, one JSON report on stdout, SIGTERM = cancellation, exit 0 whenever a report was emitted |

The SPI lives in a deployable nothing may import (enforced in every zone by
`check-source-imports.mjs`), so the mirror is tethered mechanically: the
conformance suite derives both field inventories from source and refuses on
any difference.

## Normalization basis

Pinned provider: `@anthropic-ai/claude-code@2.1.241` — exactly the version
the paired image locks. The flag surface (`--print`,
`--output-format stream-json`, `--verbose`, `--tools`, `--allowedTools`,
`--model`, `--setting-sources`) was verified against
the pinned binary's own `--help`; transcript frame shapes follow the CLI's
documented stream-json framing, and `observe` treats every frame
defensively — unrecognized or malformed input degrades to recorded
observations, never to a crash or changed behavior.

Translation decisions worth knowing:

- **Availability closes the grant.** `--tools <granted>` narrows what the
  model can even see, and an EMPTY grant STATES the empty set rather than
  omitting the control (`--tools ""` is the CLI's documented "disable all
  tools" — omitting it would leave default visibility in place);
  `--allowedTools <granted>` pre-approves exactly that set so a
  non-interactive run cannot stall. No tool universe is hardcoded here —
  denial-by-absence is structural. The substrate remains the security
  boundary (ADR-0013 decision 2).
- **Hermetic by construction.** `--setting-sources ""` loads no
  user/project/local settings: the platform-built invocation is the only
  authority.
- **`input.parameters` is not expressible** by this CLI; a non-empty value
  is refused (`environmental_fault`) rather than folded into the prompt —
  reshaping the workload would be deciding. A granted tool identity that
  is not expressible as ONE provider tool identity is refused the same
  way — the CLI splits tool lists on commas AND whitespace ("Comma or
  space-separated", per its own help), so `"Read,Bash"` and `"Read Bash"`
  are both refused: one grant entry must never widen into multiple
  provider tools.
- **Platform routing policy stays platform-owned.** `routing.fallback`
  (ADR-0007: "refuse", degrade between classes) is enforced by the
  substrate before an invocation exists and reaches no provider flag —
  mapping it to `--fallback-model` would turn a policy word into a model
  identifier. Only `routing.model_route` is expressed.
- **Workspace references stay opaque.** `workspace.session_ref`/`root_ref`
  are platform identities (`workspace:<run>`), not paths: the L9 session
  substrate establishes the sandbox working directory, the adapter and
  provider inherit it, and no reference reaches argv or a spawn option.
- **The provider environment is allowlisted**, never inherited: baseline
  (`PATH`, `HOME`, `TMPDIR`) plus the declared credential names only.
- **Money is never mapped.** The CLI reports `total_cost_usd`; usage is
  recorded in native units only (tokens, turns — decision 6).
- **Terminal facts may disagree** (exit code, provider-reported outcome,
  transcript terminal, signal) and are carried unreconciled (decision 3).

Paired derived image: `secure-home-runner-claude` — the base runner plus
this one CLI, pinned
([ADR-0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md));
the conformance suite asserts the adapter's pinned version equals the image
lock's.

## What does not belong here

- **Credentials or API keys.** The wire carries env-var NAMES only; the
  substrate provisions values. No slot for a value exists in any shape.
- **Model identifiers.** `routing.model_route` passes through as data; no
  model name exists in production source (conformance-scanned).
- **Sandbox construction, mounts, network policy, limits.** Substrate-owned;
  the entry enforces nothing.
- **The image definition** — [`../../../../deploy/images/`](../../../../deploy/images/).
- **Household device access.** A coding runner has none, ever.

## Boundary rules

- Cannot widen its sandbox; cannot reach around the substrate. Unknown
  invocation keys are refused; the provider binary resolves by name on
  PATH with no override surface.
- Emits exactly the same contract as every other adapter — proven, not
  asserted, by the shared conformance suite.
- Is an **adapter, not a platform identity**. "Claude" appears here and as
  an opaque profile value — never in a schema's structure.
- Coding runs are not on the household control path; their unavailability
  must never affect the house.

## Governed by

[`../../README.md`](../../README.md) → [`../../../AGENTS.md`](../../../AGENTS.md) ·
ADRs
[0003](../../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md),
[0013](../../../../docs/decisions/ADR-0013-adopt-the-runner-adapter-spi.md)

## Validation

```sh
corepack pnpm --filter @secure-home/adapter-claude-code run lint
corepack pnpm --filter @secure-home/adapter-claude-code run typecheck
corepack pnpm --filter @secure-home/adapter-claude-code run test
corepack pnpm --filter @secure-home/adapter-claude-code run build
uv run pytest tests/framework-conformance   # requires the build above
```

Still future: a check that a run using this image cannot reach another
provider's credential (L9 — physical enforcement).
