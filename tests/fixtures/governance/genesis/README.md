# Isolated genesis proof

Test attestations for [PR-2 tasks 6.7 and 7.2](../../../../openspec/changes/governance-state-substrate/tasks.md).
They demonstrate byte bindings, not human authorship. Nothing here is an owner
attestation or an activation artifact.

`envelope.mjs` prints a test-attested copy only for a separate fixture repository.
It never writes into that repository. For promoted inputs it checks freshness in
a disposable clone of the explicitly supplied activation base, verifies all three
frozen members against the loader, and removes the clone afterwards. The original
[candidate](../candidate/README.md) remains unattested and must fail the full checker.
Production entry points are exercised
by `tests/test_governance_state.py`; all mutation subjects are temporary copies.
Envelope/rebind entry points require an independent repository under the system
temporary directory, resolving symlinks before checking isolation. They refuse
the real checkout and aliases to it.

`install_test_genesis()` creates a positive **post-activation test subject**.
It generates the synthetic envelope while the raw inputs exist, moves all three
members using the shared promotion mapping, proves byte equality and candidate
absence, and replaces only the promoted state's two attestation envelopes.
The fixture then derives its pointer population from the frozen inventory and
task metadata, initializes the registered regions, and invokes the real renderer.
Its deterministic pointer prose is test-only scaffolding, not a production
migration tool. Retained sources are untouched; task metadata and the required
question anchors remain available. Positive current/history tests therefore
exercise the complete activated layout, not coexisting candidate copies.

Ordinary production validation recovers immutable frozen members only from the
populated genesis envelope's exact activation base. The current registry may
legally evolve after genesis; only this test loader's activation-layout recovery
requires the envelope-only state delta described below. An unattested promoted
state still refuses ordinary validation and uses the dedicated preparation path.

`rebind.mjs` constructs fully rehashed hostile or alternative-history **test**
copies. It deliberately does not validate those claims; production current and
history entry points must refuse them. Neither helper writes or accepts the
real ceremony. `delivery-preimage.json` and `spike-preimage.json` are independent
literal serialized-byte/SHA-256 vectors, not actual delivery evidence.

Named guard-removal mutation controls may explicitly promote their forged
inputs with `promote_mutation_control()`. Their forged state bytes remain
unchanged; the deficient model renders its own claimed projections. This
isolates the evidence guard being tested from unrelated layout refusals.
General hostile construction is not automatically normalized or admitted.

`acceptance-audit.json` is a read-only audit receipt for authorized common source
S, not a freeze member or owner attestation. It records all 23 historical terminal
decisions, exact transitions, source hashes and extraction rules. ADR-0022 is the
positive decision-date/Git-committer-date divergence, not an exception to a
date-equality rule. See the [candidate receipt](../candidate/README.md).
`tests/test_governance_acceptance_audit.py` exercises generic accepted and rejected
transitions, creator-supplied timestamps, source conflicts and independent mutants.

`objects.mjs` is test setup only. A fresh CI clone can lack original transitions
that were squash-delivered. This helper reads the reviewed source table and
fixture identities as inert data, retrieves missing exact commit objects from
the existing `origin`, and verifies object presence. It never checks out or
executes retrieved content. Retrieval failure fails the tests. Production
extraction and validators remain offline, fail closed on missing objects, and
do not infer human authorship from successful retrieval.

## Frozen inputs across promotion

`frozen.mjs` is the single **test-only** lifecycle loader. It returns exact byte
buffers plus `sourceLayout`; it does not discover production candidates, write
copies, attest anything, or validate activation authority.

| Layout | Frozen input source |
| --- | --- |
| `pre-promotion` | All three candidate members, with all promoted members absent. |
| `promoted-unattested` | All three promoted members, with all candidate members absent and exactly the raw genesis placeholder. |
| `attested-activation-base` | Git objects at the canonical genesis envelope's exact `activationBaseCommit`, never a guessed predecessor. |

Post-attestation recovery verifies the complete content-bound freeze, unchanged
promoted manifest/inventory, the two envelope bindings, and byte equality of the
canonical state with the raw seed after removing **only** those two envelopes.
It does not strip arbitrary state changes or authenticate the human actor. Full
production current/history checks and human provenance review remain separate.
Partial, duplicate, missing, linked, noncanonical and misbound layouts refuse;
one surviving candidate member cannot be silently preferred over promoted data.

