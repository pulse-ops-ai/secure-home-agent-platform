# Change Proposal: okf-format-decision

## Why

[U7](../../../docs/architecture/unresolved-decisions.md#u7) gates the first real
knowledge bundle on a validator existing, because authoring first would make an
unvalidated format load-bearing by accident.
[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
named OKF a **candidate** and explicitly did not choose it. Nothing has decided
whether OKF is the format, and no toolchain exists.

This change is the **decision and evidence phase**. It answers *which format*
and records why, from the current upstream specification read directly rather
than from recollection. It builds nothing.

## Problem

Two questions have to be answered before any implementation is worth starting,
and neither can be answered by writing code:

1. Does current OKF actually satisfy the requirements ADR-0010 already fixed —
   the four interfaces, immutability, provenance, freshness, prohibited content,
   deterministic resolution, provider neutrality, no direct reads?
2. Do OKF's newer trust and provenance facilities create a path by which a
   knowledge signal could be mistaken for permission?

The second matters more. `verified` derives a tier ending in `human-reviewed`,
which reads like an authorization concept and is not one.

## Proposed Capability

**Propose** OKF v0.2 as the source representation only — pinned, not floating —
with packaging, digest identity, query, and admission remaining this
repository's, and with OKF trust signals prohibited from reaching the authority
plane.

## Scope

**In scope.** [ADR-0015](../../../docs/decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
(`Proposed`); a non-resolving pointer on U7; the decisions index; this change and
its evidence record.

**Out of scope.** Every part of the toolchain. Any knowledge module. Any change
to `knowledge/INDEX.md`, `catalog.json`, or `check-knowledge.mjs`. Closing U7.

## Affected Areas

- `docs/decisions/` — one new ADR, `Proposed`, plus the index
- `docs/architecture/unresolved-decisions.md` — a pointer that **does not**
  resolve U7
- `openspec/changes/okf-format-decision/` — this change

## Governance

**Governing ADRs.** ADR-0010 (the requirements this evaluates against and the
authority-separation rule), ADR-0003 and ADR-0006 (a profile selects a named
set), ADR-0014 (`Proposed` — a module names the canonical source it projects;
ADR-0015 §5 provides the field, and depends on nothing that is not already true
independently).

**Unresolved decisions.** This change **answers U7 in a `Proposed` ADR and does
not close it.** Repository governance is explicit that an item leaves
`unresolved-decisions.md` only via an accepted ADR — ADR-0013 closed U6 *on
acceptance*. U7 therefore stays open, and the pointer added to it says so. No
other item is touched.

**ADR status.** No existing ADR's status changes. ADR-0015 is authored
`Proposed`.

## Trust / Security / Data Considerations

The finding that drove the shape of the ADR: OKF's `verified` family derives a
tier **unverified → machine-confirmed → human-reviewed**. A future component
could read `human-reviewed` as permission, which would make knowledge a shadow
authorization source — the failure ADR-0010 was written to prevent, arriving by
a route ADR-0010 did not anticipate.

ADR-0015 §10 states this as a **prohibition** rather than a mapping: no OKF trust
state is an input to execution authority, capability, authorization, safety
policy, or the interpretation of live state, and a `human-reviewed` module
confers exactly what an `unverified` one does — nothing.

## Existing Evidence

Upstream `GoogleCloudPlatform/knowledge-catalog`, retrieved 2026-08-15:

- `okf/SPEC.md` — OKF **v0.2**; `type` the only required field; `sources`,
  `generated`, `verified`, `status`, `stale_after`; consumers **MUST NOT reject**
  for missing optional fields, unknown keys, or broken links; consumption is the
  direct file read
- `okf/src/` — contains only `reference_agent`
- `okf/tests/` — tests of that agent, **not** a format conformance suite
- `okf/samples/crypto_bitcoin` — `README.md` and `seeds.txt`; generator seeds,
  not an authored bundle
- no JSON Schema, no formal grammar, no validator published

Disposable spike, outside the repository and not committed: one frontmatter
block parsed and re-serialized three defensible ways produced **three different
digests, none matching the original bytes**. That is the evidence for §6's
raw-byte digest identity.

## Dependencies

None. Nothing is built here. The toolchain ADR-0015 §12 requires is a separate,
later landing.

## Success

The format question is answered with cited evidence; the trust/authority
boundary is stated as a prohibition; U7 remains open with an honest pointer; and
a reader can tell what still blocks authoring.

## Non-Goals

- Implementing compile / validate / package / query
- Authoring any knowledge module
- Closing U7, or reading acceptance as permission to author
- Making `knowledge/` runtime-authoritative
- Changing any accepted ADR

## Open Questions

None blocking. One is deferred by design: whether OKF matures enough to relax
the `0.2` pin. ADR-0015 §11 makes that a governed act requiring a superseding
ADR, so it cannot happen by drift.
