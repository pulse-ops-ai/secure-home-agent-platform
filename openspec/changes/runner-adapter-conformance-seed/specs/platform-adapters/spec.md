# platform-adapters Specification Delta

## ADDED Requirements

### Requirement: Real adapter reports are proven adapter-neutral through the execution-port consumer path

The conformance suite SHALL obtain each coding adapter's **real**
`AdapterReport`, carry it through the runner's real
`AdapterInvocationPort` **consumer path** — the port call site, the
trusted terminal classification, and the call-recording transform — and
SHALL compare what the platform observably produces from it: run events
and evidence, rather than the adapter report alone.

The suite SHALL NOT claim that an adapter is itself the implementation
behind `AdapterInvocationPort`. It is not: the adapter process runs to
completion first, and a value-returning port double carries its report
into the run. Constructing a port implementation that launches a
provider from inside `invoke()` is L9's, and is out of scope here.

The invocation inputs that the logical run does **not** bind to a
provider — run identity, requester and principal, input, gates,
workspace root, pinned base, artifact paths, fence generation, routing
class and route, limits, and the *shape* of the capability grant (mounts,
network policy, credential references, and the number and semantics of
granted tools) — SHALL be held identical across adapters.

The concrete **provider-binding model** SHALL be the one recorded by this
landing's external authority. The plan's proposed model — one logical
run under two provider-bound profiles, necessitated because
`runtime.adapter` and `runtime.image_digest` are execution-profile fields
and the runner derives the invoked adapter from the captured profile —
SHALL NOT be implemented before that authority is recorded. Under any
authorized model, values the profile binds to a provider MAY differ
between runs and SHALL each equal the corresponding field of the profile
actually captured for that run.

#### Scenario: The same logical run yields the same platform-observable contract

- **GIVEN** one logical invocation and both adapters' real reports
  carried through the real port consumer path and interpretation
- **WHEN** the platform's events and evidence are compared
- **THEN** every field classified as adapter-neutral agrees exactly, and
  the run reaches the same lifecycle classification and outcome

#### Scenario: The binding model is not implemented before its authority is recorded

- **GIVEN** a provider-binding model that the landing's external
  authority has not recorded
- **WHEN** implementation is attempted
- **THEN** it does not proceed — an OpenSpec artifact ranks below its
  external task contract and cannot authorize the model itself

#### Scenario: The proof runs offline and launches nothing

- **GIVEN** the execution-port harness
- **WHEN** it runs
- **THEN** it contacts no provider and no network, holds no credential,
  starts no container, and constructs no port implementation capable of
  launching a process

#### Scenario: A test that bypasses the port does not count as this proof

- **GIVEN** an assertion that reads adapter internals directly instead of
  observing the platform's output through the port
- **WHEN** the suite's structure is inspected
- **THEN** that assertion is not admissible as execution-port evidence —
  the proof reads only what the platform produced after `invoke()`
  returned

### Requirement: Adapter-neutral and provider-native facts are separated explicitly

The suite SHALL carry an explicit, mechanically-applied classification of
every compared fact as either adapter-neutral (MUST agree) or
provider-native (MAY differ).

Adapter-neutral SHALL include at minimum: the platform event-type
vocabulary and its ordering, event shape per type, call disposition
semantics, lifecycle classification and terminal outcome, run identity,
fence generation, principal, routing class and route, limits, the
evidence field grammar (the key inventory of the assembled bundle), and
the grant-to-evidence binding.

Provider-native SHALL include at minimum: the evidence `adapter` field,
the evidence `image_digest`/runtime identity, the profile identity and
digest, provider tool names wherever they appear (`capability.tools`,
`operation.name`), native usage units and amounts, provider event payload
data, the operator-facing diagnostic detail of a platform classification
where it quotes a provider observation, and the observable dialect by
which an out-of-grant operation fails to be permitted.

A fact SHALL NOT be compared under a classification it was not assigned,
and a provider-native value SHALL NOT be exempt from its binding
obligation merely because it is allowed to differ.

#### Scenario: Provider-native difference alone does not fail the proof

- **GIVEN** two runs whose reports differ only in provider tool names,
  native usage units, or provider event data
- **WHEN** the neutrality comparison runs
- **THEN** it passes — native facts remain native (ADR-0013 decision 6)

#### Scenario: An unclassified compared fact is refused

- **GIVEN** a compared field that appears in neither classification
- **WHEN** the comparison runs
- **THEN** it fails rather than defaulting the field to either class — an
  unclassified fact is an unproven one

