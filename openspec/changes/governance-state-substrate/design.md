# Design: governance-state-substrate

Technical design for the ADR-0021 governance-state substrate. This artifact
defines **how** the accepted behavior will be implemented. It implements
nothing, and no task in this change is executed.

---

## D1. Component architecture and the single semantic owner

```text
                    governance/state.json          (authored authority)
                              │
                              ▼
                    ┌───────────────────┐
                    │  model/evaluator  │  ← THE SOLE SEMANTIC OWNER
                    │  parse · validate │
                    │  derive · explain │
                    └───────────────────┘
                      │     │     │     │
        ┌─────────────┘     │     │     └─────────────┐
        ▼                   ▼     ▼                   ▼
  current checker    history checker   renderer      query
  (one revision)     (two revisions)   (projections) (explain)
                            │
                            ▼
                     git history adapter
                     (bytes only, no rules)
```

**D1.1 — One implementation of every rule.** The model owns parsing,
canonicalization, schema closure, digest computation, lifecycle legality,
predicate evaluation, readiness derivation, and explanation. The four entry
points are thin: they select inputs, call the model, and format output. A
validator, renderer, query command, or test that re-implements a predicate is a
second rule authority and a defect.

**D1.2 — The Git adapter carries no rules.** It resolves a revision to bytes
and nothing else. History semantics — what regression means, which transitions
are legal — live in the model, which is handed two parsed states. This is the
boundary ADR-0021 §9 requires so the adapter cannot become a second authority.

**D1.3 — Tests consume the model.** `tests/test_governance_state.py` exercises
the real entry points over real fixtures. A helper that re-derives an expected
answer independently is permitted only as a deliberate independent
re-derivation proof, never as the mechanism under test.

### Responsibilities

| Component | Owns | Must not |
| --- | --- | --- |
| `model` (shared) | canonical parse, schema closure, digests, lifecycle legality, predicates, readiness, explanations | read Git, write files, format human output, reach the network |
| `check-governance-state.mjs` | select current revision, invoke model, report | implement any predicate or legality rule |
| `check-governance-history.mjs` | select explicit base, invoke adapter for bytes, invoke model for comparison | infer a base; encode regression rules |
| `git history adapter` | revision → bytes | interpret content |
| `render-governance-state.mjs` | deterministic projection; registered targets/markers; `--check` vs write | derive anything the model does not; edit unregistered files |
| `query-governance-state.mjs` | read-only explanation, human and JSON forms | return `AUTHORIZED`; collapse axes; mutate state |

---

## D2. Conceptual registry schema

Field spelling may be refined during implementation within ADR-0021 §3's
decided ownership and semantics. The shape:

```json
{
  "schemaVersion": 1,
  "adrs": [
    {
      "id": "ADR-0020",
      "path": "docs/decisions/ADR-0020-place-runner-control-by-workload-class.md",
      "title": "Place runner-control by workload class",
      "lifecycle": "Proposed",
      "proposedOn": "2026-08-24",
      "resolves": ["U4"],
      "supersedes": [],
      "acceptance": null
    }
  ],
  "questions": [
    { "id": "U4", "anchor": "docs/architecture/unresolved-decisions.md#u4", "title": "..." }
  ],
  "gates": [
    {
      "id": "GATE-U4",
      "predicate": { "name": "exactly-one-current-accepted-resolver", "question": "U4" },
      "sources": ["docs/decisions/ADR-0021-...md#3c"]
    }
  ],
  "landings": [
    {
      "id": "runner/L9",
      "kind": "implementation-landing",
      "requires": ["runner/L8", "GATE-U4"],
      "authorityAnchor": { "type": "github-issue", "repository": "pulse-ops-ai/secure-home-agent-platform", "number": 57 },
      "delivery": { "lifecycle": "Planned", "completionPolicy": null, "completion": null }
    }
  ],
  "externalReferences": [],
  "attestations": { "genesis": { } }
}
```

**Absent by construction** — the model derives all of these, and each is an
unknown field if authored: accepted counts and ranges; `isCurrent`,
`isImmutable`, `resolvesU4`; `question.resolved`; `gate.satisfied`;
`landing.blockedOn`; `prerequisiteReadiness`; any `authorized` field.

### Closed vocabularies

