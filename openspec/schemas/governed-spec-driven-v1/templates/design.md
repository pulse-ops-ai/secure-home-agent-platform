# Design: <change-name>

## Context

Summarize the architectural problem being solved.

Reference the proposal and normative specifications rather than restating them.

## Goals

Describe the technical properties this design must achieve.

## Non-Goals

Describe technical work deliberately excluded from this design.

## Current Architecture

Describe the relevant architecture before this change.

Include:

- component ownership;
- data flow;
- control flow;
- trust boundaries;
- authoritative contracts;
- relevant existing behavior.

Use diagrams where they improve understanding.

## Proposed Architecture

Describe the target structure and interaction between components.

```text
<architecture diagram>
```

Explain:

- component responsibilities and ownership;
- trust and authority boundaries, and where they change;
- data flow and control flow;
- state transitions for stateful behavior.

## Decisions

Record the key technical choices with stable identifiers so tasks.md and
assurance.md can reference them.

### D1: <decision title>

- **Decision:** <what was chosen>
- **Rationale:** <why this over the alternatives>
- **Alternatives considered:** <rejected options, and why each was rejected>

### D2: <decision title>

- **Decision:** ...
- **Rationale:** ...
- **Alternatives considered:** ...

## Decision Tables

For trust-critical or stateful behavior with interacting conditions, define
explicit state × condition × outcome tables where prose alone would leave
combinations ambiguous.

| State | Condition | Outcome | Classification |
|---|---|---|---|
| <observable state> | <condition> | <required outcome> | change-attributable / operational |

## Interfaces and Contracts

Define the interfaces this change introduces or modifies:

- public package or API contracts;
- schemas and validation;
- events;
- persistence shapes, only where authorized.

State which contracts are frozen by this change and which remain internal and
free to move.

## Failure Classification Boundaries

Define where failure is classified and by what rule.

Distinguish change-attributable failure from environmental or operational
failure. An undecidable state must not be silently mapped to success.

## Shared vs Independent Logic

Explicitly identify:

- logic that may be shared;
- logic that must remain independently implemented, and why.

## Compatibility and Migration

State the backward-compatibility obligations and the migration strategy.

If existing behavior must remain unchanged, state that explicitly and identify
the proof that demonstrates it.

## Security Implications

State the security consequences of this design:

- authority added, moved, or removed;
- new or changed attack surface;
- secrets or credentials involved — must be none without explicit
  authorization;
- effect on fail-closed behavior.

## Landing Seams

Identify:

- atomic landing seams or serial PR boundaries;
- behavior that remains inert until activation;
- behavior intentionally deferred to later landings, each with its named due
  landing.

## Open Questions

Record unresolved technical questions that can safely be answered later
without changing the accepted specs.

Do not mark implementation tasks complete in this document.