#!/usr/bin/env bash
#
# verify.sh — compares the digests the governed build just produced against
# the identities recorded in image-lock.yaml.
#
# Three outcomes, none silent:
#   - every recorded digest equals the rebuilt digest      -> pass; this IS
#     the reproducibility evidence (same definition, same digests, fresh
#     builder);
#   - any recorded digest differs                          -> fail, both
#     digests named (a hand-edited or stale lock cannot survive);
#   - any identity still pending-first-governed-build      -> fail loudly,
#     printing the freshly built digests as the exact evidence to record.
#     Bootstrap is visible, never complete.
#
# Same execution authority as build.sh: CI, or a deliberate human override.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if [ "${CI:-}" != "true" ] && [ "${IMAGES_BUILD_AUTHORIZED:-}" != "1" ]; then
  echo "refusing: deploy/AGENTS.md prohibits running deployment assets locally." >&2
  exit 1
fi

OUT="${IMAGES_OUT:-${RUNNER_TEMP:-/tmp}/secure-home-images}"

node -e "
  const { readFileSync, appendFileSync } = require('node:fs');
  const lock = JSON.parse(readFileSync('$OUT/lock.json', 'utf8'));
  const built = JSON.parse(readFileSync('$OUT/digests.json', 'utf8'));
  const SENTINEL = 'pending-first-governed-build';
  const problems = [];
  const pending = [];
  const rows = [];

  for (const image of lock.images) {
    const fresh = built[image.name];
    if (fresh === undefined) {
      problems.push(image.name + ': registered but not built');
      continue;
    }
    const compare = (label, recorded, rebuilt) => {
      rows.push([image.name, label, recorded, rebuilt]);
      if (recorded === SENTINEL) pending.push(image.name + ' ' + label + ' -> ' + rebuilt);
      else if (recorded !== rebuilt) problems.push(image.name + ' ' + label + ': lock records ' + recorded + ' but the governed rebuild produced ' + rebuilt);
    };
    compare('index', image.digest, fresh.digest);
    for (const m of image.manifests) compare(m.platform, m.digest, fresh.manifests[m.platform] ?? '(missing)');
    if (image.lineage === 'runner-derived') {
      const parent = lock.images.find((i) => i.name === image.parent);
      const parentBuilt = built[image.parent];
      if (image.parent_digest === SENTINEL) pending.push(image.name + ' parent_digest -> ' + parentBuilt.digest);
      else if (image.parent_digest !== parentBuilt.digest) problems.push(image.name + ' parent_digest: lock records ' + image.parent_digest + ' but the parent rebuilt to ' + parentBuilt.digest);
    }
  }

  const summary = process.env.GITHUB_STEP_SUMMARY;
  const lines = ['## Image digest verification', '', '| image | identity | lock | rebuilt |', '|---|---|---|---|'];
  for (const [n, l, a, b] of rows) lines.push('| ' + n + ' | ' + l + ' | \`' + a + '\` | \`' + b + '\` |');
  if (pending.length > 0) {
    lines.push('', '### RECORD THESE (bootstrap evidence)', '');
    lines.push('The lock still carries the bootstrap sentinel. Record exactly the');
    lines.push('rebuilt digests above into deploy/images/image-lock.yaml, then this');
    lines.push('verification re-runs at the new head and must match.', '');
    for (const p of pending) lines.push('- ' + p);
  }
  if (summary) appendFileSync(summary, lines.join('\n') + '\n');

  if (problems.length > 0) {
    console.error('✗ image digest verification — ' + problems.length + ' mismatch(es)');
    for (const p of problems) console.error('    ' + p);
    process.exit(1);
  }
  if (pending.length > 0) {
    console.error('✗ image digest verification — ' + pending.length + ' identity value(s) still ' + SENTINEL);
    console.error('    Bootstrap is loud, never complete. Record the digests below, from this evidence:');
    for (const p of pending) console.error('    ' + p);
    process.exit(1);
  }
  console.log('✓ image digest verification — every recorded identity equals the governed rebuild');
"
