# Change Proposal: <change-name>

## Why

Describe the observed problem, opportunity, or requirement that motivates this
change.

State facts rather than implementation conclusions.

Include evidence where available:

- issue, incident, or customer report;
- existing code behavior;
- production or test evidence;
- prior decision;
- measured failure or cost.

Do not prescribe the detailed implementation here.

## Problem

Describe the current behavior and why it is insufficient.

Answer:

- What happens today?
- What should be possible instead?
- Who or what is affected?
- What is the consequence of leaving the current behavior unchanged?

## Proposed Capability

Describe the capability that will exist after this change.

Keep this implementation-neutral.

## Scope

### In scope

Describe the behavior or capability this change owns.

### Out of scope

Describe adjacent work that this change deliberately does not own.

Do not hide deferred requirements here. If something is required eventually but
belongs to another landing, identify it explicitly.

## Affected Areas

Identify the expected systems, packages, modules, contracts, schemas, or
operational surfaces affected by the change.

This is impact discovery, not an implementation file list.

## Trust / Security / Data Considerations

State whether the change affects any of the following:

- authentication or authorization;
- PII or encryption;
- persistence or migrations;
- transaction or concurrency behavior;
- public package or API contracts;
- runner, review, or materialization machinery;
- candidate binding or evidence;
- reconciliation or readiness authority;
- deployment or production isolation.

If none apply, state `Not applicable` and why.

## Existing Evidence

Record evidence supporting the proposal.

Use stable repository references where possible.

Examples:

- code paths;
- schemas;
- tests;
- existing OpenSpec capabilities;
- ADRs or decisions;
- merged PRs;
- incidents;
- GitHub issues or product decisions as provenance.

Do not treat an unverified issue or agent statement as implementation evidence.

## Dependencies

Describe capabilities or accepted changes this work depends on.

Distinguish:

- already implemented dependencies;
- accepted but not yet implemented dependencies;
- external dependencies.

## Success

State the observable outcome that would make this proposal successful.

Do not use "tests pass" as the product-level success definition.

## Non-Goals

Explicitly state what this change must not build or change.

## Open Questions

Record unresolved product or architectural questions.

Trust-critical unresolved questions must be closed before implementation begins.