#!/usr/bin/env bash
#
# verify.sh — compare selected governed OCI identities with image-lock.yaml.
#
# The build plan names every output that exists for this proof. An affected
# image and any materialized parent support are all checked; unselected images
# are justified by image-impact.mjs rather than silently assumed valid.
#
# Bootstrap remains loud. The parents phase may temporarily continue past a
# parent sentinel solely to build descendant evidence; the final phase still
# fails until every recorded index, manifest, and parent identity is real.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if [ "${CI:-}" != "true" ] && [ "${IMAGES_BUILD_AUTHORIZED:-}" != "1" ]; then
  echo "refusing: deploy/AGENTS.md prohibits running deployment assets locally." >&2
  exit 1
fi

OUT="${IMAGES_OUT:-${RUNNER_TEMP:-/tmp}/secure-home-images}"
PHASE="all"
ALLOW_PENDING="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --phase)
      [ "$#" -ge 2 ] || {
        echo "refusing: --phase requires roots, parents, or all" >&2
        exit 1
      }
      PHASE="$2"
      shift 2
      ;;
    --allow-pending)
      ALLOW_PENDING="true"
      shift
      ;;
    *)
      echo "refusing: unknown verify option '$1'" >&2
      echo "usage: verify.sh [--phase roots|parents|all] [--allow-pending]" >&2
      exit 1
      ;;
  esac
done

if [ "$PHASE" != "roots" ] && [ "$PHASE" != "parents" ] && [ "$PHASE" != "all" ]; then
  echo "refusing: --phase must be roots, parents, or all" >&2
  exit 1
fi
if [ "$ALLOW_PENDING" = "true" ] && [ "$PHASE" != "parents" ]; then
  echo "refusing: --allow-pending is valid only for the intermediate parents phase" >&2
  exit 1
fi

VERIFY_PHASE="$PHASE" VERIFY_ALLOW_PENDING="$ALLOW_PENDING" node -e "
  const { readFileSync, appendFileSync } = require('node:fs');
  const lock = JSON.parse(readFileSync('$OUT/lock.json', 'utf8'));
  const plan = JSON.parse(readFileSync('$OUT/build-plan.json', 'utf8'));
  const built = JSON.parse(readFileSync('$OUT/digests.json', 'utf8'));
  const phase = process.env.VERIFY_PHASE;
  const allowPending = process.env.VERIFY_ALLOW_PENDING === 'true';
  const SENTINEL = 'pending-first-governed-build';
  const required = phase === 'roots'
    ? plan.phases.roots
    : phase === 'parents'
      ? plan.phases.parents
      : plan.outputs;
  const problems = [];
  const pending = [];
  const rows = [];
  const byName = new Map(lock.images.map((image) => [image.name, image]));

  const requiredSet = new Set(required);
  for (const name of Object.keys(built)) {
    if (!requiredSet.has(name)) problems.push(name + ': digest evidence exists outside the build plan');
  }

  for (const name of required) {
    const image = byName.get(name);
    if (image === undefined) {
      problems.push(name + ': build plan names an image absent from the lock');
      continue;
    }
    const fresh = built[name];
    if (fresh === undefined) {
      problems.push(name + ': selected but not built');
      continue;
    }
    const compare = (label, recorded, rebuilt) => {
      rows.push([name, label, recorded, rebuilt]);
      if (recorded === SENTINEL) pending.push(name + ' ' + label + ' -> ' + rebuilt);
      else if (recorded !== rebuilt) {
        problems.push(name + ' ' + label + ': lock records ' + recorded +
          ' but the governed rebuild produced ' + rebuilt);
      }
    };
    compare('index', image.digest, fresh.digest);
    for (const manifest of image.manifests) {
      compare(manifest.platform, manifest.digest, fresh.manifests[manifest.platform] ?? '(missing)');
    }
    if (image.lineage === 'runner-derived') {
      const parentBuilt = built[image.parent];
      if (parentBuilt === undefined) {
        problems.push(name + ': verified parent ' + image.parent + ' is absent from this proof');
      } else if (image.parent_digest === SENTINEL) {
        pending.push(name + ' parent_digest -> ' + parentBuilt.digest);
      } else if (image.parent_digest !== parentBuilt.digest) {
        problems.push(name + ' parent_digest: lock records ' + image.parent_digest +
          ' but the verified parent rebuilt to ' + parentBuilt.digest);
      }
    }
  }

  const summary = process.env.GITHUB_STEP_SUMMARY;
  const lines = [
    '## Image digest verification — ' + phase,
    '',
    '**Proof outputs:** ' + required.map((name) => '\`' + name + '\`').join(', '),
    '',
    '| image | identity | lock | rebuilt |',
    '|---|---|---|---|',
  ];
  for (const [name, label, recorded, rebuilt] of rows) {
    lines.push('| ' + name + ' | ' + label + ' | \`' + recorded + '\` | \`' + rebuilt + '\` |');
  }
  if (pending.length > 0) {
    lines.push('', '### RECORD THESE (bootstrap evidence)', '');
    lines.push('The lock still carries the bootstrap sentinel. Record exactly the');
    lines.push('rebuilt digests above into deploy/images/image-lock.yaml, then this');
    lines.push('verification re-runs at the new head and must match.', '');
    for (const item of pending) lines.push('- ' + item);
  }
  if (summary) appendFileSync(summary, lines.join('\n') + '\n');

  if (problems.length > 0) {
    console.error('✗ image digest verification — ' + problems.length + ' mismatch(es)');
    for (const problem of problems) console.error('    ' + problem);
    process.exit(1);
  }
  if (pending.length > 0 && !allowPending) {
    console.error('✗ image digest verification — ' + pending.length +
      ' identity value(s) still ' + SENTINEL);
    console.error('    Bootstrap is loud, never complete. Record the digests below, from this evidence:');
    for (const item of pending) console.error('    ' + item);
    process.exit(1);
  }
  if (pending.length > 0) {
    console.log('! parents verified structurally; bootstrap identities remain pending for final refusal');
  } else {
    console.log('✓ image digest verification — every selected identity equals the governed rebuild');
  }
"
