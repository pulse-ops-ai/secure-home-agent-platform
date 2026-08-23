# deploy/images/scripts/

The governed image build tooling. **Authored here; executed only by the
governed CI path** (`.github/workflows/images.yml`) — `deploy/AGENTS.md`
prohibits a coding agent from running any deployment asset locally, and
each script refuses outside CI unless a human deliberately sets
`IMAGES_BUILD_AUTHORIZED=1`.

| Script | Does |
|---|---|
| [`build.sh`](build.sh) | Builds every image registered in [`../image-lock.yaml`](../image-lock.yaml), for every declared platform, as OCI **layouts** (no registry, no push, no container run), with the reproducibility posture fixed: attestations off, `SOURCE_DATE_EPOCH=0`, timestamps rewritten, the derived image's parent resolved from the lock's `parent_digest` via an OCI-layout build context. Emits `digests.json` evidence |
| [`verify.sh`](verify.sh) | Compares the freshly built digests to the lock. Mismatch → fail naming both digests. Bootstrap sentinel → fail printing the built digests as the exact evidence to record. Match → the rebuild-and-compare reproducibility proof |
| [`inspect.sh`](inspect.sh) | Human-readable lineage: built index and per-platform manifest digests, the parent chain, and the pinned runtime, against the lock |

## Boundary rules

1. **One lock parser.** The scripts read the lock exclusively through
   `scripts/check-images.mjs --print`, so the build can never read the lock
   differently than the merge gate validates it.
2. **Build outputs live outside the repository** (`$RUNNER_TEMP` or
   `/tmp`). Nothing generated is ever tracked.
3. **No publish, no launch, no deploy.** Digest evidence is the only
   product.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md) ·
issue #53 (L5)
