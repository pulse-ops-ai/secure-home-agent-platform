---
type: model
owner: human:mikegtech
as_of: 2026-08-19
limitations: Portable projection only. Names no broker address, queue endpoint, or connection detail, and carries no live worker state. Grants nothing.
status: draft
stale_after: 2027-08-19
governs:
  - docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md
  - services/README.md
  - services/AGENTS.md
generated:
  by: claude-code/2.1.235
  at: 2026-08-19T00:05:05Z
---

# The standard runtime contract

A worker should be **nearly declarative**. Its own code is a handler and a
configuration schema; everything cross-cutting arrives from one shared runtime
package rather than being written again.

That shared runtime owns:

| Concern | What it provides |
|---|---|
| lifecycle | start, drain, graceful shutdown on signal, in-flight completion |
| configuration | schema parsing and validation at boot, never at first message |
| logging | structured logging with correlation context already bound |
| health | liveness and readiness, including dependency health |
| cancellation | cooperative cancellation and wall-clock timeout, effective rather than advisory |
| resilience | retry with backoff, and dead-letter handling for exhausted work |
| throughput | concurrency limits, so one worker cannot starve its host |
| observability | metrics and tracing hooks |
| correctness | idempotency hooks |
| outcomes | structured results and a shared error taxonomy |

Read that list as the completion criterion. A worker is not finished when its
handler returns the right answer; it is finished when it also shuts down without
losing in-flight work, fails at boot on bad configuration, reports its health
honestly, and gives exhausted work somewhere to go.

## Composition, not inheritance

There is **no base class to extend.** The worker is assembled by passing a
handler and its configuration to a factory.

This is a deliberate constraint rather than a style preference. Inheritance would
let a worker override lifecycle, shutdown, or timeout behaviour — precisely the
properties that must be uniform for the host to stay predictable. Composition
makes them non-overridable, so a worker cannot quietly opt out of the guarantee
its host depends on.

## Configuration fails early

Configuration is parsed and validated at boot. A worker that starts with invalid
configuration and discovers it on the first message has converted a startup
failure into a runtime one, at the point where work is already in flight and the
failure is least legible.

## The contract is transport-shaped, not language-shaped

It applies to every worker. A specialist worker written in another language is
either invoked through one built on the shared runtime, or it implements the same
outcome and error contract over its transport. Being written elsewhere does not
create an exemption.
