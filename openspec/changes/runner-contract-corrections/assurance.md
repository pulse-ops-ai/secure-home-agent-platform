# Assurance Plan: runner-contract-corrections

## Purpose

This artifact defines how the accepted specification and design will be
proven before the change is considered complete. It does not create new
product requirements.

Identifier convention: inherited identifiers keep their canonical names;
identifiers minted by this change are prefixed `CC-`.

---

## Risk Classification

**Risk:** `trust-critical`

### Rationale

- The prohibited-rule shape is a protection declaration consumed by trust
  decisions; a defect here mis-declares what a run may never touch.
- The evidence identity group is what makes a run auditable; an
  incompleteness here survives into every later landing.
- The change exercises the identity-ledger append path for the first time —
  the one operation the historical guard must permit while refusing every
  rewrite.

Not merely `high`: as with L2 itself, the failure modes are silent
mis-declaration and silent history rewrite, not build breakage.

Per the ratified review plan, a trust-critical child change carries an
Authority Chain delta and a before × after transition matrix. Both are
below, scoped to what this change alters.

## Critical Invariants

### Inherited (unchanged, re-proven over the enlarged corpus)

| ID | What this change must keep true |
|---|---|
| C-INV-01 | strict posture everywhere, surviving generation |
| C-INV-02 | provider/framework/runtime names never structural |
| C-INV-06 | no designated credential-value slot anywhere |
| C-INV-07 | generation deterministic; drift detected |
| C-INV-09 | one schema identity, one byte set; `$id` embeds exact version |
| C-INV-10 (ledger) | accepted ledger rows never change or disappear |

### Minted by this change

| ID | Invariant | Class |
|---|---|---|
| CC-INV-01 | An unrecognized or non-normalized prohibited-rule form is unrepresentable: unknown kind, wildcard, traversal segment, absolute prefix, and scheme all fail contract validation | trust |
| CC-INV-02 | `EvidenceIdentities` cannot validate without `path_policy` and `gate_registry` authority identities | trust |
| CC-INV-03 | The structural prefix constraint survives into generated JSON Schema (pattern present in the published projection) | trust |
| CC-INV-04 | The superseded `1.0.0` artifacts regenerate byte-identically and their ledger rows are untouched | compatibility |
| CC-INV-05 | `AuthorityIdentity` is authored once in contracts and imported by events by instance | trust |

## Proof Obligations

| ID | Proves | Proof class | Evidence |
|---|---|---|---|
| CC-EX-01 | CC-INV-01 | deterministic example | fixtures: bare string, unknown kind, `*`-carrying prefix, `../` segment, absolute prefix, `file:` scheme — each refused naming the rule; a valid typed prefix rule validates |
| CC-EX-02 | CC-INV-02 | deterministic example | a bundle omitting either identity fails validation; a complete bundle validates |
| CC-EX-03 | CC-INV-03 | deterministic example | the generated `path-policy/2.0.0.json` constrains `kind` to the closed vocabulary and `prefix` by the normalized pattern |
| CC-EX-04 | CC-INV-04 | deterministic example | regeneration includes both versions byte-identically; corpus equality holds over the enlarged set |
| CC-EX-05 | CC-INV-05 | architecture guard | `AuthorityIdentity` imported by events from contracts; the existing instance-identity suite (C-EX-005 pattern) extended to it |
| CC-ADV-01 | C-INV-10 | adversarial | in the git-seam fixture suite: a proposal rewriting `path-policy@1.0.0` while appending `2.0.0` fails the historical guard; a pure append passes |
| CC-ADV-02 | CC-INV-01 | adversarial | a `path_prefix` rule whose prefix is empty, `.`-only, or `..`-embedded (`a/../b`) refuses |
| CC-MUT-01 | CC-INV-01 | mutation | widening `RelativePathPrefix` to admit traversal is killed by CC-EX-01/CC-ADV-02 |
| CC-MUT-02 | CC-INV-02 | mutation | making either identity field optional is killed by CC-EX-02 |

## Authority Chain (delta)

Only the rows this change alters:

| Object | Authoritative source | Digest / identity | Change |
|---|---|---|---|
| Path policy | repository-declared policy bytes | `Digest` over captured bytes | rules become typed; **its identity becomes recordable in evidence** (`identities.path_policy: AuthorityIdentity`) |
| Gate registry | repository-declared registry bytes | `Digest` over captured bytes | **its identity becomes recordable in evidence** (`identities.gate_registry: AuthorityIdentity`) |
| Evidence bundle | constructed by L3 | contract validation at v2 | identity group now complete over all governing authority inputs |
| Identity ledger | authored, append-only | per-identity digests | two appended rows; the historical guard proves no rewrite |

## Before × After Transition Analysis

| # | Before | After | Required behavior | Proof |
|---|---|---|---|---|
| 1 | `path-policy@1.0.0` accepted in ledger | `2.0.0` appended | both rows present; `1.0.0` digest unchanged | CC-ADV-01, CC-EX-04 |
| 2 | rules as strings (v1) | rules typed (v2) | v1 artifact regenerates identically; v2 validates typed rules only | CC-EX-01, CC-EX-04 |
| 3 | bundle without policy/registry identity (v1) | v2 requires both | v2 refuses an incomplete identity group; v1 artifact unchanged | CC-EX-02, CC-EX-04 |
| 4 | corpus of 8 identities | corpus of 10 | set-equality holds: generated == committed == ledger | CC-EX-04 |
| 5 | prefix normalized | prefix mutated to carry traversal | unrepresentable at validation; pattern present in generated schema | CC-ADV-02, CC-EX-03, CC-MUT-01 |

No transition weakens an existing guard; none maps to silent acceptance.

## Traceability Plan

| Requirement / invariant | Proving task | Proof |
|---|---|---|
| Typed prohibited rules (`runner-verification` MODIFIED) | 2.1 | CC-EX-01, CC-EX-03, CC-ADV-02, CC-MUT-01 |
| Complete evidence identities (`runner-evidence` MODIFIED) | 3.1 | CC-EX-02, CC-MUT-02 |
| Shared identity primitive (D2) | 2.2 | CC-EX-05 |
| Version append discipline (D3) | 4.1 | CC-EX-04, CC-ADV-01 |

## Review Plan

Per the ratified standing model: planning review of this seam (closing CQ1
and CQ2) before task 0.1 flips; targeted review during construction;
complete-seam semantic review plus one fresh falsification review at the
frozen head. The L2 conformance nets re-run wholesale in the merge gate —
this change adds to them and weakens none.

## Rollout and Rollback

`not_applicable` with reason: contracts remain inert (zero consumers until
L3). Rollback before merge is branch deletion; after merge, a further
**append** (the ledger forbids un-publishing, by design).

## Assurance Completeness

**Unresolved state-model questions:** none beyond CQ1/CQ2, which gate 0.1.

**Requirements lacking proof:** none; both MODIFIED requirements trace to
named proofs above.

**Scenarios intentionally deferred:** cross-version reader behavior (first
evidence-reading landing, U11); superseded-version retirement policy (a
future governance change, named in design D3).

**Design assumptions requiring human confirmation:** CQ1 (required identity
fields), CQ2 (superseded-version retention).
