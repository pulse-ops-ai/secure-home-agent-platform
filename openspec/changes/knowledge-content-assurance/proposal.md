# Change Proposal: knowledge-content-assurance

## Why

Implementing the [ADR-0015](../../../docs/decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
§12 obligation established that an accepted claim is false.

[ADR-0010](../../../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)
§5 says the prohibited-content list *"is machine-checked before a bundle is
publishable"*, and ADR-0015 §8 carries it forward. For four of the seven classes
that cannot be done over free-form OKF Markdown, and for two more it can be done
only as a bounded subset.

The contract's own teaching material demonstrates it.
[`knowledge/README.md`](../../../knowledge/README.md) contrasts *"the upstairs
zone is served by a 3-ton heat pump rated to 15 °F"* (permitted) with *"the
upstairs is currently 71 °F"* (prohibited). Both are prose with a number and a
unit; the difference is specification versus observation, which is meaning.
The obvious detector fails both ways — deleting "currently" evades it, and
*"peak pricing **currently** runs 16:00–21:00"*, the README's own **permitted**
example, trips it.

## Problem

Two remedies had to be rejected before proposing a third. An **LLM classifier in
admission** puts a model in the trust path of the mechanism that exists to keep
model-visible content safe, and makes admission non-deterministic. A **lexical
proxy presented as class coverage** reports success while proving a keyword —
the defect this repository has repeatedly refused.

Leaving the claim in place is the worst option: a control believed automatic and
absent is more dangerous than one known to be human and recorded.

## Proposed Capability

**Propose** hybrid admission assurance
([ADR-0016](../../../docs/decisions/ADR-0016-hybrid-admission-assurance-for-prohibited-content.md)):
the prohibited list unchanged; coverage stated honestly by class; deterministic
findings refusing admission; and the semantic remainder requiring a human
content-review attestation bound to exact bytes, which a deterministic finding
always overrides.

## Scope

**In scope.** ADR-0016 (`Proposed`); the decisions index; this change.

**Out of scope.** Production code. The toolchain. Any knowledge module. Any
change to `knowledge/`, `catalog.json`, or `check-knowledge.mjs`. Opening
authoring. Editing ADR-0010 or ADR-0015.

## Affected Areas

- `docs/decisions/` — one new ADR, `Proposed`, plus the index
- `openspec/changes/knowledge-content-assurance/` — this change

## Governance

**Governing ADRs.** ADR-0010 (the list and the claim being refined), ADR-0015
(§6 identity reused, §10 preserved, §8 and §12's prohibited clause refined),
ADR-0014 (knowledge as subordinate projection).

**Neither accepted ADR is edited.** Both are immutable; ADR-0016 refines them by
supersession in part, which is the mechanism the contract provides.

**Unresolved decisions.** None touched. U7 stays resolved; no item changes state.

**ADR status.** No existing ADR's status changes. ADR-0016 is authored
`Proposed`.

## Trust / Security / Data Considerations

The posture improves, because the claim becomes true.

Three properties carry it: **deterministic findings dominate** — no attestation
waives a detected secret; **binding to exact bytes** — a post-review edit
invalidates rather than inherits the attestation; **versioned policy** —
tightening criteria does not silently bless content reviewed under looser ones.

The attestation is **admission evidence, never authority**. ADR-0015 §10 applies
to it unchanged. It is deliberately **not** OKF's `verified: human-reviewed`,
which answers a different question, is producer-controlled, and would couple
admission to an upstream vocabulary.

**Named residual risk:** a reviewer may miss a prohibited fact in prose.
Mitigated by scope limitation, the recorded accountable actor, and the
deterministic detectors that still run beneath and cannot be signed past.

## Existing Evidence

- The 2B implementation attempt, which produced the per-class finding
- `knowledge/README.md`'s boundary table — the undecidability demonstrated by the
  contract's own examples
- ADR-0010 §5 and its Consequences; ADR-0015 §8 and §12

## Dependencies

None. No code, no dependency, no runtime path.

## Success

The assurance claim is true; coverage is stated by class with blind spots named;
the gate stays fail-closed by two mechanisms; and no prohibition is narrowed.

## Non-Goals

- Implementing the toolchain or any detector
- Authoring knowledge, or opening authoring
- Narrowing the prohibited list
- Designing household typed-fact schemas
- Editing any accepted ADR

## Open Questions

None blocking. Deferred by design: the typed, closed-vocabulary fact models that
would turn the household semantic classes from undecidable into structural. That
is named as direction and is explicitly not designed here.
