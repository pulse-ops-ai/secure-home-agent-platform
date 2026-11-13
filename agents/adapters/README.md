# agents/adapters/

Current governance state is not authored here. Use [the canonical registry](../../governance/state.json),
[its generated projection](../../governance/STATE.md), or
`node scripts/query-governance-state.mjs --json` from the repository root.
Registry data grants no implementation or runtime authority.

**Runtime adapters** — thin, replaceable shims between the neutral runner
substrate and a concrete runtime.

Current runner landing status and sequencing are not authored here; use the canonical governance query for current governance state.

The coding adapters translate to the SPI; the shared
[conformance suite](../../tests/framework-conformance/) exercises translation
against stub CLIs, not physical sandbox enforcement.

## What an adapter is

Per [ADR-0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md):

- **in:** a run request, plus exactly the capabilities the execution profile
  granted;
- **out:** the platform's event and evidence contract — **identical across every
  adapter**.

An adapter exists so the substrate never has to know what a runtime is. The
substrate's security properties are its own, not the runtime's.

## Layout

| Path | Wraps |
|---|---|
| [`coding/claude-code/`](coding/claude-code/) | Claude Code CLI |
| [`coding/copilot-cli/`](coding/copilot-cli/) | GitHub Copilot CLI |
| [`coding/codex/`](coding/codex/) | Codex |
| [`frameworks/custom-loop/`](frameworks/custom-loop/) | a plain deterministic loop — **no model required** |
| [`frameworks/pydantic-ai/`](frameworks/pydantic-ai/) | PydanticAI |
| [`frameworks/langgraph/`](frameworks/langgraph/) | LangGraph |

## What belongs here

- The translation between the run request and a runtime's invocation.
- The translation from that runtime's output back into the shared event and
  evidence contract.
- Adapter-specific failure and cancellation handling.

## What does not belong here

- **Sandbox construction, mounts, network policy, or limits** — the substrate
  owns those
  ([`../../services/runner-control/`](../../services/runner-control/)).
- **Credentials.** Provisioned by the substrate from the profile.
- **Capability grants** — [`../../profiles/`](../../profiles/).
- **Agent implementations** — [`../implementations/`](../implementations/).
- **Image definitions** — [`../../deploy/images/`](../../deploy/images/).
- **Provider names in shared contracts.** A provider name lives in its own
  adapter directory and as an opaque `adapter` value in a profile. Nowhere else.

## Boundary rules

1. **An adapter cannot widen its own sandbox.** It receives what the profile
   granted, and nothing more.
2. **It must not reach around the substrate** for network, filesystem, or
   secrets. A runtime that insists is a profile-change conversation, not a
   workaround.
3. **Identical contract out.** If a field only makes sense for one runtime, it
   does not belong in the shared contract.
4. **One runtime per derived image**
   ([ADR-0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).
5. **Coding and household runner classes are separate.** A coding adapter has no
   path to household devices.

## The SPI is decided

The adapter SPI — substrate inputs, adapter outputs, failure and cancellation —
is described in
[ADR-0013](../../docs/decisions/ADR-0013-define-the-runner-adapter-spi.md).
For unresolved-question answers about U6, use canonical governance. The semantic
design compares dissimilar adapters (a coding CLI and a deterministic loop),
using the empirical [spike evidence](../../docs/spikes/l6-copilot-cli/).

The load-bearing parts for anyone writing an adapter here: an adapter
**translates and reports** — it never decides a terminal state, never enforces a
capability, and never holds a credential value. It narrows the provider-visible
tool surface from the profile (defense in depth), while the substrate enforces
the real boundary. Provider event shapes are normalized at this boundary against
a **pinned provider version** and never leak upward.

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)

## Validation

[`../../tests/framework-conformance/`](../../tests/framework-conformance/)
asserts every adapter emits an identical contract for the same logical run —
active since L7 (#55):

```sh
corepack pnpm --filter @secure-home/adapter-claude-code... --filter @secure-home/adapter-copilot-cli... run build
uv run pytest tests/framework-conformance
```
