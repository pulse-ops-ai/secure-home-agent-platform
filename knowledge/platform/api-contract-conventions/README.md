# knowledge/platform/api-contract-conventions/

**Module `platform/api-contract-conventions`** — how API surface is authored so
that one definition produces every downstream artifact.

| Field | Value |
|---|---|
| Status | `Planned` |
| Owner | human:mikegtech |

> Specification only. No module content is authored, and this directory is not
> runtime-authoritative. Registered in [`../../INDEX.md`](../../INDEX.md).
>
> This module is the one [`../README.md`](../README.md) anticipates under
> ADR-0012. It is registered here so its selection is governed like any other.

## Intended facts

- **One authored source per contract.** A second hand-maintained description of
  the same contract is a defect, not a convenience.
- Thin controllers; no duplicate hand-written transport DTO classes.
- The normalization pipeline that makes the generated API document deterministic,
  and that it is a CI gate rather than a build artifact anyone may regenerate.
- Response envelopes, cursor pagination, count modes, and problem-details
  conventions.
- That the operation catalog is an allowlist, and that exposure to an external
  tool surface is an explicit act.
- That generated reference material is never hand-maintained.

## Prohibited facts

- Actual endpoint paths, hostnames, or environment URLs.
- The generated API document itself — it is generated, and duplicating it here
  would create the second source this module exists to forbid.

## Intended consumers

Coding runners adding or changing API surface.

## Expected queries

- "Where do I author this shape so the transport layer and the tool surface both
  get it?"
- "May I hand-write a response type for this route?"
- "How does an operation become externally callable?"

## Governing sources

[ADR-0012](../../../docs/decisions/ADR-0012-adopt-typescript-nestjs-pnpm-implementation-stack.md) ·
[`api-contract-model.md`](../../../docs/architecture/api-contract-model.md)

## Freshness and update trigger

Update when the contract-authoring model, the normalization pipeline, or the
envelope and pagination conventions change.
