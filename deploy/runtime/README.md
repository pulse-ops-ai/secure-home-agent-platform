# deploy/runtime/

The repository boundary for **future** host/container/VM execution-runtime
integration — **taxonomy only**. Established by L5 (issue #53); populated
only by a later governed landing.

> **Status: no runtime is selected, configured, or installed.** This
> README is this directory's entire permitted content, and
> `scripts/check-images.mjs` refuses anything else appearing here until a
> governed landing (L9 / #57) authorizes it. Its GATE-U4 is satisfied —
> [ADR-0020](../../docs/decisions/ADR-0020-place-runner-control-by-workload-class.md)
> resolved [U4](../../docs/architecture/unresolved-decisions.md#u4) on
> 2026-08-26 — and that was one of two prerequisites: `L9 ← L8 + GATE-U4`.
> L8 (#56) has not landed, and L9 has no authorizing task contract.

## The taxonomy this directory exists to keep straight

```text
WHAT executes        → OCI workload image        → deploy/images/
HOW it is isolated   → execution/runtime layer   → deploy/runtime/   (this)
WHAT it may do       → execution profile         → profiles/
WHAT it may know     → knowledge release         → knowledge/
WHAT happened        → run evidence              → runner contracts
```

An image identifies a workload; a runtime isolates one. Conflating them —
an image named after an isolation runtime, or runtime host configuration
baked into an image — is refused mechanically. The runner contracts are
container-runtime neutral (constitution INV-012): replacing the runtime
must change no profile, run, event, or evidence contract, and the runtime
identity appears in run evidence as **data**.

## What belongs here — later

Concrete runtime integration authored by its own governed landing:
runtime configuration, hardening posture, and the documentation of how the
chosen runtime satisfies the launch contract. That landing is L9 (or an
explicitly authorized prerequisite). Its placement prerequisite is met — the
placement ADR is accepted — and that is one of two: L9 is also sequenced after
L8 (#56), which has not landed, and it has no authorizing task contract. Note
that placement and runtime are *different* decisions — ADR-0020 chose neither a
runtime nor an isolation mechanism, and explicitly implements none.

## What does not belong here

- **Anything today.** No Kata, runc, containerd, gVisor, or QEMU
  configuration; no daemon config; no `--runtime` flags; no benchmarks.
- Runtime *selection* — that is a decision, made by L9 and not by this
  directory. ADR-0020 did not make it.
- Image definitions — [`../images/`](../images/).

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) ·
`openspec/specs/runner-adoption/spec.md` (runtime neutrality) ·
issue #53 (L5) · #9 (U4) — closed by ADR-0020, 2026-08-26 · #57 (L9), open