Python delegates byte selection to this loader. Tests that require pre-activation
history explicitly build a **counterfactual temporary fixture**: before real owner
attestation, its source is the frozen manifest's unique non-historical five-row
preparation checkpoint, verified against its immutable Git objects (regular blob,
OID and content SHA-256). Current activation-seam planning bytes may legitimately
differ during task 8.4; they do not select that historical checkpoint. After
attestation the source is the exact attested activation base.
The frozen input bytes still come from the lifecycle loader,
not that fixture checkpoint. Current test subjects outside the concrete migration
scope are copied into the fixture, and the exact three raw members are materialized
there. This is not the repository's activation-base selection or new freshness
evidence. All normal freshness, refusal and history tests then use production
entry points on that isolated fixture.

`rebind.mjs` is deliberately different: its hostile tests explicitly name raw
candidate inputs in isolated repositories that may intentionally carry invalid
or coexisting copies. `readRawRebindInputsForTest` is not a fallback after lifecycle
refusal and is never used by repository setup, envelope creation or recovery.
The fully rehashed post-genesis fallback control uses this explicit forger at its
committed ordinary-registry base. A normal envelope loader must refuse that
deliberately mixed layout; the control still independently requires current
validity, production history refusal and admission by the history mutant.

## Promotion dependency inventory

Reconnaissance covered every candidate-path reference under `tests/`, including
dynamic prefixes, Git-object reads, copy/move operations and freshness invocations.
No other test module directly loads the three frozen members.

| Path / use | Disposition |
| --- | --- |
| `genesis/objects.mjs`: module setup for both governance Python modules | Lifecycle loader supplies state/manifest; exact-object hydration remains test setup only. |
| `genesis/envelope.mjs`: synthetic envelope inputs and production freshness | Lifecycle loader; promoted inputs use a disposable exact-base clone, not restored real candidate copies. |
| `genesis/rebind.mjs`: `candidate` and `forged-envelope` hostile rehashing | Explicit raw isolated fixture inputs through the shared byte reader; intentionally invalid claims are still tested by production. |
| `test_governance_state.py`: `isolated_genesis`, temporal/attested templates, `fresh_genesis`, `registry_less_repository` | Explicit temporary pre-activation reconstruction; no assumption that the subject checkout still has candidate files. |
| `install_test_genesis`, positive `activate`, temporal/attested templates, historical delivery positives | Generate envelopes before exact promotion; all candidate copies are then absent, with pointers/regions rendered in the isolated positive subject. |
| `forged_test_genesis`, `rebind_test_candidate`, deliberate reactivation | Explicit hostile construction remains separate; invalid layouts or bindings are not silently normalized into positive fixtures. |
| Preparation parity | Restore saved raw state in the already-promoted fixture; never re-promote deleted inputs or resurrect candidate copies. |
| Raw-seed refusal and real-seed envelope controls | Recovered frozen bytes, never attested state treated as raw; production raw-seed diagnostics retained. |
| `pr3_scope_inputs`, retained selector, complete discovery | Shared loader for inventory; full pre-activation discovery runs on the isolated fixture. |
| Freshness/temporal mutation families, `retained_freshness_inputs`, rehashed hostile envelopes | Explicit isolated candidate inputs and explicit base commits; no production fallback. |
| `promote_preparation_fixture`, preparation parity/hostile/CLI tests and malformed frozen-input controls | Deliberate source moves/deletions/resurrection remain unchanged negative controls. |
| `test_governance_acceptance_audit.py` | Only indirect dependency is the `objects.mjs` autouse setup; audit bodies already use exact Git snapshots. |

The lifecycle regressions exercise all three valid layouts, mixed/misbound
refusals, and committed task-8.2 promotion plus task-8.3 preparation. Nested test
runs prove the formerly failing setup reaches the actual scope/history test
bodies, raw-seed controls, preparation parity, freshness refusals and acceptance
audit. Candidate deletion assertions remain load-bearing.

Promotion determination (ADR-0014): this is fixture lifecycle compatibility,
not a new architectural truth or portable-knowledge rule. No architecture,
planning contract, candidate freeze, production semantics or knowledge review
changes are required.

## Related

- [Candidate receipt](../candidate/README.md)
- [Governance state tests](../../../test_governance_state.py)
- [Acceptance audit tests](../../../test_governance_acceptance_audit.py)
