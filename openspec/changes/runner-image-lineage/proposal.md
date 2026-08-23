# Change Proposal: runner-image-lineage

## Why

L4 (#27, `runner-control` orchestration, merged PR #82) completed the last
prerequisite in the runner program's DAG ahead of image lineage. The program
index (#19) names **L5 / #53** as the next runner landing, and #53 records
the owner's authorization to begin it. Everything the platform says about
runner images today is prose: `deploy/images/README.md` declares a lineage
("Status: no image exists"), ADR-0011 fixes one-runtime-per-derived-image,
and the execution-profile contract already carries a digest-typed
`runtime.image_digest` field — but there is no image definition, no immutable
identity, no lineage record, and no mechanism that could refuse a violation
of any of those rules.

Evidence motivating this change:

- GitHub issue **#53** — the external authority anchor and decomposition
  contract for L5, including the exact three-image inventory, the base-image
  trust boundary, the repository structure, the `image-lock.yaml`
  obligation, and the build-authority boundary.
- GitHub issue **#19** — the program index: "L5 — Image lineage (#53) —
  next runner landing; L4 prerequisite satisfied."
- `openspec/specs/runner-adoption/spec.md` — the ratified constitution whose
  INV-002 (structural neutrality), INV-012 (container-runtime neutrality),
  and INV-015 (trust preserved to the final consumer) L5 inherits, with
  PROP-004 and PROP-006 named for re-proof at L5 by the archived assurance
  traceability ("re-proof at L5, L7, L9").
- The archived constitution's design **D7** ("Image lineage; the gate
  toolchain leaves the runner lineage"), which defers the gates-toolchain
  name and registry placement to exactly this landing.
- ADR-0011's validation obligations #2 (a build-time check that a derived
  image contains exactly one coding agent) and #5 (base-image rebuild
  propagation; digests recorded for provenance) — both unowned today.

## Problem

**What happens today.** `deploy/images/` contains one README describing an
intended lineage and nothing else. A profile cannot pin an image digest
because no digest exists. Nothing enforces that a base image stays
provider-neutral, that a derived image carries exactly one runtime, that an
external base is immutable, or that a derived image names the exact base it
was built from. The repository has no machine-readable statement of image
identity at all, so ADR-0011's structural credential-isolation argument has
no artifact to attach to.

**What should be possible instead.** Three authored, digest-pinnable image
definitions — the provider-neutral `secure-home-runner-base`, the
`secure-home-runner-claude` reference derived image, and the independent
`secure-home-gates-toolchain` — plus a machine-validated
`deploy/images/image-lock.yaml` that makes every lineage claim mechanically
checkable, and a governed build path that can produce real immutable
digests without any agent running Docker locally.

