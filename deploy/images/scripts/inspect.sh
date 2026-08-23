#!/usr/bin/env bash
#
# inspect.sh — prints the built lineage in human-readable form from the
# governed build's OCI layouts: index digest, per-platform manifest digests,
# and the derived image's parent chain against the lock.
#
# Read-only over build outputs. Same execution authority as build.sh: it
# reads layouts only a governed build produced, so there is nothing for it
# to do on a host that has never run one.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

OUT="${IMAGES_OUT:-${RUNNER_TEMP:-/tmp}/secure-home-images}"

if [ ! -f "$OUT/digests.json" ]; then
  echo "nothing to inspect: no governed build output at $OUT (see build.sh)" >&2
  exit 1
fi

node -e "
  const { readFileSync } = require('node:fs');
  const lock = JSON.parse(readFileSync('$OUT/lock.json', 'utf8'));
  const built = JSON.parse(readFileSync('$OUT/digests.json', 'utf8'));
  for (const image of lock.images) {
    const fresh = built[image.name];
    console.log(image.name + '  [' + image.lineage + ']');
    console.log('  built index    ' + (fresh ? fresh.digest : '(not built)'));
    if (fresh) for (const [p, d] of Object.entries(fresh.manifests)) console.log('  built ' + p.padEnd(12) + ' ' + d);
    console.log('  lock  index    ' + image.digest);
    if (image.lineage === 'runner-derived') {
      console.log('  derives from   ' + image.parent + '@' + image.parent_digest);
      console.log('  plus runtime   ' + image.runtime.package + '@' + image.runtime.version);
    } else {
      console.log('  external base  ' + image.external_base.reference + '@' + image.external_base.digest);
    }
    console.log('');
  }
"
