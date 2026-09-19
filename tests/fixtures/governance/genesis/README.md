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

`acceptance-audit.json` is a read-only audit receipt for the authorized M, not a
freeze member or owner attestation. It records each exact historical transition,
source hashes, extraction rule, and the complete blocking exception set. The
[candidate warning](../candidate/README.md) explains why regeneration is still
blocked. `tests/test_governance_acceptance_audit.py` exercises generic accepted
and rejected transitions and hostile recording-time cases in isolated Git trees.
