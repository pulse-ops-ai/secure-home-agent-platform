# deploy/images/

Runner **image definitions** and their machine-readable lineage record.

> **Status: the definitions are landed and inert** (L5 #53, L7 #55). Four
> images are defined, digest-locked, and validated — and nothing
> references, launches, or deploys them: no profile pins one, no launcher
> exists (L9, behind U4), and nothing is published to any registry.

## Layout

| Path | Contains |
|---|---|
| [`runner-base/`](runner-base/) | `secure-home-runner-base` — the provider-neutral untrusted workload substrate |
| [`debian-closure.lock.json`](debian-closure.lock.json) | The one reviewed authority for every Debian artifact any image installs — package, version, architecture, filename, URL, SHA-256, size. Each image's `packages.<arch>.manifest` is a projection of it |
| [`runner-claude/`](runner-claude/) | `secure-home-runner-claude` — the reference derived image: exact base + one pinned Claude Code runtime |
| [`runner-copilot/`](runner-copilot/) | `secure-home-runner-copilot` — derived image: exact base + one pinned GitHub Copilot CLI runtime (L7, #55) |
| [`gates-toolchain/`](gates-toolchain/) | `secure-home-gates-toolchain` — the governed gate toolchain, **outside** the runner lineage |
| [`image-lock.yaml`](image-lock.yaml) | The lineage and pinning record: lineage classes, definitions, immutable identities (index + per-platform manifest digests), the derived parent chain, the one pinned runtime |
| [`scripts/`](scripts/) | The governed build tooling (CI-executed; never run locally by a coding agent) |

## Package closures are pinned by artifact, not by version

Every governed image installs Debian packages, and **every one of those
artifacts is pinned by SHA-256 and byte size**. There is one reviewed
authority — [`debian-closure.lock.json`](debian-closure.lock.json) — carrying
each artifact's package, version, architecture, component, filename, URL,
SHA-256, and size. Each image carries a **projection** of it,
`packages.<arch>.manifest`, and that projection is the file the build actually
reads.

| Image | Artifacts per architecture |
|---|---|
| `secure-home-runner-base` | 5 |
| `secure-home-runner-claude` | 35 |
| `secure-home-runner-copilot` | 35 |
| `secure-home-gates-toolchain` | 39 |

The build does the same thing in all four:

```
apt-get download   →  exactly the package=version pairs named; resolves nothing
content check      →  every artifact fetched must BE a reviewed one, by hash
count + size check →  all of them, none beyond them, each the declared length
sha256sum -c       →  before anything is unpacked
dpkg --install     →  the verified bytes
```

There is **no `apt-get install`** anywhere, so no dependency resolution happens
at build time. The `.deb` files never enter a layer — fetched, verified,
installed, and removed inside one instruction.

**Why, concretely.** An earlier revision pinned only the packages each image
*named* — `ca-certificates`, `tini`, `git`, `curl` — and let `apt-get install`
resolve the rest. `ca-certificates` depends on `openssl`, which drags
`libssl3t64` and `openssl-provider-legacy` up from `trixie-security`; `git` and
`curl` pull a closure of their own. When the archive moved those three from
`3.5.6-1~deb13u2` to `3.5.7-1~deb13u2`, image digests moved with them under
Dockerfiles that had not changed, and derived images' pinned `parent_digest`
broke. **The identity gate caught it** — that is what it is for — but the gate
should not have been the first line of defence.

**A version is a request; a SHA-256 is the bytes.** `scripts/check-images.mjs`
now refuses an `apt` install in any governed definition, a definition that
never runs `sha256sum -c`, a projection that has drifted from the authority, a
projection naming an artifact the authority does not cover, a "sha256" that is
not 64 hex, a non-positive size, a non-`https` URL, a URL whose basename is not
the declared filename, a filename that does not encode its declared package and
version, and one package declared at two versions.

### The gates toolchain's two non-Debian inputs

`gates-toolchain` had two more inputs named by version and fetched over the
network. Both are now artifacts, pinned exactly as `node` and `uv` already
were:

- **pnpm** — `corepack install -g pnpm@<version>` fetched whatever the registry
  served. The tarball is now pinned by SHA-256 and installed offline.
- **CPython** — `uv python install 3.13` asked for a *range* and took the
  newest 3.13.x of the day. The interpreter is now a pinned
  python-build-standalone artifact, verified by SHA-256, with `UV_PYTHON`
  pointing uv at it so it never downloads one. `PYTHON_VERSION` must be an
  exact `MAJOR.MINOR.PATCH`; the checker refuses a range.

### The accepted cost

Debian removes superseded `.deb` files from the pool, so a pinned artifact
eventually stops being fetchable and the build fails loudly. Taking a security
update is therefore a **reviewed manifest bump** that moves every digest built
from it, recorded in `image-lock.yaml` in the same change. Silent pickup is the
failure mode being removed, not a feature being kept. `snapshot.debian.org`
refuses the governed builder's address space, so a frozen archive snapshot is
not available; the manifest is the fallback.

## Lineage

```text
secure-home-runner-base              provider-neutral substrate (landed, L5)
├── secure-home-runner-claude        Claude Code, pinned (landed, L5)
└── secure-home-runner-copilot       GitHub Copilot CLI, pinned (landed, L7)

secure-home-gates-toolchain          separate lineage; runs gates, not agents
```

Future derived images extend the same base, the same lock, and the same
checker with **no new taxonomy** — one directory plus one lock entry each,
when their governed landing authorizes them — `runner-copilot` landed exactly
that way at L7 (#55). Codex, a deterministic custom loop, or household
framework runtimes arrive only when a landing requires them. **No speculative directory exists before its
landing.**

**One runtime per derived image, pinned. A multi-provider image is
prohibited**
([ADR-0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)).

## What the base contains — and where the substrate really lives

The base image is an **untrusted workload substrate**: minimal OS surface,
process bootstrap (`tini`), the non-root workload user, and the mount-point
conventions (`/workspace`, `/run/platform`) through which the platform
supplies event/evidence plumbing at launch.

The substrate *system* concerns — profile loading and validation, the run
lifecycle, event emission, evidence capture — are owned by trusted
**`services/runner-control`** (L4) outside every image, with physical
enforcement at L9. Nothing decision-bearing ships inside an image, and the
lineage checker refuses platform code copied into one. This supersedes the
older reading of this README that listed those concerns as base-image
contents; #53 fixes the trust split.

**It contains no coding agent, no framework, no provider SDK, and no
provider credential handling.** A provider name appearing in the base
definition is a lineage violation — refused mechanically, not editorially.

## What a derived image adds

Exactly one runtime, at one exact pinned version, plus only what that
runtime requires. Nothing else — enforced by `scripts/check-images.mjs`
(one declared runtime, version equality with the lock, no foreign provider
token, no credential-shaped names).

## Identity

- **Every external base reference is pinned by immutable digest.** A
  moving tag is not a pin.
- The lock records **two digest kinds, deliberately distinguished**: the
  OCI image-**index** digest (the canonical locked identity — what a
  future profile pins) and the per-platform **manifest** digests (what a
  runtime on `linux/arm64` — the Pi — or `linux/amd64` — the
  workstation/VPS class — actually consumes, and what run evidence
  records).
- The derived image's `parent_digest` must equal the base's recorded
  digest **exactly**; a rebuilt base that does not propagate cannot merge.
- Real digests are produced and re-verified only by the governed build
  path ([`../../.github/workflows/images.yml`](../../.github/workflows/images.yml))
  — built as OCI layouts, compared to the lock, published nowhere. The
  bootstrap sentinel `pending-first-governed-build` fails that
  verification loudly until real evidence is recorded.

## Governed CI selection and execution

The workflow has two deliberately separate selection layers:

```text
broad GitHub path perimeter
        ↓
trusted-revision semantic image-impact proof
        ↓
affected image dependency closure
        ↓
selected multi-platform OCI builds
        ↓
lock-authoritative digest and lineage verification
```

### Why the outer path filter remains broad

The outer `paths` list is conservative on both pull requests and pushes to
`main`:

```text
deploy/images/**
.github/workflows/images.yml
scripts/check-images.mjs
scripts/image-impact.mjs
scripts/pr-merge-plan.mjs
.github/workflows/checks.yml
package.json
scripts/check.sh
```

For a pull request, GitHub evaluates that filter against the complete
three-dot PR diff. Once any path above is in the PR, a later synchronization
can select `images.yml` even when the new commit changes only an unrelated
review gate. Encoding semantic JSON/YAML fields into `paths` is impossible and
would make a correctness-sensitive perimeter brittle, so the broad filter only
decides whether the cheap classifier runs.

This perimeter is not free-form. Every repository-level input the classifier
treats as a **global** image-proof input — `GLOBAL_BUILD_INPUTS` in
[`../../scripts/image-impact.mjs`](../../scripts/image-impact.mjs), which forces
the complete governed set — must also appear here, either exactly or subsumed by
an approved encompassing glob (`deploy/images/**` covers the governed build
scripts). A global proof input the workflow never triggers on would be a correct
checker that is never invoked: the proof machinery could change without its own
governed verification running. That includes the proof machinery itself —
`scripts/pr-merge-plan.mjs` composes the PR merge tree the whole proof is built
on. The structural test
`tests/test_image_impact.py::test_every_global_build_input_has_an_outer_workflow_trigger`
reads `GLOBAL_BUILD_INPUTS` from the classifier and fails if any entry is not
covered by both the `pull_request` and `push` perimeters, so the next
proof-support script cannot silently recreate this gap.

[`../../scripts/image-impact.mjs`](../../scripts/image-impact.mjs) owns the
inner decision, and for a pull request it runs against the **composed** tree
described in [Composed-tree PR proof](#composed-tree-pr-proof), never the
isolated PR head. The comparison origin is the live target-branch tip, unless a
previous PR head both has a successful proof and already incorporates that live
base — see [Previous-head fast path](#composed-tree-pr-proof). If nothing can be
proved, the classifier emits `IMAGE_IMPACT_UNKNOWN` and the complete governed
set builds. A push to the default branch compares its previous commit; a manual
invocation has no transition to prove and therefore builds the complete set.

Only pull-request runs share a cancellable concurrency group. Push and manual
runs use the unique workflow run ID, so one governance event cannot cancel
another. Cancellation is an optimisation, not the identity proof: the
end-of-run freshness check (below) is what binds a proof to exact identities.

### Closed Dockerfile / context-consumer model

A no-build decision is valid only when the classifier has **positively proved**
that no governed image output can change. Deriving inputs from `COPY`/`ADD`
alone is not such a proof: BuildKit can consume repository bytes through other
instructions. The Dockerfile model is therefore a **closed admitted grammar** —
every logical instruction is one of:

```text
recognized + proved non-context-consuming   -> may continue
recognized context input                     -> add exact/prefix input
anything potentially context-consuming but not modeled
                                             -> IMAGE_IMPACT_UNKNOWN / full build
```

There is no silent skip. Concretely:

- **`COPY`/`ADD` (local)** — JSON and shell forms, directories (prefix), globs
  (whole-context prefix), `.dockerignore`, missing inputs, absolute/`..`/URL
  sources, and unparseable forms are handled exactly as before (modeled or
  refused).
- **`COPY --from` / `ADD --from`** — a declared build stage, a numeric stage
  index, or the registered parent (which the build plan wires **only** as an
  OCI layout, never a local context) is internal and adds no repository input.
  Any other `--from` value may be a repository-backed named context and is
  refused (`UNKNOWN`).
- **`RUN --mount`** — `cache`, `tmpfs`, `secret`, and `ssh` mounts never read
  the build context; a `bind` mount from a declared stage or the registered
  parent is an image input, not a repository input. A `bind` mount that reads
  the build context (the default when `type=`/`from=` is omitted) is refused
  (`UNKNOWN`) — the fail-closed choice, since the governed images use no such
  mount today.
- **`ONBUILD`** — refused: it can defer a context-consuming instruction into a
  child build, which cannot be proven safe locally.
- **Any unrecognized instruction keyword or `RUN` flag** — refused.

A change to a file consumed **only** through one of these newly-modeled
mechanisms can therefore never produce `IMAGE_IMPACT_NONE`; it produces the
affected image or, for the fail-closed forms, the complete governed set.

### Composed-tree PR proof

Governed image identity for a pull request is established against the tree that
results from **composing the live target branch with the candidate head**, not
the isolated head and not the PR's historical `pull_request.base.sha` (which can
lag the branch it names). [`../../scripts/pr-merge-plan.mjs`](../../scripts/pr-merge-plan.mjs)
establishes four identities with Git plumbing only, mutating no branch:

```text
PR_HEAD_SHA    exact candidate head (from the PR event, re-verified)
BASE_REF       the PR target branch NAME
LIVE_BASE_SHA  the CURRENT tip of BASE_REF, resolved from the remote at run time
MERGE_SHA      an ephemeral commit whose tree is the clean composition of
               LIVE_BASE_SHA + PR_HEAD_SHA
```

The workflow checks out `MERGE_SHA`, so impact analysis, static lineage, Bake
plans, Dockerfiles, build scripts, OCI construction, and digest verification all
describe `image(LIVE_BASE + PR_HEAD)`. It fails closed: an unresolvable base or
head, or a merge conflict, aborts the run — it never falls back to PR-head-only
verification.

`MERGE_SHA` is a deterministic evidence identity, not a wall-clock artifact. The
ephemeral commit's author/committer name, email, **and** timestamps are all
fixed: the identity is a constant, and the dates are derived from the composed
inputs (the later of the two parents' committer instants, in UTC) rather than
the ambient clock. `git commit-tree` hashes those timestamps, so pinning them is
what makes identical `(LIVE_BASE_SHA, PR_HEAD_SHA)` inputs always produce the
same `MERGE_SHA`. (The composed **tree** was already stable and is what the build
consumes; pinning the dates makes the commit SHA equally reproducible so it can
be quoted as evidence.)

**Previous-head fast path.** The incremental optimisation is preserved but bound
to base freshness. A previously proven PR head is a valid comparison origin only
when (1) that exact SHA for that exact PR has a successful `images.yml` proof
(GitHub Actions API), **and** (2) `LIVE_BASE_SHA` is already an ancestor of that
previous head. If the live base has advanced beyond the previous head, the
previous-head proof is **not** reused; the comparison falls back to
`LIVE_BASE_SHA → MERGE_SHA`.

**TOCTOU boundary.** At the end of a PR proof the workflow re-resolves the live
PR head (`refs/pull/<n>/head`) and the live base tip and requires exact equality
with the identities the merge tree was built from. If either moved while the job
ran, the proof is refused and the newer event establishes the new proof.

**This is a run-boundary composition proof, not a merge-time freshness policy.**
It guarantees only that, at the moment a run succeeds, the exact PR head, the
exact live base tip, and their exact clean composition were proved together.
This repository declares **no** GitHub branch protection, ruleset, or merge
queue, so `main` is **not** enforced-current before merge, `pull_request.base.sha`
is **not** the live base, and a PR-head-only build is **not** a merge-tree proof.
A successful check does **not** stay fresh after `main` later advances;
continuous merge-time freshness would require a separate, enforceable repository
control that does not exist here.

### Authoritative input and dependency model

The classifier does not carry a second hand-maintained image inventory:

- image names, definitions, platforms, lineage classes, parent edges, and
  locked identities come from [`image-lock.yaml`](image-lock.yaml), through
  the same strict parser as `check-images.mjs`;
- local context inputs come from the registered Dockerfile's parsed
  `COPY`/`ADD` sources, plus the Dockerfile and `.dockerignore` itself;
- the gates-toolchain's repository-wide semantic version sources come from
  [`gates-toolchain/toolchain.json`](gates-toolchain/toolchain.json);
- build/verification machinery and the shared Debian closure authority are
  global inputs.

| Image | Direct output inputs | Dependency impact |
|---|---|---|
| `secure-home-runner-base` | registered Dockerfile; copied AMD64/ARM64 package manifests; external base/identity fields in the lock; shared Debian closure; global build/proof machinery | changing it adds Claude and Copilot transitively |
| `secure-home-runner-claude` | registered Dockerfile; copied manifests; runtime/tool pins; its lock entry; verified base OCI layout at `parent_digest` | leaf-only; does not add Copilot or gates |
| `secure-home-runner-copilot` | registered Dockerfile; copied manifests; runtime/helper/tool pins; its lock entry; verified base OCI layout at `parent_digest` | leaf-only; does not add Claude or gates |
| `secure-home-gates-toolchain` | registered Dockerfile; copied manifests; `toolchain.json`; Node/uv semantic pins in `checks.yml`; pnpm semantic version in `package.json`; its lock entry | independent of the runner lineage |

The exact `package.json` finding matters: image construction consumes the pnpm
**version** before the Corepack `+sha512...` suffix. The gates Dockerfile pins
the pnpm tarball bytes independently with `PNPM_SHA256`; it does not consume
the root Corepack integrity string. Therefore an unrelated dependency/field
change — or an integrity-suffix-only change with the same pnpm version — cannot
change this image. A pnpm version change does affect the gates image. The same
semantic comparison applies to the `NODE_VERSION` and `UV_VERSION` values
named by the toolchain inventory; unrelated `checks.yml` bytes do not affect
an image.

The positive no-build proof is:

```text
trusted base + candidate diff + derived input model + semantic values
    = no governed image output can differ
```

An unresolved base/head, failed Git diff, malformed lock or toolchain metadata,
missing dependency, dependency cycle, unparseable semantic value, ambiguous
Dockerfile input, or unclassified shared image path emits
`IMAGE_IMPACT_UNKNOWN`. `UNKNOWN` selects the complete inventory; it never
means no build.

### Parallel phases, cache, and parent proof

[`scripts/build-plan.mjs`](scripts/build-plan.mjs) projects the selected
closure into deterministic BuildKit Bake phases:

```text
runner-base ── verify parent ─┬─ Claude ──┐
                              └─ Copilot ─┼─ final verify
gates-toolchain ──────────────────────────┘
```

Independent targets within a phase run concurrently. The base and gates image
may run together; after the base OCI layout equals the lock, selected Claude
and Copilot children may run together. The independent gates digest is checked
at final verification rather than serializing the runner children. Digest
collection still follows lock order, so parallel completion order cannot
change the proof.

Every image has one stable multi-platform GHA BuildKit cache scope:

```text
secure-home-images-v1-secure-home-runner-base
secure-home-images-v1-secure-home-runner-claude
secure-home-images-v1-secure-home-runner-copilot
secure-home-images-v1-secure-home-gates-toolchain
```

Each scope carries both declared platforms because each image is one
multi-platform BuildKit target. `mode=max` retains intermediate layers; scopes
do not overwrite one another. Cache is an acceleration source only: every
selected target still exports an OCI layout, and the exported index,
per-platform manifests, and parent identity still have to equal the lock.

A selected derived leaf needs the unpublished base bytes as a build context.
Because no governed image is published to a registry, the plan materializes
the locked base as **support**, normally from its warm BuildKit cache, and
verifies its index before the leaf consumes it. This is not transitive impact
(the sibling remains unselected); it is the minimum parent-input work possible
without inventing a registry or weakening the exact-parent rule. A cold/missing
cache rebuilds the parent rather than assuming it exists.

### AMD64, ARM64, and QEMU

Every selected image still produces both `linux/amd64` and `linux/arm64`.
GitHub's hosted runner is AMD64, so the pinned binfmt/QEMU helper executes
ARM64 build instructions under emulation. QEMU setup itself is only a few
seconds; emulated `RUN` instructions are the cost. It is intentionally skipped
only when the semantic classifier proves that **no** image build is needed.
Native ARM64 runners remain a possible follow-up after semantic skipping,
closure, caching, and parallelism are measured; this change introduces no new
runner trust model or infrastructure.

### Baseline measured before optimization

Measured on 2026-08-30 from 11 successful current-shape workflow runs between
Actions runs `33170862120` and `33309513089` (2026-08-28 through
2026-08-30):

| Step | Median duration |
|---|---:|
| job setup + checkout | 2 s |
| QEMU setup | 5 s |
| Buildx setup | 5 s |
| static lineage | < 1 s |
| governed four-image multi-platform build | 12 min 45 s |
| digest verification + inspection | < 1 s |
| total job | 13 min 1 s |

The current-shape runs `33170862120` and `33309513089` also expose the
serialization cost:

| Image | Typical elapsed |
|---|---:|
| runner-base | 1 min 33 s |
| gates-toolchain | 3 min 45 s |
| Claude leaf | 3 min 14 s |
| Copilot leaf | 4 min 10 s |

Run `33309513089` is the direct unnecessary-build example. Its new commit
changed only `.github/workflows/review-boundary.yml`,
`scripts/openspec-review-gate.mjs`, and two review tests. The complete PR still
contained `checks.yml`, `package.json`, and `scripts/check.sh`, so GitHub
selected `images.yml` and the build step ran for 12 min 47 s (13 min 5 s job;
13 min 8 s workflow wall clock).

There was no persistent BuildKit import/export in that baseline. Only the QEMU
setup action restored its helper image cache. One fresh builder ran
runner-base, gates, Claude, then Copilot serially. The old concurrency group
cancelled every same-ref event, including manual events, and the workflow had
no push-to-`main` trigger.

ARM64 emulation dominated the representative run's principal `RUN` step:

| Image | AMD64 | ARM64/QEMU |
|---|---:|---:|
| runner-base | 5.9 s | 89.7 s |
| gates-toolchain | 19.2 s | 174.9 s |
| Claude leaf | 18.2 s | 132.0 s |
| Copilot leaf | 23.3 s | 159.4 s |

### Hosted before/after evidence

Local Docker execution is prohibited by [`../AGENTS.md`](../AGENTS.md), so
performance conclusions come from hosted Actions, never a developer-machine
timing. The optimization PR records four cases before merge:

| Case | Selected proof | Hosted result |
|---|---|---|
| unrelated synchronization | semantic no-impact; no QEMU/Buildx/build | Actions `33313643162`: 6 s job / 9 s workflow |
| one leaf | Claude plus verified cached base support; both platforms | Actions `33313680350`: parent 10 s, leaf 1 min 9 s, 1 min 45 s job / 1 min 49 s workflow |
| runner-base | base + Claude + Copilot; both platforms | Actions `33313809299`: base 9 s, children 1 min 46 s, 2 min 25 s job / 2 min 29 s workflow |
| full governance/build change | all four images; both platforms | Actions `33313135341`: roots 4 min 18 s, children 5 min 20 s, 9 min 59 s job / 10 min 2 s workflow |

The full build remains mandatory for global build/verification machinery,
shared package-closure changes, inventory changes, manual invocation, and every
unknown/unclassifiable state.

The first optimization-PR run was the full-change/cold-population case. It
exported all four image scopes to the GHA cache and verified every rebuilt OCI
index, platform manifest, and parent identity against the unchanged lock. Its
9 min 59 s job was 3 min 2 s (23%) below the 13 min 1 s historical median;
the still-dominant 5 min 20 s child phase shows why native ARM64 remains the
possible follow-up rather than part of this change.

The next synchronization changed only this README. The workflow proved the
exact prior PR head had succeeded, compared only the new commit, emitted
`IMAGE_IMPACT_NONE`, and skipped every expensive step. The leaf and base cases
used temporary full-line Dockerfile comments that BuildKit ignores; the
comments existed only to exercise selection and were removed after measurement.
Both runs showed the relevant BuildKit steps as `CACHED`, still exported fresh
OCI layouts, and passed the unchanged digest and parent checks. The remaining
warm-path time is predominantly OCI materialization/export plus QEMU/Buildx
setup, not image construction.

> **These timings predate the P1 correction** (closed Dockerfile grammar and
> composed-tree PR proof). They remain valid evidence of the performance
> architecture, which the correction preserves: the fast paths still exist when
> their premises are proven. What changed is the proof's rigor, not its speed —
> a PR now compares against `merge(live base, PR head)` rather than the isolated
> head, and the previous-head fast path is gated on base incorporation. New
> hosted run IDs for the corrected workflow are recorded in the PR description.

## What does not belong here

- **Credentials or API keys.** Provisioned at run time from the profile,
  never baked into an image.
- **Runtime installation at run start.** Everything a run needs is in the
  image; installing at run start destroys provenance and requires egress.
- **Knowledge content.** Runtime knowledge integration is issue #93; an
  image stays reusable across profiles and knowledge releases.
- **Agent implementations** or **adapters** — [`../../agents/`](../../agents/).
- **More than one runtime per image.**
- **Execution-runtime configuration or runtime-named images**
  (`runner-kata`, `runner-runc`): images say WHAT executes;
  [`../runtime/`](../runtime/) is the boundary for HOW it is isolated.
- **Compose files** — [`../compose/`](../compose/).

## Boundary rules

1. **Credential isolation by image selection.** A run using one provider's
   image has no path to another provider's credential — structural, per
   ADR-0011.
2. **Pinned versions.** An upgrade is a reviewed, diffable event with a
   changed digest, never a silent drift.
3. **Base patching must propagate.** The lock's parent-chain equality
   makes an unpropagated derived image un-mergeable.
4. **Image digests are recorded on run records** for provenance (the
   evidence contract's `image_digest`).
5. **Minimal surface.** Every package in an image is carried by every run
   using it.

## Validation

```sh
node scripts/check-images.mjs      # lock grammar, lineage, neutrality, inertness
bash scripts/check.sh              # includes the row above
# Real digests: .github/workflows/images.yml — governed CI build + verify.
# Never `docker build` locally from a coding-agent task (deploy/AGENTS.md).
```

## Governed by

[`../README.md`](../README.md) → [`../AGENTS.md`](../AGENTS.md) · ADRs
[0003](../../docs/decisions/ADR-0003-use-framework-neutral-runner-profiles.md),
[0011](../../docs/decisions/ADR-0011-keep-coding-agent-images-provider-specific.md)
· issue #53 (L5)
