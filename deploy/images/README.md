# deploy/images/

Runner **image definitions** and their machine-readable lineage record.

> **Status: the definitions are landed and inert** (L5 #53, L7 #55). Four
> images are defined, digest-locked, and validated — and nothing
> references, launches, or deploys them: no profile pins one, no launcher
> exists (L9, behind U4), and nothing is published to any registry.

## Layout

| Path | Contains |
|---|---|
| [`runner-base/`](runner-base/) | `secure-home-runner-base` — the provider-neutral untrusted workload substrate, plus `packages.lock.json` and its per-architecture `.sha256` projections: the pinned package closure |
| [`runner-claude/`](runner-claude/) | `secure-home-runner-claude` — the reference derived image: exact base + one pinned Claude Code runtime |
| [`runner-copilot/`](runner-copilot/) | `secure-home-runner-copilot` — derived image: exact base + one pinned GitHub Copilot CLI runtime (L7, #55) |
| [`gates-toolchain/`](gates-toolchain/) | `secure-home-gates-toolchain` — the governed gate toolchain, **outside** the runner lineage |
| [`image-lock.yaml`](image-lock.yaml) | The lineage and pinning record: lineage classes, definitions, immutable identities (index + per-platform manifest digests), the derived parent chain, the one pinned runtime |
| [`scripts/`](scripts/) | The governed build tooling (CI-executed; never run locally by a coding agent) |

## The package closure is pinned by artifact, not by version

`runner-base` installs five packages. All five are pinned by **SHA-256** in
[`runner-base/packages.lock.json`](runner-base/packages.lock.json), per
architecture, alongside the exact version, component, filename, URL, and size.
The build derives its fetch list from that manifest, downloads exactly those
artifacts with `apt-get download` — which resolves nothing — verifies them with
`sha256sum -c` before anything is unpacked, and installs them with `dpkg`.

**Why, concretely.** An earlier revision pinned only the two *named* packages,
`ca-certificates` and `tini`, and let `apt-get install` resolve the rest.
`ca-certificates` depends on `openssl`, which drags `libssl3t64` and
`openssl-provider-legacy` up from `trixie-security`. When the archive moved
those three from `3.5.6-1~deb13u2` to `3.5.7-1~deb13u2`, this image's digest
moved with them under a Dockerfile that had not changed, and every derived
image's pinned `parent_digest` broke. **The identity gate caught it** — that is
what it is for — but the gate should not have been the first line of defence.

**A version is a request; a SHA-256 is the bytes.** Pinning the top-level names
alone is insufficient and `scripts/check-images.mjs` now refuses it: an `apt`
install in a `runner-base` definition fails the gate, as does a definition that
never runs `sha256sum -c`, a `.sha256` file that has drifted from the manifest,
an artifact whose filename does not encode its declared package and version,
and a "sha256" that is not 64 hex characters.

**The accepted cost.** Debian removes superseded `.deb` files from the pool, so
a pinned artifact eventually stops being fetchable and the build fails loudly.
Taking a security update is therefore a **reviewed manifest bump** that moves
every digest built from it, recorded in `image-lock.yaml` in the same change.
Silent pickup is the failure mode being removed, not a feature being kept.
`snapshot.debian.org` refuses the governed builder's address space, so a frozen
archive snapshot is not available; the manifest is the fallback.

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