| Vocabulary | Values |
| --- | --- |
| ADR lifecycle | `Proposed`, `Accepted`, `Superseded`, `Rejected` |
| Delivery lifecycle | `Planned`, `InProgress`, `Complete`, `Withdrawn` |
| Completion policy | `reviewed-delivery-v1`, `reviewed-spike-evidence-v1` |
| Identity class | `local-git-commit`, `external-git-commit`, `content-sha256` |
| Anchor type | `github-issue`, `github-pull-request`, `task-contract` |
| Readiness | `Ready`, `NotReady` |
| Authorization assessment | `PREREQUISITES_NOT_READY`, `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` |

`AUTHORIZED` is absent from the last vocabulary by construction, not by
convention.

---

## D3. Canonicalization and digest preimages

**D3.1 — Canonical form.** A closed representation: UTF-8, LF, two-space
indent, object keys in a defined order, no trailing whitespace, one trailing
newline, no non-finite numbers, no duplicate keys. The parser is a **strict
reader**, not the host `JSON.parse`: it rejects duplicate keys *before* object
construction, so a later key cannot overwrite an earlier one silently. Canonical
serialization is a pure function of logical content, and `state.json` must equal
its own canonical serialization byte for byte.

**D3.2 — Digest classes.** Each is SHA-256 over a canonical serialization of a
defined preimage:

| Digest | Preimage |
| --- | --- |
| `contentDigest` | the exact bytes of a referenced artifact (ADR, findings, manifest) |
| `primitiveDigest` | all primitive records, **attestation envelopes excluded** |
| `relationshipDigest` | the canonical relationship tuples (`resolves`, `supersedes`) |
| `transitionDigest` | `{schemaVersion, priorStateDigest\|null, targetPrimitiveDigest, subject, from, to, contentDigest, relationshipDigest}` |
| `completionDigest` | `{landingId, from, to, authorityAnchor, deliveredIdentity, completionPolicy, …policy-specific}` |
| `seedDigest` / `relationshipEquivalenceDigest` | genesis registry, and the source-comparison tuples |

**D3.3 — Non-self-reference.** Every attestation is **excluded from the
preimage it attests**. Nothing proves itself, and no commit or row must contain
its own identity. A commit reference may be recorded after the fact; changing it
cannot change an already-bound digest.

---

## D4. Identity verification and fail-closed behavior

| Identity class | Verification | Failure |
| --- | --- | --- |
| `local-git-commit` | the object must exist in the checked-out repository, and the delivered bytes must be scoped to the landing's declared scope | object absent, or scope unbound ⇒ **fail closed**, landing unsatisfied, report `COMPLETION_REQUIRES_EXTERNAL_VERIFICATION` |
| `external-git-commit` | shape only; explicitly **not** offline proof of availability | never reported as locally proven |
| `content-sha256` | recompute over the referenced path and compare | mismatch or missing path ⇒ fail |
| anchor (`github-issue`, …) | shape and closed type only; never fetched | malformed ⇒ fail; well-formed ⇒ still no authorization |

**D4.1 — An unscoped commit is not proof.** A bare hash naming a landing does
not establish that the landing was delivered. The delivered identity must be
bound to declared scope.

**D4.2 — Offline is a property, not a limitation.** The checker performs no
network access. Live external authorization is answered with
`AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION`, never guessed from a URL,
number, or issue title.

---

## D5. Legality decision tables

### D5.1 ADR lifecycle

| From | To | Evidence present | Outcome |
| --- | --- | --- | --- |
| `Proposed` | `Accepted` | attestation + accepted-byte digest + atomic header transition | **legal** |
| `Proposed` | `Accepted` | any of those missing | refuse; change-attributable |
| `Proposed` | `Rejected` | attestation bound to final rejected bytes | **legal** |
| `Accepted` | `Superseded` | new accepted ADR with valid `supersedes`; old bytes unchanged | **legal** |
| `Accepted` | `Superseded` | no superseding accepted ADR | refuse |
| `Accepted` | `Proposed` / `Rejected` | any | refuse (terminal regression) |
| `Rejected` | anything | any | refuse (terminal) |
| `Proposed` | `Superseded` | any | refuse |

### D5.2 Header mirror

