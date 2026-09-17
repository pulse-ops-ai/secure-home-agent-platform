# Design: TS7 emit proof lifecycle

## Contract inspection before implementation

Inspection base: `main` at `5447e78fa9d63ce2c20ea8de81a1cd321bdf9b6a`.

The canonical [typescript-7-cutover requirement](../../specs/typescript-7-cutover/spec.md)
states `REQ-TC-002` as a **Scope 2** preservation obligation. Its exact runtime
and generator comparisons say a difference blocks **the cutover**. Its
declaration and map rules specify the meaning preserved across that transition.
They do not declare future authored source immutable.

The delivered [TS7 assurance contract](../archive/2026-09-10-typescript-7-lint-engine-resilience/assurance.md)
assigns `EX-TS-002` and `MUT-TS-EMIT-001/002/003/004` to PR-C. Its
`INV-TS7-01/09/10/26/27/28/32` and cross-requirement interactions 9–13 retain
future compiler maintenance through D13/D14 and MAN-TS7-01. The delivered
[design D18](../archive/2026-09-10-typescript-7-lint-engine-resilience/design.md#d18-before-first-delivery-preservation-means-semantics-not-the-previous-compilers-serialization)
expressly calls the TS6 evidence immutable historical record. It does not extend
its serializer exception to later compiler moves.

[ADR-0022](../../../docs/decisions/ADR-0022-decouple-typescript-policy-enforcement-from-lint-engine.md)
§2 names 7.0.2 as the initial cutover identity and §10 governs later exact
normal-compiler versions through predecessor-bound maintenance. The normal
compiler, protected projections, trusted verifier, subject isolation, platform
proof, and merge freshness obligations remain unchanged.

**This correction changes proof lifecycle, not proof semantics:** the same
differential continues to judge the same historical program under the same
cutover compiler. Continuous checks judge authenticity of that evidence, while
normal validation judges current source. No comparison is relaxed, no surface
is removed, and no old evidence is made to describe a new program. The defect
is the continuous caller's choice of subject, not the comparator's definition
of equality. No superseding ADR is required.

## D1: Continuous integrity, explicit historical replay

Replace only the `check:emit-conformance` invocations in `checks.yml` and
`check.sh` with a dependency-light historical verifier. Pin all three original
Git blobs, validate their seals and cross-artifact binding, and read the recorded
capture/cutover history as inert Git objects. Missing history fails closed.
Existing baseline DAG provenance and declaration/map mutation tests remain.

Retain `check:emit-conformance` as an explicit replay command requiring a clean
checkout of the recorded delivered cutover revision. Before executing that
checkout's build/generator commands, verify its exact revision, clean tracked
and untracked source state, source equality with the TS6 capture, evidence
identity, and installed normal compiler identity. Frozen install is a replay
prerequisite. Rebuild only the historical TS7 subject and compare in memory;
never write or recapture a TS6 artifact.

## D2: Maintenance remains independent

The historical verifier does not admit any tool update. No maintenance class,
projection, workflow, subject plan, or verifier changes. Hostile two-revision
fixtures must show that a compiler bump combined with protected drift or a
candidate checker bypass remains refused. A pin-only classification is merely
structural eligibility; the real predecessor-hosted proof and MAN-TS7-01 still
govern a future update.

## Alternatives rejected

Recapturing the baseline destroys historical identity. Broadening normalization
changes proof semantics. Skipping on arbitrary changed paths lets the candidate
choose whether evidence matters. Deleting the differential loses replay. Running
historical replay on every ordinary source change needlessly rebuilds a program
that has not changed; continuous integrity and explicit replay have different
subjects and purposes.

## Promotion determination

This is a durable normative clarification of `typescript-7-cutover`. Its canonical
home is that existing specification, through the reviewed delta's later validated
sync/archive, never a direct edit to canonical specs. The current canonical
requirement already scopes the proof to cutover, so implementation corrects its
caller now; the additional explicit lifecycle wording waits for independent
review. No new architecture decision or portable knowledge module is needed
for this bounded compiler-proof correction. The operational explanation belongs
beside the repository tooling and links to the existing specification.

## Landing and failure boundaries

One separate draft PR contains the invocation correction, verifier/replay guards,
hostile proofs, and documentation. Malformed or altered evidence is a validation
failure; unavailable history/dependencies is an operational refusal, never pass.
No runtime or external-system authority changes. Rollback is a reviewed revert
of this correction; evidence bytes remain unchanged in either direction.
Independent review is required before merge or spec sync/archive.

## Related

- [Proposal](proposal.md)
- [Lifecycle requirement delta](specs/typescript-7-cutover/spec.md)
- [Assurance](assurance.md)
