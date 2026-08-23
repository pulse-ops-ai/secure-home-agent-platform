# runner-image-lineage Specification Delta

## ADDED Requirements

### Requirement: The L5 image inventory is exactly three definitions

The repository SHALL define exactly three images in this landing:
`secure-home-runner-base`, `secure-home-runner-claude`, and
`secure-home-gates-toolchain`. Every image definition under
`deploy/images/**` SHALL be registered in `deploy/images/image-lock.yaml`,
and every lock entry SHALL name an existing definition. An image definition
outside the registered inventory SHALL be refused by the repository gates,
and no speculative runtime image (Copilot, Codex, custom-loop, PydanticAI,
LangGraph, or a runtime-named image such as `runner-kata`) SHALL exist in
this landing.

#### Scenario: The registered inventory validates

- **GIVEN** the three registered image definitions and the lock
- **WHEN** the image lineage checker runs
- **THEN** it passes, reporting the three registered images

#### Scenario: An unregistered image definition is refused

- **GIVEN** a Dockerfile added under `deploy/images/runner-codex/` with no
  lock entry
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the unregistered definition

#### Scenario: A lock entry without a definition is refused

- **GIVEN** a lock entry whose `definition` path names no existing file
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the missing definition

### Requirement: The base image definition is provider- and framework-neutral

The `secure-home-runner-base` definition SHALL contain no provider,
framework, or container-runtime name in any position — instruction,
argument, or comment — and SHALL contain no provider SDK, provider CLI,
framework runtime, or provider credential handling. The neutrality token
list SHALL be data shared with the platform's structural-neutrality proof,
not a second hand-maintained vocabulary.

#### Scenario: A neutral base passes

- **GIVEN** the authored `runner-base` Dockerfile
- **WHEN** the image lineage checker runs
- **THEN** the base neutrality check passes

#### Scenario: A provider name in the base definition is refused

- **GIVEN** a `runner-base` Dockerfile containing a provider token in any
  position
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the token and the file

### Requirement: The base image carries no decision-bearing authority

The base image SHALL carry only a minimal OS surface, process/bootstrap
support, and non-decision-bearing filesystem conventions for platform
event/evidence plumbing. It SHALL NOT contain, relocate, or reimplement any
`runner-control` decision-bearing responsibility: authority acquisition,
profile-authority decisions, policy interpretation, gate membership,
deterministic classification, lifecycle authority, finalization or
evidence-sealing authority, authorization, or any L9 enforcement decision.
No `runner-control`, `runner-core`, or platform service code SHALL be
copied into any L5 image.

#### Scenario: The base definition installs no platform code

- **GIVEN** the authored image definitions
- **WHEN** the image lineage checker runs
- **THEN** no Dockerfile copies from `services/**` or `packages/**`, and
  the check that refuses such a COPY/ADD passes

#### Scenario: Platform code copied into an image is refused

- **GIVEN** an image definition containing
  `COPY services/runner-control /opt/control`
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the decision-bearing path

### Requirement: A derived runner image adds exactly one pinned runtime

`secure-home-runner-claude` SHALL derive from the exact
`secure-home-runner-base` identity recorded in the lock, SHALL add exactly
one provider runtime (Claude Code) at one exact pinned version, SHALL carry
only dependencies that runtime requires, and SHALL contain no second
provider or framework runtime and no credential. The pinned runtime version
in the definition SHALL equal the lock's recorded runtime version.

#### Scenario: The reference derived image validates

- **GIVEN** the authored `runner-claude` definition and lock entry
- **WHEN** the image lineage checker runs
- **THEN** exactly one declared runtime is found, its pinned version
  matches the lock, and no foreign provider token appears

#### Scenario: A second provider runtime is refused

- **GIVEN** a `runner-claude` definition that also installs a Copilot CLI
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the second runtime token

#### Scenario: A version drifting from the lock is refused

- **GIVEN** a definition pinning a runtime version different from the
  lock's `runtime.version`
- **WHEN** the image lineage checker runs
- **THEN** it fails naming both versions

#### Scenario: A runtime identity resolving to two providers is refused

- **GIVEN** a lock `runtime` whose name or package text carries a second
  provider's tokens
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the providers, and the extra tokens never enter
  the definition's allowed set

### Requirement: The gates-toolchain image is an independent lineage

`secure-home-gates-toolchain` SHALL NOT derive from
`secure-home-runner-base`, SHALL contain no provider agent runtime and no
credential, SHALL carry the toolchain surface the governed repository gates
actually invoke (derived from the merge-gate and `scripts/check.sh`
inventory), SHALL be independently pinned, and SHALL be suitable for later
network-isolated gate execution — resolving its toolchains from image
contents rather than run-time fetches — without claiming that any network
enforcement exists today.

#### Scenario: The gates image validates as independent

- **GIVEN** the authored gates-toolchain definition and lock entry
- **WHEN** the image lineage checker runs
- **THEN** its lineage class is independent, its external base is
  digest-pinned, and no provider token appears

#### Scenario: A provider runtime in the gates image is refused