| Registry lifecycle | Required document header | Bytes |
| --- | --- | --- |
| `Proposed` | `Proposed` — checked mirror | mutable |
| `Accepted` | `Accepted` | pinned by digest, immutable |
| `Rejected` | `Rejected` | pinned by digest, immutable |
| `Superseded` | **`Accepted`** — historical record, deliberately not rewritten | pinned, immutable |

### D5.3 Prerequisite satisfaction

| Prerequisite kind | Delivery lifecycle | Completion evidence | Satisfied |
| --- | --- | --- | --- |
| landing | `Complete` | validates under its policy | **yes** |
| landing | `Complete` | missing, opaque, or failing | no — fail closed |
| landing | `Planned` / `InProgress` | any | no |
| landing | `Withdrawn` | any | no |
| gate | — | predicate evaluates true | **yes** |
| gate | — | predicate evaluates false or is unevaluable | no — unevaluable also fails the checker |

### D5.4 Query axes

| Delivery | Readiness | Prospective assessment |
| --- | --- | --- |
| `Planned` / `InProgress` | `NotReady` | `PREREQUISITES_NOT_READY` |
| `Planned` / `InProgress` | `Ready` | `AUTHORIZATION_REQUIRES_EXTERNAL_VERIFICATION` |
| `Complete` / `Withdrawn` | reported | non-applicable (`null`); historical question answered separately |

No row yields `AUTHORIZED`.

---

## D6. Genesis attestation construction

1. **Select the source snapshot** — `main` after ADR-0021's acceptance
   reconciliation and before PR #101's transition — and record its identity.
2. **Parse the pre-registry sources**: every structurally parseable ADR header,
   the decision-index records, and the unresolved-decision resolution banners.
   The seed parser may normalize the repository's existing relationship labels
   (`Closes`, `Decides`, and explicitly governed equivalents) into `resolves`;
   it may **not** infer a relationship from unstructured prose.
3. **Compare field by field** — lifecycle, identity, proposal date, `resolves`,
   `supersedes`, gate predicates, node kinds, prerequisite sets, authority
   anchors, completion policies. Relationship and rule identity are compared,
   **not** merely counts or matching summaries.
4. **Refuse on disagreement, parse failure, or omitted source.** None is
   silently treated as empty or equivalent; each requires human review.
5. **Bind** `seedDigest`, `relationshipEquivalenceDigest`, source-snapshot
   identity, actor, RFC 3339 time, and a typed authority reference, with
   `priorStateDigest: null`, the attestation excluded from its own preimage.

**D6.1 — Why equivalence is separate from the seed digest.** A byte-correct
seed can still assert a relationship no source declares. The separate
relationship-equivalence digest is what makes that case detectable without a
prior registry revision to compare against.

**D6.2 — Known genesis inputs.** The non-contiguous accepted set (ADR-0001
through ADR-0019 and ADR-0021), ADR-0020 `Proposed`, U4 open, GATE-U4
unsatisfied, L8 outstanding, L9 requiring `L8 + GATE-U4` with anchor issue #57,
and the L6 spike under `reviewed-spike-evidence-v1`.

---

## D7. Projections, markers, and migration

**D7.1 — Registered targets.** The renderer holds the registry of targets and
markers; nothing else may declare one. Initial set:

| Target | Region |
| --- | --- |
| `governance/STATE.md` | whole file, generated |
| `docs/decisions/INDEX.md` | current lifecycle portions |
| `docs/architecture/unresolved-decisions.md` | summary table and resolution banners |
| any narrowly justified local current-state section | that section only, per reviewed addition |

**D7.2 — Markers.** Each region is delimited by an explicit begin/end marker
naming the target and region. An unregistered target or marker is an **error**,
not an ignored file. Rendering is deterministic; `--check` fails unless the
render is a byte-for-byte no-op; write mode is a separate invocation from
`--check`, and the scripts documentation must record that distinction because
the current contract describes repository scripts as read-only.

**D7.3 — References, not copies.** These become stable pointers: root and
nested `AGENTS.md`, provider instruction files, root and nested READMEs, service
documentation, and `openspec/config.yaml`. A pointer carries no value and cannot
drift.

**D7.4 — Migration sequence for prose consumers.** Ordered so the repository is
never left with two coequal authorities:

1. Land the registry, model, and current checker — inert, nothing generated yet.
2. Land the renderer and register `governance/STATE.md` only.
3. Convert `docs/decisions/INDEX.md` lifecycle regions to generated regions, in
   the same change that deletes the hand-maintained values there.
