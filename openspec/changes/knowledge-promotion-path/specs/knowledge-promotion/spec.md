# Spec Delta: knowledge-promotion

> **In force.** ADR-0014 was accepted 2026-08-15, so these requirements are
> obligations. The projection step remains blocked separately: no knowledge
> module may be authored until the ADR-0010 toolchain exists.

## ADDED Requirements

### Requirement: Canonical home chosen by the kind of durable truth

A durable truth SHALL be canonically stated exactly once, in the home determined
by its kind:

| Kind of truth | Canonical home |
|---|---|
| durable system architecture, architectural invariants | accepted ADRs and `docs/architecture/` |
| repository governance, coding-agent obligations, review policy | the applicable governed repository contract — `AGENTS.md`, `CONTRIBUTING.md`, or another explicitly authoritative contract |
| human operational procedures | `docs/operations/` |
| executable or normative platform contracts | their existing governed contract or specification owner |
| portable, agent-facing representation of any of the above | `knowledge/platform/` or `knowledge/runbooks/`, as a projection |

Every other layer SHALL be subordinate to that statement.

#### Scenario: A review discovers a durable engineering truth

- **WHEN** a falsification review establishes that a bound belongs at the port
  rather than at the call site
- **THEN** the truth is stated in canonical architecture
- **AND** any other layer that needs it is subordinate to that statement

#### Scenario: A finding is specific to one change

- **WHEN** a review finds a defect whose lesson does not generalize beyond the
  change that produced it
- **THEN** no canonical statement is created
- **AND** the determination that it was not durable is recorded in that change

#### Scenario: A projection restates its source in agent-facing form

- **WHEN** a knowledge module summarizes, subsets, transforms, reorganizes, or
  restates content from its governing canonical source
- **THEN** that is permitted and expected
- **AND** the module names the source, claims no independent authority, and
  remains subordinate to it

#### Scenario: A projection claiming to be the source (negative)

- **WHEN** a module states an invariant as its own original rather than as a
  projection
- **THEN** the change is incorrect
- **AND** the defect is the claim of authority, not the restating

#### Scenario: A projection that materially disagrees with its source

- **WHEN** a module's content materially disagrees with the canonical source it
  names
- **THEN** the module is defective
- **AND** the canonical source governs

#### Scenario: A procedure is not owned by the runbook that projects it

- **WHEN** a durable operational procedure is projected into
  `knowledge/runbooks/`
- **THEN** its canonical home remains the governed contract or
  `docs/operations/` document it belongs to
- **AND** the runbook SHALL NOT become the original merely because the content
  is a procedure rather than an invariant

### Requirement: A knowledge module names its governing canonical source

Every knowledge module and runbook SHALL identify the canonical source or
sources it projects.

#### Scenario: A module projecting a governance contract

- **WHEN** a module projects a coding-agent obligation
- **THEN** it names the governed repository contract that owns it
- **AND** that contract remains canonical

#### Scenario: A module naming no source (negative)

- **WHEN** a module identifies no governing canonical source
- **THEN** it is either a projection of nothing or an original in the wrong
  place
- **AND** both are defects

### Requirement: Provider artifacts are never the canonical home

A provider-native skill or provider instruction file SHALL NOT be the sole
canonical home of an architectural invariant, engineering policy, review policy,
or operational procedure. It MAY adapt a runtime to the platform — including how
that runtime discovers and queries the knowledge selected for a run.

#### Scenario: Information that must survive a runtime swap

- **WHEN** information must survive replacing a provider or runtime
- **THEN** its canonical source SHALL be provider-neutral
- **AND** where agents must reason from it, the appropriate subset is projected
  into portable knowledge
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
- **AND** the promotion path terminates at the canonical home

### Requirement: A proposed decision does not bind through a lower artifact

While a decision is `Proposed`, no obligation derived from it SHALL be
operative, and no lower-precedence artifact SHALL make it operative. Stated
generally: the rule outlives the instance that produced it, and ADR-0015 is
`Proposed` under it today.

#### Scenario: The contract describes a proposal

- **WHEN** a repository contract describes a rule whose decision is still
  `Proposed`
- **THEN** it states explicitly that the rule is non-operative
- **AND** the obligation takes effect only on acceptance

#### Scenario: A proposal made binding by a contract file (negative)

- **WHEN** a repository contract would present a `Proposed` decision's
  consequences as binding today
- **THEN** the instruction precedence order is inverted
- **AND** the change is incorrect
