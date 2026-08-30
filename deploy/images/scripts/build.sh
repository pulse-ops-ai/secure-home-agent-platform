#!/usr/bin/env bash
#
# build.sh — the governed image build entry point.
#
# No arguments preserves the original public contract: build every image in
# image-lock.yaml for every declared platform, emit OCI layouts, and collect
# digest evidence. The workflow uses the additive `plan` / `collect` phases so
# docker/bake-action can supply the authenticated GHA cache backend.
#
# Execution graph:
#   independent roots in parallel -> verify locked parent -> selected derived
#   images in parallel -> final digest verification
#
# EXECUTION AUTHORITY: deploy/AGENTS.md — a coding agent never runs a
# deployment asset locally. CI is authorized; a human may deliberately set
# IMAGES_BUILD_AUTHORIZED=1. Nothing is pushed, published, launched, or
# deployed.

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
COMMAND="${1:-run}"
PLAN_SCRIPT="deploy/images/scripts/build-plan.mjs"

plan() {
  local selection="${IMAGE_SELECTION_MODE:-all}"
  local images="${IMAGE_SELECTION_JSON:-[]}"
  local cache="${IMAGE_CACHE_BACKEND:-none}"
  local -a args=(
    node "$PLAN_SCRIPT" plan
    --root "$ROOT"
    --out "$OUT"
    --selection "$selection"
    --images-json "$images"
    --cache "$cache"
  )
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    args+=(--github-output "$GITHUB_OUTPUT")
  fi
  "${args[@]}"
}

collect() {
  local phase="${1:-all}"
  node "$PLAN_SCRIPT" collect --out "$OUT" --phase "$phase"
}

ensure_builder() {
  # The BuildKit container is part of the digest-producing path and therefore
  # immutable. Keep this in lockstep with setup-buildx-action in images.yml.
  local buildkit_image
  buildkit_image="docker.io/moby/buildkit:v0.32.2@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8"
  docker buildx inspect secure-home-images >/dev/null 2>&1 \
    || docker buildx create --name secure-home-images --driver docker-container \
      --driver-opt "image=${buildkit_image}" >/dev/null
  docker buildx use secure-home-images
}

run_bake() {
  local file="$1"
  echo "== governed Bake phase: $(basename "$file")" >&2
  docker buildx bake \
    --file "$file" \
    --provenance=false \
    --sbom=false \
    selected
}

case "$COMMAND" in
  plan)
    plan
    ;;
  collect)
    collect "${2:-all}"
    ;;
  run)
    # Compatibility path for a deliberate human invocation. CI uses the same
    # generated definitions through docker/bake-action so its GHA cache runtime
    # credentials never need to be exposed to a shell step.
    plan
    ensure_builder
    run_bake "$OUT/roots-bake.json"

    has_derived="$(node -e "
      const p = JSON.parse(require('node:fs').readFileSync('$OUT/build-plan.json', 'utf8'));
      process.stdout.write(String(p.phases.derived.length > 0));
    ")"
    if [ "$has_derived" = "true" ]; then
      collect parents
      bash deploy/images/scripts/verify.sh --phase parents --allow-pending
      run_bake "$OUT/derived-bake.json"
    fi

    collect all
    bash deploy/images/scripts/verify.sh
    ;;
  *)
    echo "refusing: unknown build command '$COMMAND'" >&2
    echo "usage: build.sh [run|plan|collect [roots|parents|all]]" >&2
    exit 1
    ;;
esac
