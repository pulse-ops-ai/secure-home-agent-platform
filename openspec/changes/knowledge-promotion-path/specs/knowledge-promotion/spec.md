# Spec Delta: knowledge-promotion

## ADDED Requirements

### Requirement: Canonical home for a durable architectural truth

A durable architectural truth SHALL be canonically stated exactly once, in an
accepted ADR (why) or a `docs/architecture/` document (what follows). Every other
layer SHALL reference that statement rather than restate it.

#### Scenario: A review discovers a durable engineering truth

- **WHEN** a falsification review establishes that a bound belongs at the port
  rather than at the call site
- **THEN** the truth is stated in canonical architecture
- **AND** any other layer that needs it references that statement

#### Scenario: A finding is specific to one change

- **WHEN** a review finds a defect whose lesson does not generalize beyond the
  change that produced it
- **THEN** no canonical statement is created
- **AND** the determination that it was not durable is recorded in that change

#### Scenario: Two copies of a rule (negative)

- **WHEN** a change would state the same invariant in both an ADR and a
  knowledge module as independent originals
- **THEN** the change is incorrect
- **AND** the module SHALL project the canonical statement and reference it

### Requirement: Provider artifacts are never the canonical home

A provider-native skill or provider instruction file SHALL NOT be the sole
canonical home of an architectural invariant, engineering policy, review policy,
or operational procedure. It MAY adapt a runtime to the platform — including how
that runtime discovers and queries the knowledge selected for a run.

#### Scenario: Information that must survive a runtime swap

- **WHEN** information would still be required after replacing Claude with Codex
  or Copilot
- **THEN** it belongs in architecture, knowledge, a runbook, or a platform
  contract
- **AND** it SHALL NOT be recorded only in a provider artifact

#### Scenario: A runtime integration detail

- **WHEN** the information is how one runtime invokes a query interface
- **THEN** a provider artifact is an acceptable home
- **AND** the knowledge it queries remains canonical elsewhere

### Requirement: The image does not carry project knowledge

A runner image SHALL carry substrate and exactly one runtime. Project knowledge
SHALL reach a run through the profile-selected knowledge set, never through the
image.

#### Scenario: Knowledge is selected, not baked

- **WHEN** a run requires platform knowledge
- **THEN** the profile selects a named set
- **AND** the runner resolves it to exact module versions recorded before launch

#### Scenario: Knowledge baked into an image (negative)

- **WHEN** a change would add project knowledge to a derived runner image
- **THEN** the change is refused
- **AND** the reason is that the content would be invisible to the pre-launch
  record of what the run knew

### Requirement: Promotion does not confer authority

Projecting a canonical truth into a knowledge module SHALL NOT make the module
authoritative for that truth, and SHALL NOT grant any tool, capability, or
permission to override live state or an accepted ADR.

#### Scenario: A module and its canonical source disagree

- **WHEN** a knowledge module and the ADR it projects disagree
- **THEN** the ADR governs
- **AND** the module is the defect to fix

#### Scenario: Prohibited content cannot be promoted

- **WHEN** a durable truth cannot be stated without a secret, a live reading, an
  authorization tuple, or an exploitable specific
- **THEN** it is not promoted
- **AND** it remains canonically stated in `docs/`

### Requirement: A change determines whether to promote

A change or review that discovers a durable architectural truth SHALL determine
whether it must be promoted into canonical architecture and portable knowledge,
and SHALL record that determination. The obligation is the determination; a
negative answer satisfies it.

#### Scenario: Determination recorded as promoted

- **WHEN** the truth is durable and an agent must reason from it to work
  correctly
- **THEN** the change records the determination
- **AND** authoring is scheduled subject to U7

#### Scenario: Determination recorded as not promoted

- **WHEN** the truth is durable but only humans act on it
- **THEN** the change records that it stops at canonical architecture
- **AND** no knowledge module is created

#### Scenario: Authoring attempted while U7 is open (negative)

- **WHEN** a change would author a knowledge module before the OKF validator
  exists
- **THEN** the change is blocked by U7
- **AND** the promotion path terminates at canonical architecture
