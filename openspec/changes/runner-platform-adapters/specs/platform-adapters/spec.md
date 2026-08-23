# platform-adapters Specification Delta

## ADDED Requirements

### Requirement: The two coding adapters are admitted workspace packages with no runtime surface

The repository SHALL contain exactly two adapter packages in this landing:
`@secure-home/adapter-claude-code` at `agents/adapters/coding/claude-code/`
and `@secure-home/adapter-copilot-cli` at
`agents/adapters/coding/copilot-cli/`. Each SHALL be an explicit member of
the pnpm workspace and of the workspace layer map at a contract-shaped
layer (at or below the framework-guard threshold), SHALL declare zero
runtime dependencies (`dependencies`, `peerDependencies`, and
`optionalDependencies` all empty), and SHALL declare the four standard
scripts. The codex adapter directory SHALL remain README-only.

#### Scenario: The workspace admits the adapters

- **GIVEN** the two adapter packages and the updated workspace model
- **WHEN** the workspace and source-import checks run
- **THEN** both pass: each package is explicitly placed, direction is
  inward only, and no framework dependency is declared

#### Scenario: An unplaced adapter package is refused

- **GIVEN** an adapter package present in the pnpm workspace but absent
  from the layer map
- **WHEN** the workspace check runs
- **THEN** it fails naming the unplaced package

#### Scenario: A runtime dependency on the adapter is refused mechanically

- **GIVEN** an adapter declaring a framework package or a provider SDK as
  a runtime dependency
- **WHEN** the workspace check runs
- **THEN** it fails: the framework guard applies at the adapter's layer,
  and the change's own gates refuse a non-empty runtime dependency set

### Requirement: The adapter conforms to the frozen SPI without importing the deployable

Each adapter SHALL declare its own structural mirror of the frozen adapter
SPI value shapes (`services/runner-control/src/ports/values.ts`), covering
the invocation it consumes and the report it emits. No adapter source, in
any zone including tests, SHALL import `@secure-home/runner-control` or
any other deployable. A mechanical tether SHALL compare the mirror's field
inventory against the frozen SPI source text and SHALL refuse — not pass —
when the frozen source cannot be located or parsed.

#### Scenario: The mirror agrees with the frozen SPI

- **GIVEN** the frozen SPI source and both adapters' mirrors
- **WHEN** the conformance tether runs
- **THEN** it passes, deriving the expected field inventory from the
  frozen source at run time

#### Scenario: Mirror drift is refused

- **GIVEN** an adapter mirror missing a frozen field, carrying an extra
  field, or renaming one
- **WHEN** the conformance tether runs
- **THEN** it fails naming the field and the adapter

#### Scenario: A deployable import is refused in every zone

- **GIVEN** any adapter file — production or test — importing
  `@secure-home/runner-control`
- **WHEN** the source-import check runs
- **THEN** it fails: nothing may import a service, and test zones are not
  exempt from that rule

#### Scenario: An unlocatable frozen source is a refusal, not a pass

- **GIVEN** a tree where the frozen SPI source is absent or its shapes
  cannot be derived
- **WHEN** the conformance tether runs
- **THEN** it refuses loudly instead of skipping

### Requirement: One wire contract, identical across adapters

Each adapter SHALL ship a process entry implementing one shared wire
contract: a single JSON invocation document on stdin (the frozen
invocation shape minus the substrate-side abort signal); a single JSON
adapter report on stdout and nothing else ever on stdout; diagnostics on
stderr only; exit 0 whenever a report was emitted, regardless of the
report's outcome; and cancellation delivered as SIGTERM, forwarded to the
provider process, with the entry still emitting a well-formed report that
records the signal in its terminal observations. The wire contract SHALL
be byte-format identical across the two adapters.

#### Scenario: A valid invocation produces exactly one report

- **GIVEN** a valid wire invocation on stdin and a stub provider CLI
- **WHEN** the adapter entry runs
- **THEN** stdout contains exactly one JSON document, a well-formed
  adapter report, and the process exits 0

#### Scenario: A malformed invocation is refused through the contract

