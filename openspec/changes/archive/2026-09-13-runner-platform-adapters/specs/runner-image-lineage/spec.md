# runner-image-lineage Specification Delta

## MODIFIED Requirements

### Requirement: The L5 image inventory is exactly three definitions

The repository SHALL define exactly four images:
`secure-home-runner-base`, `secure-home-runner-claude`,
`secure-home-runner-copilot`, and `secure-home-gates-toolchain`. Every
image definition under `deploy/images/**` SHALL be registered in
`deploy/images/image-lock.yaml`, and every lock entry SHALL name an
existing definition. An image definition outside the registered inventory
SHALL be refused by the repository gates, and no further speculative
runtime image (Codex, custom-loop, PydanticAI, LangGraph, or a
runtime-named image such as `runner-kata`) SHALL exist in this landing.

#### Scenario: The registered inventory validates

- **GIVEN** the four registered image definitions and the lock
- **WHEN** the image lineage checker runs
- **THEN** it passes, reporting the four registered images

#### Scenario: An unregistered image definition is refused

- **GIVEN** a Dockerfile added under `deploy/images/runner-codex/` with no
  lock entry
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the unregistered definition

#### Scenario: A lock entry without a definition is refused

- **GIVEN** a lock entry whose `definition` path names no existing file
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the missing definition

## ADDED Requirements

### Requirement: The Copilot derived image carries exactly the pinned Copilot runtime

`deploy/images/runner-copilot/Dockerfile` SHALL be a `runner-derived`
definition whose parent is `secure-home-runner-base` at the exact recorded
base digest, and whose single registered runtime is `@github/copilot` at
the exact version the L6 spike evidence pins (1.0.79). The definition
SHALL declare the runtime through the well-known `RUNTIME_PACKAGE` and
`RUNTIME_VERSION` build arguments and consume them in an executed install
instruction; the runtime tarball, its per-platform executable package, and
its sole helper dependency (`detect-libc`, exact-version pinned) SHALL be
verified against recorded sha512 integrity values BEFORE installation; and
the definition SHALL assert the installed CLI answers `--version` at build
time. No second provider runtime, no credential, no provider
configuration, and no knowledge content SHALL exist in the image.

#### Scenario: The Copilot derived image validates

- **GIVEN** the registered `secure-home-runner-copilot` entry and its
  definition
- **WHEN** the image lineage checker runs
- **THEN** it passes: the parent digest chain matches the base entry
  byte-for-byte, the declared runtime matches the lock registration, and
  the declaring arguments are consumed by an executed instruction

#### Scenario: A second provider family in the Copilot image is refused

- **GIVEN** the Copilot definition with any second provider family token
  introduced into its runtime identity or install path
- **WHEN** the image lineage checker runs
- **THEN** it fails naming the foreign provider family

#### Scenario: Helper dependencies do not widen the registered runtime

- **GIVEN** the pinned `detect-libc` helper package installed in the same
  offline install step as the runtime
- **WHEN** the image lineage checker runs
- **THEN** it passes: the helper carries no provider family token and the
  lock still registers exactly one runtime for the image

#### Scenario: The Copilot digests exist only from the governed build

- **GIVEN** the fresh lock entry carrying the bootstrap sentinel
- **WHEN** governed verification runs before any governed CI build has
  recorded real digests
- **THEN** it fails loudly, naming the sentinel and instructing that the
  recorded digests come only from the governed CI evidence
