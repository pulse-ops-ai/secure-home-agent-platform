# Isolated genesis proof

Test attestations for [PR-2 tasks 6.7 and 7.2](../../../../openspec/changes/governance-state-substrate/tasks.md).
They demonstrate byte bindings, not human authorship. Nothing here is an owner
attestation or an activation artifact.

`envelope.mjs` prints a test-attested copy only for a separate fixture repository.
It does not write files. The original [candidate](../candidate/README.md) remains
unattested and must fail the full checker. Production entry points are exercised
by `tests/test_governance_state.py`; all mutation subjects are temporary copies.

`rebind.mjs` constructs fully rehashed hostile or alternative-history **test**
copies. It deliberately does not validate those claims; production current and
history entry points must refuse them. Neither helper writes or accepts the
real ceremony. `delivery-preimage.json` and `spike-preimage.json` are independent
literal serialized-byte/SHA-256 vectors, not actual delivery evidence.

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