- **GIVEN** stdin bytes that are not a valid wire invocation (unknown
  keys, missing fields, wrong types, or not JSON)
- **WHEN** the adapter entry runs
- **THEN** it emits an `environmental_fault` report naming the refusal
  and exits 0 — the failure travels through the contract, not through a
  crash

#### Scenario: Cancellation is effective and observed

- **GIVEN** a running adapter entry whose stub provider ignores nothing
- **WHEN** SIGTERM is delivered to the adapter entry
- **THEN** the stub provider process receives termination, and the
  emitted report's terminal observations record the signal

### Requirement: The adapter translates and reports; it never decides

Each adapter SHALL translate the platform-built invocation into its
provider CLI's native surface and normalize what the provider did back
into observations. The capability grant SHALL narrow the provider-visible
tool surface (available/allowed sets plus explicit denials); the routing
fields SHALL pass through as data with no model identifier constant in
adapter source; usage SHALL be reported in the provider's native units
with no monetary field; provider events SHALL be normalized at the
boundary so no provider-native shape leaks upward; model output SHALL be
carried as untrusted claims; and the report vocabulary SHALL be closed to
`observed`, `environmental_fault`, and `stale_fence` — there SHALL be no
field through which an adapter can assert that a run succeeded.

#### Scenario: The grant narrows the provider tool surface

- **GIVEN** an invocation granting a strict subset of tools
- **WHEN** the adapter plans the provider launch
- **THEN** the planned argv narrows the provider's visible tools to the
  granted set and denies outside it, and contains no tool the grant does
  not name

#### Scenario: Terminal disagreement is carried, not resolved

- **GIVEN** a provider run whose process exit and self-reported outcome
  disagree (the L6 exit-124 versus `exitCode: 0` case)
- **WHEN** the adapter normalizes the run
- **THEN** both observations appear, unreconciled, in the terminal
  observations

#### Scenario: No success authority exists in the report shape

- **GIVEN** any adapter report either adapter can emit
- **WHEN** its shape is inspected against the frozen vocabulary
- **THEN** no terminal-state assertion exists: `observed` carries only
  observations, and the other outcomes carry only detail strings

#### Scenario: Routing is data, not knowledge

- **GIVEN** the adapters' production source
- **WHEN** it is scanned for model identifiers
- **THEN** none exists as a constant: the model route travels from the
  invocation into the provider surface unchanged

### Requirement: Credentials exist only as references

The wire invocation SHALL carry credential references as environment
variable names only, preserving the frozen SPI's value-free shape. No
launch plan, report, fixture, or test artifact SHALL contain a
credential-shaped value, and the adapter SHALL never read, print, or
forward the contents of any credential variable.

#### Scenario: The reference shape survives translation

- **GIVEN** an invocation naming credential environment variables
- **WHEN** the adapter plans the provider launch
- **THEN** the plan names which variables the substrate must provision
  and contains no value slot for any of them

#### Scenario: A credential-shaped value is refused by the repository

- **GIVEN** the authored adapter sources, fixtures, and goldens
- **WHEN** the repository secret scan runs
- **THEN** it passes with no adapter-scoped allowlist entry

### Requirement: Transcript consumption is defensive

Everything an adapter reads from a provider — stdout bytes, persisted
event files, exit metadata — SHALL be treated as untrusted input.
Malformed lines, truncated documents, prose-prefixed output, oversized
payloads, and injection-shaped content SHALL degrade to recorded
observations or an `environmental_fault` report, never to an uncaught
crash, never to widened behavior. Observation capture SHALL respect the
invocation's output budget. This is the L7 re-proof of PROP-006: the
consumer of untrusted bytes re-verifies rather than trusts.

#### Scenario: Hostile transcripts never crash the adapter

- **GIVEN** the hostile transcript corpus (malformed JSONL, truncation
  mid-document, prose before JSON, oversized lines, content that mimics
  the wire report framing)
- **WHEN** each corpus entry is fed through the adapter's observation path
- **THEN** every entry yields a well-formed report; none yields an
  uncaught exception

#### Scenario: Transcript content cannot forge the adapter's own report

- **GIVEN** a stub provider whose output embeds a syntactically valid
  adapter report
