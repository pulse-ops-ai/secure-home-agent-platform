# agents/adapters/coding/copilot-cli

`@secure-home/adapter-copilot-cli` — adapter for the **GitHub Copilot CLI**,
in the **coding** runner class.

> **Status: implemented and unlaunchable** (L7, #55). The package conforms
> to the frozen adapter SPI and is proven by the shared
> [`tests/framework-conformance/`](../../../../tests/framework-conformance/)
> suite against a stub CLI. No platform code path invokes it — the launcher
> is L9 (#57). No credential exists here, and no real provider is ever
> contacted by any test.

## Shape

Identical architecture to the reference adapter
([`../claude-code/`](../claude-code/README.md)): `src/spi.ts` (frozen-SPI
mirror + closed wire validator), `src/plan.ts` (pure translation),
`src/observe.ts` (total, defensive, multi-surface observation), `src/bin.ts`
(the wire entry). Same wire contract, byte-format identical — that identity
is what the conformance suite proves.

## Normalization basis — every row traced to L6

Pinned provider: `@github/copilot@1.0.79` — deliberately not the registry's
latest: it is the exact version the
[L6 spike](../../../../docs/spikes/l6-copilot-cli/L6-Copilot-CLI-Spike-Findings.md)
evidenced and the paired image pins. Each mapping rests on a named finding:

| Mapping | L6 basis |
|---|---|
| Grant → `--available-tools=<tool>` per granted tool (availability grammar, fail-closed) | SPIKE-02: availability and permission are SEPARATE controls with SEPARATE identity grammars |
| EMPTY grant → the bare `--available-tools` / `--allow-tool` flags, stating the closed empty set rather than omitting the control (omission would leave default tool visibility in place) | COMMAND-RESULTS.txt `no-tool` case ran exactly `--available-tools --allow-tool`; the pinned CLI's help declares the value optional (`--available-tools[=tools...]`), so a bare flag cannot swallow the next argument |
| Granted `bash` → `--allow-tool=shell` — the evidenced namespace mapping (availability `bash` ↔ the `shell` permission-rule family); an availability identity is never copied into the permission grammar, and a granted tool with no evidenced mapping gets no invented rule | SPIKE-02: the proven positive case is `available=bash / allow=shell(printf)`; `--allow-tool` alone is not deny-by-default |
| `--deny-tool=shell` exactly when `bash` is ungranted — never against a granted tool's own family | SPIKE-02 boundary finding: read-only shell commands auto-approve even unlisted; deny always wins, including under prompt injection |
| Credential refs → `--secret-env-vars=<NAME>` per declared reference | SPIKE-05: the one evidenced control stripping named variables from shell/MCP subprocess environments and redacting output (marker confirmed absent from the shell tool); custody itself stays with L9 |
| `--no-ask-user`, `--no-custom-instructions`, `--no-auto-update`, `--disable-builtin-mcps`, `--no-remote`, `--no-remote-export`, `--no-color`, `--stream off` | COMMAND-RESULTS.txt: the spike harness's own hermetic surface; unapproved writes fail closed noninteractively |
| `--model <route>` explicit, never Auto; route is pass-through data | spike environment: the model was explicitly pinned for every evidence run |
| Transcript = stdout `--output-format json` frames PLUS persisted `$COPILOT_HOME/session-state/*/events.jsonl` | SPIKE-03: permission events exist only in the persisted surface; multi-surface capture is mandatory |
| Calls correlated by `toolCallId`; disposition read from `tool.execution_complete` `error.code="denied"` and `permission.completed` `result.kind` | SPIKE-03: denial is machine-readable; denial and process exit are independent |
| Structured output treated as untrusted claims, never schema-enforced | SPIKE-01: `--output-format json` frames the transcript only; no response-schema enforcement exists |
| Usage from ONE authoritative surface (the stdout terminal frame), native units, `cost`-spelled keys excluded | SPIKE-04: units are tokens/credits, not currency; cost fields disagree across surfaces |
| Process exit and CLI-reported `exitCode` carried separately, unreconciled | SPIKE-03 termination finding: external SIGTERM gave exit 124 beside `exitCode: 0` — CLI terminal fields are not authoritative |
| `COPILOT_HOME` surfaced in `required_env` as a substrate provisioning obligation | SPIKE-05: transcript, usage, and credential state persist under `COPILOT_HOME`; per-run isolation needs a throwaway home |

Substrate caveat carried from SPIKE-05, for L9: `~/.cache/copilot` is
written OUTSIDE `COPILOT_HOME`, and OS-store auth is not per-run ephemeral —
per-run credential custody and cache teardown are launcher obligations this
adapter cannot own.

`input.parameters` is not expressible by this CLI; a non-empty value is
refused rather than reshaped into the prompt, as is any grant entry that
is not expressible as ONE provider tool identity (commas and whitespace
alike — the provider's value parsing is not proven single-valued for
either, so it fails closed). `routing.fallback` is
platform routing policy (ADR-0007), enforced by the substrate — never
translated to any provider surface. Workspace references stay opaque
platform data: the L9 session substrate establishes the sandbox cwd and
the adapter and provider inherit it. The provider environment is
allowlisted, never inherited: baseline plus the declared credential names
and the isolation home only.

Paired derived image: `secure-home-runner-copilot` — the base runner plus
this one CLI, pinned
([ADR-0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md));
the conformance suite asserts the adapter's pinned version equals the image
lock's.

## What does not belong here

- **Credentials or tokens.** The wire carries env-var NAMES only
  (`COPILOT_GITHUB_TOKEN` precedence is the provider's documented lookup);
  the substrate provisions values. No slot for a value exists in any shape.
- **Model identifiers** — `routing.model_route` is data; production source
  is conformance-scanned for constants.
- **Sandbox construction, mounts, network policy, limits.**
- **The image definition** — [`../../../../deploy/images/`](../../../../deploy/images/).
- **Household device access.** A coding runner has none, ever.

## Boundary rules

- Cannot widen its sandbox; cannot reach around the substrate.
- Emits exactly the same contract as every other adapter — proven by the
  shared conformance suite.
- Is an **adapter, not a platform identity**.
- Coding runs are not on the household control path.

## Governed by

[`../../README.md`](../../README.md) → [`../../../AGENTS.md`](../../../AGENTS.md) ·
ADRs
[0003](../../../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0011](../../../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md),
[0013](../../../../docs/decisions/ADR-0013-adopt-the-runner-adapter-spi.md)
· the L6 spike evidence
([`docs/spikes/l6-copilot-cli/`](../../../../docs/spikes/l6-copilot-cli/))

## Validation

```sh
corepack pnpm --filter @secure-home/adapter-copilot-cli run lint
corepack pnpm --filter @secure-home/adapter-copilot-cli run typecheck
corepack pnpm --filter @secure-home/adapter-copilot-cli run test
corepack pnpm --filter @secure-home/adapter-copilot-cli run build
uv run pytest tests/framework-conformance   # requires the build above
```

Still future: a check that a run using this image cannot reach another
provider's credential (L9 — physical enforcement).