### Requirement: A real divergence is named, never averaged away

Where the adapters produce facts that contradict one another for the
same logical case, the suite SHALL fail and name the divergence: the
field, both values, and the classification under which it was compared.
The suite SHALL NOT contain any normalization step that rewrites
contradictory provider facts into equal values before comparison, and
SHALL NOT relax a classification to make a failing comparison pass.

#### Scenario: Operations are aligned by ordinal, never by provider name

- **GIVEN** a case declaring corresponding operation sequences, whose
  recorded operations carry platform-assigned positional identities
- **WHEN** the dispositions are compared
- **THEN** the i-th operation of one run is compared with the i-th of the
  other and their dispositions must agree, while their provider-native
  names are free to differ

#### Scenario: A length mismatch in an aligned case is a divergence

- **GIVEN** a case declaring corresponding operation sequences whose
  recorded operation counts differ
- **WHEN** the comparison runs
- **THEN** it fails naming the mismatch, and does NOT fall back to
  comparing only a shared property

#### Scenario: A declared dialect divergence is compared by shared property

- **GIVEN** a case declaring a dialect divergence — one provider records
  a denied operation where the other records none
- **WHEN** the comparison runs
- **THEN** the sequences are not zipped positionally; the shared property
  is asserted instead — no permitted operation exists for the
  out-of-grant request

#### Scenario: Contradictory permission outcomes fail loudly

- **GIVEN** one adapter reporting an operation permitted and the other
  reporting the same logically-granted operation not permitted
- **WHEN** the comparison runs
- **THEN** it fails naming the operation, both dispositions, and the
  platform positions that diverged

#### Scenario: A normalization that manufactures equality is refused

- **GIVEN** a change that maps two contradictory provider values onto one
  platform value before comparison
- **WHEN** the suite's own guards run
- **THEN** they fail — equality must be observed, never manufactured

### Requirement: Platform-structural positions carry no provider vocabulary

No provider-native token SHALL occupy a platform-**structural** position
in what the platform emits: event types, disposition values, lifecycle
states, terminal outcomes, and evidence field names are platform-owned.
This is ADR-0003's rule (lines 88–92) and no wider: a provider name "may
appear only as an *opaque value*", so provider-native tokens remain
admissible in positions the contract designates as data — including an
operator-facing diagnostic detail string. A diagnostic string SHALL NOT
be treated as a structural position.

#### Scenario: A provider frame name reaching a structural position is refused

- **GIVEN** a run whose provider dialect places a provider-specific token
  into a platform-structural position — an event type, disposition,
  lifecycle state, terminal outcome, or evidence field name
- **WHEN** the suite scans the platform's emitted events and evidence
- **THEN** it fails naming the token and the position

#### Scenario: Provider vocabulary in a diagnostic detail string is not a structural violation

- **GIVEN** a platform classification whose detail string quotes the
  provider's own observation
- **WHEN** the structural-position scan runs
- **THEN** it does not fail on that string — the detail is data; what
  must agree across adapters is the classification kind and the terminal
  outcome, which a separate requirement covers

### Requirement: Authority is adapter-independent, and provider identity is bound to the captured profile

Every identity the platform records SHALL derive from captured authority,
never from anything an adapter reports. Identities the logical run does
not bind to a provider — run identity, fence generation, principal,
routing class and route, and limits — SHALL be identical across adapters.
Identities the run does bind to a provider — the evidence `adapter`
field, the image digest, and the profile identity and digest — MAY differ
and SHALL each equal the corresponding field of the profile actually
captured for that run.

#### Scenario: Run-scoped authority is identical across adapters

- **GIVEN** the same logical run through both adapters
- **WHEN** the assembled evidence is compared
- **THEN** run identity, fence generation, principal, routing class and
  route, and limits agree exactly

#### Scenario: Provider-bound identity matches its own captured profile

- **GIVEN** each run's captured execution profile
- **WHEN** the assembled evidence is compared against it
- **THEN** the evidence `adapter` equals that profile's `runtime.adapter`,
  the recorded image digest equals its `runtime.image_digest`, and the
  recorded profile identity and digest equal that captured profile's own
  identity and digest — the values differ between runs and each is
  correctly bound

#### Scenario: An adapter cannot rebind authority through its report

- **GIVEN** a report carrying values that resemble run, fence, profile,
  or adapter identity
- **WHEN** the platform assembles evidence
- **THEN** the recorded identities remain those of the captured
  authority, unchanged by the report