- **GIVEN** a gates-toolchain definition installing any provider agent CLI
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the provider token

### Requirement: Image identity is an immutable digest with disambiguated kinds

Every external OCI base reference in any Dockerfile SHALL be pinned by
immutable `sha256` digest — a tag alone SHALL be refused. The lock SHALL
record, for every image, the OCI **image-index digest** as the canonical
locked identity and the **per-platform manifest digest** for each declared
platform (`linux/amd64`, `linux/arm64`), so that "image digest" is never
ambiguous between index digest, platform manifest digest, config digest, or
a local image ID. A future profile pins the index digest; the artifact a
future runtime actually consumes is identified by the per-platform manifest
digest the lock maps it to.

#### Scenario: A floating external base is refused

- **GIVEN** a Dockerfile whose external `FROM` names a tag with no digest
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the unpinned reference

#### Scenario: Both digest kinds are recorded

- **GIVEN** a lock entry with a resolved identity
- **WHEN** the lock is validated
- **THEN** it carries one index digest and one manifest digest per declared
  platform, each in `sha256:<64 hex>` form

### Requirement: The lock is a validated contract whose lineage chain cannot drift

`image-lock.yaml` SHALL be machine-validated: schema shape, canonical key
order, registered names, digest forms, and lineage classes. For the derived
image, the recorded `parent_digest` SHALL equal the base entry's recorded
digest exactly; a base digest change that does not propagate to the derived
entry SHALL be refused, as SHALL a derived entry claiming a stale or
foreign parent. Provider identity SHALL appear in the lock only as data
values, never as a structural key.

#### Scenario: A consistent chain validates

- **GIVEN** a lock whose derived `parent_digest` equals the base digest
- **WHEN** the image lineage checker runs
- **THEN** the chain check passes

#### Scenario: An unpropagated base digest is refused

- **GIVEN** a lock whose base digest changed while the derived
  `parent_digest` still records the old value
- **WHEN** the image lineage checker runs
- **THEN** it fails naming both digests

#### Scenario: A hand-edited digest cannot survive verification

- **GIVEN** a lock digest that does not match what the governed build path
  rebuilds for the same definition
- **WHEN** the governed build verification runs
- **THEN** it fails naming the expected and recorded digests

### Requirement: Real digests come only from the governed build path

No coding agent SHALL run a deployment asset locally to produce an image
identity. Image digests SHALL be produced and verified by the governed CI
build path, which builds every registered image for every declared platform
and compares the resulting digests to the lock; a mismatch SHALL fail. The
explicit bootstrap sentinel `pending-first-governed-build` SHALL be valid
lock **syntax** while identities are unestablished, SHALL cause the
governed build verification to fail with the freshly built digests
reported as the evidence to record, and SHALL never be treated as a
completed identity. Reproducibility SHALL be claimed only as the property
the mechanism proves: an identical definition rebuilt by the governed path
yields identical digests.

#### Scenario: Bootstrap is loud, never complete

- **GIVEN** a lock entry whose digest is the bootstrap sentinel
- **WHEN** the governed build verification runs
- **THEN** it fails, reporting the built digests for recording

#### Scenario: A recorded digest is re-proved at head

- **GIVEN** a lock with recorded digests and an unchanged definition
- **WHEN** the governed build verification runs at the PR head
- **THEN** the rebuild produces the same digests and the check passes

### Requirement: L5 images are inert

No file under `profiles/**` SHALL reference an L5 image name or digest. No
launcher, Docker socket, or container-runtime authority SHALL be introduced
into `services/runner-control`. No concrete execution runtime SHALL be
selected or configured: `deploy/runtime/` SHALL contain only its README,
and no image or directory SHALL conflate workload identity with
isolation-runtime identity. No knowledge content SHALL be packaged into any
image.

#### Scenario: A profile referencing an image is refused

- **GIVEN** a file under `profiles/` naming `secure-home-runner-claude`
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the referencing file

#### Scenario: Runtime configuration appearing under deploy/runtime is refused

- **GIVEN** any file other than `README.md` under `deploy/runtime/`
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the file

#### Scenario: A launcher token in runner-control is refused

- **GIVEN** `services/runner-control` source containing a Docker socket or
  container-launch token
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the token and file

### Requirement: Platform contracts remain provider-neutral through this landing

This landing SHALL change no platform contract, and the landed
structural-neutrality proof (adapter-neutrality conformance over the
published schema corpus) SHALL hold unchanged at the completion head.
Adding a future provider image SHALL require only a new image directory and
lock entry — no schema, contract, or checker vocabulary change beyond
registering the new image.

#### Scenario: The neutrality corpus proof holds

- **GIVEN** the completion head of this change
- **WHEN** the contract conformance suite runs
- **THEN** the structural-neutrality proof passes with zero schema changes
  in the diff

#### Scenario: A future provider image needs no taxonomy change

- **GIVEN** a hypothetical later `runner-copilot` directory and lock entry
  following the same shape
- **WHEN** the image lineage checker validates the extended fixture
- **THEN** it passes with no change to the checker's structural vocabulary
