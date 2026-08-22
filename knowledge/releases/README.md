# knowledge/releases/

**Immutable canonical set-release manifests** ([ADR-0019](../../docs/decisions/ADR-0019-version-and-release-knowledge-sets-as-immutable-compositions.md)).

One file per release, named exactly:

```
<familyId>@<version>.manifest
```

Its bytes are the canonical `okf-set-release-v1` form, and `sha256` over them is
the release's identity. **These files are never edited.** A change to what a
release means is a new release with a new version, because editing one would
silently re-identify a composition somebody already reviewed and a profile may
already pin.

Every file here has exactly one record in
[`../set-releases.json`](../set-releases.json), and every record has exactly one
file here — both directions are checked. A manifest with no record is a release
nobody reviewed; a record with no manifest is an identity with no content.

## What belongs here

Only `*.manifest` files produced by the canonical serializer.

## What does not belong here

- Per-family subdirectories. The path is flat and derived, so a record cannot
  point somewhere unexpected.
- Any other file type.
- A hand-written manifest. The bytes are generated and verified; a file that
  parses but is not canonical is refused.