4. Convert `docs/architecture/unresolved-decisions.md` regions likewise.
5. Replace status text in agent files, READMEs, service docs, and
   `openspec/config.yaml` with pointers.
6. Enable the prohibited-field refusal for the closed set of registered
   consumers.
7. Land the history checker and its CI wiring.

Each step deletes or generates the copies it replaces. **No step adds the
registry while leaving a hand-authored copy in place**, because two authored
sources for one fact is the defect, not a transition state.

**D7.5 — `openspec/config.yaml` is a named regression case.** It currently
holds independent mutable governance claims. It must become generated or a
pointer, and a test must prove it cannot revert to an independent state store.
It is not edited by this planning change.

---

## D8. CI execution and base selection

- Governance validation runs in the **unconditional governance job**, never
  only behind affected-target classification: a change that edits no
  governance file can still invalidate a projection.
- The history checker receives its base **explicitly** from CI. The base is
  exclusive: invalid, missing, unreadable, or not a commit ⇒ the check fails.
  There is no fallback to `merge-base`, `HEAD~1`, or any inferred revision,
  because a comparison against the wrong revision is a false green.
- Generated state must also pass formatting, secret scanning, and
  `git diff --check`. Renderer targets that are indexes must continue to
  satisfy their existing structural checks in `validate-scaffold.sh`, which
  gains structural coverage of the `governance/` domain.
- The v1 layout has **no** nested `governance/AGENTS.md`; the root contract and
  `governance/README.md` govern it.

---

## D9. Shared versus independently implemented logic

**Shared — exactly one implementation:** canonical parse and serialization;
digest computation; schema closure; lifecycle legality; predicate evaluation;
readiness derivation; explanation construction.

**Independently implemented — deliberately not shared:** the conformance
suite's *expectations*. Where a proof requires independent re-derivation, the
test computes the expected value by a different route than the model; otherwise
a bug in the model would be asserted as correct by a test that shares it.

**Deferred to later landings:** any locally consumable authorization-evidence
contract (requires its own ADR); additional completion policies (require their
own ADR); a nested `governance/AGENTS.md`; any fact family beyond ADR-0021 §3.

---

## D10. Alternatives considered and rejected

1. **Derive everything from ADR headers, with no authored registry.** Rejected
   on evidence: `Status`, `Date` and `Deciders` parse across all 21 ADRs, but
   the relational fields do not — `Closes` appears in 7 of 21 and its values are
   prose such as *"no unresolved decision. Authoring…"*, while ADR-0020 uses
   `Decides`. Accepted ADRs are immutable, so structure cannot be retrofitted
   into them. The registry must be authored and validated against the parseable
   subset.
2. **Registry beside the ADRs under `docs/decisions/`.** Rejected by ADR-0021
   §1: the authority spans architecture, agent instructions, OpenSpec context
   and program landings, and is not decision-document metadata.
3. **Add the registry and keep the prose copies during a transition.**
   Rejected: that is a fifty-first coequal surface with no rule for which wins.
4. **A regex scan over all prose as the enforcement mechanism.** Rejected as an
   authority and retained only as defense in depth — no scan proves arbitrary
   prose contains no contradiction. Mechanical enforcement is the closed
   registry, model, renderer, and two checkers.
5. **Let the history checker infer its base.** Rejected: an inferred base makes
   a wrong-revision comparison look green.
6. **Store `blockedOn` beside `requires` for readability.** Rejected: it is the
   exact primitive/derived collapse that produced the defect.

---

## D11. Landing seams

| Landing | Ships | Atomic with |
| --- | --- | --- |
| PR-1 | model + strict reader + current checker + conformance net | its hostile corpus |
| PR-2 | genesis seed + genesis attestation + equivalence proof | PR-1's checker |
| PR-3 | renderer + `governance/STATE.md` + marker registry | its drift controls |
| PR-4 | projection migration + prohibited-field refusal | the deletions it replaces |
| PR-5 | history checker + explicit-base CI wiring | its regression corpus |
| PR-6 | query interface | its axis-separation controls |

A landing's verification net ships **with** it. PR-2 must not land before PR-1's
checker can validate the seed it produces; PR-4 must not land a generated region
without deleting the hand-authored copy in the same change.
