## ADDED Requirements

### Requirement: Completed cutover evidence retains its historical subject

**Requirement ID:** `REQ-TC-006`

The `REQ-TC-002` TS6→TS7 differential SHALL remain evidence about the bound
pre-cutover source and the initial cutover compiler. Its runtime/generator byte,
declaration meaning, and map attribution comparisons SHALL remain unchanged.
After the completed cutover, ordinary validation SHALL verify the frozen
artifacts' identities, seals, and original capture binding; it SHALL NOT impose
historical output equality on arbitrary future source revisions.

The raw TS6 evidence and both migration projections SHALL remain byte-identical.
Historical replay SHALL refuse missing history, altered evidence, an unbound or
dirty replay tree, and a compiler other than the bound cutover compiler. Replay
SHALL NOT regenerate TS6 evidence or claim compiler-maintenance admission.
Future normal-compiler changes SHALL still satisfy ADR-0022 §10 and
`REQ-SC-006/007`, including the trusted predecessor boundary and freshness proof.

#### Scenario: Ordinary emitted source changes after cutover

- **GIVEN** the cutover is complete and the normal compiler is unchanged
- **WHEN** a captured TypeScript source changes and its emitted JavaScript changes
- **THEN** historical artifact validation SHALL pass with untouched TS6 evidence
- **AND** normal typecheck, lint, build, tests, and architecture gates SHALL remain applicable
- **AND** the changed source SHALL NOT be accepted as the historical replay subject

#### Scenario: Frozen evidence is rewritten

- **GIVEN** the recorded TS6 capture and projection identities
- **WHEN** any artifact is changed, deleted, or resealed after alteration
- **THEN** historical verification SHALL refuse it

#### Scenario: Compiler update attempts to borrow historical success

- **GIVEN** a candidate changes the normal compiler version
- **WHEN** historical integrity verification or cutover replay succeeds
- **THEN** that result SHALL NOT satisfy predecessor-bound compiler maintenance
- **AND** a candidate that changes a protected authority or supplies its own verifier SHALL be refused by the predecessor boundary

#### Scenario: Historical differential remains replayable

- **GIVEN** an authentic frozen capture and a clean checkout of the recorded cutover revision
- **WHEN** its exact frozen dependencies emit the bound historical source
- **THEN** the unchanged per-surface differential SHALL validate the cutover
- **AND** missing history, source drift, or compiler identity drift SHALL refuse replay