**Consequence of leaving it.** L7 (#55) cannot land the Copilot derived
image without a base to derive from; every later landing would inherit an
unpinned, unverifiable image story; and the "one runtime per derived image"
rule remains a sentence rather than a control.

## Proposed Capability

A **runner image lineage capability**: the repository owns image
definitions whose identity is immutable digests, whose lineage
(base → derived; gates-toolchain independent) is recorded in a
machine-readable lock, whose invariants — provider neutrality of the base
and gates images, exactly one pinned runtime in a derived image, exact
parent-digest chaining, immutable external references — are mechanically
enforced by a repository checker with adversarial tests, and whose real
digests are produced only through a governed CI build path. The images are
**inert**: nothing references, launches, or deploys them.

## Scope

### In scope

- The three L5 image definitions and their per-image READMEs.
- `deploy/images/image-lock.yaml` — the machine-readable lineage/pinning
  record — and its strict validation grammar.
- `scripts/check-images.mjs`, the lineage checker, wired into `check.sh`,
  `package.json`, and the unconditional governance job; adversarial
  coverage in `tests/test_image_lineage.py`.
- The governed CI build/verify path (`.github/workflows/images.yml`) that
  produces and re-verifies real image digests without local Docker use —
  the mechanism #53 requires this change to identify, proven necessary in
  `design.md`.
- `deploy/images/scripts/{build.sh,verify.sh,inspect.sh}` — CI-side build
  tooling, authored here and never executed locally by a coding agent.
- `deploy/runtime/README.md` — taxonomy only — and the `deploy/README.md` /
  `deploy/images/README.md` updates that retire the "nothing exists" status
  prose.

### Out of scope

Owned by later landings, explicitly not hidden here:

- The Copilot derived image and both platform adapters — **L7 / #55**.
- Any launcher, Docker socket, container start, or physical
  filesystem/network/process/resource enforcement — **L9 / #57**, behind
  the U4 ADR (#9).
- Runner-control placement — **U4 / #9**.
- Concrete execution-runtime selection or configuration (Kata, runc,
  containerd, QEMU) — L9 or a separately authorized prerequisite;
  `deploy/runtime/` gains taxonomy only.
- Profile authoring or activation: no profile may reference an L5 image.
- Knowledge runtime integration (packaging sets, mounting releases,
  resolvers, `knowledge.selection` wiring) — issue #93; #87 likewise
  untouched.
- Registry publication and image distribution: no image is pushed anywhere.
- Codex, custom-loop, PydanticAI, LangGraph, or any other speculative
  runtime image.

## Affected Areas

- `deploy/images/**` (new structure), `deploy/runtime/README.md` (new),
  `deploy/README.md`, `deploy/images/README.md` (rewritten status and
  contract).
- `scripts/check-images.mjs` (new), `scripts/check.sh`, `scripts/README.md`,
  root `package.json` (one script entry).
- `.github/workflows/checks.yml` (one governance step),
  `.github/workflows/images.yml` (new — the governed build path).
- `tests/test_image_lineage.py` (new).
- No change to `packages/**`, `services/**`, `profiles/**`, `schemas/**`,
  `knowledge/**`, or any platform contract.

## Governance

Governing ADRs, from the docs/decisions/INDEX.md "which ADRs apply" table:

- **ADR-0011** — the lineage rule itself: neutral base, one pinned runtime
  per derived image, no multi-provider image, provider names only as image
  name and adapter value.
- **ADR-0003** — the neutrality rule the images must not erode: no provider
  or framework name in a structural position of any platform contract.
- **ADR-0006** — one agent implementation ≠ one image; images identify
  execution runtimes, not implementations, profiles, or knowledge sets.
- **ADR-0013** — adapters translate and report; nothing in an image may own
  a decision. Provider identity in the SPI is data.
- **ADR-0002** — deployment assets target Docker Compose on the Pi; images
  are authored assets, never run from a coding-agent task.
- **ADR-0012** — repository tooling and CI model the checker and workflow
  extend (unconditional governance gates, SHA-pinned actions).

Declared unresolved-decision dependencies:

- **Depends on U1–U11:** `none`. U4 (runner-control placement) is
  deliberately **not** consumed: this change selects no execution runtime,
  adds no launcher, and decides no placement. Work that would need U4 stops
  at the L9 gate, as the constitution requires.

This change proposes **no ADR status change**.

## Trust / Security / Data Considerations

- **Runner machinery:** yes — this change authors the untrusted workload
  substrate's *definition*. The trust split is load-bearing:
  decision-bearing orchestration stays in `services/runner-control`
  (trusted, outside the image); the images carry no authority, no
  credential, no policy interpretation, and no lifecycle/finalization
  authority. `design.md` § The trust split is the normative statement.
- **Supply chain:** yes — every external input is pinned (digest-pinned
  OCI bases, checksum-verified toolchain archives, an exact
  integrity-recorded provider package, exact-version-pinned apt packages), and the lock
  makes the chain refusable rather than aspirational.
- **Authorization / authentication / PII / persistence / migrations /
  transactions:** not applicable — nothing executes, nothing stores.
- **Public contracts:** none change. The adapter-neutrality conformance
  suite re-runs unchanged as the INV-002/PROP-004 re-proof.
- **Deployment:** none. Authoring is not deploying (`deploy/AGENTS.md`);
  CI builds produce digests and discard the artifacts; nothing is
  published, started, or configured.

## Existing Evidence

- `packages/contracts/src/execution-profile/execution-profile.ts` —
  `runtime.image_digest: Digest` (`sha256:<64hex>`): the future consumer
  seam the lock must feed.
- `packages/events/src/evidence.ts` / `evidence-v1.ts` — `image_digest`
  in the evidence bundle: the provenance field trust-boundary crossing
  B3→B4 records (`docs/architecture/trust-boundaries.md`).
- `packages/contracts/src/conformance/adapter-neutrality.test.ts` and
  `helpers.ts` `FORBIDDEN_STRUCTURAL_NAMES` — the landed INV-002/PROP-004
  mechanism this change re-runs and whose token list the image checker
  mirrors as data.
- `docs/architecture/runner-model.md` § Runner classes — coding runners run
  on "the Pi or a workstation": the two-platform (linux/arm64 +
  linux/amd64) requirement.
- `.github/workflows/checks.yml` — the CI governance model (SHA-pinned
  actions, unconditional governance job) the build path extends; the
  repository has **no** existing image build or registry path.
- Issues #53, #19, #55, #57 read at authoring time (2026-08-23); the
  archived `runner-baseline-adoption` change (D7, assurance traceability,
  the L5 decomposition contract).

## Dependencies

- **Already implemented:** L2 contracts (`packages/contracts`,
  `packages/events`), L3 `runner-core`, L4 `runner-control` (PR #82) — the
  L5 prerequisite recorded satisfied in #53/#19.
- **Accepted decisions:** ADR-0003/0006/0011/0013 (all Accepted).
- **External:** Docker Hub (`debian:trixie-slim` by digest),
  `deb.debian.org` (exact-version-pinned packages), `nodejs.org` and
  `github.com/astral-sh/uv` release artifacts (checksum-verified),
  `registry.npmjs.org` (`@anthropic-ai/claude-code`, exact version +
  integrity). All resolved and recorded at authoring time; none is fetched
  at run time by anything this change lands.

## Success

An owner reviewing the draft PR can, without running anything locally:

1. read `image-lock.yaml` and see exactly which bytes every image identity
   derives from, including the base → Claude digest chain;
2. see the repository refuse — with tests exercising the real checker — a
   provider name in the base, a second runtime in the derived image, a
   broken parent chain, a floating external reference, an unregistered
   image, a profile referencing an image, or runtime configuration
   appearing under `deploy/runtime/`;
3. see real, CI-produced digests recorded in the lock **and re-verified by
   an independent rebuild at the exact PR head** — or, if the governed
   build path cannot be established, an explicit stopped boundary naming
   the missing authority instead of a fabricated digest.

## Non-Goals

- No container is launched anywhere, including CI smoke-running a built
  image. Build and digest verification only.
- No image is published to any registry.
- No profile, no launcher, no runtime selection, no Kata/runc/containerd
  configuration, no U4 input.
- No provider adapter and no second provider image.
- No knowledge content enters any image.
- No change to any platform contract, schema, or service.

## Open Questions

None blocking. Two deferred facts are recorded rather than open: the exact
CPython patch the gates image receives is a deterministic function of the
pinned uv release (surfaced in build evidence, not chosen here), and the
second-platform posture for future household runner classes re-uses this
change's platform model without amendment.
