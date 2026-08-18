# AGENTS.md — `knowledge/`

Scoped rules for knowledge bundles. Inherits everything from
[`../AGENTS.md`](../AGENTS.md).

## The one rule that matters

**A knowledge bundle is portable, non-sensitive, and safe to copy anywhere —
including to a third-party model provider.**

Everything below follows from that. If a fact would be unsafe to send to a cloud
model, it does not belong in a bundle.

## Read first

1. [`../AGENTS.md`](../AGENTS.md)
2. [`README.md`](README.md)
3. [`INDEX.md`](INDEX.md) — the registry of modules and sets
4. [ADR-0010](../docs/decisions/ADR-0010-use-okf-for-portable-knowledge-only.md)

## Selection is governed, and it grants nothing

A profile selects a named **set**; the runner resolves it to exact module
versions and records the result in run evidence. A profile never names a
repository file path, and a module being selected never means the run may act on
what it knows — see
[`../docs/architecture/knowledge-selection-model.md`](../docs/architecture/knowledge-selection-model.md).

**Least context is a control, not a preference.** A coding set receives no
household modules, and a household set receives no developer-platform
conventions. When adding a module, decide which sets deny it as deliberately as
which sets require it.

## Never put in a bundle

- secrets, tokens, keys, credentials
- live device state or any current reading
- current presence or occupancy
- authorization tuples or grants
- mutable automation state
- camera media or recordings
- raw personal telemetry

If you are unsure whether something is semantics or state, ask: **would this
value be different in ten minutes?** If yes, it is state.

## Rules

- **Semantics, not state.** Equipment ratings, zone relationships, tariff
  meanings — not readings.
- **Knowledge is not an authority.** It never authorizes and never evaluates
  safety. If knowledge and live state disagree, live state wins.
- **Every bundle declares owner, as-of date, and limitations.**
- **Nothing reads a bundle file directly.** Access is through the `query`
  interface, so the format stays replaceable.
- **Do not invent an OKF schema.** The format is decided by ADR-0015 and the
  repository profile is enforced by `packages/knowledge-toolchain`. Extend it
  there, under an accepted decision — never by writing a new shape here.
- **No secrets in examples either.** An example token is still a token-shaped
  string in the repository.

## Do not

- Author content for a module that is **not authoring-eligible**. Eligibility
  requires *both* gates false. `blockedByToolchain` was discharged on
  2026-08-16, so the ten `platform/**` modules are eligible; `household/**`,
  `runbooks/**`, and every set are still `blockedByRollout`. Whatever you author
  must pass `pnpm run check:knowledge-content`, and publication still requires
  Proof B, which has no producer.
- Change the source format. It is decided by
  [ADR-0015](../docs/decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
  (OKF v0.2); replacing it requires a superseding ADR, not a change here.
- Copy household member names, device identifiers, or network addresses into
  this directory.

## Adding a knowledge module

1. Create `<group>/<name>/README.md` stating intended facts, prohibited facts,
   intended consumers, expected queries, governing sources, and the update
   trigger — plus a registry block naming its status and owner.
2. Register it in [`catalog.json`](catalog.json) with every required field.
3. Add it to [`INDEX.md`](INDEX.md).
4. Add it to the sets that should receive it, **and to the `deny` list of the
   sets that should not.**
5. Author content only for an authoring-eligible module — **both** gates
   false. `blockedByToolchain` is discharged; `blockedByRollout` is not, outside
   `platform/**`. Whatever you author must pass
   `pnpm run check:knowledge-content`.

An unregistered module directory fails validation. That is deliberate: a module
no profile can select is invisible, and invisible things do not get reviewed.

## Three clocks, and who produced the bytes

The first real module exposed this: `generated` is **production provenance**, and
it was being written as though it described the owner or the reviewer. It
describes neither.

| Field | What it records | Wrong answer it attracts |
|---|---|---|
| `as_of` | **factual currency** — how current the facts are | the day you edited the file |
| `generated.at` | the **actual last meaningful change** to these bytes | midnight padding, or a copy of `as_of` because the dates matched |
| `generated.by` | **who actually produced the current bytes** | the module owner, or the human who reviewed it |
| `contentReview.at` | the human **content-review event** | the authoring time |

`generated.by` takes the OKF actor convention, which is **wider** than the owner
rule: `human:<id>`, `process:<id>`, or `<producer>/<version>`. A tool or an
automated process may produce content — and does not thereby become the module
**owner**, which stays `human:<id>`. Production and accountability are different
facts, and a module authored by an agent must say so rather than crediting a
person who did not write the bytes.

`generated.at` is an instant, not a date. Padding a date to midnight states a
time that did not happen; if you do not know the real instant, take the real one
at the moment you make the change.

**What admission can and cannot check.** It checks that `generated.by` is
present and is a well-formed actor, and that `generated.at` is an ISO-8601
instant. It **cannot** check that either is *true* — that is provenance,
established by authoring discipline and human review. A regular expression
establishes shape, never honesty.

**Changing either field changes source bytes**, so it invalidates
`contentReview.sourceDigest` and requires a new human content review. Provenance
is not free to correct after review, which is the point: the review binds exact
bytes.

See [ADR-0015](../docs/decisions/ADR-0015-adopt-okf-v0-2-as-source-representation-only.md)
§5 for the decision; this is the authoring rule that follows from it.

## Validation

```sh
bash scripts/validate-scaffold.sh
node scripts/check-knowledge.mjs
```

`check-knowledge.mjs` validates the **specification** — registry coherence,
metadata completeness, set references, status claims, and that no specification
directory contains authored content while its toolchain gate is true. **It owns
no content rules.**

Content admission is the separate canonical command
`pnpm run check:knowledge-content`, which hands real bytes to
`packages/knowledge-toolchain`. Prohibited content is enforced there under the
ADR-0016 A/B/C model — class B indicators with named blind spots, class C
classes with no detector by design — plus Proof A. It is not a full machine
check, and the code says so in `COVERAGE` and `BLIND_SPOTS`.

`admit` fails on prohibited-content indicators, missing or wrongly-typed
metadata, envelope violations, unresolvable references, and an attestation that
does not bind the exact bytes — as a gate, not a warning. What remains is a
governed Proof B producer, without which nothing may be published.
