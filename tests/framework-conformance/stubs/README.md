# tests/framework-conformance/stubs/

The **stub provider CLIs** the conformance suite resolves instead of real
providers — the only "claude" and "copilot" any conformance test can reach
(the suite constructs a PATH on which a real CLI cannot appear).

| Stub | Dialect basis |
|---|---|
| [`claude.cjs`](claude.cjs) | the pinned `@anthropic-ai/claude-code@2.1.241` CLI's documented stream-json framing |
| [`copilot.cjs`](copilot.cjs) | the L6 spike evidence ([`docs/spikes/l6-copilot-cli/`](../../../docs/spikes/l6-copilot-cli/)): stdout JSONL frames, the persisted `events.jsonl` surface, and the exit-124-beside-`exitCode: 0` termination finding |

Deterministic, offline, Node-stdlib only (they run before any install).
Scenario selection via `STUB_SCENARIO` (`golden`, `hostile`, `forged`,
`oversize`, `hang`); each records its argv to `STUB_ARGV_FILE` so the suite
can assert what an adapter actually asked for.

## What does not belong here

- Anything that contacts a network or reads a credential.
- Per-adapter conformance assertions — the suite one level up owns those.

## Governed by

[`../README.md`](../README.md)
