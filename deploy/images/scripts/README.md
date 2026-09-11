# deploy/images/scripts/

The governed image build tooling. **Authored here; executed only by the
governed CI path** (`.github/workflows/images.yml`) — `deploy/AGENTS.md`
prohibits a coding agent from running any deployment asset locally, and
each script refuses outside CI unless a human deliberately sets
`IMAGES_BUILD_AUTHORIZED=1`.

| Script | Does |
|---|---|
| [`build.sh`](build.sh) | Public governed-build entry point. With no arguments it still builds the complete lock. CI uses its additive `plan`/`collect` phases to build only the classifier-selected transitive closure, while materializing and verifying any unchanged parent needed by a selected child |
| [`build-plan.mjs`](build-plan.mjs) | Projects the validated lock into deterministic BuildKit Bake phases: independent roots together, then derived children together after parent verification. Emits one stable GHA cache scope per image, preserves every lock-declared platform, and collects OCI index/per-platform digest evidence |
| [`verify.sh`](verify.sh) | Compares every OCI output named by the build plan to the lock, including a materialized parent. Mismatch → fail naming both digests. Bootstrap sentinel → final failure printing the exact evidence to record. Match → the rebuild-and-compare proof for the selected outputs |
| [`inspect.sh`](inspect.sh) | Human-readable lineage: built index and per-platform manifest digests, the parent chain, and the pinned runtime, against the lock |

## Boundary rules

1. **One lock parser.** The scripts import the strict parser and validator from
   `scripts/check-images.mjs`, so classification/planning cannot assign a
   second meaning to the lock.
2. **Build outputs live outside the repository** (`$RUNNER_TEMP` or
   `/tmp`). Nothing generated is ever tracked.
3. **No publish, no launch, no deploy.** Digest evidence is the only
   product.
4. **Cache is not evidence.** `type=gha` can satisfy BuildKit layers, but the
   exported OCI identities are still compared with `image-lock.yaml`.
5. **A derived build waits for its parent proof.** The root phase's OCI layout
   must equal the recorded `parent_digest` before the child phase consumes it.

## Governed by

[`../README.md`](../README.md) → [`../../AGENTS.md`](../../AGENTS.md) ·
issue #53 (L5)