- **WHEN** the adapter entry runs
- **THEN** the emitted report is the adapter's own: the embedded document
  appears only as untrusted claim or event data

#### Scenario: The output budget bounds capture

- **GIVEN** a stub provider emitting more than the invocation's output
  budget
- **WHEN** the adapter normalizes the run
- **THEN** captured claims and events stay within the budget and the
  truncation is itself observable

### Requirement: Framework conformance is proven by one shared suite

`tests/framework-conformance/` SHALL contain the shared suite, written
once and applied to both adapters, running offline against deterministic
stub CLIs with no credential and no network. It SHALL prove: the same
logical run through either adapter produces the identical contract shape
(same wire report grammar, same observation field inventory, same
lifecycle event vocabulary where the adapter owns the vocabulary);
cancellation is effective for every adapter; failure is reported through
the contract; and an adapter cannot widen its invocation. Per-adapter
variants of a shared assertion SHALL NOT exist.

#### Scenario: The same logical run yields the identical contract

- **GIVEN** one golden logical run expressed neutrally and both adapters
- **WHEN** the suite drives each adapter's entry with its provider stub
- **THEN** the two reports agree on grammar, observation field inventory,
  call dispositions, and adapter-owned event vocabulary, differing only
  in provider-native data values

#### Scenario: The suite is one suite

- **GIVEN** the conformance sources
- **WHEN** the assertions are inspected
- **THEN** each shared property is asserted once, parameterized over the
  adapters — not copied per adapter

#### Scenario: An invocation cannot be widened

- **GIVEN** invocations carrying unknown fields, out-of-grant tools, or
  substrate-only concerns (image names, mount paths, argv)
- **WHEN** each adapter processes them
- **THEN** unknown fields are refused, out-of-grant tools appear only as
  denials, and no substrate concern reaches a launch plan

### Requirement: Adapters are unlaunchable and inert at L7

No platform code path SHALL invoke an adapter: no member outside
`agents/adapters/` SHALL declare or import either adapter package;
`services/runner-control` SHALL remain byte-identical to its pre-change
state; importing an adapter package SHALL have no side effects; and the
platform contract corpus SHALL show zero schema diff at the completion
head — re-running the L2 neutrality proofs (C-EX-002, C-PROP-002,
C-PROP-004) green with two real adapters present is this landing's
INV-002 re-proof.

#### Scenario: Nothing references the adapters

- **GIVEN** every workspace manifest and production source outside
  `agents/adapters/`
- **WHEN** the conformance suite scans for the adapter package names
- **THEN** none appears

#### Scenario: The deployable is untouched

- **GIVEN** the completion head and the change's base commit
- **WHEN** `services/runner-control/` is diffed between them
- **THEN** the diff is empty

#### Scenario: Zero schema diff with adapters present

- **GIVEN** the completion head
- **WHEN** the contracts conformance suite runs and `schemas/` is diffed
  against the base commit
- **THEN** the suite passes and the diff is empty

### Requirement: Each adapter normalizes against its paired pinned provider

The Claude adapter SHALL target exactly the CLI version pinned in the
`secure-home-runner-claude` image (`@anthropic-ai/claude-code@2.1.241`);
the Copilot adapter SHALL target exactly the CLI version the L6 spike
evidenced and the `secure-home-runner-copilot` image pins
(`@github/copilot@1.0.79`). Each adapter SHALL record its normalization
basis — which provider surfaces it reads and why — in its README, and
every Copilot mapping decision SHALL trace to a named L6 spike finding.
The adapter SHALL carry its target version as data used for verification,
not as an assumption that other versions work.

#### Scenario: The pinned versions agree across adapter and image

- **GIVEN** each adapter's declared provider target and the image lock
- **WHEN** the conformance suite compares them
- **THEN** they are equal, per adapter

#### Scenario: Copilot mappings trace to spike evidence

- **GIVEN** the Copilot adapter's translation and observation mappings
- **WHEN** its README's normalization-basis table is read
- **THEN** each mapping names the L6 finding (SPIKE-01 … SPIKE-05 or a
  cross-cutting finding) it rests on
