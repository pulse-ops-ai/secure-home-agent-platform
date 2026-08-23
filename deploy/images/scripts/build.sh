#!/usr/bin/env bash
#
# build.sh — the governed image build. Builds every image registered in
# image-lock.yaml, for every declared platform, as OCI layouts, and emits
# their digests as machine-readable evidence.
#
# EXECUTION AUTHORITY: deploy/AGENTS.md — a coding agent never runs a
# deployment asset locally, this script included. It runs in the governed CI
# workflow (.github/workflows/images.yml); a human may run it deliberately
# with IMAGES_BUILD_AUTHORIZED=1. It builds; it does not publish, push,
# start, or deploy anything, and no produced image is executed — the
# digest-pinned BuildKit builder container is the one thing it runs:
# build infrastructure, never a workload.
#
# Reproducibility posture (the exact claim is in the L5 child design):
#   - provenance/SBOM attestations off (both embed nondeterministic input);
#   - SOURCE_DATE_EPOCH=0 with rewrite-timestamp on the OCI export;
#   - the derived image's parent resolved from the LOCK's parent digest via
#     an oci-layout build context — never from a registry, never floating.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if [ "${CI:-}" != "true" ] && [ "${IMAGES_BUILD_AUTHORIZED:-}" != "1" ]; then
  echo "refusing: deploy/AGENTS.md prohibits running deployment assets locally." >&2
  echo "This script runs in .github/workflows/images.yml. A human may override" >&2
  echo "deliberately with IMAGES_BUILD_AUTHORIZED=1." >&2
  exit 1
fi

OUT="${IMAGES_OUT:-${RUNNER_TEMP:-/tmp}/secure-home-images}"
mkdir -p "$OUT"

# ONE parser: the lock is read through the repository checker's own
# projection, so the build cannot read it differently than the gate does.
LOCK_JSON="$OUT/lock.json"
node scripts/check-images.mjs --print > "$LOCK_JSON"

lockq() { # lockq <node-expression over `lock`>
  node -e "
    const lock = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'));
    const out = ($1);
    process.stdout.write(Array.isArray(out) ? out.join('\n') : String(out));
  " "$LOCK_JSON"
}

# The OCI exporter and multi-platform builds need the container driver, and
# the BuildKit container that produces the identities is itself part of the
# digest chain — pinned by immutable digest, never `:latest`. Keep in
# lockstep with the driver-opts pin in .github/workflows/images.yml.
BUILDKIT_IMAGE="docker.io/moby/buildkit:v0.32.2@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8"
docker buildx inspect secure-home-images >/dev/null 2>&1 \
  || docker buildx create --name secure-home-images --driver docker-container \
    --driver-opt "image=${BUILDKIT_IMAGE}" >/dev/null
docker buildx use secure-home-images

build_one() {
  local name="$1"
  local definition platforms
  definition="$(lockq "lock.images.find(i => i.name === '$name').definition")"
  platforms="$(lockq "lock.images.find(i => i.name === '$name').platforms.join(',')")"
  local context
  context="$(dirname "$definition")"

  local -a extra=()
  local lineage
  lineage="$(lockq "lock.images.find(i => i.name === '$name').lineage")"
  if [ "$lineage" = "runner-derived" ]; then
    local parent parent_digest
    parent="$(lockq "lock.images.find(i => i.name === '$name').parent")"
    parent_digest="$(lockq "lock.images.find(i => i.name === '$name').parent_digest")"
    if [ "$parent_digest" = "pending-first-governed-build" ]; then
      # Bootstrap: the chain target does not exist yet, so the freshly built
      # parent is used. verify.sh still FAILS on the sentinel — building here
      # only produces the evidence to record.
      parent_digest="$(node -e "
        const idx = JSON.parse(require('node:fs').readFileSync('$OUT/$parent/index.json', 'utf8'));
        process.stdout.write(idx.manifests[0].digest);
      ")"
      echo "bootstrap: resolving $parent via freshly built $parent_digest" >&2
    fi
    extra+=(--build-context "$parent=oci-layout://$OUT/$parent@$parent_digest")
  fi

  rm -rf "$OUT/$name"
  echo "== building $name (${platforms})" >&2
  docker buildx build \
    --platform "$platforms" \
    --provenance=false \
    --sbom=false \
    --build-arg SOURCE_DATE_EPOCH=0 \
    "${extra[@]}" \
    --output "type=oci,dest=$OUT/$name,tar=false,rewrite-timestamp=true" \
    "$context"
}

# Build order: the base first — the derived build consumes its layout.
for name in $(lockq "lock.images.filter(i => i.lineage !== 'runner-derived').map(i => i.name)"); do
  build_one "$name"
done
for name in $(lockq "lock.images.filter(i => i.lineage === 'runner-derived').map(i => i.name)"); do
  build_one "$name"
done

# Digest evidence: index digest from the layout's index.json, per-platform
# manifest digests from the index blob itself.
node -e "
  const { readFileSync, writeFileSync } = require('node:fs');
  const lock = JSON.parse(readFileSync('$LOCK_JSON', 'utf8'));
  const out = {};
  for (const image of lock.images) {
    const layout = '$OUT/' + image.name;
    const index = JSON.parse(readFileSync(layout + '/index.json', 'utf8'));
    const top = index.manifests[0].digest;
    const blob = JSON.parse(readFileSync(layout + '/blobs/sha256/' + top.slice('sha256:'.length), 'utf8'));
    const manifests = {};
    for (const m of blob.manifests) {
      if (m.platform === undefined || m.platform.os === 'unknown') continue;
      manifests[m.platform.os + '/' + m.platform.architecture] = m.digest;
    }
    out[image.name] = { digest: top, manifests };
  }
  writeFileSync('$OUT/digests.json', JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
"

echo "digest evidence written to $OUT/digests.json" >&2
