# Design: runner-contract-corrections

## Context

Two review-directed amendments to landed L2 contracts, sequenced before L3
implementation. Both are shape corrections: no behavior is added anywhere.
The interesting design content is (1) the typed rule shape, (2) the identity
shape shared by both amendments, and (3) what a **second version** of a
published contract means under the append-only identity ledger — the
question L2's design explicitly deferred "to the change that introduces a
second version," which is this change.

Governing material: the canonical `runner-verification` and
`runner-evidence` specs, the ratified `runner-adoption` contract (identity
requirements INV-016 lineage: "one schema identity means one schema"),
ADR-0003, ADR-0012, and the archived `runner-domain-contracts` design (D5:
identity ledger; D2: shared primitives authored once).

## Goals

- Prohibited rules whose meaning is fixed by the contract, structurally.
- Evidence identities complete over all four governing authority inputs.
- New contract versions introduced **without** weakening any existing
  identity, drift, corpus, or neutrality guard.

## Non-Goals

- No matching/decision behavior (L3), no enforcement (L9).
- No change to any other contract's shape or version.
- No retirement policy for superseded versions (D3 defers it, named).

## Decisions

### D1: `ProhibitedPathRule` is a closed discriminated shape with a structurally normalized prefix

```ts
export const ProhibitedPathRule = z.strictObject({
  kind: z.literal('path_prefix'),
  prefix: RelativePathPrefix,
})
```

`kind` is a closed vocabulary with exactly one member today. A future rule
language (glob, regex) is a **new kind added in a new contract version** —
the discriminated shape is how "extending the language" is made a reviewable
contract event rather than a consumer reinterpretation.

`RelativePathPrefix` is a constrained string whose pattern admits only
normalized repository-relative segment sequences: no leading `/`, no scheme,
no `*` or `?`, and no `.`/`..` segment — the pattern excludes dot-only
segments positionally, so a traversal segment is unrepresentable, not merely
refused at runtime. The pattern survives into the generated JSON Schema, so
the structural guarantee holds for schema-validating consumers too.

`PathPolicy.prohibited_rules` becomes `z.array(ProhibitedPathRule)`. An
element type change is **breaking**, so path-policy moves to contract
version **2.0.0** (D3).

Rejected: keeping `string[]` plus a documented convention — the meaning
would still be born in consumer code, which is the exact defect under
correction. Rejected: a permissive union accepting both strings and typed
rules — it would preserve the untyped path forever.

### D2: `AuthorityIdentity` is a shared primitive, authored once in contracts

```ts
export const AuthorityIdentity = z.strictObject({
  contract_id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  contract_version: SemVer,
  digest: Digest,
})
```

The digest-bound identity of a captured authority document: which contract
validated it, at which exact version, over which bytes. Authored in
`packages/contracts` primitives and imported by `packages/events` by
instance — the same D2 discipline the L2 change established (one authored
shape, no semantically equivalent second definition).

`EvidenceIdentities` gains two **required** fields:

```ts
path_policy: AuthorityIdentity,
gate_registry: AuthorityIdentity,
```

Required, not optional (proposal CQ1): the canonical requirement's own
framing is "evidence is never optional"; an omittable governing-authority
identity is a silently incomplete bundle. New required fields in a strict
object are **breaking**, so evidence-bundle moves to **2.0.0** (D3).

Rejected: reusing `ProfileIdentity` — its `name` field identifies a profile
instance, not a contract document; overloading it would blur two identity
kinds. Rejected: bare `Digest` fields — a digest without its contract
identity cannot say *what* the bytes claimed to be.

### D3: New versions are appended; superseded versions are retained, generated, and ledger-anchored

This is the deferred "second version" decision. The rule adopted:

- **The authored source carries both versions.** The v1 shapes move to
  frozen modules (`path-policy/v1.ts`, `evidence.ts` v1 slice) that are no
  longer part of the package's public API surface for new consumers but
  remain in the artifact catalogs, so `schemas/path-policy/1.0.0.json` and
  `schemas/evidence-bundle/1.0.0.json` continue to regenerate byte-identically.
- **The ledger appends two rows** (`path-policy@2.0.0`,
  `evidence-bundle@2.0.0`) and rewrites none — proven by the existing
  historical guard against the accepted base, exactly the attack surface it
  was built for.
- **Every existing guard passes unchanged**: corpus set-equality (generated
  == committed == ledger), current-state digests, identity exactness,
  neutrality, credential-slot and strictness scans all hold over the
  enlarged corpus with no test-semantics change.

Consequence, stated honestly: the corpus retains a superseded shape whose
rules are untyped strings. It is identity-anchored history, not a live
authority — nothing consumes it, and L3 consumes only v2. Retirement of
superseded versions is a **deferred policy decision**, named here and not
taken.

Rejected: rewriting the 1.0.0 artifacts in place — forbidden by the
historical ledger guard, and the guard being immovable is the point.
Rejected: deleting the 1.0.0 files while keeping their ledger rows — it
would force weakening corpus set-equality from equality to containment.

### D4: The package public APIs export the v2 shapes under the existing names

`PathPolicy` and `EvidenceBundle` (and `EvidenceIdentities`) keep their
exported names and refer to the v2 shapes; the frozen v1 modules are not
re-exported from either package index. Zero consumers exist (L2 is inert;
L3 is unstarted), so no import site changes anywhere. The version constants
(`PATH_POLICY_VERSION = '2.0.0'`, `EVIDENCE_BUNDLE_VERSION = '2.0.0'`)
move with them.

## Interfaces and Contracts

| Contract | Before | After |
|---|---|---|
| `path-policy` | `1.0.0`, `prohibited_rules: string[]` | `2.0.0`, `prohibited_rules: ProhibitedPathRule[]`; `1.0.0` retained |
| `evidence-bundle` | `1.0.0`, identities without policy/registry | `2.0.0`, `identities.path_policy` and `identities.gate_registry` required; `1.0.0` retained |
| shared primitives | — | `AuthorityIdentity` added (contracts, imported by events) |

All other contracts and versions: unchanged, byte-identical.

## Compatibility and Migration

No migration: zero consumers. L3's planning seam already sequences behind
this change and consumes only the v2 shapes. Cross-version **reader**
compatibility (a reader encountering both v1 and v2 bundles) remains
deferred to the first landing that actually reads stored evidence — U11
territory, not this change.

## Security Implications

- The rule language moving into the contract removes an
  interpretation seam from the trust path: the highest-consequence path
  failure (a protection rule silently ignored) becomes unrepresentable
  rather than convention-guarded.
- Evidence completeness over governing authority closes the "which policy
  judged this run?" gap without weakening any verifier rule — RC-ADV-07's
  fail-closed artifact accounting is untouched (option D was rejected for
  exactly that reason).
- The append-only ledger guard is exercised, not modified.

## Open Questions

CQ1 (required identity fields) and CQ2 (superseded-version retention) are
stated in `proposal.md` and assumed as decided above; both require
confirmation at the planning review.
