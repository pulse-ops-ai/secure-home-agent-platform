# knowledge/platform/implementation-rules/

**Module `platform/implementation-rules`** — the rules an agent writing code here
must hold.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).

## Intended facts

- **Dependency direction points inward only**, and it is enforced in two separate
  places: what a manifest may declare, and what source may import. A
  `devDependency` does not license an outward import.
- TypeScript is the primary language, including under `services/`; Python is
  confined to isolated inference workers and may never own authorization,
  deterministic safety policy, Home Assistant credentials, device actuation,
  authoritative persistence, or envelope minting.
- Contract-shaped packages stay framework-neutral.
- No credential, `.env`, or realistic secret example belongs in the repository —
  including in test fixtures.
- A fix converts an assumption into a mechanism: when a defect is found, the
  class is swept and a negative test proves the fix.

## Prohibited facts

- The enforced rule definitions as machine-readable data. An agent that could
  read the layer map as configuration could reason about editing it.
- Secrets or credential-shaped example values of any kind.

## Intended consumers

Coding runners with write access to the repository.

## Expected queries

- "May `contracts` import `logging` if I add it as a devDependency?"
- "Where may Python be used?"
- "I found one instance of this bug. Is fixing that instance enough?"

## Governing sources

[ADR-0012 §15](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) ·
[`packages/README.md`](../../../packages/README.md) ·
[`services/AGENTS.md`](../../../services/AGENTS.md)

## Freshness and update trigger

Update when the dependency-direction model, the language boundary, or the
prohibited-content rules change.
